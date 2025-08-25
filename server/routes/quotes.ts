import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { xeroService } from "../services/xero";

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const router = Router();

/** List (basic) */
router.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const r: any = await db.execute(sql`
    select q.id, q.title, q.status, q.created_at, q.customer_id, c.name as customer_name
    from quotes q
    join customers c on c.id = q.customer_id
    where q.org_id=${orgId}::uuid
    order by q.created_at desc
  `);
  res.json(r.rows);
});

/** Create */
router.post("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  const userId = (req as any).user?.id || null;
  const { title, customerId, jobId, notes } = req.body || {};
  if (!title || !customerId) return res.status(400).json({ error: "title & customerId required" });

  const ins: any = await db.execute(sql`
    insert into quotes (org_id, customer_id, job_id, title, notes, created_by)
    values (${orgId}::uuid, ${customerId}::uuid, ${jobId||null}, ${title}, ${notes||null}, ${userId})
    returning id
  `);
  res.json({ ok: true, id: ins.rows[0].id });
});

/** Get (with items + computed totals) */
router.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const q: any = await db.execute(sql`
    select q.*, c.name as customer_name
    from quotes q join customers c on c.id=q.customer_id
    where q.id=${id}::uuid and q.org_id=${orgId}::uuid
  `);
  const quote = q.rows?.[0];
  if (!quote) return res.status(404).json({ error: "not found" });

  const items: any = await db.execute(sql`
    select * from quote_items where quote_id=${id}::uuid order by created_at nulls last, id
  `);

  const subtotal = items.rows.reduce((s: number, it: any) => s + Number(it.quantity)*Number(it.unit_price), 0);
  res.json({ ...quote, items: items.rows, subtotal, total: subtotal }); // taxes later
});

/** Update header */
router.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });
  const { title, notes, status, customerId, jobId } = req.body || {};
  await db.execute(sql`
    update quotes
      set title=coalesce(${title}, title),
          notes=coalesce(${notes}, notes),
          status=coalesce(${status}, status),
          customer_id=coalesce(${customerId}::uuid, customer_id),
          job_id=coalesce(${jobId}::uuid, job_id),
          updated_at=now()
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  res.json({ ok: true });
});

/** Items CRUD */
router.post("/:id/items", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const { description, quantity, unit_price } = req.body || {};
  if (!description) return res.status(400).json({ error: "description required" });
  const ins: any = await db.execute(sql`
    insert into quote_items (quote_id, description, quantity, unit_price)
    values (${id}::uuid, ${description}, ${quantity||1}, ${unit_price||0})
    returning id
  `);
  res.json({ ok: true, id: ins.rows[0].id });
});

router.put("/:id/items/:itemId", requireAuth, requireOrg, async (req, res) => {
  const { id, itemId } = req.params;
  const { description, quantity, unit_price } = req.body || {};
  await db.execute(sql`
    update quote_items
      set description=coalesce(${description}, description),
          quantity=coalesce(${quantity}, quantity),
          unit_price=coalesce(${unit_price}, unit_price)
    where id=${itemId}::uuid and quote_id=${id}::uuid
  `);
  res.json({ ok: true });
});

router.delete("/:id/items/:itemId", requireAuth, requireOrg, async (req, res) => {
  const { id, itemId } = req.params;
  await db.execute(sql`delete from quote_items where id=${itemId}::uuid and quote_id=${id}::uuid`);
  res.json({ ok: true });
});

/** Actions */
router.post("/:id/accept", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  await db.execute(sql`update quotes set status='accepted', updated_at=now() where id=${id}::uuid`);
  res.json({ ok: true });
});

/** Convert to job (basic) */
router.post("/:id/convert", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId; const userId = (req as any).user?.id || null;

  const q: any = await db.execute(sql`select * from quotes where id=${id}::uuid and org_id=${orgId}::uuid`);
  const quote = q.rows?.[0];
  if (!quote) return res.status(404).json({ error: "quote not found" });

  const jr: any = await db.execute(sql`
    insert into jobs (org_id, customer_id, title, description, status, created_by, scheduled_at)
    values (${orgId}::uuid, ${quote.customer_id}::uuid, ${quote.title}, ${quote.notes||null}, 'new', ${userId}, null)
    returning id
  `);
  await db.execute(sql`update quotes set status='converted', job_id=${jr.rows[0].id}::uuid where id=${id}::uuid`);
  res.json({ ok: true, jobId: jr.rows[0].id });
});

/** Push to Xero */
router.post("/:id/xero", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; 
  const orgId = (req as any).orgId;
  
  try {
    // Get quote with customer details and items
    const q: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = q.rows?.[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Get quote items
    const items: any = await db.execute(sql`
      select * from quote_items where quote_id=${id}::uuid order by created_at nulls last, id
    `);

    // Check if already pushed to Xero
    if (quote.xero_id) {
      return res.status(400).json({ error: "Quote already exists in Xero", xeroId: quote.xero_id });
    }

    // Push to Xero
    const xeroQuote = await xeroService.createQuoteInXero(orgId, {
      customerName: quote.customer_name,
      customerEmail: quote.customer_email,
      title: quote.title,
      currency: quote.currency || 'AUD',
      items: items.rows.map((item: any) => ({
        name: item.description,
        description: item.description,
        price: item.unit_price,
        quantity: item.quantity
      }))
    });

    // Update quote with Xero ID
    await db.execute(sql`
      update quotes 
      set xero_id=${xeroQuote.quoteID}, updated_at=now() 
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    res.json({ 
      ok: true, 
      xeroId: xeroQuote.quoteID,
      xeroNumber: xeroQuote.quoteNumber,
      message: "Quote successfully created in Xero"
    });

  } catch (error) {
    console.error('Error pushing quote to Xero:', error);
    if (error instanceof Error && error.message.includes('not found or tokens expired')) {
      return res.status(401).json({ error: "Xero integration not connected. Please connect Xero in Settings." });
    }
    res.status(500).json({ error: "Failed to create quote in Xero" });
  }
});

export default router;