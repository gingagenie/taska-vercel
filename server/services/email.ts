// Email service using MailerSend
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
if (!MAILERSEND_API_KEY) {
  console.warn("Warning: MAILERSEND_API_KEY not set. Email functionality will be disabled.");
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!MAILERSEND_API_KEY) {
    console.error('Cannot send email: MailerSend API key not configured');
    return false;
  }
  
  console.log('MailerSend - API Key exists:', !!MAILERSEND_API_KEY);
  console.log('MailerSend - API Key prefix:', MAILERSEND_API_KEY?.substring(0, 10) + '...');
  
  try {
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
        to: [
          {
            email: params.to,
            name: params.to.split('@')[0]
          }
        ],
        subject: params.subject,
        text: params.text || '',
        html: params.html || ''
      })
    });

    if (response.ok) {
      console.log(`Email sent successfully to ${params.to} via MailerSend`);
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

export function generateInvoiceEmailTemplate(invoice: any, orgName: string = "Taska"): { subject: string; html: string; text: string } {
  const subject = `Invoice ${invoice.title} from ${orgName}`;
  
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
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin: 0;">${orgName}</h1>
        <h2 style="margin: 8px 0 0 0; color: #666;">Invoice: ${invoice.title}</h2>
      </div>
      
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #333;">Invoice Details</h3>
        <p><strong>Customer:</strong> ${invoice.customer_name}</p>
        <p><strong>Status:</strong> <span style="text-transform: capitalize;">${invoice.status}</span></p>
        ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
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
          Total: $${Number(invoice.grand_total || invoice.total || 0).toFixed(2)}
        </div>
      </div>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
        <p>Thank you for your business!</p>
        <p>This invoice was sent from ${orgName} via Taska.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
Invoice: ${invoice.title}
From: ${orgName}

Customer: ${invoice.customer_name}
Status: ${invoice.status}
${invoice.notes ? `Notes: ${invoice.notes}` : ''}

Line Items:
${invoice.items?.map((item: any) => 
  `${item.description} - Qty: ${Number(item.quantity).toFixed(2)} - Unit: $${Number(item.unit_price).toFixed(2)} - Total: $${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}`
).join('\n') || 'No items'}

Total: $${Number(invoice.grand_total || invoice.total || 0).toFixed(2)}

Thank you for your business!
This invoice was sent from ${orgName} via Taska.
  `;

  return { subject, html, text };
}

export function generateQuoteEmailTemplate(quote: any, orgName: string = "Taska"): { subject: string; html: string; text: string } {
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

We look forward to working with you!
This quote was sent from ${orgName} via Taska.
  `;

  return { subject, html, text };
}