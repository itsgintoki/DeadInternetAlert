import { notificationWorker } from './queues/notification.worker.js';
import { emailWorker } from './queues/email.worker.js';
import { cronWorker } from './queues/cron.worker.js';
import { checkWorker1, checkWorker2 } from './queues/check.worker.js';
import redis from './db/redis.js';

const workers = [checkWorker1, checkWorker2, notificationWorker, emailWorker, cronWorker];

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  await redis.quit();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
