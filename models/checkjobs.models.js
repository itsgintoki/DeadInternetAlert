import { pgEnum, pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { UsersTable } from './users.models.js';
import { watchListTable } from './watchlist.models.js';


export const checkJobsStatusEnum = pgEnum('checkjobs_status', [
    'WAITING',
    'ACTIVE',
    'DELAYED',
    'COMPLETED',
    'FAILED'
]);

export const checkJobsTable = pgTable('checkjobs_table', {
    id: uuid("id")
        .defaultRandom()
        .primaryKey(),

    type: text("type").notNull(),

    userId: uuid('user_id')
        .notNull()
        .references(() => UsersTable.id, { onDelete: 'cascade' }),

    watchlistId: uuid('watchlist_id')
        .notNull()
        .references(() => watchListTable.id, { onDelete: 'cascade' }),
    
    payload: jsonb("payload").notNull(), 

    status: checkJobsStatusEnum("status").default('WAITING').notNull(),

    result: jsonb("result"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index('check_jobs_user_id_idx').on(table.userId),
    index('check_jobs_status_idx').on(table.status),
    index('check_jobs_watchlist_id_idx').on(table.watchlistId),
]);
