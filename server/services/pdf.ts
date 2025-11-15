import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { generateInvoiceEmailTemplate } from "./email";

chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

export async function generateInvoicePdf(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  let browser: puppeteer.Browser | null = null;

  try {
    // Log env so we can see what's going on in Railway
    console.log("[PDF] Starting invoice PDF generation", {
      nodeEnv: process.env.NODE_ENV,
      runtime: process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL_ENV || "unknown",
    });

    const executablePath = await chromium.executablePath();

    console.log("[PDF] Using chromium executablePath:", executablePath || "<none>");

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    await page.emulateMediaType("screen");

    const { html } = generateInvoiceEmailTemplate(invoice, organization, customer);

    const pdfHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.4;
            color: #333;
            font-size: 12px;
          }
          
          table {
            width: 100% !important;
            border-collapse: collapse;
          }
          
          th, td {
            padding: 8px !important;
            border-bottom: 1px solid #ddd !important;
          }
          
          th {
            background-color: #f8f9fa !important;
            font-weight: bold;
          }
          
          .header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            margin-bottom: 30px !important;
            padding-bottom: 20px !important;
            border-bottom: 2px solid #2563eb !important;
          }
          
          h1 {
            color: #2563eb !important;
            margin: 0 !important;
            font-size: 24px !important;
          }
          
          h2 {
            margin: 0 !important;
            color: #333 !important;
            font-size: 20px !important;
          }
          
          h3 {
            margin: 0 0 10px 0 !important;
            color: #333 !important;
            border-bottom: 1px solid #ddd !important;
            padding-bottom: 5px !important;
          }
          
          .totals-section {
            margin-top: 20px !important;
            text-align: right !important;
          }
          
          .totals-table {
            margin-left: auto !important;
            width: auto !important;
            min-width: 250px !important;
          }
          
          .total-row {
            font-weight: bold !important;
            font-size: 14px !important;
            background-color: #f8f9fa !important;
          }
          
          .payment-details {
            background-color: #f8f9fa !important;
            padding: 15px !important;
            border-radius: 5px !important;
            margin: 20px 0 !important;
          }
          
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;

    await page.setContent(pdfHtml, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
      preferCSSPageSize: true,
    });

    console.log("[PDF] PDF buffer generated, size (bytes):", pdfBuffer.length);

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error("[PDF] PDF generation error:", error);
    throw new Error(
      `Failed to generate PDF: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  } finally {
    if (browser) {
      await browser.close().catch((e) =>
        console.error("[PDF] Error closing browser:", e)
      );
    }
  }
}

export async function generateInvoicePdfFilename(invoice: any): Promise<string> {
  const invoiceNumber = invoice.number || "invoice";
  const safeTitle = invoice.title
    ? invoice.title.replace(/[^a-zA-Z0-9\s-]/g, "").substring(0, 30)
    : "";

  if (safeTitle) {
    return `${invoiceNumber}-${safeTitle.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  }

  return `${invoiceNumber}.pdf`;
}
