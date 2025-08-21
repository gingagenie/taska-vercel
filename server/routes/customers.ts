import { Router } from "express"; import { db } from "../db/client"; import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth"; import { requireOrg } from "../middleware/tenancy";
export const customers = Router();
customers.get("/", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId;
  const r:any = await db.execute(sql`select id,name,email,phone,address from customers where org_id=${orgId}::uuid order by name asc`);
  res.json(r.rows);
});
customers.post("/", requireAuth, requireOrg, async (req,res)=> {
  const orgId = (req as any).orgId; const {name,email,phone,address}=req.body||{};
  if(!name) return res.status(400).json({error:"name required"});
  const r:any = await db.execute(sql`insert into customers (org_id,name,email,phone,address) values (${orgId}::uuid,${name},${email||null},${phone||null},${address||null}) returning id`);
  res.json({ ok:true, id:r.rows[0].id });
});