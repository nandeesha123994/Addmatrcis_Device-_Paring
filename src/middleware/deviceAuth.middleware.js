const prisma = require("../config/database");

function normalizeSerial(serial) {
  return serial.toLowerCase().replace(/^0+/, "") || "0";
}

async function deviceAuth(req, res, next) {
  try {
    const socket = req.socket;

    // 1. Verify TLS authentication
    if (!socket.authorized) {
      return res.status(401).json({
        success: false,
        message: "Valid device certificate is required",
      });
    }

    // 2. Get client certificate
    const peerCertificate = socket.getPeerX509Certificate();

    if (!peerCertificate || !peerCertificate.serialNumber) {
      return res.status(401).json({
        success: false,
        message: "Device certificate not found",
      });
    }

    // 3. Normalize serial number
    const certificateSerial = normalizeSerial(peerCertificate.serialNumber);

    // 4. Find device in database
    const device = await prisma.device.findFirst({
      where: {
        certSerial: {
          equals: certificateSerial,
          mode: "insensitive",
        },
      },
    });

    if (!device) {
      return res.status(401).json({
        success: false,
        message: "Device is not registered",
      });
    }

    // 5. Check revocation
    if (device.revoked) {
      return res.status(403).json({
        success: false,
        message: "Device certificate has been revoked",
      });
    }

    // 6. Check provisioning status
    if (device.pairingStatus !== "PROVISIONED") {
      return res.status(403).json({
        success: false,
        message: "Device is not provisioned",
      });
    }

    // 7. Check certificate expiry
    if (!device.certNotAfter || device.certNotAfter <= new Date()) {
      return res.status(401).json({
        success: false,
        message: "Device certificate has expired",
      });
    }

    // 8. Verify certificate device identity
    const subjectAltName = peerCertificate.subjectAltName || "";

    const expectedIdentity = `URI:urn:device:${device.id}`;

    const identityMatches = subjectAltName
      .split(/,\s*/)
      .some((entry) => entry.trim() === expectedIdentity);

    if (!identityMatches) {
      return res.status(401).json({
        success: false,
        message: "Certificate device identity does not match",
      });
    }

    // 9. Attach authenticated device details
    req.device = {
      deviceId: device.id,
      vendorId: device.vendorId,
      clinicId: device.clinicId,
    };

    // 10. Update last activity
    await prisma.device.update({
      where: {
        id: device.id,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });

    return next();
  } catch (error) {
    console.error("Device authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Device authentication failed",
    });
  }
}

module.exports = { deviceAuth };
