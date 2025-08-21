import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

export const jobs = Router();

/* LIST (now joins customer name) */
jobs.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const r: any = await db.execute(sql`
    select j.id, j.title, j.status, j.scheduled_at,
           j.customer_id, coalesce(c.name,'—') as customer_name
    from jobs j
    left join customers c on c.id = j.customer_id
    where j.org_id=${orgId}::uuid
    order by j.created_at desc
  `);
  res.json(r.rows);
});

/* DROPDOWNS */
jobs.get("/customers", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const r: any = await db.execute(sql`
    select id, name from customers where org_id=${orgId}::uuid order by name asc
  `);
  res.json(r.rows);
});
jobs.get("/equipment", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const r: any = await db.execute(sql`
    select id, name from equipment where org_id=${orgId}::uuid order by name asc
  `);
  res.json(r.rows);
});

/* CREATE */
jobs.post("/create", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id || null;
  const { title, description, customerId, scheduledAt } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const r: any = await db.execute(sql`
    insert into jobs (org_id, customer_id, title, description, scheduled_at, status, created_by)
    values (${orgId}::uuid, ${customerId||null}, ${title}, ${description||null}, ${scheduledAt||null}, 'new', ${userId||null})
    returning id
  `);
  res.json({ ok: true, id: r.rows[0].id });
});

/* DETAILS (view page) */
jobs.get("/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;

  const jr: any = await db.execute(sql`
    select j.id, j.title, j.description, j.status, j.scheduled_at,
           j.customer_id, coalesce(c.name,'—') as customer_name
    from jobs j
    left join customers c on c.id = j.customer_id
    where j.id=${jobId}::uuid and j.org_id=${orgId}::uuid
  `);
  const job = jr.rows?.[0];
  if (!job) return res.status(404).json({ error: "job not found" });

  const techs: any = await db.execute(sql`
    select u.id, u.name, u.email
    from job_assignments ja
    join users u on u.id = ja.user_id
    where ja.job_id=${jobId}::uuid
  `);
  const eq: any = await db.execute(sql`
    select e.id, e.name
    from job_equipment je
    join equipment e on e.id = je.equipment_id
    where je.job_id=${jobId}::uuid
  `);

  res.json({ ...job, technicians: techs.rows, equipment: eq.rows });
});

/* UPDATE (edit page) */
jobs.put("/:jobId", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  const { title, description, status, scheduledAt, customerId } = req.body || {};

  await db.execute(sql`
    update jobs
    set title = coalesce(${title}, title),
        description = coalesce(${description}, description),
        status = coalesce(${status}, status),
        scheduled_at = coalesce(${scheduledAt}, scheduled_at),
        customer_id = coalesce(${customerId}, customer_id)
    where id=${jobId}::uuid and org_id=${orgId}::uuid
  `);
  res.json({ ok: true });
});

/* ASSIGNMENTS (unchanged) */
jobs.post("/:jobId/assign/tech", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });
  await db.execute(sql`
    insert into job_assignments (job_id, user_id)
    values (${jobId}::uuid, ${userId}::uuid)
    on conflict do nothing;
  `);
  res.json({ ok: true });
});
jobs.post("/:jobId/assign/equipment", requireAuth, requireOrg, async (req, res) => {
  const { jobId } = req.params; const { equipmentId } = req.body || {};
  if (!equipmentId) return res.status(400).json({ error: "equipmentId required" });
  await db.execute(sql`
    insert into job_equipment (job_id, equipment_id)
    values (${jobId}::uuid, ${equipmentId}::uuid)
    on conflict do nothing;
  `);
  res.json({ ok: true });
});
