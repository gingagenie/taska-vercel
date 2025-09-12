import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { xeroService } from "../services/xero";
import { sumLines } from "../lib/totals";
import { sendEmail, generateInvoiceEmailTemplate } from "../services/email";

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
      FROM invoice_lines 
      WHERE org_id = ${orgId}::uuid AND description IS NOT NULL AND description != ''
      UNION
      SELECT DISTINCT 
        description as itemName,
        description,
        COALESCE(unit_amount, 0) as price,
        CASE WHEN tax_rate > 0 THEN 'GST' ELSE 'None' END as tax
      FROM quote_lines 
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
      i.id, 
      i.title, 
      i.status, 
      i.created_at, 
      i.customer_id, 
      c.name as customer_name,
      COALESCE(i.grand_total, 0) as total_amount
    from invoices i 
    join customers c on c.id = i.customer_id
    where i.org_id=${orgId}::uuid
    order by i.created_at desc
  `);
  console.log(`[DEBUG] Invoice list query result:`, r.map((inv: any) => ({ id: inv.id, title: inv.title, total_amount: inv.total_amount })));
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
    
    // Simple invoice creation
    const result: any = await db.execute(sql`
      INSERT INTO invoices (org_id, customer_id, title, notes, created_by)
      VALUES (${orgId}, ${customerId}, ${title}, ${notes || ''}, ${userId})
      RETURNING id
    `);
    
    const invoiceId = (result as any)[0].id;  // Match the pattern used in jobs.ts
    
    // Insert lines
    for (const [i, line] of lines.entries()) {
      await db.execute(sql`
        INSERT INTO invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (${orgId}, ${invoiceId}, ${i}, ${line.description || ''}, ${line.quantity || 0}, ${line.unit_amount || 0}, ${line.tax_rate || 0})
      `);
    }
    
    // Calculate and store totals
    const sums = sumLines(lines);
    await db.execute(sql`
      UPDATE invoices SET
        sub_total=${sums.sub_total},
        tax_total=${sums.tax_total},
        grand_total=${sums.grand_total}
      WHERE id=${invoiceId}::uuid AND org_id=${orgId}::uuid
    `);
    
    res.json({ ok: true, id: invoiceId });
  } catch (error: any) {
    console.error("Invoice creation error:", error);
    return res.status(500).json({ error: error.message });
  }
});

/** Get (with items + totals) */
router.get("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  const r: any = await db.execute(sql`
    select i.*, c.name as customer_name
    from invoices i join customers c on c.id=i.customer_id
    where i.id=${id}::uuid and i.org_id=${orgId}::uuid
  `);
  const inv = r[0];  // Match the working pattern from jobs.ts
  if (!inv) return res.status(404).json({ error: "not found" });

  const lr: any = await db.execute(sql`
    select * from invoice_lines 
    where invoice_id=${id}::uuid and org_id=${orgId}::uuid 
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
    ...inv,
    items,
    subtotal: inv.sub_total,
    total: inv.grand_total
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
    update invoices set
      title=coalesce(${title}, title),
      customer_id=coalesce(${customer_id}::uuid, customer_id),
      notes=coalesce(${notes}, notes)
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  
  // Replace lines (simple path)
  await db.execute(sql`delete from invoice_lines where invoice_id=${id}::uuid and org_id=${orgId}::uuid`);
  
  // Insert new lines
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.execute(sql`
      insert into invoice_lines (org_id, invoice_id, position, description, quantity, unit_amount, tax_rate)
      values (${orgId}::uuid, ${id}::uuid, ${i}, ${l.description||""}, ${l.quantity||0}, ${l.unit_amount||0}, ${l.tax_rate||0})
    `);
  }
  
  // Recompute and store totals
  const sums = sumLines(lines);
  await db.execute(sql`
    update invoices set
      sub_total=${sums.sub_total},
      tax_total=${sums.tax_total},
      grand_total=${sums.grand_total}
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  
  res.json({ ok: true, totals: sums });
});

/** Delete invoice */
router.delete("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    // Delete invoice lines first (due to foreign key constraints)
    await db.execute(sql`
      delete from invoice_lines 
      where invoice_id=${id}::uuid and org_id=${orgId}::uuid
    `);
    
    // Delete the invoice
    await db.execute(sql`
      delete from invoices
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    res.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/invoices/:id error:", error);
    res.status(500).json({ error: error?.message || "Failed to delete invoice" });
  }
});

/** Items CRUD */
router.post("/:id/items", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const { description, quantity, unit_price } = req.body || {};
  if (!description) return res.status(400).json({ error: "description required" });
  const ins: any = await db.execute(sql`
    insert into invoice_items (invoice_id, description, quantity, unit_price)
    values (${id}::uuid, ${description}, ${quantity||1}, ${unit_price||0})
    returning id
  `);
  res.json({ ok: true, id: (ins as any)[0].id });
});

router.put("/:id/items/:itemId", requireAuth, requireOrg, async (req, res) => {
  const { id, itemId } = req.params;
  const { description, quantity, unit_price } = req.body || {};
  await db.execute(sql`
    update invoice_items
      set description=coalesce(${description}, description),
          quantity=coalesce(${quantity}, quantity),
          unit_price=coalesce(${unit_price}, unit_price)
    where id=${itemId}::uuid and invoice_id=${id}::uuid
  `);
  res.json({ ok: true });
});

