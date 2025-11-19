import React, { useEffect, useState } from "react";

type AcceptedQuote = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  total_amount: number;
  customer_name: string;
};

type AcceptedQuotesSummary = {
  ok: boolean;
  count: number;
  recent: AcceptedQuote[];
};

type Status = "idle" | "loading" | "success" | "error";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const QuotesAcceptedCard: React.FC = () => {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<AcceptedQuotesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setStatus("loading");
        setError(null);

        const res = await fetch("/api/quotes/accepted/summary", {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = (await res.json()) as AcceptedQuotesSummary;

        if (!cancelled) {
          setData(json);
          setStatus("success");
        }
      } catch (err) {
        console.error("Failed to load accepted quotes summary", err);
        if (!cancelled) {
          setError("Could not load accepted quotes");
          setStatus("error");
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const count = data?.count ?? 0;
  const recent = data?.recent ?? [];

  return (
    <div className="flex flex-col rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Quotes Accepted
          </h3>
          <p className="text-xs text-slate-500">
            Last 30 days (org-wide) {/* purely label text – change if needed */}
          </p>
        </div>

        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Accepted
        </span>
      </div>

      {/* Main metric */}
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-slate-900">
              {status === "success" ? count : "—"}
            </span>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              quotes
            </span>
          </div>
          {status === "loading" && (
            <p className="mt-1 text-xs text-slate-500">Loading…</p>
          )}
          {status === "error" && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        {/* Quick link to Quotes page */}
        <button
          type="button"
          onClick={() => {
            // adjust if you’re using a router hook instead of location.href
            window.location.href = "/app/quotes?filter=accepted";
          }}
          className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
        >
          View quotes
        </button>
      </div>

      {/* Recent accepted quotes list */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        {status === "success" && recent.length === 0 && (
          <p className="text-xs text-slate-500">
            No accepted quotes yet.
          </p>
        )}

        {status === "success" && recent.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Recent accepted
            </p>
            <ul className="space-y-1.5 text-xs">
              {recent.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {q.title || "Untitled quote"}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {q.customer_name} • {formatDate(q.created_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-slate-900">
                      {formatMoney(q.total_amount || 0)}
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-sky-700 hover:underline"
                      onClick={() => {
                        window.location.href = `/app/quotes/${q.id}`;
                      }}
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
    </div>
  );
};
