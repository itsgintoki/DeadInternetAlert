import { db } from '../db/index.js';
import { getCached, setCached } from "../utils/cache.utils.js";
import { fetchGithubRepo, fetchGithubCommits, formatGithubData } from "../utils/github.utils.js";
import { pingUrl } from "../utils/urlCheck.utils.js";

import { watchListTable } from '../models/watchlist.models.js';
import { checkJobsTable } from '../models/checkjobs.models.js';
import { checkQueue } from '../queues/check.queues.js';
import { cronQueue } from '../queues/cron.queue.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const idSchema = z.string().uuid();

function parseId(value, res) {
  const result = idSchema.safeParse(value);
  if (!result.success) {
    res.status(400).json({ message: 'id must be a valid UUID' });
    return null;
  }
  return result.data;
}

async function enqueueCheck(entry, checkJobId, opts = {}) {
  return checkQueue.add('check', {
    checkJobId,
    watchlistId: entry.id,
    type: entry.type,
    target: entry.target,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    ...opts,
  });
}

function mapGithubError(err, res, next, target) {
  if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
    return res.status(504).json({ error: `Timed out reaching GitHub for "${target}"` });
  }
  if (err.response) {
    const status = err.response.status;
    if (status === 404) {
      return res.status(404).json({ error: `No GitHub repository found for "${target}"` });
    }
    if (status === 403) {
      return res.status(403).json({ error: `GitHub API rate limit exceeded or forbidden for "${target}"` });
    }
    return res.status(502).json({ error: `GitHub returned an unexpected error (${status})` });
  }
  return next(err);
}

export async function checkRepo(req, res, next) {
  const { target } = req.query;
  if (typeof target !== 'string' || !target) return res.status(400).json({ error: "target query param is required" });

  const normalizedTarget = target.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/\.git\/?$/i, '').replace(/\/+$/, '');
  const parts = normalizedTarget.split('/');
  if (parts.length !== 2 || !/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) {
    return res.status(400).json({ error: "target must be in 'owner/repo' format" });
  }

  const [owner, repoName] = parts;
  const cacheKey = `check:repo:${normalizedTarget}`;
  
  try {
    const cached = await getCached(cacheKey);
    if (cached) return res.json(cached);

    const repoData = await fetchGithubRepo(owner, repoName);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const commits = await fetchGithubCommits(owner, repoName, sevenDaysAgo);

    const result = formatGithubData(repoData, commits);
    await setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    mapGithubError(err, res, next, normalizedTarget);
  }
}

export async function checkUrl(req, res, next) {
  const { target } = req.query;
  if (typeof target !== 'string' || !target) return res.status(400).json({ error: "target query param is required" });

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


export const triggerCheck = async (req, res, next) => {
  try {
    const { watchlistId } = req.body;
    if (!watchlistId) return res.status(400).json({ message: 'watchlistId is required' });

    const [entry] = await db.select().from(watchListTable).where(eq(watchListTable.id, watchlistId));
    if (!entry) return res.status(404).json({ message: 'Watchlist entry not found' });

    if (req.user.role !== 'admin' && entry.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You do not own this watchlist entry' });
    }

    const [checkJob] = await db
      .insert(checkJobsTable)
      .values({ userId: entry.userId, watchlistId: entry.id, type: entry.type, payload: { target: entry.target }, status: 'WAITING' })
      .returning();

    try {
      await enqueueCheck(entry, checkJob.id);
    } catch (error) {
      await db.update(checkJobsTable)
        .set({ status: 'FAILED', result: { error: 'Unable to enqueue check' } })
        .where(eq(checkJobsTable.id, checkJob.id));
      throw error;
    }

    res.status(201).json({ message: 'Check queued', checkJobId: checkJob.id });
  } catch (err) {
    next(err);
  }
};

export const getCheckStatus = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, res);
    if (!id) return;
    const conditions = [eq(checkJobsTable.id, id)];
    if (req.user.role !== 'admin') conditions.push(eq(checkJobsTable.userId, req.user.id));
    const [job] = await db.select().from(checkJobsTable).where(and(...conditions));
    if (!job) return res.status(404).json({ message: 'Check Job not found!' });
    res.status(200).json(job);
  } catch (err) {
    next(err);
  }
};

export const getFailedChecks = async (req, res, next) => {
  try {
    const conditions = [eq(checkJobsTable.status, 'FAILED')];
    if (req.user.role !== 'admin') conditions.push(eq(checkJobsTable.userId, req.user.id));
    const failedJobs = await db
      .select()
      .from(checkJobsTable)
      .where(and(...conditions));
    res.status(200).json(failedJobs);
  } catch (err) {
    next(err);
  }
};

export const retryCheck = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, res);
    if (!id) return;
    const conditions = [eq(checkJobsTable.id, id)];
    if (req.user.role !== 'admin') conditions.push(eq(checkJobsTable.userId, req.user.id));
    const [job] = await db.select().from(checkJobsTable).where(and(...conditions));

    if (!job) return res.status(404).json({ message: 'Check job not found' });
    if (job.status !== 'FAILED') {
      return res.status(400).json({ message: 'Only failed check jobs can be retried' });
    }

    const [entry] = await db.select().from(watchListTable).where(eq(watchListTable.id, job.watchlistId));
    if (!entry) return res.status(404).json({ message: 'Watchlist entry not found' });

    await db
      .update(checkJobsTable)
      .set({ status: 'WAITING', result: null })
      .where(eq(checkJobsTable.id, id));
    try {
      await enqueueCheck(entry, job.id);
    } catch (error) {
      await db.update(checkJobsTable)
        .set({ status: 'FAILED', result: { error: 'Unable to enqueue retry' } })
        .where(eq(checkJobsTable.id, id));
      throw error;
    }

    res.status(200).json({ message: 'Retry queued', checkJobId: job.id });
  } catch (err) {
    next(err);
  }
};

export const triggerEulogyDigest = async (req, res, next) => {
  try {
    await cronQueue.add('eulogy-digest', {});
    res.status(202).json({ message: "Eulogy digest queued successfully" });
  } catch (err) {
    next(err);
  }
};

export const triggerPollScheduler = async (req, res, next) => {
  try {
    await cronQueue.add('poll-scheduler', {});
    res.status(202).json({ message: "Poll scheduler queued successfully" });
  } catch (err) {
    next(err);
  }
};
