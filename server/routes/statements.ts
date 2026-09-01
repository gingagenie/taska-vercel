import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { checkSubscription, requireActiveSubscription } from "../middleware/subscription";
import { sendEmail, generateStatementEmailTemplate } from "../services/email";
import {
  generateStatementPdf,
  generateStatementPdfFilename,
  type StatementInvoiceRow,
  type StatementPayload,
} from "../services/pdf";
import { trackEmailUsage } from "./job-sms";

const router = Router();

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

function fmtDateAU(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-AU");
}

/**
 * Build the full statement dataset for a customer.
 * Excludes draft and void invoices (a statement only shows issued documents).
 * - outstandingOnly: returns all unpaid (status='sent') invoices, ignoring the date range.
 * - otherwise: returns sent + paid invoices whose date falls within [dateFrom, dateTo].
 * "Invoice date" = COALESCE(issued_at, created_at).
 */
async function buildStatementData(
  orgId: string,
  customerId: string,
  dateFrom: string | null,
  dateTo: string | null,
  outstandingOnly: boolean
): Promise<StatementPayload | null> {
  const orgResult: any = await db.execute(sql`
    select name, abn, street, suburb, state, postcode, logo_url,
           account_name, bsb, account_number, invoice_terms
    from orgs where id=${orgId}::uuid
  `);
  const organization = orgResult[0] || {};

  const customerResult: any = await db.execute(sql`
    select id, name, contact_name, email, phone, street, suburb, state, postcode, address
    from customers where id=${customerId}::uuid and org_id=${orgId}::uuid
  `);
  const customer = customerResult[0];
  if (!customer) return null;

  const dateExpr = sql`COALESCE(i.issued_at, i.created_at)`;
  const filter = outstandingOnly
    ? sql`AND i.status = 'sent'`
    : sql`AND i.status <> 'draft' AND ${dateExpr}::date BETWEEN ${dateFrom}::date AND ${dateTo}::date`;

  const rows: any = await db.execute(sql`
    select
      i.number,
      ${dateExpr} as invoice_date,
      i.due_at,
      COALESCE(NULLIF(i.title, ''), (
        select il.description from invoice_lines il
        where il.invoice_id = i.id
        order by il.position asc nulls last, il.created_at asc nulls last
        limit 1
      )) as description,
      COALESCE(i.grand_total, 0) as total,
      i.status
    from invoices i
    where i.org_id = ${orgId}::uuid
      and i.customer_id = ${customerId}::uuid
      and i.status <> 'void'
      ${filter}
    order by ${dateExpr} asc
  `);

  const now = Date.now();
  const invoices: StatementInvoiceRow[] = (rows || []).map((r: any) => {
    const total = Number(r.total || 0);
    const isOverdue =
      r.status === "sent" && r.due_at != null && new Date(r.due_at).getTime() < now;
    return {
      number: r.number,
      invoice_date: r.invoice_date,
      due_at: r.due_at,
      description: r.description,
      total,
      status: r.status,
      is_overdue: isOverdue,
    };
  });

  const totals = invoices.reduce(
    (acc, r) => {
      acc.invoiced += r.total;
      if (r.status === "paid") acc.paid += r.total;
      else acc.outstanding += r.total;
      return acc;
    },
    { invoiced: 0, paid: 0, outstanding: 0 }
  );
  totals.invoiced = Math.round(totals.invoiced * 100) / 100;
  totals.paid = Math.round(totals.paid * 100) / 100;
  totals.outstanding = Math.round(totals.outstanding * 100) / 100;

  const statementDate = new Date().toISOString();
  const periodLabel = outstandingOnly
    ? `Outstanding invoices as at ${fmtDateAU(statementDate)}`
    : `${fmtDateAU(dateFrom)} – ${fmtDateAU(dateTo)}`;

  return {
    organization,
    customer,
    invoices,
    totals,
    statementDate,
    periodLabel,
    outstandingOnly,
  };
}

