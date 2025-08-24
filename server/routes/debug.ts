import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const debugRouter = Router();

debugRouter.get("/env", async (_req, res) => {
  try {
    const r: any = await db.execute(sql`select inet_server_addr() as db_host`);
    res.json({
      nodeEnv: process.env.NODE_ENV,
      clientOrigin: process.env.CLIENT_ORIGIN,
      apiBase: process.env.VITE_API_BASE_URL || process.env.API_BASE || null,
      bizTz: process.env.BIZ_TZ || null,
      dbHost: r.rows?.[0]?.db_host || null,
      dbUrlHash: (process.env.DATABASE_URL || "").slice(0, 24) + "...",
    });
  } catch {
    res.json({
      nodeEnv: process.env.NODE_ENV,
      clientOrigin: process.env.CLIENT_ORIGIN,
      apiBase: process.env.VITE_API_BASE_URL || process.env.API_BASE || null,
      bizTz: process.env.BIZ_TZ || null,
      dbHost: null,
      dbUrlHash: (process.env.DATABASE_URL || "").slice(0, 24) + "...",
    });
  }
});