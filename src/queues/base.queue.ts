import type { JobsOptions, QueueOptions } from "bullmq";

import { redisConnectionOptions } from "../config/redis.js";

/**
 * Standard default job options for all BullMQ queues.
 * Includes exponential retry backoff and automatic job history pruning.
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000, // Or max 1000 jobs
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days for debugging
    count: 5000,
  },
};

/**
 * Standard base QueueOptions configuration.
 */
export const defaultQueueOptions: QueueOptions = {
  connection: redisConnectionOptions as any,
  defaultJobOptions,
};
