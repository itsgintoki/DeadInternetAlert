import { Worker, Queue } from "bullmq";
import redis from "../db/redis.js";
import { db } from "../db/index.js";
import { watchListTable } from "../models/watchlist.models.js";
import { UsersTable } from "../models/users.models.js";
import { emailQueue } from "./check.queues.js";
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

// 1. Create the cronQueue
export const cronQueue = new Queue("cronQueue", { connection: redis });

// 2. Add repeatable job for eulogy digest at midnight daily
cronQueue.add("eulogy-digest", {}, {
  repeat: {
    pattern: "0 0 * * *"
  }
}).then(() => {
  console.log("Repeatable eulogy-digest job scheduled successfully (daily at midnight)");
}).catch(err => {
  console.error("Failed to schedule repeatable eulogy-digest job:", err);
});

// 3. Define cronWorker
export const cronWorker = new Worker(
  "cronQueue",
  async (job) => {
    if (job.name === "eulogy-digest") {
      await runEulogyDigest();
    }
  },
  { connection: redis }
);

cronWorker.on("completed", (job) => console.log(`Cron job ${job.id} completed`));
cronWorker.on("failed", (job, err) => console.error(`Cron job ${job?.id} failed: ${err.message}`));
