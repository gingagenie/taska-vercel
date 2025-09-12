import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { invoicesApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ExternalLink, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InvoiceView() {
  const [match, params] = useRoute("/invoices/:id");
  const [, nav] = useLocation();
  const id = params?.id;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creatingXero, setCreatingXero] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStep, setEmailStep] = useState<'input' | 'preview'>('input');
  const [emailPreview, setEmailPreview] = useState<{subject: string; html: string; text: string} | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const i = await invoicesApi.get(id);
        setInvoice(i);
        // Pre-populate email if customer has one
        if (i.customer_email) {
          setEmailAddress(i.customer_email);
        }
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

  function generateEmailPreview() {
    if (!invoice) return null;
    
    const orgName = "Taska"; // Could get from org context
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">${orgName}</h1>
          <p style="color: #666; margin: 5px 0;">Invoice</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="margin: 0 0 15px 0; color: #333;">Invoice ${invoice.title}</h2>
          <p style="margin: 5px 0; color: #666;">Customer: ${invoice.customer_name || 'N/A'}</p>
          <p style="margin: 5px 0; color: #666;">Date: ${new Date(invoice.date).toLocaleDateString()}</p>
          <p style="margin: 5px 0; color: #666;">Status: ${invoice.status}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Description</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #dee2e6;">Qty</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #dee2e6;">Unit Price</th>
              <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #dee2e6;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 30px;">
          <p style="margin: 5px 0; font-size: 18px; font-weight: bold;">Total: $${Number(invoice.total_amount).toFixed(2)}</p>
        </div>

        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #666;">Thank you for your business!</p>
          <p style="margin: 5px 0 0 0; color: #666;">If you have any questions, please don't hesitate to contact us.</p>
        </div>
      </div>
    `;

    const text = `Invoice ${invoice.title} from ${orgName}\n\nCustomer: ${invoice.customer_name || 'N/A'}\nDate: ${new Date(invoice.date).toLocaleDateString()}\nStatus: ${invoice.status}\n\nTotal: $${Number(invoice.total_amount).toFixed(2)}\n\nThank you for your business!`;

    return { subject, html, text };
  }

  function handlePreviewEmail() {
    if (!emailAddress.trim()) return;
    const preview = generateEmailPreview();
    if (preview) {
      setEmailPreview(preview);
      setEmailStep('preview');
    }
  }

  async function handleSendEmail() {
    if (!id || !emailAddress.trim()) return;
    setSendingEmail(true);
    try {
      await invoicesApi.sendEmail(id, { email: emailAddress.trim() });
      toast({
        title: "Invoice sent",
        description: `Invoice sent successfully to ${emailAddress}`,
      });
      setEmailDialogOpen(false);
      setEmailStep('input');
      setEmailPreview(null);
      
      // Refresh invoice data to reflect status change
      const updatedInvoice = await invoicesApi.get(id);
      setInvoice(updatedInvoice);
    } catch (e: any) {
      toast({
        title: "Failed to send email",
        description: e.message || "Unable to send invoice email",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  function handleCloseEmailDialog() {
    setEmailDialogOpen(false);
    setEmailStep('input');
    setEmailPreview(null);
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
            onClick={() => setEmailDialogOpen(true)}
            variant="outline"
            data-testid="button-email-invoice"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email
          </Button>
          {invoice.status !== 'paid' && invoice.status !== 'void' && (
            <Button onClick={handleMarkPaid}>Mark Paid</Button>
          )}
          {!invoice.xero_id && (
            <Button 
              onClick={handleCreateInXero}
              disabled={creatingXero}
              variant="outline"
              data-testid="button-create-xero"
            >
              {creatingXero ? "Creating..." : "Create in Xero"}
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
              <div><strong>Status:</strong> <span className="capitalize">{invoice.status}</span></div>
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
                  <span>${Number(invoice.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium text-lg">
                  <span>Total:</span>
                  <span>${Number(invoice.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={handleCloseEmailDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {emailStep === 'input' ? 'Send Invoice via Email' : 'Email Preview'}
            </DialogTitle>
          </DialogHeader>
          
          {emailStep === 'input' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Customer Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="customer@example.com"
                  data-testid="input-invoice-email"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleCloseEmailDialog}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handlePreviewEmail}
                  disabled={!emailAddress.trim()}
                  data-testid="button-preview-invoice-email"
                >
                  Preview Email
                </Button>
              </div>
            </div>
          )}

          {emailStep === 'preview' && emailPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="font-medium">To:</Label>
                  <p className="text-muted-foreground">{emailAddress}</p>
                </div>
                <div>
                  <Label className="font-medium">From:</Label>
                  <p className="text-muted-foreground">Taska &lt;noreply@taska.info&gt;</p>
                </div>
                <div>
                  <Label className="font-medium">Subject:</Label>
                  <p className="text-muted-foreground">{emailPreview.subject}</p>
                </div>
              </div>
              
              <div className="border rounded-lg p-4 bg-white">
                <div 
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: emailPreview.html }}
                />
              </div>
              
              <div className="flex justify-between gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setEmailStep('input')}
                  data-testid="button-back-to-email-input"
                >
                  ← Back
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleCloseEmailDialog}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSendEmail}
                    disabled={sendingEmail}
                    data-testid="button-send-invoice-email"
                  >
                    {sendingEmail ? "Sending..." : "Send Invoice"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}