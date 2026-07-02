import { Queue } from "bullmq";
import redis from "../db/redis.js";

export const checkQueue = new Queue('checkQueue', { connection: redis });