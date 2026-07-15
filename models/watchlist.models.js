import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { UsersTable } from "./users.models.js";

export const watchlistTypeEnum = pgEnum('watchlist_type', ['url', 'repo']);

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

    statusChangedAt: timestamp("status_changed_at"),

    lastDigestSentAt: timestamp('last_digest_sent_at'),

    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull()
}, (table) => [
    index('watch_list_user_id_idx').on(table.userId),
    uniqueIndex('watch_list_user_type_target_unique').on(table.userId, table.type, table.target),
]);
