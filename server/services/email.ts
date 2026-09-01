// Email service using MailerSend
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
if (!MAILERSEND_API_KEY) {
  console.warn("Warning: MAILERSEND_API_KEY not set. Email functionality will be disabled.");
}

interface EmailParams {
  to: string | string[];
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string; // Base64 encoded content
  }>;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!MAILERSEND_API_KEY) {
    console.error('Cannot send email: MailerSend API key not configured');
    return false;
  }
  
  console.log('MailerSend - API Key exists:', !!MAILERSEND_API_KEY);
  console.log('MailerSend - API Key prefix:', MAILERSEND_API_KEY?.substring(0, 10) + '...');
  
  try {
    // Convert single email to array for consistent handling
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    
    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MAILERSEND_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        from: {
          email: params.from.includes('<') ? params.from.match(/<(.+)>/)?.[1] || params.from : params.from,
          name: params.from.includes('<') ? params.from.split('<')[0].trim() : 'Taska'
        },
        to: recipients.map(email => ({
          email: email,
          name: email.split('@')[0]
        })),
        subject: params.subject,
        text: params.text || '',
        html: params.html || '',
        ...(params.attachments && params.attachments.length > 0 && {
          attachments: params.attachments.map(att => ({
            filename: att.filename,
            content: att.content
          }))
        })
      })
    });

    if (response.ok) {
      console.log(`Email sent successfully via MailerSend`);
      return true;
    } else {
      const errorData = await response.text();
      console.error('MailerSend API Error:');
      console.error('Status:', response.status);  
      console.error('Response:', errorData);
      console.error('FROM email:', params.from);
      return false;
    }
  } catch (error) {
    console.error('MailerSend email error:', error);
    return false;
  }
}

/**
 * Helper used by quotes routes – send a quote email to the customer.
 * Kept simple on purpose: no PDF, just HTML/text using the existing template.
 */
