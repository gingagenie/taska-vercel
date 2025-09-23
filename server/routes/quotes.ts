import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { xeroService } from "../services/xero";
import { sumLines } from "../lib/totals";
import { sendEmail, generateQuoteEmailTemplate } from "../services/email";
import { trackEmailUsage, checkEmailQuota } from "./job-sms";
import { finalizePackConsumption, releasePackReservation, durableFinalizePackConsumption } from "../lib/pack-consumption";
import { tiktokEvents } from "../services/tiktok-events";
import type { CustomerInfo } from "../services/tiktok-events";
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

    // Get customer details for tracking
    const customerResult: any = await db.execute(sql`
      select name, contact_name, email, phone, suburb, state, postcode
      from customers
      where id = ${customerId}::uuid and org_id = ${orgId}::uuid
    `);
    const customer = customerResult[0];

    // Track TikTok Lead event for quote creation (fire and forget - non-blocking)
    try {
      const customerInfo: CustomerInfo = {
        email: customer?.email || undefined,
        phone: customer?.phone || undefined,
        firstName: customer?.contact_name?.split(' ')[0] || undefined,
        lastName: customer?.contact_name?.split(' ').slice(1).join(' ') || undefined,
        city: customer?.suburb || undefined,
        state: customer?.state || undefined,
        country: 'AU', // Default to Australia for Taska
        zipCode: customer?.postcode || undefined,
        ip: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.get('User-Agent') || undefined,
      };

      const leadData = {
        value: sums.grand_total || 1000, // Use quote value or default estimate for lead value
        currency: 'AUD',
        contentName: 'New Quote Request Lead',
        contentCategory: 'lead_generation',
        contentType: 'lead_generation',
        description: `Quote created: ${quoteId}`,
        status: 'qualified',
      };

      // Fire and forget - don't wait for response to avoid slowing down quote creation
      tiktokEvents.trackLead(
        customerInfo,
        leadData,
        req.get('Referer') || undefined,
        req.get('Referer') || undefined
      ).catch((trackingError) => {
        // Log tracking errors but don't throw them
        console.error('[QUOTE_CREATION] TikTok Lead tracking failed:', trackingError);
      });

      console.log(`[QUOTE_CREATION] TikTok Lead tracking initiated for quote_id: ${quoteId}`);
    } catch (trackingError) {
      // Log any tracking errors but don't let them break quote creation
      console.error('[QUOTE_CREATION] TikTok tracking error:', trackingError);
    }
    
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

