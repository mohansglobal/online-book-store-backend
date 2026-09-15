import { emailQueue } from "./email.queue.js";
import { logger } from "../utils/logger.js";

export * from "./base.queue.js";
export * from "./email.queue.js";

/**
 * Cleanly closes all BullMQ queue producer connections during application shutdown.
 */
export const closeAllQueues = async (): Promise<void> => {
  try {
    logger.info("Closing BullMQ queue connections...");
    await Promise.all([emailQueue.close()]);
    logger.info("All BullMQ queues closed successfully.");
  } catch (error) {
    logger.error({ error }, "Error while closing BullMQ queues");
  }
};
