async function verifyVendor(token) {
  try {
    const apiUrl = process.env.ADMETRICS_API_URL;

    if (!apiUrl) {
      throw new Error("ADMETRICS_API_URL is not configured");
    }

    if (!token || typeof token !== "string") {
      return {
        valid: false,
        message: "Invalid access token",
      };
    }

    // 1. Verify token with Admetrics
    const response = await fetch(
      `${apiUrl.replace(/\/+$/, "")}/api/v1/auth/me`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      return {
        valid: false,
        message: "Admetrics authentication failed",
      };
    }

    // 2. Read user details
    const data = await response.json();
    const user = data.user || data;

    // 3. Check vendor role
    const isVendor = user.roles?.some((role) => role.code === "VENDOR");

    if (!isVendor || !user.vendor) {
      return {
        valid: false,
        message: "Vendor account not found",
      };
    }

    // 4. Check vendor status
    const allowedStatuses = ["APPROVED", "ACTIVE"];

    if (!allowedStatuses.includes(user.vendor.status)) {
      return {
        valid: false,
        message: "Vendor is not approved for device pairing",
      };
    }

    // 5. Validate vendor information
    if (!user.id || !user.vendor.id) {
      return {
        valid: false,
        message: "Invalid vendor account information",
      };
    }

    // 6. Return verified vendor details
    return {
      valid: true,
      userId: user.id,
      vendorId: user.vendor.id,
      vendorStatus: user.vendor.status,
    };
  } catch (error) {
    console.error("Admetrics verification error:", error.message);

    throw new Error("Unable to communicate with Admetrics");
  }
}

module.exports = { verifyVendor };
