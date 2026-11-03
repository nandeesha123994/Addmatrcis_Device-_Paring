const jwt = require("jsonwebtoken");
const { publicKey } = require("../config/jwt");

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access token is required",
      });
    }

    const match = authHeader.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const token = match[1];

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });

    if (
      typeof decoded.sub !== "string" ||
      !decoded.sub ||
      typeof decoded.sid !== "string" ||
      !decoded.sid
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
      });
    }

    req.auth = {
      userId: decoded.sub,
      sessionId: decoded.sid,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
}

module.exports = { authenticateToken };
