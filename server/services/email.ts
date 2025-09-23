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
        <p><strong>Invoice Number:</strong> ${invoice.id ? invoice.id.substring(0, 8).toUpperCase() : 'INV-001'}</p>
        <p><strong>Date:</strong> ${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : new Date().toLocaleDateString()}</p>
        ${invoice.due_at ? `<p><strong>Due Date:</strong> ${new Date(invoice.due_at).toLocaleDateString()}</p>` : ''}
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

Invoice Number: ${invoice.id ? invoice.id.substring(0, 8).toUpperCase() : 'INV-001'}
Date: ${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : new Date().toLocaleDateString()}
${invoice.due_at ? `Due Date: ${new Date(invoice.due_at).toLocaleDateString()}` : ''}
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