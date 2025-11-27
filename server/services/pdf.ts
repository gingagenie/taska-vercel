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

function formatMoney(
  value: number | string | null | undefined,
  currency?: string | null
): string {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  const cur = currency || "AUD";
  return `${num.toFixed(2)} ${cur}`;
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
    ? invoice.title.replace(/[^a-zA-Z0-9\\s-]/g, "").substring(0, 30)
    : "";
  return title
    ? `${num}-${title.replace(/\\s+/g, "-").toLowerCase()}.pdf`
    : `${num}.pdf`;
}