export async function sendQuoteEmailToCustomer(
  quote: any,
  organization: any = {},
  customer: any = {},
  recipients?: string | string[],
  baseUrl?: string,
  fromEmail: string = "noreply@taska.info",
  fromName: string = "Taska"
): Promise<boolean> {
  try {
    const orgName = organization.name || "Your Business";

    // Figure out who we're emailing
    let to: string[] = [];

    if (recipients) {
      to = Array.isArray(recipients) ? recipients : [recipients];
    }

    if (to.length === 0) {
      if (customer.email) {
        to = [customer.email];
      } else if (quote.customer_email) {
        to = [quote.customer_email];
      }
    }

    if (!to.length) {
      console.error("[QUOTE EMAIL] No recipient email found for quote", quote?.id || quote?.number);
      return false;
    }

    const publicBaseUrl =
      baseUrl ||
      process.env.PUBLIC_URL ||
      process.env.APP_BASE_URL ||
      "https://staging.taska.info";

    const { subject, html, text } = generateQuoteEmailTemplate(
      quote,
      orgName,
      publicBaseUrl
    );

    return await sendEmail({
      to,
      from: `${fromName} <${fromEmail}>`,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("[QUOTE EMAIL] Failed to send quote email:", err);
    return false;
  }
}

export function generateInvoiceEmailTemplate(
  invoice: any, 
  organization: any = {},
  customer: any = {},
  trackingToken?: string  // ADD THIS LINE
): { subject: string; html: string; text: string } {
  const orgName = organization.name || "Your Business";
  const subject = `Invoice ${invoice.title} from ${orgName}`;
  
  const itemsHtml = invoice.items?.map((item: any) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${Number(item.quantity).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${Number(item.unit_price).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #666;">No items</td></tr>';

  // Format addresses
  const formatAddress = (addr: any) => {
    if (!addr) return '';
    const parts = [addr.street, addr.suburb, addr.state, addr.postcode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : (addr.address || '');
  };

  const businessAddress = formatAddress(organization);
  const customerAddress = formatAddress(customer);

  // Display status properly
  const displayStatus = invoice.status === 'draft' ? 'Pending Payment' : 
                       invoice.status === 'paid' ? 'Paid' :
                       invoice.status === 'sent' ? 'Sent' :
                       invoice.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Pending Payment';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
      
      <!-- Header with Business Details -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb;">
        <div>
          <h1 style="color: #2563eb; margin: 0; font-size: 28px;">${orgName}</h1>
          ${organization.abn ? `<p style="margin: 4px 0; color: #666;"><strong>ABN:</strong> ${organization.abn}</p>` : ''}
          ${businessAddress ? `<p style="margin: 4px 0; color: #666;">${businessAddress}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <h2 style="margin: 0; color: #333; font-size: 24px;">INVOICE</h2>
          <p style="margin: 4px 0; color: #666;">Invoice #${invoice.number || 'inv-0001'}</p>
        </div>
      </div>

      <!-- Bill To & Invoice Details -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div style="width: 48%;">
          <h3 style="margin: 0 0 10px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Bill To</h3>
          <p style="margin: 4px 0; font-weight: bold;">${customer.name || invoice.customer_name}</p>
          ${customer.contact_name ? `<p style="margin: 4px 0;">${customer.contact_name}</p>` : ''}
          ${customer.email ? `<p style="margin: 4px 0;">${customer.email}</p>` : ''}
          ${customer.phone ? `<p style="margin: 4px 0;">${customer.phone}</p>` : ''}
          ${customerAddress ? `<p style="margin: 4px 0;">${customerAddress}</p>` : ''}
        </div>
        <div style="width: 48%; text-align: right;">
          <h3 style="margin: 0 0 10px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Invoice Details</h3>
          <p style="margin: 4px 0;"><strong>Date:</strong> ${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-AU') : new Date().toLocaleDateString('en-AU')}</p>
          ${invoice.due_at ? `<p style="margin: 4px 0;"><strong>Due Date:</strong> ${new Date(invoice.due_at).toLocaleDateString('en-AU')}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: ${invoice.status === 'paid' ? '#16a34a' : '#ea580c'}; font-weight: bold;">${displayStatus}</span></p>
          ${invoice.title ? `<p style="margin: 4px 0;"><strong>Job:</strong> ${invoice.title}</p>` : ''}
        </div>
      </div>

      <!-- Notes -->
      ${invoice.notes ? `
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0; color: #333;">Notes</h3>
        <p style="margin: 0;">${invoice.notes}</p>
      </div>
      ` : ''}

      <!-- Line Items -->
      <div style="margin-bottom: 30px;">
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd; font-weight: bold;">Description</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; font-weight: bold;">Qty</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; font-weight: bold;">Unit Price</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; font-weight: bold;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Total with GST Breakdown -->
      <div style="text-align: right; margin-bottom: 30px;">
        <div style="display: inline-block; background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #ddd; min-width: 250px;">
          <div style="border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span>Subtotal:</span>
              <span>$${(Number(invoice.grand_total || invoice.total || 0) / 1.1).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span>GST (10%):</span>
              <span>$${(Number(invoice.grand_total || invoice.total || 0) - (Number(invoice.grand_total || invoice.total || 0) / 1.1)).toFixed(2)}</span>
            </div>
          </div>
          <div style="font-size: 18px; font-weight: bold; color: #2563eb; display: flex; justify-content: space-between;">
            <span>Total Amount:</span>
            <span>$${Number(invoice.grand_total || invoice.total || 0).toFixed(2)} AUD</span>
          </div>
        </div>
      </div>

      <!-- Terms & Conditions -->
      ${organization.invoice_terms ? `
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0; color: #333;">Terms & Conditions</h3>
        <p style="margin: 0; font-size: 14px; color: #666;">${organization.invoice_terms}</p>
      </div>
      ` : ''}

      <!-- Payment Details -->
      ${organization.account_name || organization.bsb || organization.account_number ? `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ddd;">
        <h3 style="margin: 0 0 15px 0; color: #333;">Payment Details</h3>
        ${organization.account_name ? `<p style="margin: 4px 0;"><strong>Account Name:</strong> ${organization.account_name}</p>` : ''}
        ${organization.bsb ? `<p style="margin: 4px 0;"><strong>BSB:</strong> ${organization.bsb}</p>` : ''}
        ${organization.account_number ? `<p style="margin: 4px 0;"><strong>Account Number:</strong> ${organization.account_number}</p>` : ''}
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">Please use Invoice #${invoice.number || 'inv-0001'} as payment reference</p>
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; text-align: center;">
        <p>Thank you for your business!</p>
        <p>This invoice was sent from ${orgName} via Taska field service management system.</p>
        ${organization.abn ? `<p>ABN: ${organization.abn}</p>` : ''}
 </div>
      
      <!-- Tracking Pixel -->
      ${trackingToken ? `<img src="${process.env.PUBLIC_URL || 'https://www.taska.info'}/api/invoices/track/${trackingToken}" width="1" height="1" style="display:none;" alt="" />` : ''}
    </body>
  </html>
`;

  const text = `
INVOICE
=======

From: ${orgName}
${organization.abn ? `ABN: ${organization.abn}` : ''}
${businessAddress ? `Address: ${businessAddress}` : ''}

Invoice #${invoice.number || 'inv-0001'}
Date: ${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString('en-AU') : new Date().toLocaleDateString('en-AU')}
${invoice.due_at ? `Due Date: ${new Date(invoice.due_at).toLocaleDateString('en-AU')}` : ''}
Status: ${displayStatus}

BILL TO:
--------
${customer.name || invoice.customer_name}
${customer.contact_name ? customer.contact_name : ''}
${customer.email ? customer.email : ''}
${customer.phone ? customer.phone : ''}
${customerAddress ? customerAddress : ''}

LINE ITEMS:
-----------
${invoice.items?.map((item: any) => 
  `${item.description} - Qty: ${Number(item.quantity).toFixed(2)} - Unit: $${Number(item.unit_price).toFixed(2)} - Total: $${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}`
).join('\n') || 'No items'}

TOTAL: $${Number(invoice.grand_total || invoice.total || 0).toFixed(2)} AUD

${organization.account_name || organization.bsb || organization.account_number ? `
PAYMENT DETAILS:
----------------
${organization.account_name ? `Account Name: ${organization.account_name}` : ''}
${organization.bsb ? `BSB: ${organization.bsb}` : ''}
${organization.account_number ? `Account Number: ${organization.account_number}` : ''}
Please use Invoice #${invoice.number || 'inv-0001'} as payment reference
` : ''}

${invoice.notes ? `
NOTES:
------
${invoice.notes}
` : ''}

${organization.invoice_terms ? `
TERMS & CONDITIONS:
------------------
${organization.invoice_terms}
` : ''}

Thank you for your business!
This invoice was sent from ${orgName} via Taska field service management system.
${organization.abn ? `ABN: ${organization.abn}` : ''}
  `;

  return { subject, html, text };
}

export function generateInvoiceReminderTemplate(
  invoice: any,
  organization: any = {},
  customer: any = {},
): { subject: string; html: string; text: string } {
  const orgName = organization.name || "Your Business";
  const daysOverdue = invoice.due_at
    ? Math.floor((Date.now() - new Date(invoice.due_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const customerFirstName = (customer.contact_name || customer.name || invoice.customer_name || '').split(' ')[0] || 'there';
  const subject = `Quick reminder — Invoice #${invoice.number || invoice.title} from ${orgName}`;

  const formatAddress = (addr: any) => {
    if (!addr) return '';
    const parts = [addr.street, addr.suburb, addr.state, addr.postcode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : (addr.address || '');
  };

  const businessAddress = formatAddress(organization);
  const customerAddress = formatAddress(customer);

  const itemsHtml = invoice.items?.map((item: any) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${Number(item.quantity).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${Number(item.unit_price).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #666;">No items</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 620px; margin: 0 auto; padding: 20px;">

      <!-- Header -->
      <div style="margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #2563eb;">
        <h1 style="color: #2563eb; margin: 0; font-size: 26px;">${orgName}</h1>
        ${organization.abn ? `<p style="margin: 4px 0; color: #666; font-size: 14px;">ABN: ${organization.abn}</p>` : ''}
        ${businessAddress ? `<p style="margin: 4px 0; color: #666; font-size: 14px;">${businessAddress}</p>` : ''}
      </div>

      <!-- Friendly opener -->
      <p style="font-size: 16px; margin: 0 0 20px 0;">Hi ${customerFirstName},</p>
      <p style="font-size: 16px; margin: 0 0 20px 0;">
        Just a friendly heads-up — it looks like invoice <strong>#${invoice.number || 'inv-0001'}</strong>${invoice.title ? ` for <em>${invoice.title}</em>` : ''}
        ${daysOverdue !== null && daysOverdue > 0 ? ` was due ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago` : ' has recently come due'} and we haven't received payment yet.
      </p>
      <p style="font-size: 16px; margin: 0 0 28px 0;">
        If you've already sorted it, no worries at all — feel free to ignore this. Otherwise, the details are below.
      </p>

      <!-- Invoice summary card -->
      <div style="background: #f8faff; border: 1px solid #d1ddf5; border-radius: 10px; padding: 20px; margin-bottom: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <span style="font-size: 15px; color: #555;">Invoice #${invoice.number || 'inv-0001'}</span>
          ${invoice.due_at ? `<span style="font-size: 14px; color: #888;">Due ${new Date(invoice.due_at).toLocaleDateString('en-AU')}</span>` : ''}
        </div>
        <div style="font-size: 26px; font-weight: bold; color: #2563eb;">$${Number(invoice.grand_total || 0).toFixed(2)} AUD</div>
        ${invoice.title ? `<div style="font-size: 14px; color: #666; margin-top: 6px;">${invoice.title}</div>` : ''}
      </div>

      <!-- Line Items -->
      <div style="margin-bottom: 28px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; color: #555; font-weight: 600;">Description</th>
              <th style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #ddd; color: #555; font-weight: 600;">Qty</th>
              <th style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #ddd; color: #555; font-weight: 600;">Unit</th>
              <th style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #ddd; color: #555; font-weight: 600;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Payment Details -->
      ${organization.account_name || organization.bsb || organization.account_number ? `
      <div style="background: #f8f9fa; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 10px 0; font-weight: 600; color: #333;">How to pay</p>
        ${organization.account_name ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Account Name:</strong> ${organization.account_name}</p>` : ''}
        ${organization.bsb ? `<p style="margin: 4px 0; font-size: 14px;"><strong>BSB:</strong> ${organization.bsb}</p>` : ''}
        ${organization.account_number ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Account Number:</strong> ${organization.account_number}</p>` : ''}
        <p style="margin: 10px 0 0 0; font-size: 13px; color: #666;">Use <strong>#${invoice.number || 'inv-0001'}</strong> as your payment reference</p>
      </div>
      ` : ''}

      <!-- Sign-off -->
      <p style="font-size: 15px; margin: 0 0 6px 0;">Thanks so much,</p>
      <p style="font-size: 15px; margin: 0 0 28px 0; font-weight: 600;">${orgName}</p>

      <!-- Footer -->
      <div style="padding-top: 20px; border-top: 1px solid #eee; color: #aaa; font-size: 12px;">
        <p style="margin: 0;">Sent via Taska${organization.abn ? ` · ABN: ${organization.abn}` : ''}</p>
        ${customerAddress ? `<p style="margin: 4px 0;">${customer.name || ''} · ${customerAddress}</p>` : ''}
      </div>
    </body>
    </html>
  `;

  const text = `
Hi ${customerFirstName},

Just a friendly heads-up — invoice #${invoice.number || 'inv-0001'}${invoice.title ? ` for ${invoice.title}` : ''}${daysOverdue !== null && daysOverdue > 0 ? ` was due ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago` : ' has recently come due'} and we haven't received payment yet.

If you've already sorted it, no worries — feel free to ignore this.

AMOUNT: $${Number(invoice.grand_total || 0).toFixed(2)} AUD
${invoice.due_at ? `DUE: ${new Date(invoice.due_at).toLocaleDateString('en-AU')}` : ''}

${invoice.items?.map((item: any) =>
  `  ${item.description} × ${Number(item.quantity).toFixed(2)} @ $${Number(item.unit_price).toFixed(2)} = $${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}`
).join('\n') || ''}

${organization.account_name || organization.bsb || organization.account_number ? `HOW TO PAY:
${organization.account_name ? `  Account Name:   ${organization.account_name}` : ''}
${organization.bsb ? `  BSB:            ${organization.bsb}` : ''}
${organization.account_number ? `  Account Number: ${organization.account_number}` : ''}
  Reference:      #${invoice.number || 'inv-0001'}
` : ''}
Thanks,
${orgName}${organization.abn ? `\nABN: ${organization.abn}` : ''}
  `.trim();

  return { subject, html, text };
}

export function generateStatementEmailTemplate(
  payload: {
    organization: any;
    customer: any;
    totals: { invoiced: number; paid: number; outstanding: number };
    periodLabel: string;
    statementDate: string;
    invoices: any[];
  }
): { subject: string; html: string; text: string } {
  const { organization, customer, totals, periodLabel } = payload;
  const orgName = organization?.name || "Your Business";
  const customerName = customer?.name || "Customer";
  const firstName = (customer?.contact_name || customer?.name || "").split(" ")[0] || "there";
  const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

  const subject = `Statement of Account – ${customerName} – ${periodLabel}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 620px; margin: 0 auto; padding: 20px;">
      <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2563eb;">
        <h1 style="color: #2563eb; margin: 0; font-size: 24px;">${orgName}</h1>
        ${organization?.abn ? `<p style="margin: 4px 0; color: #666; font-size: 14px;">ABN: ${organization.abn}</p>` : ""}
      </div>

      <p style="font-size: 16px; margin: 0 0 16px 0;">Hi ${firstName},</p>
      <p style="font-size: 15px; margin: 0 0 20px 0;">
        Please find attached your statement of account covering <strong>${periodLabel}</strong>.
      </p>

      <div style="background: #f8faff; border: 1px solid #d1ddf5; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Total Invoiced:</span><span>${money(totals.invoiced)}</span></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Total Paid:</span><span>${money(totals.paid)}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; color: #2563eb; border-top: 1px solid #d1ddf5; padding-top: 8px; margin-top: 8px;"><span>Total Outstanding:</span><span>${money(totals.outstanding)}</span></div>
      </div>

      <p style="font-size: 15px; margin: 0 0 8px 0;">A detailed PDF statement is attached. If you have any questions, just reply to this email.</p>

      <p style="font-size: 15px; margin: 20px 0 4px 0;">Thanks,</p>
      <p style="font-size: 15px; margin: 0; font-weight: 600;">${orgName}</p>

      <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #eee; color: #aaa; font-size: 12px;">
        <p style="margin: 0;">Sent via Taska${organization?.abn ? ` · ABN: ${organization.abn}` : ""}</p>
      </div>
    </body>
    </html>
  `;

  const text = `
Hi ${firstName},

Please find attached your statement of account covering ${periodLabel}.

Total Invoiced:    ${money(totals.invoiced)}
Total Paid:        ${money(totals.paid)}
Total Outstanding: ${money(totals.outstanding)}

A detailed PDF statement is attached. If you have any questions, just reply to this email.

Thanks,
${orgName}${organization?.abn ? `\nABN: ${organization.abn}` : ""}
  `.trim();

  return { subject, html, text };
}

export function generateQuoteEmailTemplate(quote: any, orgName: string = "Taska", baseUrl: string = "http://localhost:5000"): { subject: string; html: string; text: string } {
  const subject = `Quote ${quote.title} from ${orgName}`;
  
  const itemsHtml = quote.items?.map((item: any) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${Number(item.quantity).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${Number(item.unit_price).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #666;">No items</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin: 0;">${orgName}</h1>
        <h2 style="margin: 8px 0 0 0; color: #666;">Quote: ${quote.title}</h2>
      </div>
      
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #333;">Quote Details</h3>
        <p><strong>Customer:</strong> ${quote.customer_name}</p>
        <p><strong>Status:</strong> <span style="text-transform: capitalize;">${quote.status}</span></p>
        ${quote.notes ? `<p><strong>Notes:</strong> ${quote.notes}</p>` : ''}
      </div>

      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #333;">Line Items</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #ddd;">Description</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #ddd;">Qty</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #ddd;">Unit</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: right;">
        <div style="font-size: 18px; font-weight: bold; color: #2563eb;">
          Total: $${Number(quote.grand_total || quote.total || 0).toFixed(2)}
        </div>
      </div>

      ${quote.confirmation_token ? `
      <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
        <h3 style="margin-top: 0; color: #333;">Please respond to this quote</h3>
        <p style="color: #666; margin-bottom: 25px;">Click one of the buttons below to accept or decline this quote.</p>
        <table style="margin: 0 auto; border-spacing: 20px 0;">
          <tr>
            <td>
              <a href="${baseUrl}/api/public/quotes/accept?token=${quote.confirmation_token}" 
                 style="display: inline-block; padding: 12px 30px; background: #22c55e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                ✅ Accept Quote
              </a>
            </td>
            <td>
              <a href="${baseUrl}/api/public/quotes/decline?token=${quote.confirmation_token}" 
                 style="display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                ❌ Decline Quote
              </a>
            </td>
          </tr>
        </table>
      </div>
      ` : ''}

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
        <p>We look forward to working with you!</p>
        <p>This quote was sent from ${orgName} via Taska.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
Quote: ${quote.title}
From: ${orgName}

Customer: ${quote.customer_name}
Status: ${quote.status}
${quote.notes ? `Notes: ${quote.notes}` : ''}

Line Items:
${quote.items?.map((item: any) => 
  `${item.description} - Qty: ${Number(item.quantity).toFixed(2)} - Unit: $${Number(item.unit_price).toFixed(2)} - Total: $${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}`
).join('\n') || 'No items'}

Total: $${Number(quote.grand_total || quote.total || 0).toFixed(2)}

${quote.confirmation_token ? `
Please respond to this quote by clicking one of the links below:

Accept Quote: ${baseUrl}/api/public/quotes/accept?token=${quote.confirmation_token}
Decline Quote: ${baseUrl}/api/public/quotes/decline?token=${quote.confirmation_token}

` : ''}We look forward to working with you!
This quote was sent from ${orgName} via Taska.
  `;

  return { subject, html, text };
}
