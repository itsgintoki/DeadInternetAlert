import { cronQueue } from './cron.queue.js';

export async function registerScheduledJobs() {
  await Promise.all([
    cronQueue.upsertJobScheduler('eulogy-digest', { pattern: '0 0 * * *' }, { name: 'eulogy-digest', data: {} }),
    cronQueue.upsertJobScheduler('poll-scheduler', { pattern: '*/5 * * * *' }, { name: 'poll-scheduler', data: {} }),
    cronQueue.upsertJobScheduler('cleanup-cron', { pattern: '0 5 * * *' }, { name: 'cleanup-cron', data: {} }),
    cronQueue.upsertJobScheduler('queue-cleanup', { pattern: '0 1 * * *' }, { name: 'queue-cleanup', data: {} }),
  ]);
}
