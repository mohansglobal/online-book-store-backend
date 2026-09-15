import type { Worker } from "bullmq";

import { createEmailWorker } from "./email.worker.js";
import { logger } from "../utils/logger.js";

const activeWorkers: Worker[] = [];


//Initializes and starts all background queue workers.

export const initWorkers = (): void => {
  try {
    logger.info("Initializing BullMQ background workers...");
    const emailWorker = createEmailWorker();
    activeWorkers.push(emailWorker);
    logger.info("All BullMQ background workers initialized successfully.");
  } catch (error) {
    logger.error({ error }, "Failed to initialize BullMQ workers");
  }
};


//Gracefully shuts down all active background workers.

export const closeAllWorkers = async (): Promise<void> => {
  try {
    logger.info("Closing all BullMQ workers...");
    await Promise.all(activeWorkers.map((worker) => worker.close()));
    activeWorkers.length = 0;
    logger.info("All BullMQ workers closed gracefully.");
  } catch (error) {
    logger.error({ error }, "Error while shutting down BullMQ workers");
  }
};
