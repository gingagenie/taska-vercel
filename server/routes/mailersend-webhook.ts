import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const WEBHOOK_SECRET = process.env.MAILERSEND_WEBHOOK_SECRET;

const STATUS_MAP: Record<string, string> = {
  "activity.sent":           "sent",
  "activity.delivered":      "delivered",
  "activity.soft_bounced":   "soft_bounced",
  "activity.hard_bounced":   "hard_bounced",
  "activity.spam_complaint": "spam_complaint",
};

router.post("/webhooks/mailersend", async (req, res) => {
  // Verify HMAC signature if secret is configured
  if (WEBHOOK_SECRET) {
    const signature = req.headers["signature"] as string | undefined;
    if (!signature) {
      console.warn("[MAILERSEND_WEBHOOK] Missing signature header");
      return res.status(401).json({ error: "Missing signature" });
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        console.warn("[MAILERSEND_WEBHOOK] Invalid signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    } catch {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  try {
    const raw = req.body;
    const payload = Buffer.isBuffer(raw)
      ? JSON.parse(raw.toString())
      : typeof raw === "string"
      ? JSON.parse(raw)
      : raw;

    const eventType: string = payload?.type ?? "";
    // MailerSend sends message_id as a flat field on data
    const messageId: string =
      payload?.data?.message_id ??
      payload?.data?.email?.message?.id ??
      payload?.data?.message?.id ??
      "";

    console.log(`[MAILERSEND_WEBHOOK] event=${eventType} messageId=${messageId || "(none)"}`);

    if (!messageId) {
      console.warn("[MAILERSEND_WEBHOOK] No message ID in payload:", JSON.stringify(payload?.data).slice(0, 300));
      return res.status(200).json({ ok: true, skipped: "no message id" });
    }

    const newStatus = STATUS_MAP[eventType];
    if (!newStatus) {
      return res.status(200).json({ ok: true, skipped: `unhandled event: ${eventType}` });
    }

    let rowsAffected = 0;
    try {
      console.log(`[MAILERSEND_WEBHOOK] Running UPDATE invoices SET email_status='${newStatus}' WHERE email_message_id='${messageId}'`);
      const result: any = await db.execute(sql`
        UPDATE invoices
        SET email_status = ${newStatus}
        WHERE email_message_id = ${messageId}
        RETURNING id
      `);
      rowsAffected = Array.isArray(result) ? result.length : 0;
      console.log(`[MAILERSEND_WEBHOOK] UPDATE complete — rows affected: ${rowsAffected}`);
      if (rowsAffected === 0) {
        console.warn(`[MAILERSEND_WEBHOOK] Zero rows updated for messageId=${messageId} — check email_message_id column in DB`);
      } else {
        console.log(`[MAILERSEND_WEBHOOK] email_status set to '${newStatus}' on invoice ${(result as any[])[0]?.id}`);
      }
    } catch (dbErr: any) {
      console.error(`[MAILERSEND_WEBHOOK] DB UPDATE failed for messageId=${messageId}:`, dbErr?.message ?? dbErr);
      return res.status(500).json({ error: "DB update failed" });
    }

    return res.status(200).json({ ok: true, rowsAffected });
  } catch (e: any) {
    console.error("[MAILERSEND_WEBHOOK] Unexpected error:", e);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
