const crypto = require("crypto");

// Check pairing secret
function getPairingSecret() {
const secret = process.env.PAIRING_SECRET;

if (!secret || secret.length < 32) {
throw new Error("PAIRING_SECRET must contain at least 32 characters");
}

return secret;
}

// Generate secure six-digit pairing code
function generatePairingCode() {
return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

// Generate unique pairing session ID
function generateSessionId() {
return crypto.randomUUID();
}

// Generate secret token for Android TV
function generateSessionSecret() {
return crypto.randomBytes(32).toString("hex");
}

// Generate HMAC hash of pairing code
function hashPairingCode(code) {
return crypto
.createHmac("sha256", getPairingSecret())
.update(code)
.digest("hex");
}

module.exports = {
generatePairingCode,
generateSessionId,
generateSessionSecret,
hashPairingCode,
};
