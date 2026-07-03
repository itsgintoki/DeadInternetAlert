import { db } from '../db/index.js';
import { getCached, setCached } from "../utils/cache.utils.js";
import { fetchSubredditAbout, searchRedditPosts, formatRedditData, countRecentPosts } from "../utils/reddit.utils.js";
import { pingUrl } from "../utils/urlCheck.utils.js";

import { watchListTable, watchlistTypeEnum } from '../models/watchlist.models.js';
import { checkJobsTable, checkJobsStatusEnum } from '../models/checkjobs.models.js';
import { checkQueue } from '../queues/check.queues.js';
import { eq } from 'drizzle-orm';

function mapRedditError(err, res, next, target) {
  if (err.code === "ECONNABORTED") {
    return res.status(504).json({ error: `Timed out reaching Reddit for "${target}"` });
  }
  if (err.response) {
    const status = err.response.status;
    if (status === 404) {
      return res.status(404).json({ error: `No Reddit data found for "${target}"` });
    }
    return res.status(502).json({ error: `Reddit returned an unexpected error (${status})` });
  }
  return next(err);
}

export async function checkSubreddit(req, res, next) {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "name query param is required" });

  const cacheKey = `check:subreddit:${name}`;
  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.json(cached);

    const raw = await fetchSubredditAbout(name);
    const result = formatRedditData(raw);
    await setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    if (err.response?.status === 403) {
      const result = { name, subscribers: null, type: "private", over18: null, url: null };
      await setCached(cacheKey, result);
      return res.json(result);
    }
    mapRedditError(err, res, next, name);
  }
}

export async function checkUrl(req, res, next) {
  const { target } = req.query;
  if (!target) return res.status(400).json({ error: "target query param is required" });

  const cacheKey = `check:url:${target}`;
  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.json(cached);

    const result = await pingUrl(target);
    await setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function checkMeme(req, res, next) {
  const { format } = req.query;
  if (!format) return res.status(400).json({ error: "format query param is required" });

  const cacheKey = `check:meme:${format}`;
  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.json(cached);

    const raw = await searchRedditPosts(format);
    const result = countRecentPosts(raw, format);
    await setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    mapRedditError(err, res, next, format);
  }
}


export const triggerCheck = async (req, res, next) => {
  try {
    const { watchlistId } = req.body;
    if (!watchlistId) return res.status(400).json({ message: 'watchlistId is required' });

    const [entry] = await db.select().from(watchListTable).where(eq(watchListTable.id, watchlistId));
    if (!entry) return res.status(404).json({ message: 'Watchlist entry not found' });

    const [checkJob] = await db
      .insert(checkJobsTable)
      .values({ type: entry.type, payload: { watchlistId: entry.id, target: entry.target }, status: 'WAITING' })
      .returning();

    await checkQueue.add('check', {
      checkJobId: checkJob.id,
      watchlistId: entry.id,
      type: entry.type,
      target: entry.target,
    });

    res.status(201).json({ message: 'Check queued', checkJobId: checkJob.id });
  } catch (err) {
    next(err);
  }
};

export const getCheckStatus = async(req,res,next) => {
  try{
    const {id} = req.params;
    const [job] = await db.select().from(checkJobsTable).where(eq(checkJobsTable.id,id));
    if(!job) return res.status(404).json({message:'Check Job not found!'});
    res.status(200).json(job);
  }catch(err){
    next(err);
  }

}