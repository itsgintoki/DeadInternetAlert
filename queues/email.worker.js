import { Worker } from "bullmq";
import redis from "../db/redis.js";
import { sendAlertEmail } from "../utils/email.utils.js";
import { db } from '../db/index.js';
import { watchListTable } from '../models/watchlist.models.js';
import { inArray } from 'drizzle-orm';

export const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    const { email, subject, textContent, digestWatchlistIds } = job.data;
    await sendAlertEmail(email, subject, textContent);
    if (Array.isArray(digestWatchlistIds) && digestWatchlistIds.length) {
      await db.update(watchListTable)
        .set({ lastDigestSentAt: new Date() })
        .where(inArray(watchListTable.id, digestWatchlistIds));
    }
  },
  { connection: redis }
);

emailWorker.on("completed", (job) => console.log(`Eulogy email job ${job.id} sent successfully`));
emailWorker.on("failed", (job, err) => console.error(`Eulogy email job ${job?.id} failed: ${err.message}`));
