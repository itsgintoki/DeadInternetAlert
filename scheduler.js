import { registerScheduledJobs } from './queues/scheduler.js';
import { cronQueue } from './queues/cron.queue.js';
import redis from './db/redis.js';

await registerScheduledJobs();
await cronQueue.close();
await redis.quit();
