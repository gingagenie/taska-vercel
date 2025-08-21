import { Router } from "express"; import { db } from "../db/client"; import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth"; import { requireOrg } from "../middleware/tenancy";
export const jobs = Router();
jobs.get("/", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId;
  const r:any = await db.execute(sql`select id,title,status,scheduled_at,customer_id from jobs where org_id=${orgId}::uuid order by created_at desc`);
  res.json(r.rows);
});
jobs.get("/customers", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId;
  const r:any = await db.execute(sql`select id,name from customers where org_id=${orgId}::uuid order by name asc`);
  res.json(r.rows);
});
jobs.get("/equipment", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId;
  const r:any = await db.execute(sql`select id,name from equipment where org_id=${orgId}::uuid order by name asc`);
  res.json(r.rows);
});
jobs.post("/create", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId; const userId = (req as any).user?.id || null;
  const { title, description, customerId, scheduledAt } = req.body||{};
  if(!title) return res.status(400).json({ error:"title required" });
  const r:any = await db.execute(sql`insert into jobs (org_id,customer_id,title,description,scheduled_at,status,created_by) values (${orgId}::uuid,${customerId||null},${title},${description||null},${scheduledAt||null},'new',${userId||null}) returning id`);
  res.json({ ok:true, id:r.rows[0].id });
});
jobs.post("/:jobId/assign/tech", requireAuth, requireOrg, async (req,res)=> {
  const { jobId } = req.params; const { userId } = req.body||{};
  if(!userId) return res.status(400).json({ error:"userId required" });
  await db.execute(sql`insert into job_assignments (job_id,user_id) values (${jobId}::uuid,${userId}::uuid) on conflict do nothing;`);
  res.json({ ok:true });
});
jobs.post("/:jobId/assign/equipment", requireAuth, requireOrg, async (req,res)=> {
  const { jobId } = req.params; const { equipmentId } = req.body||{};
  if(!equipmentId) return res.status(400).json({ error:"equipmentId required" });
  await db.execute(sql`insert into job_equipment (job_id,equipment_id) values (${jobId}::uuid,${equipmentId}::uuid) on conflict do nothing;`);
  res.json({ ok:true });
});