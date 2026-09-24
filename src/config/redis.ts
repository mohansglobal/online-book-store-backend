import { Redis, type RedisOptions } from "ioredis";

import { env } from "./env.js";
import { logger } from "../utils/logger.js";


export const redisConnectionOptions: RedisOptions = (env.REDIS_URL
  ? {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }
  : {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }) as RedisOptions;



//Creates a new IORedis instance with standard BullMQ-compatible settings.

export const createRedisConnection = (): Redis => {
  const connection = env.REDIS_URL
    ? new Redis(env.REDIS_URL, redisConnectionOptions)
    : new Redis(redisConnectionOptions);

  connection.on("error", (error) => {
    logger.error({ error }, "Redis connection error");
  });

  return connection;
};
