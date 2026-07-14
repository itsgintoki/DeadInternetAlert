import { Queue } from "bullmq";
import redis from "../db/redis.js";

export const checkQueue = new Queue('checkQueue', { connection: redis });
export const notificationQueue = new Queue('notificationQueue', { connection: redis });
export const emailQueue = new Queue('emailQueue', { connection: redis });