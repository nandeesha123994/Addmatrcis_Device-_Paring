const pairingService = require("../services/pairing.service");
const deviceService = require("../services/device.service");
const certificateValidationService = require("../services/certificate-validation.service");

// TV requests a new pairing session
async function startPairing(req, res) {
  try {
    const { publicKey, appVersion, platform } = req.body;

    if (!publicKey || !appVersion || platform !== "ANDROID_TV") {
      return res.status(400).json({
        success: false,
        message: "Public key, app version and valid platform are required",
      });
    }

    const result = await pairingService.createPairingSession(
      publicKey,
      appVersion,
      platform,
    );

    return res.status(201).json({
      success: true,
      message: "Pairing session created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Pairing session error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create pairing session",
    });
  }
}

// Vendor approves device pairing
async function pairDevice(req, res) {
  try {
    const { installationId } = req.params;
    const { pairingCode } = req.body;

    if (!installationId || !/^\d{6}$/.test(pairingCode || "")) {
      return res.status(400).json({
        success: false,
        message:
          "A valid installation ID and six-digit pairing code are required",
      });
    }

    const result = await pairingService.pairDevice(
      installationId,
      pairingCode,
      req.vendor,
    );

    return res.status(200).json({
      success: true,
      message: "Device paired successfully",
      data: result,
    });
  } catch (error) {
    console.error("Device pairing error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// Android TV checks pairing status
async function getPairingStatus(req, res) {
  try {
    const { pairingSessionId } = req.params;

    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^PairingSession ([^\s]+)$/);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Pairing session credentials required",
      });
    }

    const result = await pairingService.getPairingStatus(
      pairingSessionId,
      match[1],
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
}

// Android TV confirms device registration
async function registerDevice(req, res) {
  try {
    const { pairingSessionId } = req.params;

    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^PairingSession ([^\s]+)$/);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Pairing session credentials required",
      });
    }

    const result = await deviceService.registerDevice(
      pairingSessionId,
      match[1],
    );

    return res.status(200).json({
      success: true,
      message: "Device registered successfully",
      data: result,
    });
  } catch (error) {
    console.error("Device registration error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// Android TV requests its device certificate
async function provisionDevice(req, res) {
  try {
    const { pairingSessionId } = req.params;
    const { csrPem } = req.body;

    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^PairingSession ([^\s]+)$/);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Pairing session credentials required",
      });
    }

    if (!csrPem) {
      return res.status(400).json({
        success: false,
        message: "Certificate signing request is required",
      });
    }

    const result = await deviceService.provisionDevice(
      pairingSessionId,
      match[1],
      csrPem,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Device provisioning error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// Validate an Android TV device certificate
async function validateDeviceCertificate(req, res) {
  try {
    const { deviceId } = req.params;
    const { certificatePem } = req.body;

    if (!certificatePem) {
      return res.status(400).json({
        success: false,
        message: "Device certificate is required",
      });
    }

    const result = await certificateValidationService.validateCertificate(
      deviceId,
      certificatePem,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Certificate validation error:", error.message);

    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  startPairing,
  pairDevice,
  getPairingStatus,
  registerDevice,
  provisionDevice,
  validateDeviceCertificate,
};
