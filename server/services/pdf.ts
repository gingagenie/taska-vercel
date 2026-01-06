import puppeteer from "puppeteer";
import PDFDocument from "pdfkit";
import { generateInvoiceEmailTemplate } from "./email";

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-AU");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-AU");
}

function formatMoney(
  value: number | string | null | undefined,
  currency?: string | null
): string {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  const cur = currency || "AUD";
  return `${num.toFixed(2)} ${cur}`;
}

function escapeHtml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------------------------------------------------------
   INVOICE PDF (Puppeteer first, fallback to PDFKit)
--------------------------------------------------------- */

async function generateInvoicePdfWithPuppeteer(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.emulateMediaType("screen");

    const { html } = generateInvoiceEmailTemplate(
      invoice,
      organization,
      customer
    );

    const pdfHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8">
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; }
      </style>
      </head><body>${html}</body></html>
    `;

    await page.setContent(pdfHtml, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await new Promise((r) => setTimeout(r, 800));

    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(buffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Fallback PDF generator – clean invoice layout instead of raw JSON.
 */
function generateInvoicePdfWithPdfKitSync(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    const currency = invoice.currency || "AUD";

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc
      .fontSize(20)
      .text(organization?.name || "Your Business", { align: "left" });
    doc.fontSize(10).text(organization?.abn ? `ABN: ${organization.abn}` : "", {
      align: "left",
    });
    doc.moveUp(2);
    doc.fontSize(18).text("INVOICE", { align: "right" });

    doc.moveDown();

    // Invoice + customer details
    const leftX = 50;
    const rightX = 320;

    doc
      .fontSize(11)
      .text("Bill To", leftX, doc.y, { bold: true })
      .moveDown(0.3);
    doc.fontSize(10);
    doc.text(customer?.name || "", leftX);
    if (customer?.email) doc.text(customer.email, leftX);
    if (customer?.address) doc.text(customer.address, leftX);

    doc.fontSize(11).text("Invoice Details", rightX, 120);
    doc.fontSize(10);
    doc.text(`Invoice #: ${invoice.number || "-"}`, rightX);
    doc.text(`Date: ${formatDate(invoice.created_at)}`, rightX);
    doc.text(`Due Date: ${formatDate(invoice.due_at)}`, rightX);
    if (invoice.status)
      doc.text(`Status: ${String(invoice.status).toUpperCase()}`, rightX);

    doc.moveDown(2);

    // Notes
    if (invoice.notes) {
      doc
        .fontSize(11)
        .text("Notes", { underline: true })
        .moveDown(0.3);
      doc.fontSize(10).text(invoice.notes);
      doc.moveDown();
    }

    // Line items table
    const tableTop = doc.y + 10;
    const descriptionX = leftX;
    const qtyX = 320;
    const unitX = 380;
    const totalX = 450;

    doc
      .fontSize(11)
      .text("Description", descriptionX, tableTop)
      .text("Qty", qtyX, tableTop)
      .text("Unit", unitX, tableTop)
      .text("Total", totalX, tableTop);

    doc
      .moveTo(leftX, tableTop + 14)
      .lineTo(550, tableTop + 14)
      .stroke();

    doc.fontSize(10);
    let y = tableTop + 20;

    (invoice.items || []).forEach((item: any) => {
      const qty = item.quantity ?? 0;
      const unit = item.unit_price ?? 0;
      const lineTotal = Number(qty) * Number(unit);

      doc.text(item.description || "", descriptionX, y, { width: 250 });
      doc.text(Number(qty).toFixed(2), qtyX, y);
      doc.text(Number(unit).toFixed(2), unitX, y);
      doc.text(lineTotal.toFixed(2), totalX, y);

      y += 18;
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveTo(leftX, y + 4).lineTo(550, y + 4).stroke();

    // Totals
    y += 20;
    doc.fontSize(10);

    doc.text(
      `Subtotal: ${formatMoney(invoice.sub_total, currency)}`,
      totalX - 40,
      y
    );
    y += 14;

    if (invoice.tax_total != null) {
      doc.text(
        `GST: ${formatMoney(invoice.tax_total, currency)}`,
        totalX - 40,
        y
      );
      y += 14;
    }

    doc.fontSize(11).text(
      `Total: ${formatMoney(invoice.grand_total, currency)}`,
      totalX - 40,
      y
    );

    doc.end();
  });
}

