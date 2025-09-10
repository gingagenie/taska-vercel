import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { db } from "../db/client";
import { sql, eq, and } from "drizzle-orm";
import { jobs as jobsSchema, customers, smsUsage, orgSubscriptions, subscriptionPlans } from "../../shared/schema";
import twilio from "twilio";

export const jobSms = Router();

// Helpers
const BIZ_TZ = process.env.BIZ_TZ || "Australia/Melbourne";
const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

if (!accountSid || !authToken || !(messagingServiceSid || fromNumber)) {
  // eslint-disable-next-line no-console
  console.warn("[job-sms] Twilio env missing; SMS route will 400 until configured.");
}
const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

// Format date in business timezone (simple, no extra deps)
function formatAEST(iso: string | null): string {
  if (!iso) return "Not scheduled";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-AU", {
      timeZone: BIZ_TZ,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso!;
  }
}

// SMS quota checking helper
async function checkSmsQuota(orgId: string): Promise<{ canSend: boolean; usage: number; quota: number; planId: string }> {
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM' format
  
  // Get organization's subscription and plan details
  const [subResult] = await db
    .select({
      planId: orgSubscriptions.planId,
      smsQuota: subscriptionPlans.smsQuotaMonthly,
    })
    .from(orgSubscriptions)
    .leftJoin(subscriptionPlans, eq(orgSubscriptions.planId, subscriptionPlans.id))
    .where(eq(orgSubscriptions.orgId, orgId));

  if (!subResult) {
    // No subscription found, deny SMS
    return { canSend: false, usage: 0, quota: 0, planId: 'none' };
  }

  const quota = subResult.smsQuota || 0;
  const planId = subResult.planId || 'free';

  // Get current month's usage
  const [usageResult] = await db
    .select({ smsCount: smsUsage.smsCount })
    .from(smsUsage)
    .where(and(eq(smsUsage.orgId, orgId), eq(smsUsage.month, currentMonth)));

  const currentUsage = usageResult?.smsCount || 0;
  
  return {
    canSend: currentUsage < quota,
    usage: currentUsage,
    quota: quota,
    planId: planId
  };
}

// SMS usage tracking helper
async function trackSmsUsage(orgId: string): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM' format
  
  // Upsert SMS usage record
  await db
    .insert(smsUsage)
    .values({
      orgId: orgId,
      month: currentMonth,
      smsCount: 1,
    })
    .onConflictDoUpdate({
      target: [smsUsage.orgId, smsUsage.month],
      set: {
        smsCount: sql`${smsUsage.smsCount} + 1`,
        updatedAt: new Date(),
      },
    });
}

/**
 * POST /api/jobs/:jobId/sms/confirm
 * body: { phone?: string, messageOverride?: string }
 * - phone: override customer phone (optional)
 * - messageOverride: override full text (optional)
 */
