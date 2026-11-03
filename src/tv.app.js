const express = require("express");
const helmet = require("helmet");

const tvRoutes = require("./routes/tv.routes");

const app = express();

app.use(helmet());

app.use(express.json({ limit: "32kb" }));

app.use("/api/v1/tv", tvRoutes);

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Android TV secure API is healthy",
  });
});

module.exports = app;
