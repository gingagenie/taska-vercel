import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { quotesApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ExternalLink, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function QuoteView() {
  const [match, params] = useRoute("/quotes/:id");
  const [, nav] = useLocation();
  const id = params?.id;

  const [quote, setQuote] = useState<any>(null);
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
        const q = await quotesApi.get(id);
        setQuote(q);
        // Pre-populate email if customer has one
        if (q.customer_email) {
          setEmailAddress(q.customer_email);
        }
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

  function generateEmailPreview() {
    if (!quote) return null;
    
    const orgName = "Taska"; // Could get from org context
    const subject = `Quote ${quote.title} from ${orgName}`;
    
    const linesHtml = quote.lines?.map((line: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${line.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${Number(line.quantity).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${Number(line.unit_amount).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${(Number(line.quantity) * Number(line.unit_amount)).toFixed(2)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #666;">No items</td></tr>';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">${orgName}</h1>
          <p style="color: #666; margin: 5px 0;">Quote</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="margin: 0 0 15px 0; color: #333;">Quote ${quote.title}</h2>
          <p style="margin: 5px 0; color: #666;">Customer: ${quote.customer_name || 'N/A'}</p>
          <p style="margin: 5px 0; color: #666;">Date: ${new Date(quote.date).toLocaleDateString()}</p>
          <p style="margin: 5px 0; color: #666;">Status: ${quote.status}</p>
          ${quote.valid_until ? `<p style="margin: 5px 0; color: #666;">Valid Until: ${new Date(quote.valid_until).toLocaleDateString()}</p>` : ''}
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
            ${linesHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 30px;">
          <p style="margin: 5px 0; font-size: 18px; font-weight: bold;">Total: $${Number(quote.total_amount).toFixed(2)}</p>
        </div>

        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #666;">Thank you for considering our services!</p>
          <p style="margin: 5px 0 0 0; color: #666;">Please contact us if you have any questions about this quote.</p>
        </div>
      </div>
    `;

    const text = `Quote ${quote.title} from ${orgName}\n\nCustomer: ${quote.customer_name || 'N/A'}\nDate: ${new Date(quote.date).toLocaleDateString()}\nStatus: ${quote.status}\n${quote.valid_until ? `Valid Until: ${new Date(quote.valid_until).toLocaleDateString()}\n` : ''}\nTotal: $${Number(quote.total_amount).toFixed(2)}\n\nThank you for considering our services!`;

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
      await quotesApi.sendEmail(id, { email: emailAddress.trim() });
      toast({
        title: "Quote sent",
        description: `Quote sent successfully to ${emailAddress}`,
      });
      setEmailDialogOpen(false);
      setEmailStep('input');
      setEmailPreview(null);
      
      // Refresh quote data to reflect status change
      const updatedQuote = await quotesApi.get(id);
      setQuote(updatedQuote);
    } catch (e: any) {
      toast({
        title: "Failed to send email",
        description: e.message || "Unable to send quote email",
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
  if (!quote) return <div className="page">Quote not found</div>;

  return (
    <div className="page space-y-6">
      <div className="header-row">
        <h1 className="text-2xl font-bold">{quote.title}</h1>
        <div className="header-actions">
          <Link href={`/quotes/${id}/edit`}><a><Button variant="outline">Edit</Button></a></Link>
          <Button 
            onClick={() => setEmailDialogOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-email-quote"
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
              <div><strong>Status:</strong> <span className="capitalize">{quote.status}</span></div>
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

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEmailDialogOpen(false);
          setEmailStep('input');
          setEmailPreview(null);
        } else {
          setEmailDialogOpen(true);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {emailStep === 'input' ? 'Send Quote via Email' : 'Email Preview'}
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
                  data-testid="input-quote-email"
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
                  data-testid="button-preview-quote-email"
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
                    data-testid="button-send-quote-email"
                  >
                    {sendingEmail ? "Sending..." : "Send Quote"}
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