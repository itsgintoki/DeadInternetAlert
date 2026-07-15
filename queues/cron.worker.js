import { Worker } from 'bullmq';
import redis from '../db/redis.js';
import { runCleanupCron, runEulogyDigest, runPollScheduler, runQueueCleanup } from './cron.tasks.js';

const handlers = {
  'eulogy-digest': runEulogyDigest,
  'poll-scheduler': runPollScheduler,
  'cleanup-cron': runCleanupCron,
  'queue-cleanup': runQueueCleanup,
};

export const cronWorker = new Worker('cronQueue', async (job) => {
  const handler = handlers[job.name];
  if (!handler) throw new Error(`Unknown cron job: ${job.name}`);
  await handler();
}, { connection: redis });

cronWorker.on('failed', (job, error) => console.error(`Cron job ${job?.id} failed:`, error));
