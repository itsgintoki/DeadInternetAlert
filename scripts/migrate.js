import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '../db/index.js';

await migrate(db, { migrationsFolder: './drizzle' });
console.log('Database migrations applied.');
