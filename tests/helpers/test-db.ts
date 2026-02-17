/**
 * Test database client
 * 
 * This is exactly like server/db/client.ts but uses DATABASE_URL_TEST
 * so tests run against a separate database and never touch production data.
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../shared/schema';

const databaseUrl = process.env.DATABASE_URL_TEST;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST not set - tests need a separate database');
}

const client = postgres(databaseUrl.trim(), {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 30,
  max_lifetime: 60 * 30,
});

export const db = drizzle(client, { schema });
