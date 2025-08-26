import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { invoicesApi, customersApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { QuoteInvoicePage } from "@/components/quotes/QuoteInvoicePage";

export default function InvoiceEdit() {
  const [isNewMatch] = useRoute("/invoices/new");
  const [isEditMatch, params] = useRoute("/invoices/:id/edit");
  const [, nav] = useLocation();
  const id = params?.id;

  const [saving, setSaving] = useState(false);

  // Fetch customers and item presets
  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers"],
  });

  const { data: presets = [] } = useQuery({
    queryKey: ["/api/item-presets"],
  });

  // Fetch invoice data if editing
  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ["/api/invoices", id],
    enabled: !!id,
  });

  const loading = invoiceLoading;

  // Transform invoice data for the new component
  const initial = invoice ? {
    customer: { id: (invoice as any).customer_id },
    title: (invoice as any).title,
    notes: (invoice as any).notes,
    items: ((invoice as any).lines || []).map((l: any) => ({
      id: crypto.randomUUID(),
      itemName: l.description || '',
      description: l.description || '',
      qty: Number(l.quantity || 1),
      price: Number(l.unit_amount || 0),
      discount: 0,
      tax: Number(l.tax_rate || 0) > 0 ? 'GST' : 'None',
    })),
  } : undefined;

  async function handleSave(payload: any) {
    setSaving(true);
    try {
      // Transform payload back to API format
      const lines = payload.items.map((item: any) => ({
        description: item.description || item.itemName,
        quantity: item.qty,
        unit_amount: item.price,
        tax_rate: item.tax === 'GST' ? 10 : 0,
      }));

      if (id) {
        await invoicesApi.update(id, {
          title: payload.title,
          customer_id: payload.customerId,
          notes: payload.notes,
          lines,
        });
        nav(`/invoices/${id}`);
      } else {
        const r = await invoicesApi.create({
          title: payload.title,
          customerId: payload.customerId,
          notes: payload.notes,
          lines,
        });
        nav(`/invoices/${r.id}`);
      }
    } catch (e: any) {
      console.error("Failed to save invoice:", e);
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(payload: any) {
    await handleSave(payload);
    // TODO: Add send functionality
  }

  return (
    <QuoteInvoicePage
      mode="invoice"
      initial={initial}
      customers={customers as any}
      presets={presets as any}
      onSave={handleSave}
      onSend={handleSend}
      loading={loading}
      saving={saving}
    />
  );
}