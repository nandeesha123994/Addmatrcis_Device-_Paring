const express = require("express");
const router = express.Router();

const deviceController = require("../controllers/device.controller");

const mockVendorAuth = require("../middleware/mockVendorAuth.middleware");

// Android TV starts pairing
router.post("/pairing/start", deviceController.startPairing);

// Vendor approves TV pairing (LOCAL TESTING ONLY)
router.post(
  "/installations/:installationId/pair-device",
  mockVendorAuth,
  deviceController.pairDevice,
);

// Android TV checks pairing status
router.get(
  "/pairing/status/:pairingSessionId",
  deviceController.getPairingStatus,
);

// Android TV registers the paired device
router.post(
  "/pairing/register/:pairingSessionId",
  deviceController.registerDevice,
);

// Android TV requests its client certificate
router.post(
  "/pairing/provision/:pairingSessionId",
  deviceController.provisionDevice,
);

// Certificate validation
router.post(
  "/:deviceId/certificate/validate",
  deviceController.validateDeviceCertificate,
);

module.exports = router;
