import 'dotenv/config';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { UsersTable } from '../models/users.models.js';

const email = z.string().email().transform((value) => value.toLowerCase()).safeParse(process.argv[2]);
if (!email.success) {
  throw new Error('Usage: pnpm admin:grant user@example.com');
}

const [user] = await db
  .update(UsersTable)
  .set({ role: 'admin' })
  .where(eq(UsersTable.email, email.data))
  .returning({ id: UsersTable.id, email: UsersTable.email });

if (!user) throw new Error('No user exists with that email address');
console.log(`Granted admin role to ${user.email} (${user.id}).`);
