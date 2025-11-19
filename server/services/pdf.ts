import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import PDFDocument from "pdfkit";
import {
  generateInvoiceEmailTemplate,
  generateQuoteEmailTemplate,
} from "./email";

chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

/* -------------------------------------------------------
 * INVOICE PDF – PUPPETEER (PRIMARY PATH)
 * -----------------------------------------------------*/

async function generateInvoicePdfWithPuppeteer(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  let browser: puppeteer.Browser | null = null;

  try {
    console.log("[PDF] [PUPPETEER] Starting invoice PDF generation", {
      nodeEnv: process.env.NODE_ENV,
      runtime:
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.VERCEL_ENV ||
        "unknown",
    });

    const executablePath = await chromium.executablePath();
    console.log(
      "[PDF] [PUPPETEER] Using chromium executablePath:",
      executablePath || "<none>"
    );

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

    console.log(
      "[PDF] [PUPPETEER] PDF buffer generated, size (bytes):",
      pdfBuffer.length
    );

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close().catch((e) =>
        console.error("[PDF] [PUPPETEER] Error closing browser:", e)
      );
    }
  }
}

/* -------------------------------------------------------
 * INVOICE PDF – PDFKIT FALLBACK
 * -----------------------------------------------------*/

function generateInvoicePdfWithPdfKitSync(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      console.log("[PDF] [PDFKIT] Generating invoice PDF with PDFKit fallback");

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const buf = Buffer.concat(chunks);
        console.log(
          "[PDF] [PDFKIT] PDF buffer generated, size (bytes):",
          buf.length
        );
        resolve(buf);
      });
      doc.on("error", (err) => {
        console.error("[PDF] [PDFKIT] Error:", err);
        reject(err);
      });

      const orgName = organization.name || "Your Business";
      const invoiceNumber = invoice.number || "inv-0001";
      const total = Number(invoice.grand_total || invoice.total || 0);

      // Header
      doc.fontSize(20).fillColor("#2563eb").text(orgName, { align: "left" });
      doc.moveDown(0.5);
      if (organization.abn) {
        doc.fontSize(10).fillColor("#444").text(`ABN: ${organization.abn}`, {
          align: "left",
        });
      }
      doc.moveDown(0.5);
      doc.fontSize(18).fillColor("#000").text("INVOICE", { align: "right" });
      doc.fontSize(10).text(`Invoice #${invoiceNumber}`, { align: "right" });
      doc.moveDown(1);

      // Bill To & Invoice details
      const startY = doc.y;
      const customerName = customer.name || invoice.customer_name || "";
      const customerAddressParts = [
        customer.street,
        customer.suburb,
        customer.state,
        customer.postcode,
      ].filter(Boolean);
      const customerAddress =
        customerAddressParts.length > 0
          ? customerAddressParts.join(", ")
          : customer.address || "";

      doc.fontSize(12).fillColor("#000").text("Bill To", 50, startY);
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text(customerName || "Customer");
      doc.font("Helvetica").moveDown(0.2);
      if (customer.contact_name) doc.text(customer.contact_name);
      if (customer.email) doc.text(customer.email);
      if (customer.phone) doc.text(customer.phone);
      if (customerAddress) doc.text(customerAddress);

      const rightX = 320;
      doc.fontSize(12).fillColor("#000").text("Invoice Details", rightX, startY);
      doc.moveDown(0.3);
      const createdAt = invoice.created_at
        ? new Date(invoice.created_at)
        : new Date();
      const dueAt = invoice.due_at ? new Date(invoice.due_at) : null;

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`Date: ${createdAt.toLocaleDateString("en-AU")}`, rightX, doc.y);
      if (dueAt) {
        doc.text(`Due: ${dueAt.toLocaleDateString("en-AU")}`, rightX, doc.y);
      }
      if (invoice.title) {
        doc.text(`Job: ${invoice.title}`, rightX, doc.y);
      }
      doc.moveDown(1.5);

      // Notes
      if (invoice.notes) {
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text("Notes", { underline: true });
        doc.moveDown(0.3);
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(String(invoice.notes), { align: "left" });
        doc.moveDown(1);
      }

      // Line Items
      doc.fontSize(12).font("Helvetica-Bold").text("Line Items", {
        underline: true,
      });
      doc.moveDown(0.5);

      const items = invoice.items || [];
      const tableTop = doc.y + 5;

      const colDescX = 50;
      const colQtyX = 280;
      const colUnitX = 340;
      const colTotalX = 430;

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Description", colDescX, tableTop);
      doc.text("Qty", colQtyX, tableTop, { width: 50, align: "right" });
      doc.text("Unit", colUnitX, tableTop, { width: 70, align: "right" });
      doc.text("Total", colTotalX, tableTop, { width: 80, align: "right" });

      doc
        .moveTo(50, tableTop + 14)
        .lineTo(550, tableTop + 14)
        .strokeColor("#cccccc")
        .stroke();

      doc.font("Helvetica").fontSize(10);

      let y = tableTop + 20;
      items.forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        const unit = Number(item.unit_price || 0);
        const lineTotal = qty * unit;

        const descHeight = doc.heightOfString(item.description || "Item", {
          width: colQtyX - colDescX - 10,
        });
        const rowHeight = Math.max(descHeight, 14);

        if (y + rowHeight > 760) {
          doc.addPage();
          y = 50;
        }

        doc.text(item.description || "Item", colDescX, y, {
          width: colQtyX - colDescX - 10,
        });
        doc.text(qty.toFixed(2), colQtyX, y, { width: 50, align: "right" });
        doc.text(`$${unit.toFixed(2)}`, colUnitX, y, {
          width: 70,
          align: "right",
        });
        doc.text(`$${lineTotal.toFixed(2)}`, colTotalX, y, {
          width: 80,
          align: "right",
        });

        y += rowHeight + 6;
      });

      // Totals
      doc.moveDown(2);
      const subtotal = total / 1.1;
      const gst = total - subtotal;

      const totalsX = 330;
      const totalsY = doc.y;

      doc
        .font("Helvetica")
        .fontSize(10)
        .text("Subtotal:", totalsX, totalsY, {
          width: 100,
          align: "right",
        });
      doc.text(`$${subtotal.toFixed(2)}`, totalsX + 110, totalsY, {
        width: 80,
        align: "right",
      });

      doc.text("GST (10%):", totalsX, totalsY + 14, {
        width: 100,
        align: "right",
      });
      doc.text(`$${gst.toFixed(2)}`, totalsX + 110, totalsY + 14, {
        width: 80,
        align: "right",
      });

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Total:", totalsX, totalsY + 32, {
          width: 100,
          align: "right",
        });
      doc.text(`$${total.toFixed(2)} AUD`, totalsX + 110, totalsY + 32, {
        width: 80,
        align: "right",
      });

      // Payment details
      doc.moveDown(2);
      if (
        organization.account_name ||
        organization.bsb ||
        organization.account_number
      ) {
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .text("Payment Details", 50, doc.y, {
            underline: true,
          });
        doc.moveDown(0.5);
        doc.font("Helvetica").fontSize(10);
        if (organization.account_name)
          doc.text(`Account Name: ${organization.account_name}`);
        if (organization.bsb) doc.text(`BSB: ${organization.bsb}`);
        if (organization.account_number)
          doc.text(`Account Number: ${organization.account_number}`);
        doc.text(`Please use Invoice #${invoiceNumber} as payment reference.`);
      }

      // Footer
      doc.moveDown(2);
      doc
        .fontSize(9)
        .fillColor("#666")
        .text("Thank you for your business.", {
          align: "center",
        });
      if (organization.abn) {
        doc.text(`ABN: ${organization.abn}`, { align: "center" });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* -------------------------------------------------------
 * INVOICE PDF – PUBLIC EXPORT
 * -----------------------------------------------------*/

export async function generateInvoicePdf(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  try {
    // Try puppeteer first
    return await generateInvoicePdfWithPuppeteer(
      invoice,
      organization,
      customer
    );
  } catch (err) {
    console.error(
      "[PDF] [PUPPETEER] Failed, falling back to PDFKit:",
      err
    );
    // Fallback so Railway/etc still works
    return await generateInvoicePdfWithPdfKitSync(
      invoice,
      organization,
      customer
    );
  }
}

/* -------------------------------------------------------
 * QUOTE PDF – PUPPETEER
 * -----------------------------------------------------*/

async function generateQuotePdfWithPuppeteer(
  quote: any,
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

    const publicBaseUrl =
      process.env.PUBLIC_URL ||
      process.env.APP_BASE_URL ||
      "https://staging.taska.info";

    const { html } = generateQuoteEmailTemplate(
      quote,
      organization?.name || "Your Business",
      publicBaseUrl
    );

    const pdfHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4; margin: 20mm; }
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.4;
            color: #333;
            font-size: 12px;
          }
          table { width: 100% !important; border-collapse: collapse; }
          th, td {
            padding: 8px !important;
            border-bottom: 1px solid #ddd !important;
          }
          th {
            background-color: #f8f9fa !important;
            font-weight: bold;
          }
          h1 { color: #2563eb !important; margin: 0 !important; font-size: 24px !important; }
          h2 { margin: 0 !important; color: #333 !important; font-size: 20px !important; }
          h3 {
            margin: 0 0 10px 0 !important;
            color: #333 !important;
            border-bottom: 1px solid #ddd !important;
            padding-bottom: 5px !important;
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

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close().catch((e) =>
        console.error("[PDF] [QUOTE][PUPPETEER] Error closing browser:", e)
      );
    }
  }
}

