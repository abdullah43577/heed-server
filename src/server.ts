import express from "express";
import { configureApp } from "./config";
import { registerRoutes } from "./routes";
import { getEnv } from "./lib/get-env";
import { checkRedisHealth } from "./lib/redis-connection";
import { startScheduler } from "./lib/scheduler";

const PORT = getEnv("PORT");

if (!PORT) {
  console.error("❌ PORT environment variable is not set!");
  process.exit(1);
}

const app = express();

configureApp(app);
registerRoutes(app);

const server = app.listen(PORT, async () => {
  try {
    console.log(`✅ Server started on http://localhost:${PORT}`);

    await checkRedisHealth();
    startScheduler();
  } catch (error) {
    console.error("❌ Error starting server:", error);
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace");
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
});
