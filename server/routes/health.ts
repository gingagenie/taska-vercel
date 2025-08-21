import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
export const health = Router();
const REQUIRED = ["organisations","users","memberships","teams","team_members","customers","equipment","jobs","job_assignments","job_equipment","entitlements","quotes","invoices"];
health.get("/db", async (_req, res) => {
  try {
    const missing:string[] = [];
    for (const t of REQUIRED) {
      const r = await db.execute(sql`select to_regclass('public.${sql.raw(t)}') as reg;`);
      // @ts-ignore
      if (!r.rows?.[0]?.reg) missing.push(t);
    }
    if (missing.length) return res.status(500).json({ ok:false, missing });
    res.json({ ok:true });
  } catch (e:any) { res.status(500).json({ ok:false, error:String(e) }); }
});
health.get("/", (_req,res)=>res.json({ ok:true, ts:new Date().toISOString() }));