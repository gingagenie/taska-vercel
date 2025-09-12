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
            data-testid="button-email-quote"
          >
            <Mail className="h-4 w-4 mr-2" />
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
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Quote via Email</DialogTitle>
          </DialogHeader>
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
                onClick={() => setEmailDialogOpen(false)}
                disabled={sendingEmail}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSendEmail}
                disabled={sendingEmail || !emailAddress.trim()}
                data-testid="button-send-quote-email"
              >
                {sendingEmail ? "Sending..." : "Send Quote"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}