export async function generateInvoicePdf(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  try {
    return await generateInvoicePdfWithPuppeteer(
      invoice,
      organization,
      customer
    );
  } catch (err) {
    console.error("[PDF] Puppeteer failed, using PDFKit fallback", err);
    return await generateInvoicePdfWithPdfKitSync(
      invoice,
      organization,
      customer
    );
  }
}

export async function generateInvoicePdfFilename(
  invoice: any
): Promise<string> {
  const num = invoice.number || "invoice";
  const title = invoice.title
    ? invoice.title.replace(/[^a-zA-Z0-9\s-]/g, "").substring(0, 30)
    : "";
  return title
    ? `${num}-${title.replace(/\s+/g, "-").toLowerCase()}.pdf`
    : `${num}.pdf`;
}

/* ---------------------------------------------------------
   SERVICE SHEET PDF (Puppeteer first, fallback to PDFKit)
--------------------------------------------------------- */

export type ServiceSheetPayload = {
  completedJob: any;
  organization: any;
  customer: any;
  equipment: any[]; // completed_job_equipment rows
  notes: any[]; // completed_job_notes rows
  parts: any[]; // completed_job_parts rows
  hours: any[]; // completed_job_hours rows
  charges: any[]; // completed_job_charges rows
  photos: any[]; // completed_job_photos rows (not rendered yet, but kept for future)
};

