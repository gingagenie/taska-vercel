import { Router } from "express"; import { db } from "../db/client"; import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth"; import { requireOrg } from "../middleware/tenancy";
export const equipment = Router();
equipment.get("/", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId;
  const r:any = await db.execute(sql`select id,name from equipment where org_id=${orgId}::uuid order by name asc`);
  res.json(r.rows);
});
equipment.post("/", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId; const {name,make,model,serial,customerId}=req.body||{};
  if(!name) return res.status(400).json({error:"name required"});
  const r:any = await db.execute(sql`insert into equipment (org_id,customer_id,name,make,model,serial) values (${orgId}::uuid,${customerId||null},${name},${make||null},${model||null},${serial||null}) returning id`);
  res.json({ ok:true, id:r.rows[0].id });
});