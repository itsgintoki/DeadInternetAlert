import { Worker } from "bullmq";
import redis from "../db/redis.js";
import { db } from "../db/index.js";
import { notificationsTable } from "../models/notifications.models.js";

export const notificationWorker = new Worker(
  "notificationQueue",
  async (job) => {
    const { userId, watchlistId, message } = job.data;
    
    await db.insert(notificationsTable).values({
      userId,
      watchlistId,
      message,
    });
  },
  { connection: redis }
);

notificationWorker.on("completed", (job) => console.log(`Notification job ${job.id} completed`));
notificationWorker.on("failed", (job, err) => console.error(`Notification job ${job?.id} failed: ${err.message}`));
