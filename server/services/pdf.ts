import puppeteer from 'puppeteer';
import { generateInvoiceEmailTemplate } from './email';

export async function generateInvoicePdf(
  invoice: any,
  organization: any,
  customer: any
): Promise<Buffer> {
  let browser;
  
  try {
    // Launch Puppeteer with Replit-safe options
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    });
    
    const page = await browser.newPage();
    
    // Generate the invoice HTML using the existing email template
    const { html } = generateInvoiceEmailTemplate(invoice, organization, customer);
    
    // Enhanced HTML with better PDF styling
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
          
          /* Override email styles for better PDF formatting */
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
          
          /* Print-specific adjustments */
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
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Generate PDF with A4 format and good quality settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      },
      preferCSSPageSize: true
    });
    
    return pdfBuffer;
    
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function generateInvoicePdfFilename(invoice: any): Promise<string> {
  const invoiceNumber = invoice.number || 'invoice';
  const safeTitle = invoice.title ? invoice.title.replace(/[^a-zA-Z0-9\s-]/g, '').substring(0, 30) : '';
  
  if (safeTitle) {
    return `${invoiceNumber}-${safeTitle.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  }
  
  return `${invoiceNumber}.pdf`;
}