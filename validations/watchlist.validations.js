import { z } from "zod";

export const addWatchlistSchema = z.object({
    type:z.enum(['url','repo']),
    target: z.string().trim().min(1, "target is required!").max(2048),
});

export const triggerCheckSchema = z.object({
    watchlistId: z.string().uuid(),
});