/** Preview quote email without sending */
router.post("/:id/email-preview", requireAuth, requireOrg, checkSubscription, requireActiveSubscription, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).orgId;
  const { email } = req.body;
  
  if (!isUuid(id)) return res.status(400).json({ error: "Invalid quote ID" });
  if (!email) return res.status(400).json({ error: "Customer email is required" });
  
  try {
    // Get quote with customer details and lines
    const quoteResult: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = quoteResult[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Get quote lines
    const lines: any = await db.execute(sql`
      select * from quote_lines where quote_id=${id}::uuid and org_id=${orgId}::uuid order by position asc, created_at asc
    `);

    // Prepare quote data for email template
    const quoteData = {
      ...quote,
      items: lines.map((line: any) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_amount
      }))
    };

    // Get organization name for branding
    const orgResult: any = await db.execute(sql`
      select name from orgs where id=${orgId}::uuid
    `);
    const orgName = orgResult[0]?.name || "Your Business";

    // Generate email content for preview
    const { subject, html, text } = generateQuoteEmailTemplate(quoteData, orgName);

    res.json({ 
      subject,
      html,
      text,
      to: email
    });

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
    // Get quote with customer details and lines
    const quoteResult: any = await db.execute(sql`
      select q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      from quotes q join customers c on c.id=q.customer_id
      where q.id=${id}::uuid and q.org_id=${orgId}::uuid
    `);
    const quote = quoteResult[0];
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Get quote lines
    const lines: any = await db.execute(sql`
      select * from quote_lines where quote_id=${id}::uuid order by position asc, created_at asc
    `);

    // Prepare quote data for email template
    const quoteData = {
      ...quote,
      items: lines.map((line: any) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_amount
      }))
    };

    // Get organization name for branding
    const orgResult: any = await db.execute(sql`
      select name from orgs where id=${orgId}::uuid
    `);
    const orgName = orgResult[0]?.name || "Your Business";

    // Generate secure confirmation token for accept/decline links
    const confirmationToken = randomBytes(32).toString('hex');

    // Update quote with confirmation token
    await db.execute(sql`
      update quotes 
      set confirmation_token=${confirmationToken}
      where id=${id}::uuid and org_id=${orgId}::uuid
    `);

    // Add confirmation token to quote data
    const quoteDataWithToken = {
      ...quoteData,
      confirmation_token: confirmationToken
    };

    // Get base URL for email links  
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://taska.info'  // Production domain
      : process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';

    // Generate email content with confirmation token
    const { subject, html, text } = generateQuoteEmailTemplate(quoteDataWithToken, orgName, baseUrl);

    // PHASE 1: Check email quota and reserve pack unit if needed
    const quotaCheck = await checkEmailQuota(orgId);
    if (!quotaCheck.canSend) {
      // Distinguish between different failure types for proper error handling
      let statusCode = 429; // Default to quota exceeded
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
        upgradeOptions: {
          pro: { quota: 500, price: "$29/month" },
          enterprise: { quota: 2000, price: "$99/month" }
        }
      });
    }

    // Log if pack was reserved for this email
    if (quotaCheck.reservationId) {
      console.log(`[EMAIL] Pack reserved for org ${orgId}: ${quotaCheck.packType} pack reserved, ${quotaCheck.remainingPacks} packs remaining after send`);
    }

    // PHASE 2: Attempt to send email
    let finalizeSuccess = true;
    const emailSent = await sendEmail({
      to: email,
      from: `${fromName} <${fromEmail}>`,
      subject,
      html,
      text
    });

    if (!emailSent) {
      // PHASE 3B: Email send failed - release pack reservation
      if (quotaCheck.reservationId) {
        console.log(`[EMAIL] Send failed, releasing pack reservation: ${quotaCheck.reservationId}`);
        const releaseResult = await releasePackReservation(quotaCheck.reservationId);
        if (!releaseResult.success) {
          console.error(`[EMAIL] Failed to release pack reservation: ${releaseResult.errorMessage}`);
        }
      }
      return res.status(500).json({ 
        error: "Failed to send email",
        packReservationReleased: !!quotaCheck.reservationId
      });
    }

    // PHASE 3A: Email sent successfully - CRITICAL: MUST finalize pack consumption
    // Using fail-safe approach: prefer failing request over under-billing
    if (quotaCheck.reservationId) {
      try {
        console.log(`[EMAIL] Quote email sent successfully, finalizing pack consumption: ${quotaCheck.reservationId}`);
        
        // Use durable finalization with retry logic and fail-safe approach
        const finalizeResult = await durableFinalizePackConsumption(
          quotaCheck.reservationId,
          {
            maxAttempts: 3,
            baseDelayMs: 1000,
            failRequestOnPersistentFailure: true, // CRITICAL: Fail request if can't charge
          }
        );
        
        if (!finalizeResult.success) {
          // This should rarely happen due to retry logic, but if it does, it's critical
          console.error(`[EMAIL] CRITICAL: Failed to finalize pack consumption after retry attempts: ${finalizeResult.errorMessage}`);
          
          // The durable finalize function should have thrown an error if failRequestOnPersistentFailure is true
          // If we reach here, something went wrong with the fail-safe logic
          throw new Error(`BILLING ERROR: Email delivered but failed to charge after ${finalizeResult.attemptCount} attempts`);
        }
        
        console.log(`[EMAIL] Pack consumption finalized successfully after ${finalizeResult.attemptCount} attempts`);
      } catch (error) {
        // CRITICAL BILLING ERROR: Email was delivered but we cannot charge for it
        console.error(`[EMAIL] CRITICAL BILLING ERROR: Quote email sent to ${email} but pack finalization failed:`, error);
        
        // Log the critical billing error for manual intervention
        await db.execute(sql`
          INSERT INTO quote_lines (org_id, quote_id, position, description, quantity, unit_amount, tax_rate)
          VALUES (${orgId}::uuid, ${id}::uuid, 999, ${'BILLING_ERROR: Email sent but not charged - ' + String(error).slice(0, 200)}, 0, 0, 0)
          ON CONFLICT DO NOTHING
        `).catch(logError => {
          console.error(`[EMAIL] Failed to log billing error:`, logError);
        });
        
        // FAIL-SAFE: Return error to prevent under-billing
        // This means user sees the email as "failed" even though it was delivered
        // This is better than allowing free email delivery
        return res.status(500).json({
          error: "Email delivered but billing failed - contact support immediately",
          severity: "critical",
          billingError: true,
          emailDelivered: true,
          support: "This email was delivered but could not be charged. Please contact support for billing adjustment."
        });
      }
    }

    // Track email usage for quota management
    try {
      await trackEmailUsage(orgId);
    } catch (error) {
      console.error('Failed to track email usage:', error);
      // Don't fail the request if usage tracking fails
    }

    // Update quote status to 'sent' if it was 'draft'
    if (quote.status === 'draft') {
      await db.execute(sql`
        update quotes 
        set status='sent' 
        where id=${id}::uuid and org_id=${orgId}::uuid
      `);
    }

    const response: any = { 
      ok: true, 
      message: `Quote sent successfully to ${email}`,
      email: email,
      packUsed: !!quotaCheck.reservationId,
      billingStatus: quotaCheck.reservationId ? 'charged' : 'plan_quota'
    };

    res.json(response);

  } catch (error) {
    console.error('Error sending quote email:', error);
    res.status(500).json({ error: "Failed to send quote email" });
  }
});

export default router;