import { Worker } from "bullmq";
import redis from '../db/redis.js';
import { db } from '../db/index.js';
import { checkJobsTable } from "../models/checkjobs.models.js";
import { UsersTable } from "../models/users.models.js";
import { watchListTable } from "../models/watchlist.models.js";
import { eq } from "drizzle-orm";
import { pingUrl } from '../utils/urlCheck.utils.js';
import { fetchGithubRepo, fetchGithubCommits, formatGithubData } from '../utils/github.utils.js';
import { sendAlertEmail } from '../utils/email.utils.js';
import axios from "axios";

async function runCheck(type, target) {
    switch (type) {
        case 'url': {
            try {
                const res = await axios.head(target, { timeout: 5000 });
                return { url: target, status: res.status, alive: res.status < 400, checkedAt: new Date().toISOString() };
            } catch (err) {
                const status = err.response?.status;
                if (status && status < 500) {
                    return { url: target, status, alive: false, checkedAt: new Date().toISOString() };
                }
                throw err;
            }
        }

        case 'repo': {
            const [owner, repoName] = target.split('/');
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

export const checkWorker = new Worker(
    'checkQueue',
    async (job) => {
        const { checkJobId, watchlistId, type, target } = job.data;

        await job.log(`Checking ${type} target="${target}" (watchlist #${watchlistId})`);

        const [watchlistEntry] = await db
            .select({
                id: watchListTable.id,
                target: watchListTable.target,
                lastStatus: watchListTable.lastStatus,
                email: UsersTable.email
            })
            .from(watchListTable)
            .innerJoin(UsersTable, eq(watchListTable.userId, UsersTable.id))
            .where(eq(watchListTable.id, watchlistId));

        if (!watchlistEntry) {
            throw new Error(`Watchlist entry #${watchlistId} not found`);
        }

        const result = await runCheck(type, target);

        const currentStatus = computeStatus(type, result);
        const oldStatus = watchlistEntry.lastStatus;

        if (oldStatus !== null && oldStatus !== currentStatus) {
            const subject = `ALERT: Status changed for ${target}`;
            const textContent = `Hello,\n\nThe status of your watched item "${target}" (${type}) has changed from "${oldStatus}" to "${currentStatus}".\n\nChecked At: ${new Date().toISOString()}\n\nBest,\nDeadInternetAlert Tracker`;
            await sendAlertEmail(watchlistEntry.email, subject, textContent);
        }

        await db.update(watchListTable)
            .set({ lastStatus: currentStatus })
            .where(eq(watchListTable.id, watchlistId));

        return result;
    },
    { connection: redis }
);

checkWorker.on('active', async (job) => {
    const { checkJobId } = job.data;
    if (checkJobId) {
        try {
            await db.update(checkJobsTable)
                .set({ status: 'ACTIVE' })
                .where(eq(checkJobsTable.id, checkJobId));
        } catch (err) {
            console.error(`Failed to set job status to ACTIVE for checkJobId ${checkJobId}:`, err);
        }
    }
});

checkWorker.on('completed', async (job, result) => {
    console.log(`job ${job.id} completed`);
    const { checkJobId } = job.data;
    if (checkJobId) {
        try {
            await db.update(checkJobsTable)
                .set({ status: 'COMPLETED', result })
                .where(eq(checkJobsTable.id, checkJobId));
        } catch (err) {
            console.error(`Failed to set job status to COMPLETED for checkJobId ${checkJobId}:`, err);
        }
    }
});

checkWorker.on('failed', async (job, err) => {
    console.error(`job ${job?.id} failed: ${err.message}`);
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
            console.error(`Failed to set job status to FAILED for checkJobId ${checkJobId}:`, dbErr);
        }
    }
});