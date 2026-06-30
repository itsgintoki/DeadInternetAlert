import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { UsersTable } from "./users.models.js";

export const watchlistTypeEnum = pgEnum('watchlist_type', ['url', 'subreddit', 'meme']);

export const watchListTable = pgTable('watch_list_table', {
    id: uuid("id")
        .defaultRandom()
        .primaryKey(),

    userId: uuid("user_id")
        .notNull()
        .references(() => UsersTable.id, { onDelete: 'cascade' }),

    type: watchlistTypeEnum("type").notNull(),

    target: text("target").notNull(),

    lastStatus: text("last_status"),

    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull()
});