function validateInput(body: any): { ok: true } | { ok: false; error: string } {
  const { customerId, dateFrom, dateTo, outstandingOnly } = body || {};
  if (!isUuid(customerId)) return { ok: false, error: "Valid customerId is required" };
  if (!outstandingOnly) {
    if (!dateFrom || !dateTo) {
      return { ok: false, error: "dateFrom and dateTo are required unless outstandingOnly is set" };
    }
    const isDate = (v: string) => !Number.isNaN(new Date(v).getTime());
    if (!isDate(dateFrom) || !isDate(dateTo)) {
      return { ok: false, error: "dateFrom and dateTo must be valid dates" };
    }
  }
  return { ok: true };
}

/** Preview: returns invoice rows + totals for the modal summary. */
router.post(
  "/preview",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const orgId = (req as any).orgId;
    const { customerId, dateFrom = null, dateTo = null, outstandingOnly = false } = req.body || {};

    const valid = validateInput(req.body);
    if (!valid.ok) return res.status(400).json({ error: valid.error });

    try {
      const data = await buildStatementData(
        orgId,
        customerId,
        dateFrom,
        dateTo,
        !!outstandingOnly
      );
      if (!data) return res.status(404).json({ error: "Customer not found" });

      res.json({
        customer: { id: data.customer.id, name: data.customer.name, email: data.customer.email },
        periodLabel: data.periodLabel,
        count: data.invoices.length,
        totals: data.totals,
        invoices: data.invoices,
      });
    } catch (error) {
      console.error("[STATEMENT] preview error:", error);
      res.status(500).json({ error: "Failed to build statement preview" });
    }
  }
);

/** Generate: produces the PDF and delivers it as a download, email, or both. */
router.post(
  "/generate",
  requireAuth,
  requireOrg,
  checkSubscription,
  requireActiveSubscription,
  async (req, res) => {
    const orgId = (req as any).orgId;
    const {
      customerId,
      dateFrom = null,
      dateTo = null,
      outstandingOnly = false,
      delivery = "pdf",
      fromEmail = "noreply@taska.info",
      fromName = "Taska",
    } = req.body || {};

    const valid = validateInput(req.body);
    if (!valid.ok) return res.status(400).json({ error: valid.error });
    if (!["pdf", "email", "both"].includes(delivery)) {
      return res.status(400).json({ error: "delivery must be 'pdf', 'email', or 'both'" });
    }

    try {
      const data = await buildStatementData(
        orgId,
        customerId,
        dateFrom,
        dateTo,
        !!outstandingOnly
      );
      if (!data) return res.status(404).json({ error: "Customer not found" });

      const sendEmailRequested = delivery === "email" || delivery === "both";
      const sendPdfRequested = delivery === "pdf" || delivery === "both";

      // Validate recipient up-front so an email-only request fails cleanly.
      const recipient = data.customer.email;
      if (sendEmailRequested && !recipient) {
        return res
          .status(400)
          .json({ error: "This customer has no email address on file" });
      }

      const pdfBuffer = await generateStatementPdf(data);
      const filename = generateStatementPdfFilename(data.customer);

      let emailSent = false;
      if (sendEmailRequested) {
        const { subject, html, text } = generateStatementEmailTemplate(data);
        emailSent = await sendEmail({
          to: recipient,
          from: `${fromName} <${fromEmail}>`,
          subject,
          html,
          text,
          attachments: [{ filename, content: pdfBuffer.toString("base64") }],
        });

        if (!emailSent && delivery === "email") {
          return res.status(500).json({ error: "Failed to send statement email" });
        }
        if (emailSent) {
          try {
            await trackEmailUsage(orgId);
          } catch (err) {
            console.error("[STATEMENT] Failed to track email usage:", err);
          }
        }
      }

      if (sendPdfRequested) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        if (sendEmailRequested) {
          res.setHeader("X-Statement-Email", emailSent ? "sent" : "failed");
          res.setHeader("X-Statement-Recipient", recipient || "");
        }
        return res.send(pdfBuffer);
      }

      // email-only success
      return res.json({
        ok: true,
        message: `Statement sent to ${recipient}`,
        recipient,
      });
    } catch (error) {
      console.error("[STATEMENT] generate error:", error);
      res.status(500).json({ error: "Failed to generate statement" });
    }
  }
);

export default router;