function serviceSheetHtml(p: ServiceSheetPayload): string {
  const {
    completedJob,
    organization,
    customer,
    equipment,
    notes,
    parts,
    hours,
    charges,
  } = p;

  const jobTitle = completedJob?.title || "Service Sheet";
  const completedAt = formatDateTime(completedJob?.completed_at);
  const scheduledAt = formatDateTime(completedJob?.scheduled_at);
  const jobType = completedJob?.job_type || "-";

  const equipLines = (equipment || [])
    .map((e: any) => escapeHtml(e.equipment_name || e.name || ""))
    .filter(Boolean);
  const equipText = equipLines.length ? equipLines.join("<br/>") : "-";

  const noteLines = [
    completedJob?.notes ? escapeHtml(completedJob.notes) : "",
    ...(notes || []).map((n: any) => escapeHtml(n.text)).filter(Boolean),
  ].filter(Boolean);

  const partsRows = (parts || []).map((p2: any) => ({
    name: p2.part_name,
    qty: p2.quantity ?? 1,
  }));

  const hoursRows = (hours || []).map((h: any) => ({
    hours: h.hours ?? 0,
    desc: h.description || "Labour",
  }));

  const chargesRows = (charges || []).map((c: any) => ({
    desc: c.description || "",
    qty: c.quantity ?? 0,
    unit: c.unit_price ?? 0,
    total:
      c.total ??
      Number(c.quantity || 0) * Number(c.unit_price || 0),
  }));

  const orgName = organization?.name || "Your Business";

  return `
  <div class="wrap">
    <div class="header">
      <div>
        <div class="org">${escapeHtml(orgName)}</div>
        <div class="muted">${
          organization?.abn ? `ABN: ${escapeHtml(organization.abn)}` : ""
        }</div>
        <div class="muted">
          ${escapeHtml(organization?.street || "")}
          ${escapeHtml(organization?.suburb || "")}
          ${escapeHtml(organization?.state || "")}
          ${escapeHtml(organization?.postcode || "")}
        </div>
      </div>
      <div class="right">
        <div class="doc">SERVICE SHEET</div>
        <div class="muted">Completed: ${escapeHtml(completedAt)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="h">Job</div>
        <div><b>Title:</b> ${escapeHtml(jobTitle)}</div>
        <div><b>Type:</b> ${escapeHtml(jobType)}</div>
        <div><b>Scheduled:</b> ${escapeHtml(scheduledAt)}</div>
        <div><b>Reference:</b> ${escapeHtml(
          completedJob?.original_job_id || completedJob?.id || "-"
        )}</div>
      </div>

      <div class="card">
        <div class="h">Customer</div>
        <div><b>Name:</b> ${escapeHtml(
          customer?.name || completedJob?.customer_name || "-"
        )}</div>
        <div><b>Email:</b> ${escapeHtml(customer?.email || "-")}</div>
        <div><b>Phone:</b> ${escapeHtml(customer?.phone || "-")}</div>
        <div><b>Address:</b> ${escapeHtml(customer?.address || "-")}</div>
      </div>

      <div class="card">
        <div class="h">Equipment</div>
        <div>${equipText}</div>
      </div>
    </div>

    <div class="section">
      <div class="h2">Work Notes</div>
      ${
        noteLines.length
          ? `<div class="notes">${noteLines
              .map((t) => `<div class="note">${t}</div>`)
              .join("")}</div>`
          : `<div class="muted">No notes recorded.</div>`
      }
    </div>

    <div class="section">
      <div class="h2">Charges</div>
      ${
        chargesRows.length
          ? `
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num">Unit</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${chargesRows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.desc)}</td>
              <td class="num">${Number(r.qty).toFixed(2)}</td>
              <td class="num">${Number(r.unit).toFixed(2)}</td>
              <td class="num">${Number(r.total).toFixed(2)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      `
          : `<div class="muted">No charges recorded.</div>`
      }
    </div>

    <div class="section">
      <div class="h2">Hours</div>
      ${
        hoursRows.length
          ? `
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Hours</th>
          </tr>
        </thead>
        <tbody>
          ${hoursRows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.desc)}</td>
              <td class="num">${Number(r.hours).toFixed(2)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      `
          : `<div class="muted">No hours recorded.</div>`
      }
    </div>

    <div class="section">
      <div class="h2">Parts</div>
      ${
        partsRows.length
          ? `
      <table>
        <thead>
          <tr>
            <th>Part</th>
            <th class="num">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${partsRows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="num">${Number(r.qty).toFixed(0)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      `
          : `<div class="muted">No parts recorded.</div>`
      }
    </div>

    <div class="footer muted">
      Generated by Taska • ${escapeHtml(orgName)}
    </div>
  </div>
  `;
}

async function generateServiceSheetPdfWithPuppeteer(
  p: ServiceSheetPayload
): Promise<Buffer> {
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.emulateMediaType("screen");

    const html = serviceSheetHtml(p);

    const pdfHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
          .wrap { width: 100%; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
          .org { font-size: 18px; font-weight: 700; }
          .doc { font-size: 16px; font-weight: 700; text-align: right; }
          .right { text-align: right; }
          .muted { color: #555; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .card { border: 1px solid #ddd; padding: 10px; border-radius: 6px; }
          .h { font-weight: 700; margin-bottom: 6px; }
          .section { margin-top: 14px; }
          .h2 { font-weight: 700; margin-bottom: 6px; }
          .notes .note { border-left: 3px solid #ddd; padding-left: 8px; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #eee; padding: 6px 6px; vertical-align: top; }
          th { text-align: left; font-weight: 700; background: #fafafa; }
          .num { text-align: right; white-space: nowrap; }
          .footer { margin-top: 18px; }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `;

    await page.setContent(pdfHtml, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await new Promise((r) => setTimeout(r, 500));

    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(buffer);
  } finally {
    if (browser) await browser.close();
  }
}

function generateServiceSheetPdfWithPdfKitSync(
  p: ServiceSheetPayload
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const {
      completedJob,
      organization,
      customer,
      equipment,
      notes,
      parts,
      hours,
      charges,
    } = p;

    doc.fontSize(18).text(organization?.name || "Your Business");
    if (organization?.abn) doc.fontSize(10).text(`ABN: ${organization.abn}`);
    doc.moveUp(2);
    doc.fontSize(16).text("SERVICE SHEET", { align: "right" });
    doc.moveDown();

    doc.fontSize(11).text("Job", { underline: true });
    doc.fontSize(10);
    doc.text(`Title: ${completedJob?.title || "-"}`);
    doc.text(`Type: ${completedJob?.job_type || "-"}`);
    doc.text(`Scheduled: ${formatDateTime(completedJob?.scheduled_at)}`);
    doc.text(`Completed: ${formatDateTime(completedJob?.completed_at)}`);
    doc.text(
      `Reference: ${completedJob?.original_job_id || completedJob?.id || "-"}`
    );

    doc.moveDown();

    doc.fontSize(11).text("Customer", { underline: true });
    doc.fontSize(10);
    doc.text(customer?.name || completedJob?.customer_name || "-");
    if (customer?.email) doc.text(customer.email);
    if (customer?.phone) doc.text(customer.phone);
    if (customer?.address) doc.text(customer.address);

    doc.moveDown();

    doc.fontSize(11).text("Equipment", { underline: true });
    doc.fontSize(10);
    if (equipment?.length) {
      for (const e of equipment)
        doc.text(`• ${e.equipment_name || e.name || ""}`);
    } else {
      doc.text("-");
    }

    doc.moveDown();

    doc.fontSize(11).text("Work Notes", { underline: true });
    doc.fontSize(10);
    const noteLines = [
      completedJob?.notes || "",
      ...(notes || []).map((n: any) => n.text).filter(Boolean),
    ].filter(Boolean);
    if (noteLines.length) noteLines.forEach((t) => doc.text(`- ${t}`));
    else doc.text("No notes recorded.");

    doc.moveDown();

    doc.fontSize(11).text("Charges", { underline: true });
    doc.fontSize(10);
    if (charges?.length) {
      for (const c of charges) {
        const qty = Number(c.quantity || 0);
        const unit = Number(c.unit_price || 0);
        const tot = Number(c.total ?? qty * unit);
        doc.text(
          `${c.description} — qty ${qty.toFixed(2)} @ ${unit.toFixed(
            2
          )} = ${tot.toFixed(2)}`
        );
      }
    } else doc.text("No charges recorded.");

    doc.moveDown();

    doc.fontSize(11).text("Hours", { underline: true });
    doc.fontSize(10);
    if (hours?.length) {
      for (const h of hours)
        doc.text(
          `${h.description || "Labour"} — ${Number(h.hours || 0).toFixed(
            2
          )} hrs`
        );
    } else doc.text("No hours recorded.");

    doc.moveDown();

    doc.fontSize(11).text("Parts", { underline: true });
    doc.fontSize(10);
    if (parts?.length) {
      for (const p2 of parts)
        doc.text(`${p2.part_name} — qty ${Number(p2.quantity || 1)}`);
    } else doc.text("No parts recorded.");

    doc.end();
  });
}

export async function generateServiceSheetPdf(
  p: ServiceSheetPayload
): Promise<Buffer> {
  try {
    return await generateServiceSheetPdfWithPuppeteer(p);
  } catch (err) {
    console.error("[PDF] Service sheet puppeteer failed, using PDFKit fallback", err);
    return await generateServiceSheetPdfWithPdfKitSync(p);
  }
}

export async function generateServiceSheetPdfFilename(
  p: ServiceSheetPayload
): Promise<string> {
  const id = p.completedJob?.id || "job";
  const title = (p.completedJob?.title || "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .substring(0, 30)
    .trim();
  const slug = title ? title.replace(/\s+/g, "-").toLowerCase() : "service-sheet";
  return `${slug}-${String(id).slice(0, 8)}.pdf`;
}
