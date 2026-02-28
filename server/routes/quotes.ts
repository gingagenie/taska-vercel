import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { sumLines } from "../lib/totals";
import { sendEmail, generateQuoteEmailTemplate } from "../services/email";
import { trackEmailUsage, checkEmailQuota } from "./job-sms";
import { finalizePackConsumption, releasePackReservation, durableFinalizePackConsumption } from "../lib/pack-consumption";
import { randomBytes } from "crypto";

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
  res.json(r);
});

/** Accepted quotes summary (for dashboard) */
router.get(
  "/accepted/summary",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const orgId = (req as any).orgId;
    try {
      const countResult: any = await db.execute(sql`
        select count(*)::int as count
        from quotes
        where org_id = ${orgId}::uuid
          and status = 'accepted'
      `);
      const acceptedCount = countResult[0]?.count ?? 0;
      const recent: any = await db.execute(sql`
        select 
          q.id,
          q.title,
          q.status,
          q.created_at,
          coalesce(q.grand_total, 0) as total_amount,
          c.name as customer_name
        from quotes q
        join customers c on c.id = q.customer_id
        where q.org_id = ${orgId}::uuid
          and q.status = 'accepted'
        order by q.created_at desc
        limit 3
      `);
      res.json({ ok: true, count: acceptedCount, recent });
    } catch (error) {
      console.error("Error fetching accepted quotes summary:", error);
      res.status(500).json({ ok: false, error: "Failed to load accepted quotes summary" });
    }
  }
);

/** Create */
router.post("/", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const userId = (req as any).user?.id;
    const { title, customerId, notes, lines = [] } = req.body;
    
    if (!title || !customerId) {
      return res.status(400).json({ error: "title & customerId required" });
    }
    
    const result: any = await db.execute(sql`
      INSERT INTO quotes (org_id, customer_id, title, notes, created_by)
      VALUES (${orgId}, ${customerId}, ${title}, ${notes || ''}, ${userId})
      RETURNING id
    `);
    
    const quoteId = (result as any)[0].id;
    
    for (const [i, line] of lines.entries()) {
      await db.execute(sql`
        INSERT INTO quote_lines (org_id, quote_id, position, description, quantity, unit_amount, tax_rate)
        VALUES (${orgId}, ${quoteId}, ${i}, ${line.description || ''}, ${line.quantity || 0}, ${line.unit_amount || 0}, ${line.tax_rate || 0})
      `);
    }
    
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
  const quote = r[0];
  if (!quote) return res.status(404).json({ error: "not found" });

  const lr: any = await db.execute(sql`
    select * from quote_lines 
    where quote_id=${id}::uuid and org_id=${orgId}::uuid 
    order by position asc, created_at asc
  `);
  
  const items = lr.map((line: any) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_amount,
    tax_rate: line.tax_rate
  }));
  
  res.json({ ...quote, items, subtotal: quote.sub_total, total: quote.grand_total });
});

/** Update header and lines with totals */
router.put("/:id", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params; const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });
  const { title, customer_id, notes, lines = [] } = req.body || {};
  
  await db.execute(sql`
    update quotes set
      title=coalesce(${title}, title),
      customer_id=coalesce(${customer_id}::uuid, customer_id),
      notes=coalesce(${notes}, notes)
    where id=${id}::uuid and org_id=${orgId}::uuid
  `);
  
  await db.execute(sql`delete from quote_lines where quote_id=${id}::uuid and org_id=${orgId}::uuid`);
  
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.execute(sql`
      insert into quote_lines (org_id, quote_id, position, description, quantity, unit_amount, tax_rate)
      values (${orgId}::uuid, ${id}::uuid, ${i}, ${l.description||""}, ${l.quantity||0}, ${l.unit_amount||0}, ${l.tax_rate||0})
    `);
  }
  
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
    await db.execute(sql`delete from quote_lines where quote_id=${id}::uuid and org_id=${orgId}::uuid`);
    await db.execute(sql`delete from quotes where id=${id}::uuid and org_id=${orgId}::uuid`);
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

/** Preview quote email without sending */
router.post("/:id/email-preview", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  const { email } = req.body;
  
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid quote ID" });
  if (!email) return res.status(400).json({ error: "Customer email is required" });
  
  try {
    const quoteResult: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = quoteResult[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    const lines: any = await db.execute(sql`
      select * from quote_lines where quote_id=${id}::uuid and org_id=${orgId}::uuid order by position asc, created_at asc
    `);

    const quoteData = {
      ...quote,
      items: lines.map((line: any) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_amount
      }))
    };

    const orgResult: any = await db.execute(sql`select name from orgs where id=${orgId}::uuid`);
    const orgName = orgResult[0]?.name || "Your Business";

    const { subject, html, text } = generateQuoteEmailTemplate(quoteData, orgName);
    res.json({ subject, html, text, to: email });
  } catch (error) {
    console.error('Error generating quote email preview:', error);
    res.status(500).json({ error: "Failed to generate email preview" });
  }
});

