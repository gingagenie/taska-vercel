import React, { useEffect, useState } from "react";
import { invoicesApi } from "@/lib/api";

type InvoiceSummary = {
  paid: number;
  paidCount: number;
  outstanding: number;
  outstandingCount: number;
  overdue: number;
  overdueCount: number;
  recentUnpaid: any[];
};

type Status = "idle" | "loading" | "success" | "error";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
  });

export const InvoiceSummaryCard: React.FC = () => {
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setStatus("loading");
        setError(null);

        // Use counts endpoint for accurate server-side totals
        const [counts, unpaidInvoices, paidInvoices] = await Promise.all([
          fetch("/api/invoices/counts", { credentials: "include" }).then(r => r.json()),
          fetch("/api/invoices?tab=unpaid&pageSize=50", { credentials: "include" }).then(r => r.json()),
          fetch("/api/invoices?tab=paid&pageSize=100", { credentials: "include" }).then(r => r.json()),
        ]);

        if (cancelled) return;

        // Calculate outstanding (all unpaid amounts)
        const outstanding = (unpaidInvoices as any[]).reduce(
          (sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0
        );

        // Calculate overdue from unpaid list
        const now = new Date();
        let overdue = 0;
        let overdueCount = 0;
        for (const inv of unpaidInvoices as any[]) {
          if (inv.due_at && new Date(inv.due_at) < now) {
            overdue += Number(inv.total_amount || 0);
            overdueCount++;
          }
        }

        // Calculate paid this month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        let paidThisMonth = 0;
        let paidThisMonthCount = 0;
        for (const inv of paidInvoices as any[]) {
          const createdAt = new Date(inv.created_at);
          if (createdAt >= startOfMonth) {
            paidThisMonth += Number(inv.total_amount || 0);
            paidThisMonthCount++;
          }
        }

        // Recent unpaid - sort by created_at desc, take top 3
        const recentUnpaid = [...(unpaidInvoices as any[])]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 3);

        setSummary({
          paid: paidThisMonth,
          paidCount: paidThisMonthCount,
          outstanding,
          outstandingCount: Number(counts.unpaid || 0),
          overdue,
          overdueCount: Number(counts.overdue || 0),
          recentUnpaid,
        });
        setStatus("success");
      } catch (err) {
        console.error("Failed to load invoice summary", err);
        if (!cancelled) {
          setError("Could not load invoice summary");
          setStatus("error");
        }
      }
    };

    load();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Invoices</h3>
          <p className="text-xs text-slate-500">This month + outstanding</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          Invoices
        </span>
      </div>

      {/* Main metrics */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {/* Paid this month */}
        <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center">
          <div className="text-xs text-emerald-600 font-medium mb-0.5">Paid</div>
          <div className="text-sm font-semibold text-emerald-800">
            {status === "success" ? formatMoney(summary!.paid) : "—"}
          </div>
          <div className="text-[10px] text-emerald-600">
            {status === "success" ? `${summary!.paidCount} this mo` : ""}
          </div>
        </div>

        {/* Outstanding */}
        <div className="rounded-lg bg-amber-50 px-2 py-2 text-center">
          <div className="text-xs text-amber-600 font-medium mb-0.5">Owing</div>
          <div className="text-sm font-semibold text-amber-800">
            {status === "success" ? formatMoney(summary!.outstanding) : "—"}
          </div>
          <div className="text-[10px] text-amber-600">
            {status === "success" ? `${summary!.outstandingCount} inv` : ""}
          </div>
        </div>

        {/* Overdue */}
        <div className={`rounded-lg px-2 py-2 text-center ${status === "success" && summary!.overdueCount > 0 ? "bg-red-50" : "bg-slate-50"}`}>
          <div className={`text-xs font-medium mb-0.5 ${status === "success" && summary!.overdueCount > 0 ? "text-red-600" : "text-slate-500"}`}>
            Overdue
          </div>
          <div className={`text-sm font-semibold ${status === "success" && summary!.overdueCount > 0 ? "text-red-800" : "text-slate-400"}`}>
            {status === "success" ? formatMoney(summary!.overdue) : "—"}
          </div>
          <div className={`text-[10px] ${status === "success" && summary!.overdueCount > 0 ? "text-red-600" : "text-slate-400"}`}>
            {status === "success" ? `${summary!.overdueCount} inv` : ""}
          </div>
        </div>
      </div>

      {status === "loading" && (
        <p className="mt-3 text-xs text-slate-500">Loading…</p>
      )}
      {status === "error" && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}

      {/* Recent unpaid */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        {status === "success" && summary!.recentUnpaid.length === 0 && (
          <p className="text-xs text-slate-500">All invoices paid 🎉</p>
        )}

        {status === "success" && summary!.recentUnpaid.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Unpaid
            </p>
            <ul className="space-y-1.5 text-xs">
              {summary!.recentUnpaid.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {inv.customer_name || "Invoice"}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {inv.number} • {formatDate(inv.created_at)}
                      {inv.due_at && new Date(inv.due_at) < new Date() && (
                        <span className="ml-1 text-red-500 font-medium">overdue</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-slate-900">
                      {formatMoney(Number(inv.total_amount || 0))}
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-sky-700 hover:underline"
                      onClick={() => { window.location.href = `/invoices/${inv.id}`; }}
                    >
                      Open
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Link to invoices */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => { window.location.href = "/invoices"; }}
          className="rounded-lg border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          View invoices
        </button>
      </div>
    </div>
  );
};
