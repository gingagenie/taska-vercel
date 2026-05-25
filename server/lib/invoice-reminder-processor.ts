/**
 * INVOICE OVERDUE REMINDER PROCESSOR
 *
 * Runs in the background every 6 hours. Finds all unpaid invoices that are
 * past their due date and sends a reminder email to the customer, at most
 * once every 7 days per invoice.
 */

import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { sendEmail, generateInvoiceReminderTemplate } from "../services/email";
import { trackEmailUsage, checkEmailQuota } from "../routes/job-sms";
import { releasePackReservation, durableFinalizePackConsumption } from "./pack-consumption";

const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

let reminderWorkerInterval: NodeJS.Timeout | null = null;
let isProcessingReminders = false;

async function processOverdueInvoiceReminders(): Promise<void> {
  if (isProcessingReminders) {
    console.log("[REMINDER] Skipping run: previous cycle still in progress");
    return;
  }

  isProcessingReminders = true;

  try {
    const overdueInvoices: any[] = await db.execute(sql`
      SELECT
        i.id,
        i.org_id,
        i.number,
        i.title,
        i.status,
        i.due_at,
        i.grand_total,
        i.items,
        i.notes,
        i.created_at,
        i.reminder_count,
        c.name    AS customer_name,
        c.email   AS customer_email,
        c.contact_name,
        c.phone,
        c.street,
        c.suburb,
        c.state,
        c.postcode,
        o.name            AS org_name,
        o.abn,
        o.street          AS org_street,
        o.suburb          AS org_suburb,
        o.state           AS org_state,
        o.postcode        AS org_postcode,
        o.account_name,
        o.bsb,
        o.account_number,
        o.invoice_terms
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id AND c.org_id = i.org_id
      JOIN orgs o      ON o.id = i.org_id
      WHERE i.status NOT IN ('paid', 'void')
        AND i.due_at IS NOT NULL
        AND i.due_at < now() AT TIME ZONE 'UTC' - INTERVAL '3 days'
        AND c.email IS NOT NULL
        AND c.email <> ''
        AND (
          i.last_reminder_sent_at IS NULL
          OR i.last_reminder_sent_at < now() - INTERVAL '7 days'
        )
    `);

    if (overdueInvoices.length === 0) {
      console.log("[REMINDER] No overdue invoices pending reminders");
      return;
    }

    console.log(`[REMINDER] Processing reminders for ${overdueInvoices.length} overdue invoice(s)`);

    for (const invoice of overdueInvoices) {
      try {
        await sendReminderForInvoice(invoice);
      } catch (err) {
        console.error(`[REMINDER] Error sending reminder for invoice ${invoice.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[REMINDER] Fatal error in reminder processor:", err);
  } finally {
    isProcessingReminders = false;
  }
}

async function sendReminderForInvoice(invoice: any): Promise<void> {
  const orgId = invoice.org_id;

  const customer = {
    name: invoice.customer_name,
    contact_name: invoice.contact_name,
    email: invoice.customer_email,
    phone: invoice.phone,
    street: invoice.street,
    suburb: invoice.suburb,
    state: invoice.state,
    postcode: invoice.postcode,
  };

  const organization = {
    name: invoice.org_name,
    abn: invoice.abn,
    street: invoice.org_street,
    suburb: invoice.org_suburb,
    state: invoice.org_state,
    postcode: invoice.org_postcode,
    account_name: invoice.account_name,
    bsb: invoice.bsb,
    account_number: invoice.account_number,
    invoice_terms: invoice.invoice_terms,
  };

  // Quota check — same flow as manual invoice email
  const quotaCheck = await checkEmailQuota(orgId);
  if (!quotaCheck.canSend) {
    console.log(
      `[REMINDER] Skipping invoice ${invoice.number || invoice.id} (org ${orgId}): email quota exceeded`
    );
    return;
  }

  const invoiceData = {
    ...invoice,
    items:
      typeof invoice.items === "string"
        ? JSON.parse(invoice.items)
        : (invoice.items ?? []),
  };

  const { subject, html, text } = generateInvoiceReminderTemplate(
    invoiceData,
    organization,
    customer
  );

  const emailSent = await sendEmail({
    to: invoice.customer_email,
    from: `${organization.name} <noreply@taska.info>`,
    subject,
    html,
    text,
  });

  if (!emailSent) {
    if (quotaCheck.reservationId) {
      await releasePackReservation(quotaCheck.reservationId).catch((err) =>
        console.error(`[REMINDER] Failed to release pack reservation:`, err)
      );
    }
    console.error(
      `[REMINDER] Failed to send reminder for invoice ${invoice.number || invoice.id}`
    );
    return;
  }

  // Finalize pack consumption if a pack was reserved
  if (quotaCheck.reservationId) {
    await durableFinalizePackConsumption(quotaCheck.reservationId, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      failRequestOnPersistentFailure: false,
    }).catch((err) =>
      console.error(`[REMINDER] Failed to finalize pack consumption:`, err)
    );
  }

  try {
    await trackEmailUsage(orgId);
  } catch (err) {
    console.error("[REMINDER] Failed to track email usage:", err);
  }

  const reminderNum = (Number(invoice.reminder_count) || 0) + 1;

  // Record the send so we don't remind again for 7 days
  await db.execute(sql`
    UPDATE invoices
    SET last_reminder_sent_at = now(),
        reminder_count        = COALESCE(reminder_count, 0) + 1
    WHERE id = ${invoice.id}::uuid
  `);

  await db.execute(sql`
    INSERT INTO invoice_reminder_logs (invoice_id, org_id, recipient_email, reminder_number, status)
    VALUES (${invoice.id}::uuid, ${orgId}::uuid, ${invoice.customer_email}, ${reminderNum}, 'sent')
  `);

  console.log(
    `[REMINDER] Sent reminder #${reminderNum} for invoice ${invoice.number || invoice.id} → ${invoice.customer_email}`
  );
}

export function startInvoiceReminderProcessor(): void {
  if (reminderWorkerInterval) {
    console.log("[REMINDER] Worker already running");
    return;
  }

  // Initial run on startup (catches anything that accumulated while server was down)
  processOverdueInvoiceReminders().catch((err) =>
    console.error("[REMINDER] Error in initial run:", err)
  );

  reminderWorkerInterval = setInterval(() => {
    processOverdueInvoiceReminders().catch((err) =>
      console.error("[REMINDER] Error in scheduled run:", err)
    );
  }, REMINDER_INTERVAL_MS);

  console.log(
    `[REMINDER] Invoice reminder processor started — checking every ${REMINDER_INTERVAL_MS / 1000 / 60 / 60}h`
  );
}

export function stopInvoiceReminderProcessor(): void {
  if (reminderWorkerInterval) {
    clearInterval(reminderWorkerInterval);
    reminderWorkerInterval = null;
    console.log("[REMINDER] Invoice reminder processor stopped");
  }
}