/* -------------------------------------------------------
 * QUOTE PDF – PDFKIT FALLBACK
 * -----------------------------------------------------*/

function generateQuotePdfWithPdfKitSync(
  quote: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      console.log("[PDF] [PDFKIT] Generating quote PDF with PDFKit fallback");

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const buf = Buffer.concat(chunks);
        console.log(
          "[PDF] [PDFKIT] Quote PDF buffer generated, size (bytes):",
          buf.length
        );
        resolve(buf);
      });
      doc.on("error", (err) => {
        console.error("[PDF] [PDFKIT][QUOTE] Error:", err);
        reject(err);
      });

      const orgName = organization.name || "Your Business";
      const quoteNumber = quote.number || "quote-0001";
      const total = Number(quote.grand_total || quote.total || 0);

      // Header
      doc.fontSize(20).fillColor("#2563eb").text(orgName, { align: "left" });
      doc.moveDown(0.5);
      if (organization.abn) {
        doc.fontSize(10).fillColor("#444").text(`ABN: ${organization.abn}`, {
          align: "left",
        });
      }
      doc.moveDown(0.5);
      doc.fontSize(18).fillColor("#000").text("QUOTE", { align: "right" });
      doc.fontSize(10).text(`Quote #${quoteNumber}`, { align: "right" });
      doc.moveDown(1);

      // Bill To & details
      const startY = doc.y;
      const customerName = customer.name || quote.customer_name || "";
      const customerAddressParts = [
        customer.street,
        customer.suburb,
        customer.state,
        customer.postcode,
      ].filter(Boolean);
      const customerAddress =
        customerAddressParts.length > 0
          ? customerAddressParts.join(", ")
          : customer.address || "";

      doc.fontSize(12).fillColor("#000").text("Bill To", 50, startY);
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text(customerName || "Customer");
      doc.font("Helvetica").moveDown(0.2);
      if (customer.contact_name) doc.text(customer.contact_name);
      if (customer.email) doc.text(customer.email);
      if (customer.phone) doc.text(customer.phone);
      if (customerAddress) doc.text(customerAddress);

      const rightX = 320;
      doc.fontSize(12).fillColor("#000").text("Quote Details", rightX, startY);
      doc.moveDown(0.3);
      const createdAt = quote.created_at
        ? new Date(quote.created_at)
        : new Date();

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`Date: ${createdAt.toLocaleDateString("en-AU")}`, rightX, doc.y);
      if (quote.title) {
        doc.text(`Job: ${quote.title}`, rightX, doc.y);
      }
      doc.moveDown(1.5);

      // Notes
      if (quote.notes) {
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text("Notes", { underline: true });
        doc.moveDown(0.3);
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(String(quote.notes), { align: "left" });
        doc.moveDown(1);
      }

      // Line Items
      doc.fontSize(12).font("Helvetica-Bold").text("Line Items", {
        underline: true,
      });
      doc.moveDown(0.5);

      const items = quote.items || [];
      const tableTop = doc.y + 5;

      const colDescX = 50;
      const colQtyX = 280;
      const colUnitX = 340;
      const colTotalX = 430;

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Description", colDescX, tableTop);
      doc.text("Qty", colQtyX, tableTop, { width: 50, align: "right" });
      doc.text("Unit", colUnitX, tableTop, { width: 70, align: "right" });
      doc.text("Total", colTotalX, tableTop, { width: 80, align: "right" });

      doc
        .moveTo(50, tableTop + 14)
        .lineTo(550, tableTop + 14)
        .strokeColor("#cccccc")
        .stroke();

      doc.font("Helvetica").fontSize(10);

      let y = tableTop + 20;
      items.forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        const unit = Number(item.unit_price || 0);
        const lineTotal = qty * unit;

        const descHeight = doc.heightOfString(item.description || "Item", {
          width: colQtyX - colDescX - 10,
        });
        const rowHeight = Math.max(descHeight, 14);

        if (y + rowHeight > 760) {
          doc.addPage();
          y = 50;
        }

        doc.text(item.description || "Item", colDescX, y, {
          width: colQtyX - colDescX - 10,
        });
        doc.text(qty.toFixed(2), colQtyX, y, { width: 50, align: "right" });
        doc.text(`$${unit.toFixed(2)}`, colUnitX, y, {
          width: 70,
          align: "right",
        });
        doc.text(`$${lineTotal.toFixed(2)}`, colTotalX, y, {
          width: 80,
          align: "right",
        });

        y += rowHeight + 6;
      });

      // Totals
      doc.moveDown(2);
      const subtotal = total / 1.1;
      const gst = total - subtotal;

      const totalsX = 330;
      const totalsY = doc.y;

      doc
        .font("Helvetica")
        .fontSize(10)
        .text("Subtotal:", totalsX, totalsY, {
          width: 100,
          align: "right",
        });
      doc.text(`$${subtotal.toFixed(2)}`, totalsX + 110, totalsY, {
        width: 80,
        align: "right",
      });

      doc.text("GST (10%):", totalsX, totalsY + 14, {
        width: 100,
        align: "right",
      });
      doc.text(`$${gst.toFixed(2)}`, totalsX + 110, totalsY + 14, {
        width: 80,
        align: "right",
      });

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Total:", totalsX, totalsY + 32, {
          width: 100,
          align: "right",
        });
      doc.text(`$${total.toFixed(2)} AUD`, totalsX + 110, totalsY + 32, {
        width: 80,
        align: "right",
      });

      // Footer
      doc.moveDown(2);
      doc
        .fontSize(9)
        .fillColor("#666")
        .text("We look forward to working with you.", {
          align: "center",
        });
      if (organization.abn) {
        doc.text(`ABN: ${organization.abn}`, { align: "center" });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* -------------------------------------------------------
 * QUOTE PDF – PUBLIC EXPORT
 * -----------------------------------------------------*/

export async function generateQuotePdf(
  quote: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  try {
    return await generateQuotePdfWithPuppeteer(quote, organization, customer);
  } catch (error) {
    console.error(
      "[PDF] [QUOTE][PUPPETEER] Failed, falling back to PDFKit:",
      error
    );
    return await generateQuotePdfWithPdfKitSync(quote, organization, customer);
  }
}

/* -------------------------------------------------------
 * FILENAMES
 * -----------------------------------------------------*/

export async function generateQuotePdfFilename(
  quote: any
): Promise<string> {
  const quoteNumber = quote.number || "quote";
  const safeTitle = quote.title
    ? quote.title.replace(/[^a-zA-Z0-9\s-]/g, "").substring(0, 30)
    : "";

  if (safeTitle) {
    return `${quoteNumber}-${safeTitle
      .replace(/\s+/g, "-")
      .toLowerCase()}.pdf`;
  }

  return `${quoteNumber}.pdf`;
}

export async function generateInvoicePdfFilename(
  invoice: any
): Promise<string> {
  const invoiceNumber = invoice.number || "invoice";
  const safeTitle = invoice.title
    ? invoice.title.replace(/[^a-zA-Z0-9\s-]/g, "").substring(0, 30)
    : "";

  if (safeTitle) {
    return `${invoiceNumber}-${safeTitle
      .replace(/\s+/g, "-")
      .toLowerCase()}.pdf`;
  }

  return `${invoiceNumber}.pdf`;
}
