import { Worker } from "bullmq";
import redis from '../db/redis.js';
import { db } from '../db/index.js';
import { checkJobsTable } from "../models/checkjobs.models.js";
import { eq } from "drizzle-orm";
import { pingUrl } from '../utils/urlCheck.utils.js';
import { fetchGithubRepo, fetchGithubCommits, formatGithubData } from '../utils/github.utils.js';

async function runCheck(type, target) {
    switch (type) {
        case 'url':
            return await pingUrl(target);

        case 'repo': {
            const [owner, repoName] = target.split('/');
            if (!owner || !repoName) {
                throw new Error(`Invalid target format for repo: ${target}`);
            }
            const repoData = await fetchGithubRepo(owner, repoName);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const commits = await fetchGithubCommits(owner, repoName, sevenDaysAgo);
            return formatGithubData(repoData, commits);
        }

        default:
            throw new Error(`Unknown watchlist type: ${type}`);
    }
}

export const checkWorker = new Worker(
    'checkQueue',
    async (job) => {
        const { checkJobId, watchlistId, type, target } = job.data;

        await job.log(`Checking ${type} target="${target}" (watchlist #${watchlistId})`);

        const result = await runCheck(type, target);

        await db.update(checkJobsTable)
            .set({ status: 'COMPLETED', result })
            .where(eq(checkJobsTable.id, checkJobId));

        return result;
    },
    { connection: redis }
);

checkWorker.on('completed', (job) => console.log(`job ${job.id} completed`));
checkWorker.on('failed', (job, err) => console.error(`job ${job?.id} failed: ${err.message}`));