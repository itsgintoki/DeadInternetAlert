import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { UsersTable } from "./users.models.js";
import { watchListTable } from "./watchlist.models.js";

export const notificationsTable = pgTable("notifications_table", {
    id: uuid("id")
        .defaultRandom()
        .primaryKey(),

    userId: uuid("user_id")
        .notNull()
        .references(() => UsersTable.id, { onDelete: 'cascade' }),

    watchlistId: uuid('watchlist_id')
        .notNull()
        .references(() => watchListTable.id, { onDelete: 'cascade' }),

    message: text('message')
        .notNull(),

    read: boolean('read')
        .default(false)
        .notNull(),

    createdAt: timestamp('created_at')
        .defaultNow()
        .notNull(),
}, (table) => [
    index('notifications_user_created_at_idx').on(table.userId, table.createdAt),
]);
