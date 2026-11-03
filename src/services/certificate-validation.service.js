const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const prisma = require("../config/database");

const execFileAsync = promisify(execFile);

const OPENSSL_PATH =
  process.env.OPENSSL_PATH || "C:\Program Files\OpenSSL-Win64\bin\openssl.exe";

const CA_CERT_PATH = path.resolve(".keys/device-ca.crt");

function normalizeSerial(serial) {
  return serial.toLowerCase().replace(/^0+/, "") || "0";
}

async function validateCertificate(deviceId, certificatePem) {
  let tempDir;

  try {
    // 1. Validate input
    if (
      typeof certificatePem !== "string" ||
      !certificatePem.includes("-----BEGIN CERTIFICATE-----") ||
      certificatePem.length > 16000
    ) {
      throw new Error("Invalid device certificate format");
    }

    if (!deviceId) {
      throw new Error("Device ID is required");
    }

    // 2. Check CA certificate
    if (!fs.existsSync(CA_CERT_PATH)) {
      throw new Error("Device CA certificate not found");
    }

    // 3. Find device
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new Error("Device not found");
    }

    if (device.revoked) {
      throw new Error("Device has been revoked");
    }

    if (device.pairingStatus !== "PROVISIONED") {
      throw new Error("Device is not provisioned");
    }

    // 4. Create temporary directory
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "device-validation-"),
    );

    const certificatePath = path.join(tempDir, "device.crt");

    await fs.promises.writeFile(certificatePath, certificatePem, {
      mode: 0o600,
    });

    // 5. Verify certificate against Device CA
    await execFileAsync(OPENSSL_PATH, [
      "verify",
      "-CAfile",
      CA_CERT_PATH,
      "-purpose",
      "sslclient",
      certificatePath,
    ]);

    // 6. Extract certificate serial
    const { stdout: serialOutput } = await execFileAsync(OPENSSL_PATH, [
      "x509",
      "-in",
      certificatePath,
      "-noout",
      "-serial",
    ]);

    const certSerial = normalizeSerial(
      serialOutput.trim().replace(/^serial=/i, ""),
    );

    const storedSerial = normalizeSerial(device.certSerial || "");

    if (!storedSerial || certSerial !== storedSerial) {
      throw new Error("Certificate does not match registered device");
    }

    // 7. Verify certificate expiry
    await execFileAsync(OPENSSL_PATH, [
      "x509",
      "-in",
      certificatePath,
      "-noout",
      "-checkend",
      "0",
    ]);

    if (!device.certNotAfter || device.certNotAfter.getTime() <= Date.now()) {
      throw new Error("Device certificate has expired");
    }

    // 8. Verify certificate device identity
    const { stdout: subjectAltName } = await execFileAsync(OPENSSL_PATH, [
      "x509",
      "-in",
      certificatePath,
      "-noout",
      "-ext",
      "subjectAltName",
    ]);

    const expectedIdentity = `URI:urn:device:${device.id}`;

    if (!subjectAltName.includes(expectedIdentity)) {
      throw new Error("Certificate device identity does not match");
    }

    return {
      valid: true,
      deviceId: device.id,
      message: "Device certificate is valid",
    };
  } catch (error) {
    throw new Error(`Certificate validation failed: ${error.message}`);
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
  validateCertificate,
};
