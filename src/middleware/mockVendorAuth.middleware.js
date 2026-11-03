const vendor = require("../../test/vendor.json");

function mockVendorAuth(req, res, next) {
  req.vendor = {
    vendorId: vendor.vendorId,
    role: vendor.role,
    status: vendor.status,
  };

  console.log("Mock Vendor authenticated:", req.vendor.vendorId);

  next();
}

module.exports = mockVendorAuth;
