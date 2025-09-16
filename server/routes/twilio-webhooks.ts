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
      
      // Simple approach: find the most recent job sent to this phone number and confirm it
      const jobResult: any = await db.execute(sql`
        select j.id, j.org_id
        from jobs j
        join job_notifications jn on j.id = jn.job_id
        where jn.to_addr = ${normalizedFrom}
          and jn.direction = 'out'
          and jn.channel = 'sms'
        order by jn.created_at desc
        limit 1
      `);

      console.log(`[TWILIO] Job lookup result:`, jobResult.rows);

      if (jobResult.rows?.[0]?.id) {
        const jobId = jobResult.rows[0].id;
        const orgId = jobResult.rows[0].org_id;

        console.log(`[TWILIO] Confirming job ${jobId} for org ${orgId}`);

        // Just update the job status - keep it simple
        await db.execute(sql`
          update jobs set status='confirmed' where id=${jobId}
        `);

        // Link the inbound notification to the job  
        await db.execute(sql`
          update job_notifications
             set job_id=${jobId}, org_id=${orgId}
           where provider_id=${MessageSid}
             and direction='in'
        `);

        console.log(`[TWILIO] Job ${jobId} confirmed successfully`);
      } else {
        console.log("[TWILIO] No job found for this phone number");
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