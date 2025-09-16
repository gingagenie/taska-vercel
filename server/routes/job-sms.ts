import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { db } from "../db/client";
import { sql, eq, and, lte, lt, gt, asc } from "drizzle-orm";
import { jobs as jobsSchema, customers, usageCounters, orgSubscriptions, subscriptionPlans, usagePacks } from "../../shared/schema";
import twilio from "twilio";
import { reservePackUnits, finalizePackConsumption, releasePackReservation, checkPackAvailability, durableFinalizePackConsumption } from "../lib/pack-consumption";

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

// Helper to get normalized period boundaries [start inclusive, end exclusive)
function getCurrentPeriodBoundaries() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);   // First day of next month
  return { periodStart, periodEnd, now };
}

// Enhanced quota check result type
type QuotaCheckResult = {
  canSend: boolean;
  usage: number;
  quota: number;
  planId: string;
  reservationId?: string;  // For two-phase consumption
  packAvailable?: boolean;
  remainingPacks?: number;
  packType?: 'sms' | 'email';
  error?: 'no_packs' | 'db_error';
  errorMessage?: string;
};

// DEPRECATED - Replaced with atomic two-phase consumption
// See server/lib/pack-consumption.ts for new implementation

// Enhanced SMS quota checking with atomic pack reservation
export async function checkSmsQuota(orgId: string): Promise<QuotaCheckResult> {
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
  const { now } = getCurrentPeriodBoundaries();

  // Get current month's usage using range query [start <= now < end)
  const [usageResult] = await db
    .select({ smsSent: usageCounters.smsSent })
    .from(usageCounters)
    .where(and(
      eq(usageCounters.orgId, orgId),
      lte(usageCounters.periodStart, now),  // period_start <= now
      gt(usageCounters.periodEnd, now)      // period_end > now
    ));

  const currentUsage = usageResult?.smsSent || 0;
  
  // If within plan quota, allow sending (no pack needed)
  if (currentUsage < quota) {
    return {
      canSend: true,
      usage: currentUsage,
      quota: quota,
      planId: planId
    };
  }

  // Plan quota exceeded - check if packs are available
  const packAvailability = await checkPackAvailability(orgId, 'sms', 1);
  
  if (packAvailability.error === 'db_error') {
    // Database error - don't treat as quota exceeded
    return {
      canSend: false,
      usage: currentUsage,
      quota: quota,
      planId: planId,
      error: 'db_error',
      errorMessage: packAvailability.errorMessage || 'Database error checking packs',
      packType: 'sms'
    };
  }

  if (packAvailability.canConsume) {
    // Packs available - reserve one unit for sending
    const reservation = await reservePackUnits(orgId, 'sms', 1);
    
    if (reservation.success) {
      return {
        canSend: true,
        usage: currentUsage,
        quota: quota,
        planId: planId,
        reservationId: reservation.reservationId,
        packAvailable: true,
        remainingPacks: packAvailability.availablePacks - 1,
        packType: 'sms'
      };
    } else {
      // Pack reservation failed
      return {
        canSend: false,
        usage: currentUsage,
        quota: quota,
        planId: planId,
        error: reservation.error,
        errorMessage: reservation.errorMessage || 'Failed to reserve pack unit',
        packType: 'sms'
      };
    }
  }

  // No packs available - deny sending
  return {
    canSend: false,
    usage: currentUsage,
    quota: quota,
    planId: planId,
    packAvailable: false,
    remainingPacks: packAvailability.availablePacks,
    error: 'no_packs',
    packType: 'sms'
  };
}

// Enhanced email quota checking with atomic pack reservation
export async function checkEmailQuota(orgId: string): Promise<QuotaCheckResult> {
  // Get organization's subscription and plan details
  const [subResult] = await db
    .select({
      planId: orgSubscriptions.planId,
      emailQuota: subscriptionPlans.emailsQuotaMonthly,
    })
    .from(orgSubscriptions)
    .leftJoin(subscriptionPlans, eq(orgSubscriptions.planId, subscriptionPlans.id))
    .where(eq(orgSubscriptions.orgId, orgId));

  if (!subResult) {
    // No subscription found, deny email
    return { canSend: false, usage: 0, quota: 0, planId: 'none' };
  }

  const quota = subResult.emailQuota || 0;
  const planId = subResult.planId || 'free';
  const { now } = getCurrentPeriodBoundaries();

  // Get current month's usage using range query [start <= now < end)
  const [usageResult] = await db
    .select({ emailsSent: usageCounters.emailsSent })
    .from(usageCounters)
    .where(and(
      eq(usageCounters.orgId, orgId),
      lte(usageCounters.periodStart, now),  // period_start <= now
      gt(usageCounters.periodEnd, now)      // period_end > now
    ));

  const currentUsage = usageResult?.emailsSent || 0;
  
  // If within plan quota, allow sending (no pack needed)
  if (currentUsage < quota) {
    return {
      canSend: true,
      usage: currentUsage,
      quota: quota,
      planId: planId
    };
  }

  // Plan quota exceeded - check if packs are available
  const packAvailability = await checkPackAvailability(orgId, 'email', 1);
  
  if (packAvailability.error === 'db_error') {
    // Database error - don't treat as quota exceeded
    return {
      canSend: false,
      usage: currentUsage,
      quota: quota,
      planId: planId,
      error: 'db_error',
      errorMessage: packAvailability.errorMessage || 'Database error checking packs',
      packType: 'email'
    };
  }

  if (packAvailability.canConsume) {
    // Packs available - reserve one unit for sending
    const reservation = await reservePackUnits(orgId, 'email', 1);
    
    if (reservation.success) {
      return {
        canSend: true,
        usage: currentUsage,
        quota: quota,
        planId: planId,
        reservationId: reservation.reservationId,
        packAvailable: true,
        remainingPacks: packAvailability.availablePacks - 1,
        packType: 'email'
      };
    } else {
      // Pack reservation failed
      return {
        canSend: false,
        usage: currentUsage,
        quota: quota,
        planId: planId,
        error: reservation.error,
        errorMessage: reservation.errorMessage || 'Failed to reserve pack unit',
        packType: 'email'
      };
    }
  }

  // No packs available - deny sending
  return {
    canSend: false,
    usage: currentUsage,
    quota: quota,
    planId: planId,
    packAvailable: false,
    remainingPacks: packAvailability.availablePacks,
    error: 'no_packs',
    packType: 'email'
  };
}

