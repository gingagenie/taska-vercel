import React from 'react';

interface Totals {
  subtotal: number;
  gst: number;
  total: number;
}

interface TotalsCardProps {
  totals: Totals;
  onSend: () => void;
  canSend: boolean;
  mode: 'quote' | 'invoice';
}

export function TotalsCard({ totals, onSend, canSend, mode }: TotalsCardProps) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4">
      <Row label="Subtotal" value={totals.subtotal} />
      <Row label="Total GST" value={totals.gst} />
      <div className="h-px bg-neutral-200 my-3" />
      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span>{currency(totals.total)}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <button 
          className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm disabled:opacity-50 hover:bg-neutral-800" 
          disabled={!canSend} 
          onClick={onSend}
        >
          {mode === 'quote' ? 'Send quote' : 'Send invoice'}
        </button>
        <button 
          className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50" 
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium">{currency(value)}</span>
    </div>
  );
}

function currency(n: number): string {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: 'currency', currency: 'AUD' });
}