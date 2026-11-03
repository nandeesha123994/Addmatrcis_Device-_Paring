const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const deviceRoutes = require("./routes/device.routes");

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors());

// Parse JSON requests
app.use(express.json({ limit: "32kb" }));

// Parse URL-encoded requests
app.use(express.urlencoded({ extended: true }));

// Device pairing and registration routes
app.use("/api/v1/devices", deviceRoutes);

// Health check
app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Device Pairing & Registration API is running",
  });
});

// API health check
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

module.exports = app;
