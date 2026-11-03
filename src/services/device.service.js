const crypto = require("crypto");

const prisma = require("../config/database");
const redisClient = require("../config/redis");
const certificateService = require("./certificate.service");

const RELEASE_LOCK_SCRIPT = `  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end`;

function verifySessionSecret(session, sessionSecret) {
  if (!session.sessionSecretHash || typeof sessionSecret !== "string") {
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

async function getVerifiedSession(pairingSessionId, sessionSecret) {
  const sessionKey = `pairing:session:${pairingSessionId}`;

  const sessionValue = await redisClient.get(sessionKey);

  if (!sessionValue) {
    throw new Error("Pairing session expired");
  }

  const session = JSON.parse(sessionValue);

  verifySessionSecret(session, sessionSecret);

  if (session.status !== "APPROVED") {
    throw new Error("Device pairing is not approved");
  }

  return session;
}

// Register device
async function registerDevice(pairingSessionId, sessionSecret) {
  const session = await getVerifiedSession(pairingSessionId, sessionSecret);

  const device = await prisma.device.findUnique({
    where: { id: session.deviceId },
  });

  if (!device) {
    throw new Error("Paired device record not found");
  }

  if (device.revoked) {
    throw new Error("Device has been revoked");
  }

  if (device.pairingStatus !== "LINKED") {
    throw new Error("Device is not ready for provisioning");
  }

  return {
    deviceId: device.id,
    vendorId: device.vendorId,
    clinicId: device.clinicId,
    pairingStatus: device.pairingStatus,
    message: "Device registration verified successfully",
  };
}

// Provision device certificate
async function provisionDevice(pairingSessionId, sessionSecret, csrPem) {
  const session = await getVerifiedSession(pairingSessionId, sessionSecret);

  // Prevent simultaneous provisioning
  const lockKey = `pairing:provision:${session.deviceId}`;
  const lockToken = crypto.randomUUID();

  const lock = await redisClient.set(lockKey, lockToken, {
    NX: true,
    EX: 120,
  });

  if (lock !== "OK") {
    throw new Error("Device provisioning is already in progress");
  }

  try {
    // Check device registration
    const registration = await registerDevice(pairingSessionId, sessionSecret);

    // Generate certificate after matching the original public key
    const certificate = await certificateService.issueCertificate(
      registration.deviceId,
      csrPem,
      session.publicKey,
    );

    // Save certificate details
    const updatedDevice = await prisma.device.updateMany({
      where: {
        id: registration.deviceId,
        revoked: false,
        pairingStatus: "LINKED",
        certSerial: null,
      },
      data: {
        certSerial: certificate.certSerial,
        certNotAfter: certificate.certNotAfter,
        pairingStatus: "PROVISIONED",
      },
    });

    if (updatedDevice.count !== 1) {
      throw new Error(
        "Device provisioning failed. Device may already be provisioned or revoked.",
      );
    }

    return {
      deviceId: registration.deviceId,
      certificate: certificate.certificate,
      caCertificate: certificate.caCertificate,
      certSerial: certificate.certSerial,
      certNotAfter: certificate.certNotAfter,
      pairingStatus: "PROVISIONED",
      message: "Device provisioned successfully",
    };
  } finally {
    await redisClient.eval(RELEASE_LOCK_SCRIPT, {
      keys: [lockKey],
      arguments: [lockToken],
    });
  }
}

module.exports = {
  registerDevice,
  provisionDevice,
};