/** Send quote via email */
router.post("/:id/email", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  const { email, fromEmail = "noreply@taska.info", fromName = "Taska" } = req.body;
  
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid quote ID" });
  if (!email) return res.status(400).json({ error: "Customer email is required" });
  
  try {
    const quoteResult: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = quoteResult[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    const lines: any = await db.execute(sql`
      select * from quote_lines where quote_id=${id}::uuid order by position asc, created_at asc
    `);

    const quoteData = {
      ...quote,
      items: lines.map((line: any) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_amount
      }))
    };

    const orgResult: any = await db.execute(sql`select name from orgs where id=${orgId}::uuid`);
    const orgName = orgResult[0]?.name || "Your Business";

    const confirmationToken = randomBytes(32).toString('hex');
    await db.execute(sql`update quotes set confirmation_token=${confirmationToken} where id=${id}::uuid and org_id=${orgId}::uuid`);

    const quoteDataWithToken = { ...quoteData, confirmation_token: confirmationToken };

    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://taska.info'
      : process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';

    const { subject, html, text } = generateQuoteEmailTemplate(quoteDataWithToken, orgName, baseUrl);

    const quotaCheck = await checkEmailQuota(orgId);
    if (!quotaCheck.canSend) {
      let statusCode = 429;
      let errorMessage = "Email quota exceeded";
      if (quotaCheck.error === 'db_error') {
        statusCode = 500;
        errorMessage = quotaCheck.errorMessage || "Database error checking email quota";
      } else if (quotaCheck.error === 'no_packs') {
        errorMessage = "Email quota exceeded and no packs available";
      }
      return res.status(statusCode).json({ 
        error: errorMessage,
        usage: quotaCheck.usage,
        quota: quotaCheck.quota,
        planId: quotaCheck.planId,
        packInfo: {
          type: quotaCheck.packType,
          remainingPacks: quotaCheck.remainingPacks || 0,
          packAvailable: quotaCheck.packAvailable || false
        },
      });
    }

    if (quotaCheck.reservationId) {
      console.log(`[EMAIL] Pack reserved for org ${orgId}`);
    }

    const emailSent = await sendEmail({
      to: email,
      from: `${fromName} <${fromEmail}>`,
      subject,
      html,
      text
    });

    if (!emailSent) {
      if (quotaCheck.reservationId) {
        await releasePackReservation(quotaCheck.reservationId);
      }
      return res.status(500).json({ error: "Failed to send email" });
    }

    if (quotaCheck.reservationId) {
      try {
        const finalizeResult = await durableFinalizePackConsumption(quotaCheck.reservationId, {
          maxAttempts: 3,
          baseDelayMs: 1000,
          failRequestOnPersistentFailure: true,
        });
        if (!finalizeResult.success) {
          throw new Error(`BILLING ERROR: Email delivered but failed to charge after ${finalizeResult.attemptCount} attempts`);
        }
      } catch (error) {
        console.error(`[EMAIL] CRITICAL BILLING ERROR: Quote email sent to ${email} but pack finalization failed:`, error);
        return res.status(500).json({
          error: "Email delivered but billing failed - contact support immediately",
          severity: "critical",
          billingError: true,
          emailDelivered: true,
        });
      }
    }

    try {
      await trackEmailUsage(orgId);
    } catch (error) {
      console.error('Failed to track email usage:', error);
    }

    if (quote.status === 'draft') {
      await db.execute(sql`update quotes set status='sent' where id=${id}::uuid and org_id=${orgId}::uuid`);
    }

    res.json({ 
      ok: true, 
      message: `Quote sent successfully to ${email}`,
      email,
      packUsed: !!quotaCheck.reservationId,
      billingStatus: quotaCheck.reservationId ? 'charged' : 'plan_quota'
    });

  } catch (error) {
    console.error('Error sending quote email:', error);
    res.status(500).json({ error: "Failed to send quote email" });
  }
});

/** Convert quote to job */
router.post("/:id/convert", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    const r: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = r[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    const lines: any = await db.execute(sql`
      select * from quote_lines where quote_id=${id}::uuid order by position asc, created_at asc
    `);

    if (quote.status === 'converted') {
      return res.status(400).json({ error: "Quote already converted to job" });
    }

    const jr: any = await db.execute(sql`
      insert into jobs (org_id, title, customer_id, description, status)
      values (${orgId}::uuid, ${quote.title}, ${quote.customer_id}::uuid, ${quote.notes || ''}, 'draft')
      returning id
    `);
    
    const jobId = jr[0].id;

    for (const line of lines) {
      const isLabour = /\b(labour|labor|work|hours?)\b/i.test(line.description);
      if (isLabour) {
        await db.execute(sql`
          insert into job_hours (org_id, job_id, hours, description)
          values (${orgId}::uuid, ${jobId}::uuid, ${line.quantity}, ${line.description})
        `);
      } else {
        await db.execute(sql`
          insert into job_parts (org_id, job_id, part_name, quantity)
          values (${orgId}::uuid, ${jobId}::uuid, ${line.description}, ${Math.floor(line.quantity)})
        `);
      }
    }

    await db.execute(sql`
      update quotes set status='converted', job_id=${jobId}::uuid 
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    res.json({ ok: true, jobId });

  } catch (error: any) {
    console.error("Quote conversion error:", error);
    res.status(500).json({ error: error?.message || "Failed to convert quote to job" });
  }
});

export default router;
