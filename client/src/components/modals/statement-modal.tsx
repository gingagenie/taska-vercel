import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Download, Mail, Loader2 } from "lucide-react";
import { statementsApi, type StatementFilters } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type CustomerOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-fill / lock the customer (customer detail page). */
  customerId?: string;
  customerName?: string;
  /** Provide a list to allow choosing the customer (invoices list). */
  customers?: CustomerOption[];
};

type Preset = "thisMonth" | "last30" | "last90" | "fy" | "custom";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(preset: Preset): { from: string; to: string } {
  const today = new Date();
  const to = toYMD(today);
  if (preset === "thisMonth") {
    return { from: toYMD(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  }
  if (preset === "last30") {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return { from: toYMD(d), to };
  }
  if (preset === "last90") {
    const d = new Date(today);
    d.setDate(d.getDate() - 89);
    return { from: toYMD(d), to };
  }
  if (preset === "fy") {
    // AU financial year: 1 July – 30 June
    const month = today.getMonth(); // 0=Jan, 6=Jul
    const fyStartYear = month >= 6 ? today.getFullYear() : today.getFullYear() - 1;
    return { from: toYMD(new Date(fyStartYear, 6, 1)), to };
  }
  return { from: "", to };
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "thisMonth", label: "This Month" },
  { key: "last30", label: "Last 30 Days" },
  { key: "last90", label: "Last 90 Days" },
  { key: "fy", label: "This Financial Year" },
];

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export function StatementModal({ open, onOpenChange, customerId, customerName, customers }: Props) {
  const { toast } = useToast();
  const selectable = !!customers && customers.length > 0 && !customerId;

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(customerId);
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const initial = presetRange("thisMonth");
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const [summary, setSummary] = useState<{
    count: number;
    totals: { invoiced: number; paid: number; outstanding: number };
    periodLabel: string;
    email: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState<null | "pdf" | "email">(null);

  // Reset when (re)opened
  useEffect(() => {
    if (open) {
      setSelectedCustomerId(customerId);
      setPreset("thisMonth");
      const r = presetRange("thisMonth");
      setDateFrom(r.from);
      setDateTo(r.to);
      setOutstandingOnly(false);
      setSummary(null);
    }
  }, [open, customerId]);

  const effectiveName = useMemo(() => {
    if (customerName) return customerName;
    return customers?.find((c) => c.id === selectedCustomerId)?.name || "";
  }, [customerName, customers, selectedCustomerId]);

  const filters: StatementFilters | null = useMemo(() => {
    if (!selectedCustomerId) return null;
    if (outstandingOnly) {
      return { customerId: selectedCustomerId, outstandingOnly: true };
    }
    if (!dateFrom || !dateTo) return null;
    return { customerId: selectedCustomerId, dateFrom, dateTo, outstandingOnly: false };
  }, [selectedCustomerId, dateFrom, dateTo, outstandingOnly]);

  // Reactive preview (debounced)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !filters) {
      setSummary(null);
      return;
    }
    setPreviewLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await statementsApi.preview(filters);
        setSummary({
          count: res.count,
          totals: res.totals,
          periodLabel: res.periodLabel,
          email: res.customer?.email ?? null,
        });
      } catch (e: any) {
        setSummary(null);
        toast({
          title: "Couldn't load statement preview",
          description: e?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, JSON.stringify(filters)]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  }

  async function handleDownload() {
    if (!filters) return;
    setBusy("pdf");
    try {
      const result = await statementsApi.generate({ ...filters, delivery: "pdf" });
      if (result.kind === "pdf") {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast({ title: "Statement downloaded" });
      }
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleEmail() {
    if (!filters) return;
    setBusy("email");
    try {
      const result = await statementsApi.generate({ ...filters, delivery: "email" });
      const recipient = result.kind === "json" ? result.data?.recipient : null;
      toast({
        title: "Statement sent",
        description: recipient ? `Emailed to ${recipient}` : undefined,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed to send statement", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const noEmail = summary?.email === null || summary?.email === "";
  const canAct = !!filters && !previewLoading && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-financial" />
            Statement of Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div>
            <Label>Customer</Label>
            {selectable ? (
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers!.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1 px-3 py-2 border rounded-md bg-gray-50 text-sm font-medium">
                {effectiveName || "—"}
              </div>
            )}
          </div>

          {/* Outstanding only toggle */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Outstanding invoices only</div>
              <div className="text-xs text-gray-500">Ignores the date range; shows all unpaid invoices.</div>
            </div>
            <Switch checked={outstandingOnly} onCheckedChange={setOutstandingOnly} />
          </div>

          {/* Date range (hidden when outstanding-only) */}
          {!outstandingOnly && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.key}
                    type="button"
                    size="sm"
                    variant={preset === p.key ? "default" : "outline"}
                    onClick={() => applyPreset(p.key)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPreset("custom");
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPreset("custom");
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-md bg-financial/5 border border-financial/20 p-3 text-sm">
            {previewLoading ? (
              <span className="text-gray-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
              </span>
            ) : summary ? (
              <span className="font-medium text-gray-700">
                {summary.count} invoice{summary.count === 1 ? "" : "s"} —{" "}
                {money(summary.totals.outstanding)} outstanding
                <span className="text-gray-500 font-normal">
                  {" "}
                  ({money(summary.totals.invoiced)} invoiced)
                </span>
              </span>
            ) : (
              <span className="text-gray-500">
                {selectedCustomerId ? "Adjust filters to preview." : "Select a customer to begin."}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!canAct}
              onClick={handleDownload}
            >
              {busy === "pdf" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Button
              className="flex-1 bg-financial hover:bg-financial/90 text-financial-foreground"
              disabled={!canAct || noEmail}
              title={noEmail ? "This customer has no email on file" : undefined}
              onClick={handleEmail}
            >
              {busy === "email" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send via Email
            </Button>
          </div>
          {noEmail && summary && (
            <p className="text-xs text-amber-600">This customer has no email address on file.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
