import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// ignore stray PG* envs that Replit might inject
for (const k of ["PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE"]) {
  delete (process.env as any)[k];
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

// Show which database we're connecting to for debugging (can remove this later)
console.log("🔍 Database host:", process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'NOT_SET');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);