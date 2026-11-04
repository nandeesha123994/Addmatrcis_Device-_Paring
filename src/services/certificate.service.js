const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const OPENSSL_PATH =
  process.env.OPENSSL_PATH || "C:/Program Files/OpenSSL-Win64/bin/openssl.exe";

const CA_KEY_PATH = path.resolve(".keys/device-ca.key");
const CA_CERT_PATH = path.resolve(".keys/device-ca.crt");

function normalizeSerial(serial) {
  return serial.toLowerCase().replace(/^0+/, "") || "0";
}

// Convert public keys into a common format for comparison
function getPublicKeyBuffer(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);

  if (key.asymmetricKeyType !== "rsa") {
    throw new Error("Only RSA public keys are currently supported");
  }

  if (key.asymmetricKeyDetails?.modulusLength < 2048) {
    throw new Error("RSA key must be at least 2048 bits");
  }

  return key.export({
    type: "spki",
    format: "der",
  });
}

async function issueCertificate(deviceId, csrPem, expectedPublicKey) {
  let tempDir;

  try {
    // 1. Validate inputs
    if (!/^[0-9a-f-]{36}$/i.test(deviceId)) {
      throw new Error("Invalid device ID");
    }

    if (
      typeof csrPem !== "string" ||
      !csrPem.includes("-----BEGIN CERTIFICATE REQUEST-----") ||
      csrPem.length > 16000
    ) {
      throw new Error("Invalid CSR format");
    }

    if (typeof expectedPublicKey !== "string" || !expectedPublicKey) {
      throw new Error("Original device public key is missing");
    }

    // 2. Check CA files
    if (!fs.existsSync(CA_KEY_PATH) || !fs.existsSync(CA_CERT_PATH)) {
      throw new Error("Device CA files not found");
    }

    // 3. Create temporary directory
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "device-cert-"));

    const csrPath = path.join(tempDir, "device.csr");
    const certPath = path.join(tempDir, "device.crt");
    const extensionPath = path.join(tempDir, "extensions.cnf");
    const publicKeyPath = path.join(tempDir, "public-key.pem");

    await fs.promises.writeFile(csrPath, csrPem, { mode: 0o600 });

    // 4. Verify CSR signature
    await execFileAsync(OPENSSL_PATH, [
      "req",
      "-in",
      csrPath,
      "-verify",
      "-noout",
    ]);

    // 5. Extract CSR public key
    await execFileAsync(OPENSSL_PATH, [
      "req",
      "-in",
      csrPath,
      "-pubkey",
      "-noout",
      "-out",
      publicKeyPath,
    ]);

    const csrPublicKeyPem = await fs.promises.readFile(publicKeyPath, "utf8");

    // 6. Compare original TV public key with CSR public key
    const originalKey = getPublicKeyBuffer(expectedPublicKey);
    const csrKey = getPublicKeyBuffer(csrPublicKeyPem);

    if (
      originalKey.length !== csrKey.length ||
      !crypto.timingSafeEqual(originalKey, csrKey)
    ) {
      throw new Error("CSR public key does not match the paired device");
    }

    // 7. Create certificate extensions
    const extensions = `


[v3_device]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName = URI:urn:device:${deviceId}
`;

    await fs.promises.writeFile(extensionPath, extensions);

    // 8. Generate unique serial number
    const serialBytes = crypto.randomBytes(16);
    serialBytes[0] &= 0x7f;

    const serial = serialBytes.toString("hex");

    // 9. Sign CSR using Device CA
    await execFileAsync(OPENSSL_PATH, [
      "x509",
      "-req",
      "-in",
      csrPath,
      "-CA",
      CA_CERT_PATH,
      "-CAkey",
      CA_KEY_PATH,
      "-set_serial",
      `0x${serial}`,
      "-days",
      "365",
      "-sha256",
      "-extfile",
      extensionPath,
      "-extensions",
      "v3_device",
      "-out",
      certPath,
    ]);

    // 10. Read generated certificates
    const certificate = await fs.promises.readFile(certPath, "utf8");
    const caCertificate = await fs.promises.readFile(CA_CERT_PATH, "utf8");

    // 11. Extract actual serial number
    const { stdout: serialOutput } = await execFileAsync(OPENSSL_PATH, [
      "x509",
      "-in",
      certPath,
      "-noout",
      "-serial",
    ]);

    const certSerial = normalizeSerial(
      serialOutput.trim().replace(/^serial=/i, ""),
    );

    // 12. Extract expiry date
    const { stdout: expiryOutput } = await execFileAsync(OPENSSL_PATH, [
      "x509",
      "-in",
      certPath,
      "-noout",
      "-enddate",
    ]);

    const certNotAfter = new Date(expiryOutput.trim().replace("notAfter=", ""));

    if (
      !certSerial ||
      Number.isNaN(certNotAfter.getTime()) ||
      certNotAfter <= new Date()
    ) {
      throw new Error("Generated certificate details are invalid");
    }

    return {
      deviceId,
      certificate,
      caCertificate,
      certSerial,
      certNotAfter,
      message: "Device certificate generated successfully",
    };
  } catch (error) {
    throw new Error(`Certificate generation failed: ${error.message}`);
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, {
        recursive: true,
        force: true,
      });
    }
  }
}

module.exports = {
  issueCertificate,
};
