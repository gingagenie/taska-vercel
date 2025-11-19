import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import PDFDocument from "pdfkit";
import { generateInvoiceEmailTemplate } from "./email";

chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

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
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
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
    if (browser) await browser.close();
  }
}

function generateInvoicePdfWithPdfKitSync(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(organization.name || "Your Business");
    doc.fontSize(14).text("INVOICE");
    doc.moveDown();
    doc.text(JSON.stringify(invoice, null, 2));
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
