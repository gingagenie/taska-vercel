import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";

export const equipment = Router();
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/* LIST: equipment + customer name + address */
equipment.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const r: any = await db.execute(sql`
    select
      e.id, e.name, e.make, e.model, 
      coalesce(e.serial, e.serial_number) as serial, 
      e.notes,
      e.customer_id,
      coalesce(c.name,'—') as customer_name,
      -- one-line address from customer
      nullif(trim(concat_ws(', ',
        nullif(c.street,''),
        nullif(c.suburb,''),
        nullif(c.state,''),
        nullif(c.postcode,'')
      )), '') as customer_address
    from equipment e
    left join customers c on c.id = e.customer_id
    where e.org_id = ${orgId}::uuid
    order by e.name nulls last, e.created_at desc
  `);
  res.json(r.rows);
});

/* GET ONE */
equipment.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const r: any = await db.execute(sql`
    select
      e.id, e.name, e.make, e.model, 
      coalesce(e.serial, e.serial_number) as serial, 
      e.notes, e.customer_id,
      coalesce(c.name,'—') as customer_name,
      nullif(trim(concat_ws(', ',
        nullif(c.street,''),
        nullif(c.suburb,''),
        nullif(c.state,''),
        nullif(c.postcode,'')
      )), '') as customer_address
    from equipment e
    left join customers c on c.id = e.customer_id
    where e.id=${id}::uuid and e.org_id=${orgId}::uuid
  `);
  const row = r.rows?.[0];
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

/* CREATE */
equipment.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  let { name, make, model, serial, notes, customerId } = req.body || {};
  if (customerId === "") customerId = null;

  const r: any = await db.execute(sql`
    insert into equipment (org_id, name, make, model, serial_number, notes, customer_id)
    values (
      ${orgId}::uuid,
      ${name || null},
      ${make || null},
      ${model || null},
      ${serial || null},
      ${notes || null},
      case when ${customerId} is null then null else (${customerId}::uuid) end
    )
    returning id
  `);
  res.json({ ok: true, id: r.rows[0].id });
});

/* UPDATE */
equipment.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  let { name, make, model, serial, notes, customerId } = req.body || {};
  if (customerId === "") customerId = null;

  await db.execute(sql`
    update equipment set
      name         = coalesce(${name}, name),
      make         = coalesce(${make}, make),
      model        = coalesce(${model}, model),
      serial_number = coalesce(${serial}, serial_number),
      notes        = coalesce(${notes}, notes),
      customer_id  = case when ${customerId} is null then null else (${customerId}::uuid) end
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  res.json({ ok: true });
});

export default equipment;