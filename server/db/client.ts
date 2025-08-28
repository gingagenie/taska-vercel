import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// hard-stop if someone points us at the wrong DB host
const REQUIRED_HOST = "ep-shy-hill-a7icgvux-pooler.ap-southeast-2.aws.neon.tech";

// ignore stray PG* envs that Replit might inject
for (const k of ["PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE"]) {
  delete (process.env as any)[k];
}

if (!process.env.DATABASE_URL?.includes(REQUIRED_HOST)) {
  console.error("❌ Wrong DATABASE_URL host. Refusing to start.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);