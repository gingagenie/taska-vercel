import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { invoicesApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ExternalLink, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function InvoiceView() {
  const [match, params] = useRoute("/invoices/:id");
  const [, nav] = useLocation();
  const id = params?.id;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creatingXero, setCreatingXero] = useState(false);
  const { toast } = useToast();

  // Fetch customers and user data for preview
  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers"],
  });

  const { data: meData } = useQuery({ queryKey: ["/api/me"] });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const i = await invoicesApi.get(id);
        setInvoice(i);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleMarkPaid() {
    if (!id) return;
    try {
      await invoicesApi.markPaid(id);
      const i = await invoicesApi.get(id);
      setInvoice(i);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  // Calculate totals from invoice items (consistent with quotes)
  function calculateTotals(items: any[]) {
    const subtotal = items.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.unit_price || 0));
    }, 0);
    
    const gst = items.reduce((sum, item) => {
      const itemTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
      const taxRate = Number(item.tax_rate || 0) / 100;
      return sum + (itemTotal * taxRate);
    }, 0);
    
    const total = subtotal + gst;
    
    return { subtotal, gst, total };
  }

  async function handleCreateInXero() {
    if (!id) return;
    setCreatingXero(true);
    try {
      const response = await api(`/api/invoices/${id}/xero`, { method: 'POST' });
      
      toast({
        title: "Invoice created in Xero",
        description: `Invoice #${response.xeroNumber} created successfully`,
      });
      
      // Refresh invoice data to show Xero ID
      const updatedInvoice = await invoicesApi.get(id);
      setInvoice(updatedInvoice);
    } catch (e: any) {
      toast({
        title: "Failed to create in Xero",
        description: e.message || "Unable to create invoice in Xero",
        variant: "destructive",
      });
    } finally {
      setCreatingXero(false);
    }
  }

  // Safe HTML escaping function to prevent XSS
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function handlePreview() {
    if (!invoice) return;
    
    // Open preview window synchronously from user click to avoid popup blocking
    const previewWindow = window.open('', 'preview', 'width=800,height=600,scrollbars=yes');
    if (!previewWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups for this site to preview invoices.",
        variant: "destructive",
      });
      return;
    }

    const customer = (customers as any[]).find((c: any) => c.id === invoice.customer_id) || {};
    const org = (meData as any)?.org || {};
    const items = invoice.items || [];
    const totals = calculateTotals(items);
    
    // Safely escape all user data to prevent XSS
    const safeData = {
      title: escapeHtml(invoice.title || ''),
      orgName: escapeHtml(org.name || 'Your Company'),
      orgStreet: escapeHtml(org.street || ''),
      orgSuburb: escapeHtml(org.suburb || ''),
      orgState: escapeHtml(org.state || ''),
      orgPostcode: escapeHtml(org.postcode || ''),
      orgAbn: escapeHtml(org.abn || ''),
      customerName: escapeHtml(customer.name || 'Customer Name'),
      customerEmail: escapeHtml(customer.email || ''),
      customerPhone: escapeHtml(customer.phone || ''),
      customerAddress: escapeHtml(customer.address || ''),
      customerStreet: escapeHtml(customer.street || ''),
      customerSuburb: escapeHtml(customer.suburb || ''),
      customerState: escapeHtml(customer.state || ''),
      customerPostcode: escapeHtml(customer.postcode || ''),
      notes: escapeHtml(invoice.notes || '').replace(/\n/g, '<br>'),
      number: escapeHtml(invoice.number || 'INV-001'),
    };
    
    previewWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice Preview - ${safeData.title}</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .company-info h1 { color: #0ea5e9; margin: 0; }
            .invoice-info { text-align: right; }
            .customer-section { margin: 30px 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f8f9fa; font-weight: 600; }
            .amount { text-align: right; }
            .totals { margin-top: 30px; text-align: right; }
            .totals table { width: 300px; margin-left: auto; }
            .total-row { font-weight: bold; font-size: 1.1em; }
            .summary-section { margin: 20px 0; padding: 15px; background-color: #f8f9fa; }
            .terms { margin-top: 40px; padding: 20px; border-top: 2px solid #ddd; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <h1>${safeData.orgName}</h1>
              <p>${[safeData.orgStreet, safeData.orgSuburb, safeData.orgState, safeData.orgPostcode].filter(Boolean).join(', ') || 'Field Service Management'}</p>
              ${safeData.orgAbn ? `<p>ABN: ${safeData.orgAbn}</p>` : ''}
            </div>
            <div class="invoice-info">
              <h2>INVOICE</h2>
              <p><strong>Date:</strong> ${new Date(invoice.date).toLocaleDateString()}</p>
              <p><strong>Invoice #:</strong> ${safeData.number}</p>
            </div>
          </div>
          
          <div class="customer-section">
            <h3>Bill To:</h3>
            <p><strong>${safeData.customerName}</strong></p>
            ${safeData.customerEmail ? `<p>${safeData.customerEmail}</p>` : ''}
            ${safeData.customerPhone ? `<p>${safeData.customerPhone}</p>` : ''}
            ${safeData.customerAddress ? `<p>${safeData.customerAddress}</p>` : ''}
            ${[safeData.customerStreet, safeData.customerSuburb, safeData.customerState, safeData.customerPostcode].filter(Boolean).length > 0 ? `<p>${[safeData.customerStreet, safeData.customerSuburb, safeData.customerState, safeData.customerPostcode].filter(Boolean).join(', ')}</p>` : ''}
          </div>

          ${safeData.notes ? `
            <div class="summary-section">
              <h3>Notes:</h3>
              <p>${safeData.notes}</p>
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => {
                const qty = Number(item.quantity || 0);
                const price = Number(item.unit_price || 0);
                const amount = qty * price;
                const description = escapeHtml(item.description || '');
                return `
                  <tr>
                    <td>${description}</td>
                    <td>${qty.toFixed(2)}</td>
                    <td>$${price.toFixed(2)}</td>
                    <td class="amount">$${amount.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
              ${items.length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">No items</td></tr>' : ''}
            </tbody>
          </table>

          <div class="totals">
            <table>
              <tr><td>Subtotal:</td><td class="amount">$${totals.subtotal.toFixed(2)}</td></tr>
              <tr><td>GST:</td><td class="amount">$${totals.gst.toFixed(2)}</td></tr>
              <tr class="total-row"><td>Total:</td><td class="amount">$${totals.total.toFixed(2)}</td></tr>
            </table>
          </div>

          <script>
            function sendInvoiceEmail(invoiceId) {
              console.log('sendInvoiceEmail called with ID:', invoiceId);
              var email = prompt('Enter email address to send invoice:', '${safeData.customerEmail}');
              if (email && email.trim()) {
                console.log('Sending to email:', email.trim());
                fetch('/api/invoices/' + encodeURIComponent(invoiceId) + '/email', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include',
                  body: JSON.stringify({ email: email.trim() })
                })
                .then(function(response) {
                  console.log('Response:', response);
                  return response.json();
                })
                .then(function(data) {
                  console.log('Response data:', data);
                  if (data.ok) {
                    alert('Invoice sent successfully to ' + email);
                  } else {
                    alert('Failed to send: ' + (data.error || 'Unknown error'));
                  }
                })
                .catch(function(err) {
                  console.error('Fetch error:', err);
                  alert('Failed to send: ' + err.message);
                });
              } else {
                console.log('No email entered or cancelled');
              }
            }
          </script>
          <div style="position: fixed; top: 10px; right: 10px; z-index: 1000;">
            <button onclick="window.close()" style="background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;">Close</button>
            <button onclick="window.print()" style="background: #0ea5e9; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 8px;">Print</button>
            <button onclick="sendInvoiceEmail('${escapeHtml(id || '')}')" style="background: #16a34a; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 8px;">📧 Send</button>
          </div>
        </body>
      </html>
    `);
    previewWindow.document.close();
  }


  if (loading) return <div className="page">Loading…</div>;
  if (!invoice) return <div className="page">Invoice not found</div>;

  return (
    <div className="page space-y-6">
      <div className="header-row">
        <h1 className="text-2xl font-bold">{invoice.title}</h1>
        <div className="header-actions">
          <Link href={`/invoices/${id}/edit`}><a><Button variant="outline">Edit</Button></a></Link>
          <Button 
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-email-invoice"
            onClick={handlePreview}
          >
            <Mail className="h-4 w-4" />
            Email
          </Button>
          {invoice.status !== 'paid' && invoice.status !== 'void' && (
            <Button onClick={handleMarkPaid}>Mark Paid</Button>
          )}
          {!invoice.xero_id && (
            <Button 
              disabled={true}
              variant="outline"
              data-testid="button-create-xero"
              className="opacity-50 cursor-not-allowed"
              title="Coming Soon"
            >
              Create in Xero
            </Button>
          )}
          {invoice.xero_id && (
            <Button 
              variant="outline"
              onClick={() => window.open('https://my.xero.com', '_blank')}
              data-testid="button-view-xero"
            >
              View in Xero <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {err && <div className="text-red-600">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="card-pad space-y-4">
              <div><strong>Customer:</strong> {invoice.customer_name}</div>
              {invoice.notes && <div><strong>Notes:</strong> {invoice.notes}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
            <CardContent className="card-pad">
              <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(invoice.items || []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{Number(item.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${Number(item.unit_price).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          ${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {(!invoice.items || invoice.items.length === 0) && (
                      <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">No items</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="card-pad">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${Number(invoice.subTotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST:</span>
                  <span>${Number(invoice.taxTotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-lg">
                  <span>Total:</span>
                  <span>${Number(invoice.grandTotal || 0).toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}