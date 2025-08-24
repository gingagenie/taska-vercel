import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

export const schedule = Router();

/**
 * GET /api/schedule/range?start=YYYY-MM-DD&end=YYYY-MM-DD&techId=uuid&tz=Area/City
 * start inclusive, end exclusive, dates interpreted in provided tz (defaults to Australia/Melbourne)
 */
schedule.get("/range", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { start, end, techId, tz } = req.query as Record<string, string | undefined>;
  
  console.log("[TRACE] GET /api/schedule/range org=%s start=%s end=%s techId=%s tz=%s", orgId, start, end, techId, tz);
  
  if (!start || !end) {
    return res.status(400).json({ error: "start and end required (YYYY-MM-DD)" });
  }

  // Default business timezone; mobile can override with &tz=Australia/Melbourne
  const zone = tz || process.env.BIZ_TZ || "Australia/Melbourne";

  // Simplified query without job_assignments table for now
  const techFilter = techId ? sql`and j.created_by = ${techId}::uuid` : sql``;

  try {
    const r: any = await db.execute(sql`
      select
        j.id, j.title, j.description, j.status, j.scheduled_at,
        j.customer_id, coalesce(c.name,'—') as customer_name,
        '[]'::json as technicians
      from jobs j
      left join customers c on c.id = j.customer_id
      where j.org_id=${orgId}::uuid
        and (j.scheduled_at at time zone ${sql.raw(`'${zone}'`)})::date >= ${start}::date
        and (j.scheduled_at at time zone ${sql.raw(`'${zone}'`)})::date <  ${end}::date
        ${techFilter}
      order by j.scheduled_at asc nulls last, j.created_at desc
    `);

    res.json(r.rows);
  } catch (error: any) {
    console.error("GET /api/schedule/range error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch schedule" });
  }
});