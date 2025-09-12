import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineItemsTable } from './parts/LineItemsTable';
import { TotalsCard } from './parts/TotalsCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Mail, Eye } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email?: string;
}

interface Preset {
  id: string;
  name: string;
  description?: string;
  unit_amount: number;
  tax_rate?: number;
}

interface LineItem {
  id: string;
  itemName: string;
  description: string;
  qty: number;
  price: number;
  discount: number;
  tax: string;
}

interface Initial {
  id?: string;
  customer?: { id: string };
  issueDate?: string;
  dueDate?: string;
  number?: string;
  reference?: string;
  taxMode?: string;
  items?: LineItem[];
  title?: string;
  notes?: string;
  terms?: string;
}

interface Totals {
  subtotal: number;
  gst: number;
  total: number;
}

interface Payload {
  mode: string;
  customerId: string;
  header: {
    issueDate: string;
    dueDate: string;
    number: string;
    reference: string;
    taxMode: string;
  };
  items: LineItem[];
  totals: Totals;
  title: string;
  notes: string;
  terms: string;
}

interface QuoteInvoicePageProps {
  mode?: 'quote' | 'invoice';
  initial?: Initial;
  customers?: Customer[];
  presets?: Preset[];
  onSave?: (payload: Payload) => Promise<void>;
  onSend?: (payload: Payload) => Promise<void>;
  onPreview?: (payload: Payload) => void;
  loading?: boolean;
  saving?: boolean;
}

