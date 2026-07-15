import { Worker, Queue } from "bullmq";
import redis from "../db/redis.js";
import { db } from "../db/index.js";
import { watchListTable } from "../models/watchlist.models.js";
import { UsersTable } from "../models/users.models.js";
import { checkJobsTable } from "../models/checkjobs.models.js";
import { notificationsTable } from "../models/notifications.models.js";
import { checkQueue, notificationQueue, emailQueue } from "./check.queues.js";
import { eq, and, lte } from "drizzle-orm";

export async function runEulogyDigest() {
  console.log("Running daily eulogy digest scan...");
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Select all items where lastStatus is 'dead' and statusChangedAt <= twentyFourHoursAgo
  const deadItems = await db
    .select({
      target: watchListTable.target,
      type: watchListTable.type,
      userId: watchListTable.userId,
      email: UsersTable.email,
    })
    .from(watchListTable)
    .innerJoin(UsersTable, eq(watchListTable.userId, UsersTable.id))
    .where(
      and(
        eq(watchListTable.lastStatus, "dead"),
        lte(watchListTable.statusChangedAt, twentyFourHoursAgo)
      )
    );

  if (deadItems.length === 0) {
    console.log("No dead items found for eulogy digest.");
    return;
  }

  // Group by email address
  const grouped = {};
  for (const item of deadItems) {
    if (!grouped[item.email]) {
      grouped[item.email] = [];
    }
    grouped[item.email].push(item);
  }

  // Queue one job per user via emailQueue
  for (const [email, items] of Object.entries(grouped)) {
    const itemsList = items.map(i => `- ${i.target} (${i.type})`);
    await emailQueue.add("eulogy-email", {
      email,
      items: itemsList
    });
    console.log(`Queued eulogy digest job for user ${email} containing ${items.length} dead items.`);
  }
}

export async function runPollScheduler() {
  console.log("Running poll scheduler...");
  
  // 1. Fetch all watchlist entries with user role
  const entries = await db
    .select({
      id: watchListTable.id,
      type: watchListTable.type,
      target: watchListTable.target,
      userRole: UsersTable.role,
    })
    .from(watchListTable)
    .innerJoin(UsersTable, eq(watchListTable.userId, UsersTable.id));

  if (entries.length === 0) {
    console.log("No watchlist entries found to check.");
    return;
  }

  // 2. Insert WAITING check jobs into checkJobsTable in bulk
  const jobValues = entries.map(entry => ({
    type: entry.type,
    payload: { watchlistId: entry.id, target: entry.target },
    status: 'WAITING'
  }));

  const insertedJobs = await db
    .insert(checkJobsTable)
    .values(jobValues)
    .returning();

  // Map watchlist entry ID to the inserted check job ID
  const watchlistToJobMap = {};
  for (const job of insertedJobs) {
    watchlistToJobMap[job.payload.watchlistId] = job.id;
  }

  // 3. Queue jobs in bulk using checkQueue.addBulk()
  const bulkJobs = entries.map(entry => {
    const checkJobId = watchlistToJobMap[entry.id];
    return {
      name: 'check',
      data: {
        checkJobId,
        watchlistId: entry.id,
        type: entry.type,
        target: entry.target,
      },
      opts: {
        jobId: `check:${entry.id}:${Math.floor(Date.now() / 300000)}`,
        priority: entry.userRole === 'pro' ? 1 : 10,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    };
  });

  await checkQueue.addBulk(bulkJobs);
  console.log(`Fanned out ${bulkJobs.length} check jobs.`);
}

export async function runCleanupCron() {
  console.log("Running cleanup cron...");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(lte(notificationsTable.createdAt, sevenDaysAgo));
  
  console.log("Cleanup cron completed. Old notifications marked as read.");
}

export async function runQueueCleanup() {
  console.log("Running queue cleanup (purging jobs older than 1 day)...");
  const oneDayAgoMs = 24 * 60 * 60 * 1000;
  
  const queues = [checkQueue, notificationQueue, emailQueue, cronQueue];
  for (const queue of queues) {
    try {
      const completedCleaned = await queue.clean(oneDayAgoMs, 1000, 'completed');
      const failedCleaned = await queue.clean(oneDayAgoMs, 1000, 'failed');
      console.log(`Queue ${queue.name}: Cleaned ${completedCleaned.length} completed, ${failedCleaned.length} failed jobs.`);
    } catch (err) {
      console.error(`Failed to clean queue ${queue.name}:`, err);
    }
  }
}

// 1. Create the cronQueue
export const cronQueue = new Queue("cronQueue", { connection: redis });

// 2. Add repeatable jobs
cronQueue.add("eulogy-digest", {}, {
  repeat: { pattern: "0 0 * * *" }
}).then(() => {
  console.log("Repeatable eulogy-digest job scheduled successfully (daily at midnight)");
}).catch(err => {
  console.error("Failed to schedule repeatable eulogy-digest job:", err);
});

cronQueue.add("poll-scheduler", {}, {
  repeat: { pattern: "*/5 * * * *" }
}).then(() => {
  console.log("Repeatable poll-scheduler job scheduled successfully (every 5 minutes)");
}).catch(err => {
  console.error("Failed to schedule repeatable poll-scheduler job:", err);
});

cronQueue.add("cleanup-cron", {}, {
  repeat: { pattern: "*/5 * * * *" }
}).then(() => {
  console.log("Repeatable cleanup-cron job scheduled successfully (every 5 minutes)");
}).catch(err => {
  console.error("Failed to schedule repeatable cleanup-cron job:", err);
});

cronQueue.add("queue-cleanup", {}, {
  repeat: { pattern: "0 1 * * *" }
}).then(() => {
  console.log("Repeatable queue-cleanup job scheduled successfully (daily at 1:00 AM)");
}).catch(err => {
  console.error("Failed to schedule repeatable queue-cleanup job:", err);
});

// 3. Define cronWorker
export const cronWorker = new Worker(
  "cronQueue",
  async (job) => {
    if (job.name === "eulogy-digest") {
      await runEulogyDigest();
    } else if (job.name === "poll-scheduler") {
      await runPollScheduler();
    } else if (job.name === "cleanup-cron") {
      await runCleanupCron();
    } else if (job.name === "queue-cleanup") {
      await runQueueCleanup();
    }
  },
  { connection: redis }
);

cronWorker.on("completed", (job) => console.log(`Cron job ${job.id} completed`));
cronWorker.on("failed", (job, err) => console.error(`Cron job ${job?.id} failed: ${err.message}`));