// SMS usage tracking helper
async function trackSmsUsage(orgId: string): Promise<void> {
  // Get normalized period boundaries [start, end) pattern
  const { periodStart, periodEnd } = getCurrentPeriodBoundaries();
  
  // Upsert usage_counters record with normalized boundaries
  await db
    .insert(usageCounters)
    .values({
      orgId: orgId,
      periodStart: periodStart,
      periodEnd: periodEnd,
      smsSent: 1,
      emailsSent: 0,
    })
    .onConflictDoUpdate({
      target: [usageCounters.orgId, usageCounters.periodStart, usageCounters.periodEnd],
      set: {
        smsSent: sql`${usageCounters.smsSent} + 1`,
        updatedAt: new Date(),
      },
    });
}

// Email usage tracking helper
export async function trackEmailUsage(orgId: string): Promise<void> {
  // Get normalized period boundaries [start, end) pattern
  const { periodStart, periodEnd } = getCurrentPeriodBoundaries();
  
  // Upsert usage_counters record with normalized boundaries
  await db
    .insert(usageCounters)
    .values({
      orgId: orgId,
      periodStart: periodStart,
      periodEnd: periodEnd,
      smsSent: 0,
      emailsSent: 1,
    })
    .onConflictDoUpdate({
      target: [usageCounters.orgId, usageCounters.periodStart, usageCounters.periodEnd],
      set: {
        emailsSent: sql`${usageCounters.emailsSent} + 1`,
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

  // PHASE 1: Check SMS quota and reserve pack unit if needed
  const quotaCheck = await checkSmsQuota(orgId);
  if (!quotaCheck.canSend) {
    // Distinguish between different failure types for proper error handling
    let statusCode = 429; // Default to quota exceeded
    let errorMessage = "SMS quota exceeded";
    
    if (quotaCheck.error === 'db_error') {
      statusCode = 500;
      errorMessage = quotaCheck.errorMessage || "Database error checking SMS quota";
    } else if (quotaCheck.error === 'no_packs') {
      errorMessage = "SMS quota exceeded and no packs available";
    }
    
    const errorDetails: any = {
      error: errorMessage,
      usage: quotaCheck.usage,
      quota: quotaCheck.quota,
      planId: quotaCheck.planId,
      packInfo: {
        type: quotaCheck.packType,
        remainingPacks: quotaCheck.remainingPacks || 0,
        packAvailable: quotaCheck.packAvailable || false
      },
      solutions: {
        immediate: quotaCheck.remainingPacks === 0 ? 
          ["Purchase SMS packs", "Upgrade subscription plan"] :
          ["Contact support - pack reservation failed"],
        packs: {
          sms_pack_100: { quantity: 100, price: "$5.00" },
          sms_pack_500: { quantity: 500, price: "$20.00" },
          sms_pack_1000: { quantity: 1000, price: "$35.00" }
        },
        upgrade: {
          pro: { quota: 200, price: "$29/month" },
          enterprise: { quota: 1000, price: "$99/month" }
        }
      }
    };

    return res.status(statusCode).json(errorDetails);
  }

  // Log if pack was reserved for this SMS
  if (quotaCheck.reservationId) {
    console.log(`[SMS] Pack reserved for org ${orgId}: ${quotaCheck.packType} pack reserved, ${quotaCheck.remainingPacks} packs remaining after send`);
  }

  // Pull job + customer info + organization name using proper Drizzle ORM
  const jobRows = await db
    .select({
      id: jobsSchema.id,
      title: jobsSchema.title,
      scheduled_at: sql`${jobsSchema.scheduledAt}::text`.as('scheduled_at'),
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
  const when = formatAEST(row.scheduled_at as string);
  const orgName = row.org_name || "Taska";
  const defaultMsg =
    `Hi from ${orgName}! Job "${row.title}" is scheduled for ${when}. Reply YES to confirm or call if you need to reschedule.`;

  const body = (messageOverride && messageOverride.trim()) || defaultMsg;

  // PHASE 2: Attempt to send SMS via Twilio
  try {
    const msg = await client!.messages.create({
      to: toPhone,
      ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber! }),
      body,
    });

    // PHASE 3A: SMS sent successfully - CRITICAL: MUST finalize pack consumption
    // Using fail-safe approach: prefer failing request over under-billing
    if (quotaCheck.reservationId) {
      try {
        console.log(`[SMS] SMS sent successfully, finalizing pack consumption: ${quotaCheck.reservationId}`);
        
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
          console.error(`[SMS] CRITICAL: Failed to finalize pack consumption after retry attempts: ${finalizeResult.errorMessage}`);
          
          // The durable finalize function should have thrown an error if failRequestOnPersistentFailure is true
          // If we reach here, something went wrong with the fail-safe logic
          throw new Error(`BILLING ERROR: SMS delivered but failed to charge after ${finalizeResult.attemptCount} attempts`);
        }
        
        console.log(`[SMS] Pack consumption finalized successfully after ${finalizeResult.attemptCount} attempts`);
      } catch (error) {
        // CRITICAL BILLING ERROR: SMS was delivered but we cannot charge for it
        console.error(`[SMS] CRITICAL BILLING ERROR: SMS sent to ${toPhone} but pack finalization failed:`, error);
        
        // Log the critical billing error for manual intervention
        await db.execute(sql`
          insert into job_notifications (org_id, job_id, notification_type, recipient, message, status, error_details)
          values (${orgId}::uuid, ${row.id}::uuid, 'sms_billing_error'::text, ${toPhone}::text, ${body}::text, 'billing_error'::text, ${String(error)}::text)
        `).catch(logError => {
          console.error(`[SMS] Failed to log billing error:`, logError);
        });
        
        // FAIL-SAFE: Return error to prevent under-billing
        // This means user sees the SMS as "failed" even though it was delivered
        // This is better than allowing free SMS delivery
        return res.status(500).json({
          error: "SMS delivered but billing failed - contact support immediately",
          severity: "critical",
          billingError: true,
          twilioSid: msg.sid,
          support: "This SMS was delivered but could not be charged. Please contact support for billing adjustment."
        });
      }
    }

    // Log outbound SMS for inbound matching
    await db.execute(sql`
      insert into job_notifications (org_id, job_id, notification_type, recipient, message, status)
      values (${orgId}::uuid, ${row.id}::uuid, 'sms'::text, ${toPhone}::text, ${body}::text, ${String(msg.status)}::text)
    `);

    // Track SMS usage for quota management
    try {
      await trackSmsUsage(orgId);
    } catch (error) {
      console.error('Failed to track SMS usage:', error);
      // Don't fail the request if usage tracking fails
    }

    const response: any = { 
      ok: true, 
      sid: msg.sid, 
      status: msg.status,
      packUsed: !!quotaCheck.reservationId,
      billingStatus: quotaCheck.reservationId ? 'charged' : 'plan_quota'
    };

    return res.json(response);
  } catch (e: any) {
    // PHASE 3B: SMS send failed - release pack reservation
    if (quotaCheck.reservationId) {
      console.log(`[SMS] Send failed, releasing pack reservation: ${quotaCheck.reservationId}`);
      const releaseResult = await releasePackReservation(quotaCheck.reservationId);
      if (!releaseResult.success) {
        console.error(`[SMS] Failed to release pack reservation: ${releaseResult.errorMessage}`);
        // This is serious - user may be charged for failed send
      }
    }

    return res.status(500).json({ 
      error: e?.message || "Twilio send failed",
      packReservationReleased: !!quotaCheck.reservationId
    });
  }
});

/**
 * GET /api/jobs/sms/usage
 * Get current month's SMS usage for the organization
 */
jobSms.get("/sms/usage", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = (req as any).orgId;
    const { now } = getCurrentPeriodBoundaries();
    const currentMonth = now.toISOString().slice(0, 7); // For display compatibility
    
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

    // Get current month's usage using range query [start <= now < end)
    const [usageResult] = await db
      .select({ smsSent: usageCounters.smsSent })
      .from(usageCounters)
      .where(and(
        eq(usageCounters.orgId, orgId),
        lte(usageCounters.periodStart, now),  // period_start <= now
        gt(usageCounters.periodEnd, now)      // period_end > now
      ));

    const currentUsage = usageResult?.smsSent || 0;
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
        month: sql<string>`TO_CHAR(${usageCounters.periodStart}, 'YYYY-MM')`.as('month'),
        smsCount: usageCounters.smsSent,
        periodStart: usageCounters.periodStart,
        periodEnd: usageCounters.periodEnd,
      })
      .from(usageCounters)
      .where(eq(usageCounters.orgId, orgId))
      .orderBy(sql`${usageCounters.periodStart} DESC`)
      .limit(Number(months));

    return res.json(history);
  } catch (error) {
    console.error("Error fetching SMS history:", error);
    return res.status(500).json({ error: "Failed to fetch SMS history" });
  }
});