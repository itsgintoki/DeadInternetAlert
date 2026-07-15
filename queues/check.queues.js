import { Queue } from "bullmq";
import redis from "../db/redis.js";

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

export const checkQueue = new Queue('checkQueue', { connection: redis, defaultJobOptions });
export const notificationQueue = new Queue('notificationQueue', { connection: redis, defaultJobOptions });
export const emailQueue = new Queue('emailQueue', { connection: redis, defaultJobOptions });