jobSms.post("/:jobId/sms/confirm", requireAuth, requireOrg, async (req, res) => {
  if (!client || !(messagingServiceSid || fromNumber)) {
    return res.status(400).json({ error: "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and (TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)" });
  }

  const { jobId } = req.params;
  const orgId = (req as any).orgId;
  const { phone: phoneOverride, messageOverride } = (req.body || {}) as { phone?: string; messageOverride?: string };

  // Check SMS quota before proceeding
  const quotaCheck = await checkSmsQuota(orgId);
  if (!quotaCheck.canSend) {
    return res.status(429).json({ 
      error: "SMS quota exceeded", 
      usage: quotaCheck.usage,
      quota: quotaCheck.quota,
      planId: quotaCheck.planId,
      upgradeOptions: {
        pro: { quota: 100, price: "$29/month" },
        enterprise: { quota: 500, price: "$99/month" }
      }
    });
  }

  // Pull job + customer info + organization name using proper Drizzle ORM
  const jobRows = await db
    .select({
      id: jobsSchema.id,
      title: jobsSchema.title,
      scheduled_at: jobsSchema.scheduledAt,
      description: jobsSchema.description,
      customer_id: customers.id,
      customer_name: customers.name,
      customer_phone: customers.phone,
      org_name: sql`(SELECT name FROM orgs WHERE id = ${orgId}::uuid)`.as('org_name'),
    })
    .from(jobsSchema)
    .leftJoin(customers, eq(customers.id, jobsSchema.customerId))
    .where(and(eq(jobsSchema.id, jobId), eq(jobsSchema.orgId, orgId)))
    .limit(1);

  const row = jobRows[0];
  if (!row) return res.status(404).json({ error: "Job not found" });

  // Normalize phone number for consistent formatting and matching
  function normPhone(s?: string | null) {
    if (!s) return "";
    const digits = s.replace(/[^\d]/g, "");
    if (digits.startsWith("04")) return "+61" + digits.slice(1);
    if (digits.startsWith("61")) return "+" + digits;
    if (digits.startsWith("0")) return "+61" + digits.slice(1);
    return s.startsWith("+") ? s : "+" + digits;
  }

  const rawPhone = (phoneOverride || row.customer_phone || "").trim();
  if (!rawPhone) return res.status(400).json({ error: "No customer phone on file. Provide { phone } in request body or set customer.phone." });
  
  const toPhone = normPhone(rawPhone);

  // Build default confirmation message
  const when = formatAEST(row.scheduled_at);
  const orgName = row.org_name || "Taska";
  const defaultMsg =
    `Hi from ${orgName}! Job "${row.title}" is scheduled for ${when}. Reply YES to confirm or call if you need to reschedule.`;

  const body = (messageOverride && messageOverride.trim()) || defaultMsg;

  try {
    const msg = await client!.messages.create({
      to: toPhone,
      ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber! }),
      body,
    });

    // Log outbound SMS for inbound matching
    await db.execute(sql`
      insert into job_notifications (org_id, job_id, notification_type, recipient, message, status)
      values (${orgId}::uuid, ${row.id}::uuid, 'sms', ${toPhone}, ${body}, ${msg.status})
    `);

    // Track SMS usage for quota management
    await trackSmsUsage(orgId);

    return res.json({ ok: true, sid: msg.sid, status: msg.status });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Twilio send failed" });
  }
});

/**
 * GET /api/jobs/sms/usage
 * Get current month's SMS usage for the organization
 */
jobSms.get("/sms/usage", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM' format
    
    // Get organization's subscription and plan details  
    const [subResult] = await db
      .select({
        planId: orgSubscriptions.planId,
        planName: subscriptionPlans.name,
        smsQuota: subscriptionPlans.smsQuotaMonthly,
      })
      .from(orgSubscriptions)
      .leftJoin(subscriptionPlans, eq(orgSubscriptions.planId, subscriptionPlans.id))
      .where(eq(orgSubscriptions.orgId, orgId));

    if (!subResult) {
      return res.status(404).json({ error: "No subscription found" });
    }

    // Get current month's usage
    const [usageResult] = await db
      .select({ smsCount: smsUsage.smsCount })
      .from(smsUsage)
      .where(and(eq(smsUsage.orgId, orgId), eq(smsUsage.month, currentMonth)));

    const currentUsage = usageResult?.smsCount || 0;
    const quota = subResult.smsQuota || 0;
    
    return res.json({
      month: currentMonth,
      usage: currentUsage,
      quota: quota,
      remaining: Math.max(0, quota - currentUsage),
      planId: subResult.planId,
      planName: subResult.planName,
      quotaExceeded: currentUsage >= quota,
      usagePercentage: quota > 0 ? Math.round((currentUsage / quota) * 100) : 0
    });
  } catch (error) {
    console.error("Error fetching SMS usage:", error);
    return res.status(500).json({ error: "Failed to fetch SMS usage" });
  }
});

/**
 * GET /api/jobs/sms/history
 * Get SMS usage history for multiple months
 */
jobSms.get("/sms/history", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { months = 3 } = req.query; // Default to last 3 months
    
    const history = await db
      .select({
        month: smsUsage.month,
        smsCount: smsUsage.smsCount,
      })
      .from(smsUsage)
      .where(eq(smsUsage.orgId, orgId))
      .orderBy(sql`${smsUsage.month} DESC`)
      .limit(Number(months));

    return res.json(history);
  } catch (error) {
    console.error("Error fetching SMS history:", error);
    return res.status(500).json({ error: "Failed to fetch SMS history" });
  }
});