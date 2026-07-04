import { Worker } from "bullmq";
import redis from '../db/redis.js';
import { db } from '../db/index.js';
import { checkJobsTable } from "../models/checkjobs.models.js";
import { eq } from "drizzle-orm";
import { pingUrl } from '../utils/urlCheck.utils.js';
import { fetchSubredditAbout, formatRedditData, searchRedditPosts, countRecentPosts } from '../utils/reddit.utils.js';

async function runCheck(type, target) {
    switch (type) {
        case 'url':
            return await pingUrl(target);

        case 'subreddit':
            try {
                const raw = await fetchSubredditAbout(target);
                return formatRedditData(raw);
            } catch (err) {
                if (err.response?.status === 403) {
                    return { name: target, subscribers: null, type: 'private', over18: null, url: null };
                }
                throw err;
            }

        case 'meme': {
            const raw = await searchRedditPosts(target);
            return countRecentPosts(raw, target);
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