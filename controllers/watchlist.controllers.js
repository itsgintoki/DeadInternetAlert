import db from "../db/index.js";
import { watchListTable, watchlistTypeEnum } from "../models/watchlist.models.js";
import { eq, and } from "drizzle-orm";

export const addToWatchList = async (req, res, next) => {
    try {
        const { type, target } = req.body;
        const [entry] = await db
            .insert(watchListTable)
            .values({ userId: req.user.id, type, target })
            .returning()

        res.status(201).json(entry);
    } catch (err) {
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