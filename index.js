require("dotenv").config();

const https = require("https");
const fs = require("fs");
const path = require("path");

const app = require("./src/app");
const tvApp = require("./src/tv.app");

const prisma = require("./src/config/database");
const redisClient = require("./src/config/redis");

const VENDOR_PORT = process.env.PORT || 5001;
const TV_PORT = process.env.TV_PORT || 5002;

// Read HTTPS certificates
const key = fs.readFileSync(path.join(__dirname, ".keys", "server.key"));

const cert = fs.readFileSync(path.join(__dirname, ".keys", "server.crt"));

const ca = fs.readFileSync(path.join(__dirname, ".keys", "device-ca.crt"));

// Normal HTTPS options for vendor and pairing APIs
const httpsOptions = {
  key,
  cert,
};

// Strict mTLS options for registered Android TVs
const mtlsOptions = {
  key,
  cert,
  ca,
  requestCert: true,
  rejectUnauthorized: true,
};

async function startServer() {
  try {
    // Connect PostgreSQL
    await prisma.$connect();
    console.log("PostgreSQL connected successfully!");

    // Connect Redis
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    console.log("Redis connected successfully!");

    // Vendor and initial pairing HTTPS server
    https.createServer(httpsOptions, app).listen(VENDOR_PORT, "0.0.0.0", () => {
      console.log(
        `Vendor and Pairing API running on HTTPS port ${VENDOR_PORT}`,
      );
    });

    // Android TV mutual TLS server
    https.createServer(mtlsOptions, tvApp).listen(TV_PORT, "0.0.0.0", () => {
      console.log(`Android TV mTLS API running on HTTPS port ${TV_PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
