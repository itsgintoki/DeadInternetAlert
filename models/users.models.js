import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

//users — id, email, password_hash, role, created_at


export const UsersTable = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),

  firstName: varchar("first_name", { length: 255 })
    .notNull(),

  lastName: varchar("last_name", { length: 255 }),

  email: varchar("email", { length: 255 })
    .notNull()
    .unique(),

  passwordHash: text("password_hash").notNull(),

  role: varchar("role", { length: 50 })
    .default("user")
    .notNull(),

  createdAt: timestamp("created_at", { mode: "date" })
    .defaultNow()
    .notNull(),
});