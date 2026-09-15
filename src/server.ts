import mongoose from "mongoose";

import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { initWorkers, closeAllWorkers } from "./workers/index.js";
import { closeAllQueues } from "./queues/index.js";
import { logger } from "./utils/logger.js";

const startServer = async () => {
  try {
    await connectDB();

    // Start background queue workers
    initWorkers();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on http://localhost:${env.PORT}`);
    });

    const handleGracefulShutdown = async (signal: string) => {
      logger.info({ signal }, "Graceful shutdown initiated...");

      server.close(async () => {
        logger.info("HTTP server closed.");

        try {
          await closeAllWorkers();
          await closeAllQueues();
          await mongoose.connection.close();
          logger.info("Database and background queues disconnected cleanly.");
          process.exit(0);
        } catch (error) {
          logger.error({ error }, "Error during graceful shutdown");
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => void handleGracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => void handleGracefulShutdown("SIGINT"));
  } catch (error) {
    logger.error(error, "Failed to start server");
    process.exit(1);
  }
};

void startServer();