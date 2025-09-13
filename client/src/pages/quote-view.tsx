import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { quotesApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ExternalLink, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function QuoteView() {
  const [match, params] = useRoute("/quotes/:id");
  const [, nav] = useLocation();
  const id = params?.id;

  const [quote, setQuote] = useState<any>(null);
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
        const q = await quotesApi.get(id);
        setQuote(q);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleAccept() {
    if (!id) return;
    try {
      await quotesApi.accept(id);
      const q = await quotesApi.get(id);
      setQuote(q);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handleConvert() {
    if (!id) return;
    try {
      const result = await quotesApi.convertToJob(id);
      nav(`/jobs/${result.jobId}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handleCreateInXero() {
    if (!id) return;
    setCreatingXero(true);
    try {
      const response = await api(`/api/quotes/${id}/xero`, { method: 'POST' });
      
      toast({
        title: "Quote created in Xero",
        description: `Quote #${response.xeroNumber} created successfully`,
      });
      
      // Refresh quote data to show Xero ID
      const updatedQuote = await quotesApi.get(id);
      setQuote(updatedQuote);
    } catch (e: any) {
      toast({
        title: "Failed to create in Xero",
        description: e.message || "Unable to create quote in Xero",
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

  // Calculate totals from quote items
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

  function handlePreview() {
    if (!quote) return;
    
    // Open preview window synchronously from user click to avoid popup blocking
    const previewWindow = window.open('', 'preview', 'width=800,height=600,scrollbars=yes');
    if (!previewWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups for this site to preview quotes.",
        variant: "destructive",
      });
      return;
    }

    const customer = (customers as any[]).find((c: any) => c.id === quote.customer_id) || {};
    const org = (meData as any)?.org || {};
    const items = quote.items || [];
    const totals = calculateTotals(items);
    
    // Safely escape all user data to prevent XSS
    const safeData = {
      title: escapeHtml(quote.title || ''),
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
      notes: escapeHtml(quote.notes || '').replace(/\n/g, '<br>'),
      terms: escapeHtml(quote.terms || '').replace(/\n/g, '<br>'),
      number: escapeHtml(quote.number || 'QUOTE-001'),
    };
    
    previewWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quote Preview - ${safeData.title}</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .company-info h1 { color: #0ea5e9; margin: 0; }
            .quote-info { text-align: right; }
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
            <div class="quote-info">
              <h2>QUOTE</h2>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Quote #:</strong> ${safeData.number}</p>
            </div>
          </div>
          
          <div class="customer-section">
            <h3>Quote For:</h3>
            <p><strong>${safeData.customerName}</strong></p>
            ${safeData.customerEmail ? `<p>${safeData.customerEmail}</p>` : ''}
            ${safeData.customerPhone ? `<p>${safeData.customerPhone}</p>` : ''}
            ${safeData.customerAddress ? `<p>${safeData.customerAddress}</p>` : ''}
            ${[safeData.customerStreet, safeData.customerSuburb, safeData.customerState, safeData.customerPostcode].filter(Boolean).length > 0 ? `<p>${[safeData.customerStreet, safeData.customerSuburb, safeData.customerState, safeData.customerPostcode].filter(Boolean).join(', ')}</p>` : ''}
          </div>

          ${safeData.notes ? `
            <div class="summary-section">
              <h3>Summary:</h3>
              <p>${safeData.notes}</p>
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Tax</th>
                <th class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => {
                const qty = Number(item.quantity || 0);
                const price = Number(item.unit_price || 0);
                const taxRate = Number(item.tax_rate || 0) / 100;
                const amount = qty * price;
                const taxAmount = amount * taxRate;
                const total = amount + taxAmount;
                const description = escapeHtml(item.description || '');
                return `
                  <tr>
                    <td>${description}</td>
                    <td>${qty.toFixed(2)}</td>
                    <td>$${price.toFixed(2)}</td>
                    <td>${taxRate > 0 ? 'GST' : 'None'}</td>
                    <td class="amount">$${total.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
              ${items.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #666;">No items</td></tr>' : ''}
            </tbody>
          </table>

          <div class="totals">
            <table>
              <tr><td>Subtotal:</td><td class="amount">$${totals.subtotal.toFixed(2)}</td></tr>
              <tr><td>GST:</td><td class="amount">$${totals.gst.toFixed(2)}</td></tr>
              <tr class="total-row"><td>Total:</td><td class="amount">$${totals.total.toFixed(2)}</td></tr>
            </table>
          </div>

          ${safeData.terms ? `
            <div class="terms">
              <h3>Terms & Conditions:</h3>
              <p>${safeData.terms}</p>
            </div>
          ` : ''}

          <div style="position: fixed; top: 10px; right: 10px; z-index: 1000;">
            <button onclick="window.close()" style="background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;">Close</button>
            <button onclick="window.print()" style="background: #0ea5e9; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 8px;">Print</button>
            <button onclick="
              var email = prompt('Enter email address to send quote:', '${safeData.customerEmail}');
              if (email && email.trim()) {
                fetch('/api/quotes/${escapeHtml(id || '')}/email', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include',
                  body: JSON.stringify({ email: email.trim() })
                })
                .then(response => response.json())
                .then(data => {
                  if (data.ok) {
                    alert('Quote sent successfully to ' + email);
                  } else {
                    alert('Failed to send: ' + (data.error || 'Unknown error'));
                  }
                })
                .catch(err => {
                  alert('Failed to send: ' + err.message);
                });
              }
            " style="background: #16a34a; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 8px;">📧 Send</button>
          </div>
        </body>
      </html>
    `);
    previewWindow.document.close();
  }



  if (loading) return <div className="page">Loading…</div>;
  if (!quote) return <div className="page">Quote not found</div>;

  return (
    <div className="page space-y-6">
      <div className="header-row">
        <h1 className="text-2xl font-bold">{quote.title}</h1>
        <div className="header-actions">
          <Link href={`/quotes/${id}/edit`}><a><Button variant="outline">Edit</Button></a></Link>
          <Button 
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-email-quote"
            onClick={handlePreview}
          >
            <Mail className="h-4 w-4" />
            Email
          </Button>
          {quote.status === 'sent' && (
            <Button onClick={handleAccept}>Accept</Button>
          )}
          {quote.status === 'accepted' && (
            <Button onClick={handleConvert}>Convert to Job</Button>
          )}
          {!quote.xero_id && (
            <Button 
              onClick={handleCreateInXero}
              disabled={creatingXero}
              variant="outline"
              data-testid="button-create-xero"
            >
              {creatingXero ? "Creating..." : "Create in Xero"}
            </Button>
          )}
          {quote.xero_id && (
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
              <div><strong>Customer:</strong> {quote.customer_name}</div>
              {quote.notes && <div><strong>Notes:</strong> {quote.notes}</div>}
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
                    {(quote.items || []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{Number(item.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">${Number(item.unit_price).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          ${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {(!quote.items || quote.items.length === 0) && (
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
                  <span>${Number(quote.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-lg">
                  <span>Total:</span>
                  <span>${Number(quote.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}