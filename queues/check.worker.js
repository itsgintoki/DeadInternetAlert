import { Worker } from "bullmq";
import redis from '../db/redis.js';
import { db } from '../db/index.js';
import { checkJobsTable, checkJobsStatusEnum } from "../models/checkjobs.models.js";
import { eq } from "drizzle-orm";

export const checkWorker = new Worker(
    'checkQueue',
    async (job) => {
        const { checkJobId, watchlistId, type, target } = job.data;

        await job.log(`Checking ${type} target="${target}" (watchlist #${watchlistId})`);
        console.log(`[checkWorker] would check ${type}: ${target}`);

        await db.update(checkJobsTable).set({ status: 'COMPLETED' }).where(eq(checkJobsTable.id, checkJobId))

        return { status: 'stub-completed' };
    },
    { connection: redis }

);

checkWorker.on('completed', (job) => console.log(` job ${job.id} completed`));
checkWorker.on('failed', (job, err) => console.error(`job ${job?.id} failed: ${err.message}`));