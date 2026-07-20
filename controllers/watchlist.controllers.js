import db from "../db/index.js";
import { watchListTable, watchlistTypeEnum } from "../models/watchlist.models.js";
import { eq, and } from "drizzle-orm";
import { normalizeHttpTarget } from '../utils/httpTarget.utils.js';

export const addToWatchList = async (req, res, next) => {
    try {
        const { type, target } = req.body;
        let normalizedTarget = target.trim();
        if (type === 'repo') {
            normalizedTarget = normalizedTarget.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
            normalizedTarget = normalizedTarget.replace(/\.git\/?$/i, "");
            normalizedTarget = normalizedTarget.replace(/\/+$/, "");
            if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalizedTarget)) {
                return res.status(400).json({ message: 'Repository target must be in owner/repository format' });
            }
        } else {
            normalizedTarget = await normalizeHttpTarget(normalizedTarget);
        }

        const [entry] = await db
            .insert(watchListTable)
            .values({ userId: req.user.id, type, target: normalizedTarget })
            .returning()

        res.status(201).json(entry);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'This target is already in your watchlist' });
        next(err);
    }

}

export const removeFromWatchlist = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [deleted] = await db
            .delete(watchListTable)
            .where(and(eq(watchListTable.id, id), eq(watchListTable.userId, req.user.id)))
            .returning();

        if (!deleted) return res.status(404).json({ message: 'Watchlist entry not found!' })
        return res.status(200).json({ message: 'Removed', id: deleted.id })
    } catch (err) {
        next(err);
    }
}

export const listWatchlist = async (req, res, next) => {
    try {
        const items = await db
            .select()
            .from(watchListTable)
            .where(eq(watchListTable.userId, req.user.id))
        res.status(200).json(items)
    } catch (err) {
        next(err);
    }
}
