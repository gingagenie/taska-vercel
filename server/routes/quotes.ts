import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { xeroService } from "../services/xero";
import { sumLines } from "../lib/totals";

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const router = Router();

/** Get previous items for autocomplete */
router.get("/previous-items", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId;
  try {
    const r: any = await db.execute(sql`
      SELECT DISTINCT 
        description as itemName,
        description,
        COALESCE(unit_amount, 0) as price,
        CASE WHEN tax_rate > 0 THEN 'GST' ELSE 'None' END as tax
      FROM quote_lines 
      WHERE org_id = ${orgId}::uuid AND description IS NOT NULL AND description != ''
      UNION
      SELECT DISTINCT 
        description as itemName,
        description,
        COALESCE(unit_amount, 0) as price,
        CASE WHEN tax_rate > 0 THEN 'GST' ELSE 'None' END as tax
      FROM invoice_lines 
      WHERE org_id = ${orgId}::uuid AND description IS NOT NULL AND description != ''
      ORDER BY itemName
      LIMIT 50
    `);
    res.json(r || []);
  } catch (error) {
    console.error("Error fetching previous items:", error);
    res.json([]);
  }
});

/** List */
router.get("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const orgId = (req as any).orgId;
  const r: any = await db.execute(sql`
    select 
      q.id, 
      q.title, 
      q.status, 
      q.created_at, 
      q.customer_id, 
      c.name as customer_name,
      COALESCE(q.grand_total, 0) as total_amount
    from quotes q 
    join customers c on c.id = q.customer_id
    where q.org_id=${orgId}::uuid
    order by q.created_at desc
  `);
  console.log(`[DEBUG] Quote list query result:`, r.map((quote: any) => ({ id: quote.id, title: quote.title, total_amount: quote.total_amount })));
  res.json(r);  // Match the working pattern from jobs.ts
});

/** Create */
router.post("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const userId = (req as any).user?.id;
    const { title, customerId, notes, lines = [] } = req.body;
    
    if (!title || !customerId) {
      return res.status(400).json({ error: "title & customerId required" });
    }
    
    // Simple quote creation
    const result: any = await db.execute(sql`
      INSERT INTO quotes (org_id, customer_id, title, notes, created_by)
      VALUES (${orgId}, ${customerId}, ${title}, ${notes || ''}, ${userId})
      RETURNING id
    `);
    
    const quoteId = (result as any)[0].id;  // Match the pattern used in jobs.ts
    
    // Insert lines
    for (const [i, line] of lines.entries()) {
      await db.execute(sql`
        INSERT INTO quote_lines (org_id, quote_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (${orgId}, ${quoteId}, ${i}, ${line.description || ''}, ${line.quantity || 0}, ${line.unit_amount || 0}, ${line.tax_rate || 0})
      `);
    }
    
    // Calculate and store totals
    const sums = sumLines(lines);
    await db.execute(sql`
      UPDATE quotes SET
        sub_total=${sums.sub_total},
        tax_total=${sums.tax_total},
        grand_total=${sums.grand_total}
      WHERE id=${quoteId}::uuid AND org_id=${orgId}::uuid
    `);
    
    res.json({ ok: true, id: quoteId });
  } catch (error: any) {
    console.error("Quote creation error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/** Get (with items + totals) */
router.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const r: any = await db.execute(sql`
    select q.*, c.name as customer_name
    from quotes q join customers c on c.id=q.customer_id
    where q.id=${id}::uuid and q.org_id=${orgId}::uuid
  `);
  const quote = r[0];  // Match the working pattern from jobs.ts
  if (!quote) return res.status(404).json({ error: "not found" });

  const lr: any = await db.execute(sql`
    select * from quote_lines 
    where quote_id=${id}::uuid and org_id=${orgId}::uuid 
    order by position asc, created_at asc
  `);
  
  // Transform lines to items format that frontend expects
  const items = lr.map((line: any) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_amount, // Map unit_amount to unit_price
    tax_rate: line.tax_rate
  }));
  
  // Map backend field names to frontend expected names
  const response = {
    ...quote,
    items,
    subtotal: quote.sub_total,
    total: quote.grand_total
  };
  
  res.json(response);
});

/** Update header and lines with totals */
router.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });
  const { title, customer_id, notes, lines = [] } = req.body || {};
  
  // Update header
  await db.execute(sql`
    update quotes set
      title=coalesce(${title}, title),
      customer_id=coalesce(${customer_id}::uuid, customer_id),
      notes=coalesce(${notes}, notes)
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  
  // Replace lines (simple path)
  await db.execute(sql`delete from quote_lines where quote_id=${id}::uuid and org_id=${orgId}::uuid`);
  
  // Insert new lines
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.execute(sql`
      insert into quote_lines (org_id, quote_id, position, description, quantity, unit_amount, tax_rate)
      values (${orgId}::uuid, ${id}::uuid, ${i}, ${l.description||""}, ${l.quantity||0}, ${l.unit_amount||0}, ${l.tax_rate||0})
    `);
  }
  
  // Recompute and store totals
  const sums = sumLines(lines);
  await db.execute(sql`
    update quotes set
      sub_total=${sums.sub_total},
      tax_total=${sums.tax_total},
      grand_total=${sums.grand_total}
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  
  res.json({ ok: true, totals: sums });
});

/** Delete quote */
router.delete("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    // Delete quote lines first (due to foreign key constraints)
    await db.execute(sql`
      delete from quote_lines 
      where quote_id=${id}::uuid and org_id=${orgId}::uuid
    `);
    
    // Delete the quote
    await db.execute(sql`
      delete from quotes
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/quotes/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete quote" });
  }
});

/** Mark accepted */
router.post("/:id/accept", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  await db.execute(sql`update quotes set status='accepted', updated_at=now() where id=${id}::uuid`);
  res.json({ ok: true });
});

/** Push to Xero */
router.post("/:id/xero", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; 
  const orgId = (req as any).orgId;
  
  try {
    // Get quote with customer details and items
    const r: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = r[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Get quote lines
    const lines: any = await db.execute(sql`
      select * from quote_lines where quote_id=${id}::uuid order by position asc, created_at asc
    `);

    // Check if already pushed to Xero
    if (quote.xero_id) {
      return res.status(400).json({ error: "Quote already exists in Xero", xeroId: quote.xero_id });
    }

    // Push to Xero
    const xeroQuote = await xeroService.createQuoteInXero(orgId, {
      customerName: quote.customer_name,
      customerEmail: quote.customer_email,
      currency: quote.currency || 'AUD',
      expiryDate: quote.expiry_date,
      lines: lines.map((line: any) => ({
        name: line.description,
        description: line.description,
        price: line.unit_amount,
        quantity: line.quantity
      }))
    });

    // Update quote with Xero ID
    await db.execute(sql`
      update quotes 
      set xero_id=${xeroQuote?.quoteID}, updated_at=now() 
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    res.json({ 
      ok: true, 
      xeroId: xeroQuote?.quoteID,
      xeroNumber: xeroQuote?.quoteNumber,
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