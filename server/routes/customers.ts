import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

export const customers = Router();
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/* LIST */
customers.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/customers org=%s", orgId);
  
  try {
    const r: any = await db.execute(sql`
      select id, name, contact_name, email, phone, street, suburb, state, postcode
      from customers
      where org_id=${orgId}::uuid
      order by name asc
    `);
    res.json(r.rows);
  } catch (error: any) {
    console.error("GET /api/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customers" });
  }
});

/* GET ONE */
customers.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  console.log("[TRACE] GET /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });
  
  try {
    const r: any = await db.execute(sql`
      select id, name, contact_name, email, phone, street, suburb, state, postcode
      from customers
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (error: any) {
    console.error("GET /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch customer" });
  }
});

/* CREATE */
customers.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  console.log("[TRACE] POST /api/customers org=%s", orgId);
  
  const { name, contact_name, email, phone, street, suburb, state, postcode } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "name required" });

  try {
    const r: any = await db.execute(sql`
      insert into customers (org_id, name, contact_name, email, phone, street, suburb, state, postcode)
      values (
        ${orgId}::uuid, ${name}, ${contact_name||null}, ${email||null}, ${phone||null},
        ${street||null}, ${suburb||null}, ${state||null}, ${postcode||null}
      )
      returning id
    `);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (error: any) {
    console.error("POST /api/customers error:", error);
    res.status(500).json({ error: error?.message || "Failed to create customer" });
  }
});

/* UPDATE */
customers.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const { id } = req.params;
  console.log("[TRACE] PUT /api/customers/%s org=%s", id, orgId);
  
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const { name, contact_name, email, phone, street, suburb, state, postcode } = req.body || {};
  
  try {
    await db.execute(sql`
      update customers set
        name         = coalesce(${name}, name),
        contact_name = coalesce(${contact_name}, contact_name),
        email        = coalesce(${email}, email),
        phone        = coalesce(${phone}, phone),
        street       = coalesce(${street}, street),
        suburb       = coalesce(${suburb}, suburb),
        state        = coalesce(${state}, state),
        postcode     = coalesce(${postcode}, postcode)
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("PUT /api/customers/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to update customer" });
  }
});

export { customers as default };