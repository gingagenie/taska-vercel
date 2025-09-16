import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { jobNotifications } from "../../shared/schema";

export const twilioWebhooks = Router();

// Normalize phone number for matching
function normPhone(s?: string | null) {
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  if (digits.startsWith("04")) return "+61" + digits.slice(1);
  if (digits.startsWith("61")) return "+" + digits;
  if (digits.startsWith("0")) return "+61" + digits.slice(1);
  return s.startsWith("+") ? s : "+" + digits;
}

// POST /api/twilio/webhook/sms - Handle inbound SMS replies
twilioWebhooks.post("/webhook/sms", async (req, res) => {
  try {
    const { From, To, Body, MessageSid, AccountSid } = req.body;
    
    console.log("[TWILIO] Inbound SMS:", { From, To, Body, MessageSid });
    console.log("[TWILIO] Environment:", process.env.NODE_ENV);
    console.log("[TWILIO] Database URL:", process.env.DATABASE_URL ? "Connected" : "Missing");
    console.log("[TWILIO] Full request body:", req.body);
    console.log("[TWILIO] Request headers:", req.headers);
    
    if (!From || !Body || !MessageSid) {
      return res.status(400).send("Missing required fields");
    }

    const normalizedFrom = normPhone(From);
    const bodyUpper = Body.trim().toUpperCase();
    
    // Log the inbound message first
    await db.execute(sql`
      insert into job_notifications (org_id, channel, to_addr, body, provider_id, direction, status)
      values ('00000000-0000-0000-0000-000000000000'::uuid, 'sms', ${normalizedFrom}, ${Body}, ${MessageSid}, 'in', 'received')
    `);

    // Check if this is a YES/Y confirmation
    if (bodyUpper === "YES" || bodyUpper === "Y") {
      console.log(`[TWILIO] Processing YES confirmation from ${normalizedFrom}`);
      
      // First get org_id from any outbound SMS to this number (bypass RLS by getting org_id first)
      const orgLookup: any = await db.execute(sql`
        select org_id from job_notifications 
        where to_addr = ${normalizedFrom} 
          and direction = 'out' 
          and channel = 'sms' 
          and org_id != '00000000-0000-0000-0000-000000000000'::uuid
        order by created_at desc 
        limit 1
      `);
      
      if (orgLookup.rows?.[0]?.org_id) {
        const orgId = orgLookup.rows[0].org_id;
        console.log(`[TWILIO] Found org ${orgId}, setting RLS context`);
        
        // Set org context for RLS (matches current_org_id() function)
        await db.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
        
        // Now find the most recent outbound SMS to this phone number
        const outboundResult: any = await db.execute(sql`
          select jn.job_id, j.org_id, jn.created_at
          from job_notifications jn
          join jobs j on j.id = jn.job_id
          where jn.to_addr = ${normalizedFrom}
            and jn.direction = 'out' 
            and jn.channel = 'sms'
          order by jn.created_at desc
          limit 1
        `);

        console.log(`[TWILIO] Query result:`, outboundResult.rows);

        const outbound = outboundResult.rows?.[0];
        if (outbound && outbound.job_id) {
          const jobId = outbound.job_id;
          const orgIdFromJob = outbound.org_id;

          console.log(`[TWILIO] Found matching outbound SMS for job ${jobId}, org ${orgIdFromJob}`);

          // Update job status to confirmed with row count check
          const updateResult: any = await db.execute(sql`
            update jobs set status='confirmed' where id=${jobId}::uuid
          `);

          if (updateResult.rowCount === 0) {
            console.warn(`[TWILIO] Job update matched 0 rows`, { jobId, orgId });
          } else {
            console.log(`[TWILIO] Job ${jobId} confirmed via SMS reply (${updateResult.rowCount} rows updated)`);
          }

          // Link the inbound notification to the job
          await db.execute(sql`
            update job_notifications
               set job_id=${jobId}::uuid, org_id=${orgId}::uuid
             where provider_id=${MessageSid}
               and direction='in'
          `);
        } else {
          console.log("[TWILIO] No matching outbound SMS found for confirmation");
        }
      } else {
        console.log("[TWILIO] No org found for phone number, cannot process confirmation");
      }
    }

    // Respond to Twilio with TwiML (optional auto-reply)
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    
  } catch (error: any) {
    console.error("[TWILIO] Webhook error:", error);
    console.error("[TWILIO] Error details:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).send("Internal server error");
  }
});

// Test endpoint to verify webhook is reachable in production
twilioWebhooks.get("/webhook/test", async (req, res) => {
  res.json({ 
    status: "OK",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    message: "Twilio webhook endpoint is reachable"
  });
});