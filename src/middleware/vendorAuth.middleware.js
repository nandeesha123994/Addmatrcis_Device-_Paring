const { verifyVendor } = require("../services/admetrics.service");

async function vendorAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    // 1. Check Authorization header
    const match = authHeader.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Admetrics access token is required",
      });
    }

    const token = match[1];

    // 2. Verify vendor with Admetrics
    const vendor = await verifyVendor(token);

    if (!vendor || !vendor.valid) {
      return res.status(403).json({
        success: false,
        message: vendor?.message || "Vendor authentication failed",
      });
    }

    // 3. Check required vendor information
    if (!vendor.vendorId || !vendor.userId) {
      return res.status(403).json({
        success: false,
        message: "Valid vendor account is required",
      });
    }

    // 4. Attach verified vendor information
    req.vendor = {
      userId: vendor.userId,
      vendorId: vendor.vendorId,
      vendorStatus: vendor.vendorStatus,
    };

    return next();
  } catch (error) {
    console.error("Vendor authentication error:", error.message);

    return res.status(503).json({
      success: false,
      message: "Unable to verify vendor with Admetrics",
    });
  }
}

module.exports = { vendorAuth };
