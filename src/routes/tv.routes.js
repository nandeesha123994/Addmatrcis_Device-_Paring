const express = require("express");

const router = express.Router();

const { deviceAuth } = require("../middleware/deviceAuth.middleware");

// Protected Android TV endpoint
// Only TVs with valid client certificates can access this route.

router.get("/device-check", deviceAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Android TV authenticated successfully",
    device: req.device,
  });
});

module.exports = router;