router.delete("/:id/items/:itemId", requireAuth, requireOrg, async (req, res) => {
  const { id, itemId } = req.params;
  await db.execute(sql`delete from invoice_items where id=${itemId}::uuid and invoice_id=${id}::uuid`);
  res.json({ ok: true });
});

/** Mark paid */
router.post("/:id/pay", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  await db.execute(sql`update invoices set status='paid', updated_at=now() where id=${id}::uuid`);
  res.json({ ok: true });
});

/** Push to Xero */
router.post("/:id/xero", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; 
  const orgId = (req as any).orgId;
  
  try {
    // Get invoice with customer details and items
    const r: any = await db.execute(sql`
      select i.*, c.name as customer_name, c.email as customer_email
      from invoices i join customers c on c.id=i.customer_id
      where i.id=${id}::uuid and i.org_id=${orgId}::uuid
    `);
    const invoice = r[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Get invoice items
    const items: any = await db.execute(sql`
      select * from invoice_items where invoice_id=${id}::uuid order by created_at nulls last, id
    `);

    // Check if already pushed to Xero
    if (invoice.xero_id) {
      return res.status(400).json({ error: "Invoice already exists in Xero", xeroId: invoice.xero_id });
    }

    // Push to Xero
    const xeroInvoice = await xeroService.createInvoiceInXero(orgId, {
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      currency: invoice.currency || 'AUD',
      dueAt: invoice.due_at,
      items: items.map((item: any) => ({
        name: item.description,
        description: item.description,
        price: item.unit_price,
        quantity: item.quantity
      }))
    });

    // Update invoice with Xero ID
    await db.execute(sql`
      update invoices 
      set xero_id=${xeroInvoice?.invoiceID}, updated_at=now() 
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    res.json({ 
      ok: true, 
      xeroId: xeroInvoice?.invoiceID,
      xeroNumber: xeroInvoice?.invoiceNumber,
      message: "Invoice successfully created in Xero"
    });

  } catch (error) {
    console.error('Error pushing invoice to Xero:', error);
    if (error instanceof Error && error.message.includes('not found or tokens expired')) {
      return res.status(401).json({ error: "Xero integration not connected. Please connect Xero in Settings." });
    }
    res.status(500).json({ error: "Failed to create invoice in Xero" });
  }
});

/** Preview invoice email without sending */
router.post("/:id/email-preview", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  const { email } = req.body;
  
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid invoice ID" });
  if (!email) return res.status(400).json({ error: "Customer email is required" });
  
  try {
    // Get invoice with customer details and items
    const invoiceResult: any = await db.execute(sql`
      select i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      from invoices i join customers c on c.id=i.customer_id
      where i.id=${id}::uuid and i.org_id=${orgId}::uuid
    `);
    const invoice = invoiceResult[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Get invoice items (correct table name: invoice_lines)
    const items: any = await db.execute(sql`
      select * from invoice_lines where invoice_id=${id}::uuid order by position asc, created_at asc
    `);

    // Prepare invoice data for email template
    const invoiceData = {
      ...invoice,
      items: items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_amount
      }))
    };

    // Get organization name for branding
    const orgResult: any = await db.execute(sql`
      select name from organizations where id=${orgId}::uuid
    `);
    const orgName = orgResult[0]?.name || "Your Business";

    // Generate email content for preview
    const { subject, html, text } = generateInvoiceEmailTemplate(invoiceData, orgName);

    res.json({ 
      subject,
      html,
      text,
      to: email
    });

  } catch (error) {
    console.error('Error generating invoice email preview:', error);
    res.status(500).json({ error: "Failed to generate email preview" });
  }
});

/** Send invoice via email */
router.post("/:id/email", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  const { email, fromEmail = "noreply@taska.info", fromName = "Taska" } = req.body;
  
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid invoice ID" });
  if (!email) return res.status(400).json({ error: "Customer email is required" });
  
  try {
    // Get invoice with customer details and items
    const invoiceResult: any = await db.execute(sql`
      select i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      from invoices i join customers c on c.id=i.customer_id
      where i.id=${id}::uuid and i.org_id=${orgId}::uuid
    `);
    const invoice = invoiceResult[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Get invoice items
    const items: any = await db.execute(sql`
      select * from invoice_items where invoice_id=${id}::uuid order by created_at nulls last, id
    `);

    // Prepare invoice data for email template
    const invoiceData = {
      ...invoice,
      items: items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))
    };

    // Get organization name for branding
    const orgResult: any = await db.execute(sql`
      select name from organizations where id=${orgId}::uuid
    `);
    const orgName = orgResult[0]?.name || "Your Business";

    // Generate email content
    const { subject, html, text } = generateInvoiceEmailTemplate(invoiceData, orgName);

    // Send email
    const emailSent = await sendEmail({
      to: email,
      from: `${fromName} <${fromEmail}>`,
      subject,
      html,
      text
    });

    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send email" });
    }

    // Update invoice status to 'sent' if it was 'draft'
    if (invoice.status === 'draft') {
      await db.execute(sql`
        update invoices 
        set status='sent', updated_at=now() 
        where id=${id}::uuid and org_id=${orgId}::uuid
      `);
    }

    res.json({ 
      ok: true, 
      message: `Invoice sent successfully to ${email}`,
      email: email
    });

  } catch (error) {
    console.error('Error sending invoice email:', error);
    res.status(500).json({ error: "Failed to send invoice email" });
  }
});

export default router;