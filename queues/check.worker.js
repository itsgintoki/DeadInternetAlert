import { Worker } from "bullmq";
import redis from '../db/redis.js';
import { db } from '../db/index.js';
import { checkJobsTable } from "../models/checkjobs.models.js";
import { UsersTable } from "../models/users.models.js";
import { watchListTable } from "../models/watchlist.models.js";
import { eq } from "drizzle-orm";
import { pingUrl } from '../utils/urlCheck.utils.js';
import { fetchGithubRepo, fetchGithubCommits, formatGithubData } from '../utils/github.utils.js';
import { emailQueue, notificationQueue } from "./check.queues.js";
import { env } from '../config/env.js';

async function runCheck(type, target) {
    switch (type) {
        case 'url': {
            return pingUrl(target);
        }

        case 'repo': {
            let cleanTarget = target.trim();
            cleanTarget = cleanTarget.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
            cleanTarget = cleanTarget.replace(/\.git\/?$/i, "");
            cleanTarget = cleanTarget.replace(/\/+$/, "");

            const [owner, repoName] = cleanTarget.split('/');
            if (!owner || !repoName) {
                throw new Error(`Invalid target format for repo: ${target}`);
            }
            try {
                const repoData = await fetchGithubRepo(owner, repoName);
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const commits = await fetchGithubCommits(owner, repoName, sevenDaysAgo);
                return formatGithubData(repoData, commits);
            } catch (err) {
                if (err.response?.status === 404) {
                    return { name: repoName, dead: true, checkedAt: new Date().toISOString() };
                }
                throw err;
            }
        }

        default:
            throw new Error(`Unknown watchlist type: ${type}`);
    }
}

function computeStatus(type, result) {
    if (type === 'url') {
        return result.alive ? 'alive' : 'dead';
    }
    if (type === 'repo') {
        if (result.dead) return 'dead';
        if (result.archived) return 'archived';
        if (result.commitsLast7Days === 0) return 'inactive';
        return 'active';
    }
    return 'unknown';
}

const makeProcessor = (workerId) => async (job) => {
    const { checkJobId, watchlistId, type, target } = job.data;

    console.log(`[${workerId}] Processing job ${job.id} for target "${target}"`);
    await job.log(`[${workerId}] Checking ${type} target="${target}" (watchlist #${watchlistId})`);

    const [watchlistEntry] = await db
        .select({
            id: watchListTable.id,
            userId: watchListTable.userId,
            target: watchListTable.target,
            type: watchListTable.type,
            lastStatus: watchListTable.lastStatus,
            email: UsersTable.email
        })
        .from(watchListTable)
        .innerJoin(UsersTable, eq(watchListTable.userId, UsersTable.id))
        .where(eq(watchListTable.id, watchlistId));

    if (!watchlistEntry) {
        throw new Error(`Watchlist entry #${watchlistId} not found`);
    }

    if (watchlistEntry.type !== type || watchlistEntry.target !== target) {
        throw new Error('Queued check data does not match the watchlist entry');
    }

    const result = await runCheck(watchlistEntry.type, watchlistEntry.target);

    const currentStatus = computeStatus(watchlistEntry.type, result);
    const oldStatus = watchlistEntry.lastStatus;

    if (oldStatus !== currentStatus) {
        await db.update(watchListTable)
            .set({ lastStatus: currentStatus, statusChangedAt: new Date(), lastDigestSentAt: null })
            .where(eq(watchListTable.id, watchlistId));

        if (oldStatus !== null) {
            const subject = `ALERT: Status changed for ${target}`;
            const textContent = `Hello,\n\nThe status of your watched item "${target}" (${type}) has changed from "${oldStatus}" to "${currentStatus}".\n\nChecked At: ${new Date().toISOString()}\n\nBest,\nDeadInternetAlert Tracker`;
            await emailQueue.add('status-alert', {
                email: watchlistEntry.email,
                subject,
                textContent,
            });

            await notificationQueue.add("notify", {
                userId: watchlistEntry.userId,
                watchlistId: watchlistEntry.id,
                message: `Watchlist item "${target}" status changed from "${oldStatus}" to "${currentStatus}"`
            });
        } else {
            // Initial status resolved - generate in-app notification but no email
            await notificationQueue.add("notify", {
                userId: watchlistEntry.userId,
                watchlistId: watchlistEntry.id,
                message: `Watchlist item "${target}" is now actively tracked (Status: ${currentStatus.toUpperCase()})`
            });
        }
    }

    return result;
};

const workerOptions = {
    connection: redis,
    concurrency: 3,
    ...(env.NODE_ENV !== "test" && {
        limiter: {
            max: 10,
            duration: 60000
        }
    })
};

export const checkWorker1 = new Worker('checkQueue', makeProcessor('Worker-1'), workerOptions);
export const checkWorker2 = new Worker('checkQueue', makeProcessor('Worker-2'), workerOptions);

const workers = [
    { instance: checkWorker1, name: 'Worker-1' },
    { instance: checkWorker2, name: 'Worker-2' }
];

for (const { instance, name } of workers) {
    instance.on('active', async (job) => {
        console.log(`[${name}] job ${job.id} is active`);
        const { checkJobId } = job.data;
        if (checkJobId) {
            try {
                await db.update(checkJobsTable)
                    .set({ status: 'ACTIVE' })
                    .where(eq(checkJobsTable.id, checkJobId));
            } catch (err) {
                console.error(`[${name}] Failed to set job status to ACTIVE for checkJobId ${checkJobId}:`, err);
            }
        }
    });

    instance.on('completed', async (job, result) => {
        console.log(`[${name}] job ${job.id} completed`);
        const { checkJobId } = job.data;
        if (checkJobId) {
            try {
                await db.update(checkJobsTable)
                    .set({ status: 'COMPLETED', result })
                    .where(eq(checkJobsTable.id, checkJobId));
            } catch (err) {
                console.error(`[${name}] Failed to set job status to COMPLETED for checkJobId ${checkJobId}:`, err);
            }
        }
    });

    instance.on('failed', async (job, err) => {
        console.error(`[${name}] job ${job?.id} failed: ${err.message}`);
        if (!job) return;

        const { checkJobId } = job.data;
        if (checkJobId) {
            try {
                const attemptsMade = job.attemptsMade;
                const maxAttempts = job.opts.attempts || 1;
                
                if (attemptsMade >= maxAttempts) {
                    await db.update(checkJobsTable)
                        .set({ status: 'FAILED', result: { error: err.message } })
                        .where(eq(checkJobsTable.id, checkJobId));
                }
            } catch (dbErr) {
                console.error(`[${name}] Failed to set job status to FAILED for checkJobId ${checkJobId}:`, dbErr);
            }
        }
    });
}
