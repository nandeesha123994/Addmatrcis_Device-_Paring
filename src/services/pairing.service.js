const crypto = require("crypto");

const redisClient = require("../config/redis");
const prisma = require("../config/database");

const {
  generatePairingCode,
  generateSessionId,
  generateSessionSecret,
  hashPairingCode,
} = require("../utils/pairingCode");

// Pairing code expires in 20 minutes
const PAIRING_CODE_EXPIRY = 1200;

// Pairing session expires in 20 minutes
const PAIRING_SESSION_EXPIRY = 1200;

// Safely release only the lock owned by this request
const RELEASE_LOCK_SCRIPT = `  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end`;

// Verify Android TV session secret
function verifySessionSecret(session, sessionSecret) {
  if (
    !session ||
    !session.sessionSecretHash ||
    typeof sessionSecret !== "string"
  ) {
    throw new Error("Invalid device credentials");
  }

  const providedHash = crypto
    .createHash("sha256")
    .update(sessionSecret)
    .digest();

  const storedHash = Buffer.from(session.sessionSecretHash, "hex");

  if (
    providedHash.length !== storedHash.length ||
    !crypto.timingSafeEqual(providedHash, storedHash)
  ) {
    throw new Error("Invalid device credentials");
  }
}

// Create temporary pairing session
async function createPairingSession(publicKey, appVersion, platform) {
  let pairingCode;
  let codeHash;
  let pairingSessionId;
  let sessionKey;
  let codeKey;

  try {
    const deviceId = crypto.randomUUID();

    pairingSessionId = generateSessionId();
    const sessionSecret = generateSessionSecret();

    sessionKey = `pairing:session:${pairingSessionId}`;

    // Generate a unique pairing code
    let stored = false;

    for (let attempt = 0; attempt < 10 && !stored; attempt++) {
      pairingCode = generatePairingCode();
      codeHash = hashPairingCode(pairingCode);

      codeKey = `pairing:code:${codeHash}`;

      const result = await redisClient.set(codeKey, pairingSessionId, {
        EX: PAIRING_CODE_EXPIRY,
        NX: true,
      });

      if (result === "OK") {
        stored = true;
      }
    }

    if (!stored) {
      throw new Error("Unable to generate a unique pairing code");
    }

    const sessionData = {
      deviceId,
      pairingSessionId,

      sessionSecretHash: crypto
        .createHash("sha256")
        .update(sessionSecret)
        .digest("hex"),

      publicKey,
      appVersion,
      platform,

      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    try {
      await redisClient.set(sessionKey, JSON.stringify(sessionData), {
        EX: PAIRING_SESSION_EXPIRY,
        NX: true,
      });
    } catch (error) {
      await redisClient.del(codeKey);
      throw error;
    }

    return {
      deviceId,
      pairingSessionId,
      sessionSecret,
      pairingCode,
      expiresIn: PAIRING_CODE_EXPIRY,
      sessionExpiresIn: PAIRING_SESSION_EXPIRY,
      pollInterval: 5,
    };
  } catch (error) {
    throw new Error(`Pairing session creation failed: ${error.message}`);
  }
}

// Vendor approves TV pairing
async function pairDevice(installationId, pairingCode, vendor) {
  const codeHash = hashPairingCode(pairingCode);
  const codeKey = `pairing:code:${codeHash}`;

  // 1. Verify vendor installation assignment
  const assignment = await prisma.installationAssignment.findFirst({
    where: {
      installationRequestId: installationId,
      vendorId: vendor.vendorId,
      status: {
        not: "COMPLETED",
      },
    },
  });

  if (!assignment) {
    throw new Error("Installation not assigned to this vendor");
  }

  // 2. Find pairing session
  const pairingSessionId = await redisClient.get(codeKey);

  if (!pairingSessionId) {
    throw new Error("Pairing code is invalid or expired");
  }

  const sessionKey = `pairing:session:${pairingSessionId}`;

  const sessionValue = await redisClient.get(sessionKey);

  if (!sessionValue) {
    throw new Error("Pairing session expired");
  }

  const session = JSON.parse(sessionValue);

  if (session.status !== "PENDING") {
    throw new Error("Device is already paired or being processed");
  }

  // 3. Create unique lock token
  const lockKey = `pairing:claim:${pairingSessionId}`;
  const lockToken = crypto.randomUUID();

  const lock = await redisClient.set(lockKey, lockToken, {
    NX: true,
    EX: 30,
  });

  if (lock !== "OK") {
    throw new Error("Pairing is already being processed");
  }

  let deviceCreated = false;
  let sessionApproved = false;

  try {
    // 4. Recheck session after acquiring lock
    const currentSessionValue = await redisClient.get(sessionKey);

    if (!currentSessionValue) {
      throw new Error("Pairing session expired");
    }

    const currentSession = JSON.parse(currentSessionValue);

    if (currentSession.status !== "PENDING") {
      throw new Error("Device is already paired");
    }

    const currentCodeSession = await redisClient.get(codeKey);

    if (currentCodeSession !== pairingSessionId) {
      throw new Error("Pairing code is no longer available");
    }

    // 5. Check remaining session lifetime
    const remainingTTL = await redisClient.ttl(sessionKey);

    if (remainingTTL <= 0) {
      throw new Error("Pairing session expired");
    }

    // 6. Create device in PostgreSQL
    const device = await prisma.device.create({
      data: {
        id: currentSession.deviceId,
        vendorId: assignment.vendorId,
        clinicId: assignment.clinicId,
        pairingStatus: "LINKED",
      },
    });

    deviceCreated = true;

    // 7. Update pairing session
    const updatedSession = {
      ...currentSession,
      status: "APPROVED",
      vendorId: assignment.vendorId,
      clinicId: assignment.clinicId,
      approvedAt: new Date().toISOString(),
    };

    await redisClient.set(sessionKey, JSON.stringify(updatedSession), {
      EX: remainingTTL,
    });

    sessionApproved = true;

    // 8. Remove pairing code
    try {
      await redisClient.del(codeKey);
    } catch (error) {
      // Session is already approved.
      // A repeated approval will be rejected by the session status check.
      console.error("Pairing code cleanup failed:", error.message);
    }

    return {
      deviceId: device.id,
      vendorId: assignment.vendorId,
      clinicId: assignment.clinicId,
      status: "APPROVED",
    };
  } catch (error) {
    // Compensate if database creation succeeded but
    // Redis approval update failed.
    if (deviceCreated && !sessionApproved) {
      await prisma.device.deleteMany({
        where: {
          id: session.deviceId,
          pairingStatus: "LINKED",
          certSerial: null,
        },
      });
    }

    throw error;
  } finally {
    // Release only our own lock
    await redisClient.eval(RELEASE_LOCK_SCRIPT, {
      keys: [lockKey],
      arguments: [lockToken],
    });
  }
}

// TV checks pairing approval status
async function getPairingStatus(pairingSessionId, sessionSecret) {
  const sessionKey = `pairing:session:${pairingSessionId}`;

  const sessionValue = await redisClient.get(sessionKey);

  if (!sessionValue) {
    return {
      status: "EXPIRED",
    };
  }

  const session = JSON.parse(sessionValue);

  // 1. Verify TV session credentials
  verifySessionSecret(session, sessionSecret);

  // 2. Return pairing status
  return {
    status: session.status,
    deviceId: session.deviceId,

    ...(session.status === "APPROVED"
      ? {
          vendorId: session.vendorId,
          clinicId: session.clinicId,
        }
      : {}),
  };
}

module.exports = {
  createPairingSession,
  pairDevice,
  getPairingStatus,
};
