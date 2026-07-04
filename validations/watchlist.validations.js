import z from "zod";

export const addWatchlistSchema = z.object({
    type:z.enum(['url','repo']),
    target:z.string().min(1,"target is required!"),
});