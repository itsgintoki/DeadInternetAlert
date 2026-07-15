import crypto from 'node:crypto';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import redis from '../db/redis.js';
import { db } from '../db/index.js';
import { notificationsTable } from '../models/notifications.models.js';
import { checkJobsTable } from '../models/checkjobs.models.js';
import { refreshTokensTable } from '../models/tokens.models.js';
import { UsersTable } from '../models/users.models.js';
import { watchListTable } from '../models/watchlist.models.js';
import { checkQueue, emailQueue, notificationQueue } from './check.queues.js';
import { cronQueue } from './cron.queue.js';

async function releaseLock(key, token) {
  await redis.eval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
    1,
    key,
    token,
  );
}

export async function runEulogyDigest() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deadItems = await db
    .select({
      id: watchListTable.id,
      target: watchListTable.target,
      type: watchListTable.type,
      userId: watchListTable.userId,
      email: UsersTable.email,
    })
    .from(watchListTable)
    .innerJoin(UsersTable, eq(watchListTable.userId, UsersTable.id))
    .where(and(
      eq(watchListTable.lastStatus, 'dead'),
      lte(watchListTable.statusChangedAt, twentyFourHoursAgo),
      isNull(watchListTable.lastDigestSentAt),
    ));

  const grouped = new Map();
  for (const item of deadItems) {
    const group = grouped.get(item.userId) ?? { email: item.email, items: [] };
    group.items.push(item);
    grouped.set(item.userId, group);
  }

  for (const { email, items } of grouped.values()) {
    await emailQueue.add('eulogy-email', {
      email,
      subject: 'Eulogy Digest: Your dead watch items',
      textContent: `Hello,\n\nHere are items that have been unavailable for over 24 hours:\n\n${items.map((item) => `- ${item.target} (${item.type})`).join('\n')}\n\nBest,\nDeadInternetAlert Team`,
      digestWatchlistIds: items.map((item) => item.id),
    });
  }
}

export async function runPollScheduler() {
  const lockKey = 'lock:poll-scheduler';
  const lockToken = crypto.randomUUID();
  const acquired = await redis.set(lockKey, lockToken, 'EX', 240, 'NX');
  if (acquired !== 'OK') return;

  try {
    const entries = await db
      .select({
        id: watchListTable.id,
        userId: watchListTable.userId,
        type: watchListTable.type,
        target: watchListTable.target,
        userRole: UsersTable.role,
      })
      .from(watchListTable)
      .innerJoin(UsersTable, eq(watchListTable.userId, UsersTable.id));

    if (!entries.length) return;

    const insertedJobs = await db.insert(checkJobsTable).values(entries.map((entry) => ({
      userId: entry.userId,
      watchlistId: entry.id,
      type: entry.type,
      payload: { target: entry.target },
      status: 'WAITING',
    }))).returning();

    try {
      await checkQueue.addBulk(entries.map((entry, index) => ({
        name: 'check',
        data: {
          checkJobId: insertedJobs[index].id,
          watchlistId: entry.id,
          type: entry.type,
          target: entry.target,
        },
        opts: {
          priority: entry.userRole === 'pro' ? 1 : 10,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
        },
      })));
    } catch (error) {
      await db.update(checkJobsTable)
        .set({ status: 'FAILED', result: { error: 'Unable to enqueue scheduled check' } })
        .where(inArray(checkJobsTable.id, insertedJobs.map((job) => job.id)));
      throw error;
    }
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

export async function runCleanupCron() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.delete(notificationsTable).where(and(
    eq(notificationsTable.read, true),
    lte(notificationsTable.createdAt, sevenDaysAgo),
  ));
  await db.delete(refreshTokensTable).where(lte(refreshTokensTable.expiresAt, new Date()));
}

export async function runQueueCleanup() {
  const oneDayAgoMs = 24 * 60 * 60 * 1000;
  for (const queue of [checkQueue, notificationQueue, emailQueue, cronQueue]) {
    await queue.clean(oneDayAgoMs, 1_000, 'completed');
    await queue.clean(oneDayAgoMs, 1_000, 'failed');
  }
}