export function QuoteInvoicePage({
  mode = 'invoice',
  initial,
  customers = [],
  presets = [],
  onSave,
  onSend,
  onPreview,
  loading = false,
  saving = false,
}: QuoteInvoicePageProps) {
  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailStep, setEmailStep] = useState<'input' | 'preview'>('input');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailPreview, setEmailPreview] = useState<any>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const { toast } = useToast();
  // Fetch previous items for autocomplete
  const { data: previousItems = [] } = useQuery<Array<{ itemName: string; description: string; price: number; tax: string }>>({
    queryKey: [`/api/${mode}s/previous-items`],
    retry: false,
  });
  
  // Fetch organization data for default terms
  const { data: orgData } = useQuery<{ org: { invoice_terms?: string; quote_terms?: string; [key: string]: any } }>({ 
    queryKey: ["/api/me"], 
    retry: false 
  });
  const org = orgData?.org || { invoice_terms: '', quote_terms: '' };
  const [customerId, setCustomerId] = useState(initial?.customer?.id || '');
  
  // Expose openEmailDialog to window for preview window communication
  useEffect(() => {
    (window as any).openEmailDialog = () => {
      const customer = customers.find(c => c.id === customerId);
      if (customer?.email) {
        setEmailAddress(customer.email);
      }
      setEmailDialogOpen(true);
    };
    
    return () => {
      delete (window as any).openEmailDialog;
    };
  }, [customers, customerId]);
  const [issueDate, setIssueDate] = useState(initial?.issueDate || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [docNo, setDocNo] = useState(initial?.number || '');
  const [reference, setReference] = useState(initial?.reference || '');
  const [taxMode, setTaxMode] = useState(initial?.taxMode || 'exclusive');
  const [title, setTitle] = useState(initial?.title || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [terms, setTerms] = useState(initial?.terms || '');

  // Update form fields when initial data loads
  useEffect(() => {
    if (initial) {
      setCustomerId(initial.customer?.id || '');
      setIssueDate(initial.issueDate || new Date().toISOString().slice(0, 10));
      setDueDate(initial.dueDate || '');
      setDocNo(initial.number || '');
      setReference(initial.reference || '');
      setTaxMode(initial.taxMode || 'exclusive');
      setTitle(initial.title || '');
      setNotes(initial.notes || '');
      setTerms(initial.terms || '');
      if (initial.items?.length) {
        setItems(initial.items);
      }
    }
  }, [initial]);

  // Auto-populate terms when org data loads and no terms are set
  useEffect(() => {
    if (!terms && org && orgData) {
      if (mode === 'quote' && org.quote_terms) {
        setTerms(org.quote_terms);
      } else if (mode === 'invoice' && org.invoice_terms) {
        setTerms(org.invoice_terms);
      }
    }
  }, [org, orgData, mode, terms]);
  const [items, setItems] = useState<LineItem[]>(
    initial?.items?.length ? initial.items : [
      { id: crypto.randomUUID(), itemName: '', description: '', qty: 1, price: 0, discount: 0, tax: 'GST' },
    ]
  );

  const customer = useMemo(() => customers.find(c => c.id === customerId) || null, [customerId, customers]);

  function setItem(id: string, key: keyof LineItem, value: any) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, [key]: value } : it)));
  }

  function addRow() {
    setItems(prev => [...prev, { id: crypto.randomUUID(), itemName: '', description: '', qty: 1, price: 0, discount: 0, tax: 'GST' }]);
  }

  function removeRow(id: string) {
    setItems(prev => (prev.length > 1 ? prev.filter(it => it.id !== id) : prev));
  }

  function applyPreset(id: string, presetId: string) {
    const p = presets.find(p => p.id === presetId);
    if (!p) return;
    setItems(prev => prev.map(it => (it.id === id ? {
      ...it,
      itemName: p.name,
      description: p.description || p.name,
      price: Number(p.unit_amount || 0),
      tax: (p.tax_rate || 0) > 0 ? 'GST' : 'None',
    } : it)));
  }

  const totals = useMemo(() => calcTotals(items, taxMode), [items, taxMode]);

  const payload = useMemo(() => ({
    mode,
    customerId,
    header: { issueDate, dueDate, number: docNo, reference, taxMode },
    items,
    totals,
    title,
    notes,
    terms,
  }), [mode, customerId, issueDate, dueDate, docNo, reference, taxMode, items, totals, title, notes, terms]);

  async function handleSave() { 
    await onSave?.(payload); 
  }
  
  async function handleSend() { 
    await onSend?.(payload); 
  }

  async function handlePreviewAndEmail() {
    // Just show the preview - no email dialog yet
    onPreview?.(payload);
  }

  async function handleEmailPreview() {
    console.log('handleEmailPreview called!', { emailAddress, initialId: initial?.id, mode });
    if (!emailAddress.trim()) return;
    if (!initial?.id) {
      toast({
        title: "Preview failed",
        description: "Invoice must be saved before sending email",
        variant: "destructive",
      });
      return;
    }
    try {
      console.log('Making API call:', `/api/${mode}s/${initial.id}/email-preview`);
      const response = await api(`/api/${mode}s/${initial.id}/email-preview`, {
        method: 'POST',
        body: JSON.stringify({ email: emailAddress.trim() })
      });
      console.log('API response:', response);
      setEmailPreview(response);
      setEmailStep('preview');
    } catch (e: any) {
      console.error('Email preview error:', e);
      toast({
        title: "Preview failed",
        description: e.message || "Unable to generate email preview",
        variant: "destructive",
      });
    }
  }

  async function handleSendEmail() {
    if (!initial?.id || !emailAddress.trim()) return;
    setSendingEmail(true);
    try {
      const apiMethod = mode === 'quote' ? 'quotes' : 'invoices';
      await api(`/api/${apiMethod}/${initial.id}/email`, {
        method: 'POST',
        body: JSON.stringify({ email: emailAddress.trim() })
      });
      toast({
        title: `${mode === 'quote' ? 'Quote' : 'Invoice'} sent`,
        description: `Successfully sent to ${emailAddress}`,
      });
      setEmailDialogOpen(false);
      setEmailStep('input');
      setEmailPreview(null);
    } catch (e: any) {
      toast({
        title: "Failed to send email",
        description: e.message || `Unable to send ${mode} email`,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          {/* Mobile: Stack vertically */}
          <div className="flex flex-col gap-4 md:hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 grid place-items-center font-bold text-white text-lg">T</div>
              <div className="leading-tight">
                <div className="font-semibold text-gray-900">New {mode === 'quote' ? 'quote' : 'invoice'}</div>
                <div className="text-sm text-gray-500">Draft</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center gap-2" 
                onClick={handlePreviewAndEmail}
                data-testid="button-preview-send"
              >
                <Eye className="h-4 w-4" />
                <Mail className="h-4 w-4" />
                Preview & Send
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save & close'}
                </button>
                <button 
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
                  disabled={!customerId || saving} 
                  onClick={handleSend}
                >
                  {mode === 'quote' ? 'Approve & email' : 'Approve & email'}
                </button>
              </div>
            </div>
          </div>

          {/* Desktop: Horizontal layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 grid place-items-center font-bold text-white text-lg">T</div>
              <div className="leading-tight">
                <div className="font-semibold text-gray-900">New {mode === 'quote' ? 'quote' : 'invoice'}</div>
                <div className="text-sm text-gray-500">Draft</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2" 
                onClick={handlePreviewAndEmail}
                data-testid="button-preview-send-desktop"
              >
                <Eye className="h-4 w-4" />
                <Mail className="h-4 w-4" />
                Preview & Send
              </button>
              <button 
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save & close'}
              </button>
              <button 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
                disabled={!customerId || saving} 
                onClick={handleSend}
              >
                {mode === 'quote' ? 'Approve & email' : 'Approve & email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Header form */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-4 md:px-6 py-4">
            {/* Contact - Full width on mobile */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                value={customerId} 
                onChange={e => setCustomerId(e.target.value)}
              >
                <option value="">Choose a contact</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Date fields - 2 columns on mobile, responsive */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Issue Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{mode === 'quote' ? 'Issue date' : 'Issue date'}</label>
                <input 
                  type="date" 
                  value={issueDate} 
                  onChange={e => setIssueDate(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>

              {/* Expiry/Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{mode === 'quote' ? 'Expiry date' : 'Due date'}</label>
                <input 
                  type="date" 
                  value={dueDate} 
                  onChange={e => setDueDate(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
            </div>

            {/* Document details - 2 columns on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quote/Invoice Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{mode === 'quote' ? 'Quote number' : 'Invoice number'}</label>
                <input 
                  value={docNo} 
                  onChange={e => setDocNo(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  placeholder={`${mode === 'quote' ? 'QU' : 'INV'}-0001`}
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reference</label>
                <input 
                  value={reference} 
                  onChange={e => setReference(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  placeholder="Job reference"
                />
              </div>
            </div>

            {/* Title Field - Full Width Below */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder={`${mode === 'quote' ? 'Quote' : 'Invoice'} title`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              />
            </div>

          </div>
        </div>

        {/* Summary Field - Moved up */}
        <div className="mt-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 md:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Summary</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              rows={3}
              placeholder="Brief description of this quote/invoice..."
            />
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-6">
          <LineItemsTable
            items={items}
            onChange={setItems}
            onSetItem={setItem}
            onAddRow={addRow}
            onRemoveRow={removeRow}
            onApplyPreset={applyPreset}
            presets={presets}
            taxMode={taxMode}
            previousItems={previousItems}
          />
        </div>

        {/* Totals Section */}
        <div className="mt-6 flex justify-center md:justify-end">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 md:p-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{currency(totals.subtotal)}</span>
                </div>
                {totals.gst > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Total GST</span>
                    <span className="font-medium">{currency(totals.gst)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-base md:text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-base md:text-lg font-bold text-gray-900">{currency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Terms Section */}
        <div className="mt-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 md:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Terms</label>
            <textarea 
              value={terms}
              onChange={e => setTerms(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
              rows={4}
              placeholder="Terms and Conditions for On-Site Forklift Repairs

1. Scope of Work
Fix My Forklift agrees to provide repair and maintenance services for forklift trucks on-site at the customer's location. The services will be performed based on the assessment of the forklift's condition."
            />
          </div>
        </div>
      </div>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={handleCloseEmailDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send {mode === 'quote' ? 'Quote' : 'Invoice'} via Email</DialogTitle>
          </DialogHeader>
          
          {emailStep === 'input' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="customer@example.com"
                  data-testid="input-email-address"
                />
              </div>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={handleCloseEmailDialog}
                  type="button"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleEmailPreview}
                  disabled={!emailAddress.trim()}
                  data-testid="button-preview-email"
                  type="button"
                >
                  Preview Email
                </Button>
              </DialogFooter>
            </div>
          )}
          
          {emailStep === 'preview' && emailPreview && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <strong>To:</strong> {emailAddress}
              </div>
              <div className="text-sm text-gray-600">
                <strong>Subject:</strong> {emailPreview.subject}
              </div>
              <div className="border rounded-md p-4 max-h-60 overflow-y-auto bg-gray-50">
                <div dangerouslySetInnerHTML={{ __html: emailPreview.html }} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEmailStep('input')}>
                  Back
                </Button>
                <Button 
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                  className="flex items-center gap-2"
                  data-testid="button-send-email"
                >
                  <Mail className="h-4 w-4" />
                  {sendingEmail ? 'Sending...' : 'Send Email'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function currency(n: number): string {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function calcTotals(items: LineItem[], taxMode: string): Totals {
  const GST = 0.10;
  const rows = items.map(it => {
    const base = Number(it.qty || 0) * Number(it.price || 0) * (1 - Number(it.discount || 0) / 100);
    if (it.tax === 'GST') {
      if (taxMode === 'inclusive') {
        const ex = base / (1 + GST);
        return { base: ex, gst: ex * GST, total: base };
      }
      return { base, gst: base * GST, total: base * (1 + GST) };
    }
    return { base, gst: 0, total: base };
  });
  const subtotal = rows.reduce((a, r) => a + r.base, 0);
  const gst = rows.reduce((a, r) => a + r.gst, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  return { subtotal, gst, total };
}