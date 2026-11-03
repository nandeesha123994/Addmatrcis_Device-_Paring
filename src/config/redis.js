const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (error) => {
  console.error("Redis connection error:", error);
});

redisClient.on("connect", () => {
  console.log("Redis connected successfully! ✅");
});

module.exports = redisClient;
