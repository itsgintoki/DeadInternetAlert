import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { UsersTable } from "./users.models.js";

// refresh_tokens — id, user_id, token, expires_at, created_at

export const refreshTokensTable = pgTable('refresh_token_table', {
    id: uuid("id")
        .defaultRandom()
        .primaryKey(),

    userId: uuid("user_id")
        .notNull()
        .references(() => UsersTable.id, { onDelete: "cascade" }),

    token: text("token").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true })
        .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => [
    index('refresh_token_user_id_idx').on(table.userId),
    index('refresh_token_expires_at_idx').on(table.expiresAt),
]);
