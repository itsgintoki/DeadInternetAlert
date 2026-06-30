import { pgEnum, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { UsersTable } from "./users.models.js";

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
    
    payload: jsonb("payload").notNull(), 

    status: checkJobsStatusEnum("status").default('WAITING').notNull(),

    result: jsonb("result"),

    created_at: timestamp("created_at").defaultNow().notNull(),
});
