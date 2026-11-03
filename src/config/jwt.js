const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const keyPath = process.env.JWT_PUBLIC_KEY_PATH;

if (!keyPath) {
  throw new Error("JWT_PUBLIC_KEY_PATH is not configured");
}

const publicKeyPath = path.resolve(process.cwd(), keyPath);

let publicKey;

try {
  const publicPem = fs.readFileSync(publicKeyPath, "utf8");

  publicKey = crypto.createPublicKey(publicPem);

  if (
    publicKey.asymmetricKeyType !== "rsa" ||
    publicKey.asymmetricKeyDetails?.modulusLength < 2048
  ) {
    throw new Error("Invalid RSA public key. Minimum 2048 bits required.");
  }

  console.log("Admetrics JWT public key loaded successfully!");
} catch (error) {
  throw new Error(`JWT public key loading failed: ${error.message}`);
}

module.exports = {
  publicKey,
};
