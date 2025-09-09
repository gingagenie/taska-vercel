// client/src/components/billing/ItemPresetInput.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { itemPresetsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";

type Preset = {
  id: string;
  name: string;
  unit_amount: number | string;
  tax_rate: number | string;
};

export default function ItemPresetInput({
  description, setDescription,
  unitAmount, setUnitAmount,
  taxRate, setTaxRate,
  autoSave = true,
}: {
  description: string; setDescription: (v: string) => void;
  unitAmount: number; setUnitAmount: (v: number) => void;
  taxRate: number; setTaxRate: (v: number) => void;
  autoSave?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState(description || "");
  const [opts, setOpts] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Menu positioning
  const [rect, setRect] = useState({ left: 0, top: 0, width: 0 });
  const recompute = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom, width: r.width });
  };
  useLayoutEffect(() => { if (open) recompute(); }, [open, opts.length]);

  useEffect(() => {
    const onWin = () => open && recompute();
    window.addEventListener("resize", onWin, { passive: true });
    window.addEventListener("scroll", onWin, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true as any);
    };
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Debounced search - only show dropdown if user has typed something
  useEffect(() => {
    const t = setTimeout(async () => {
      // Only search and show dropdown if there's actual input
      if (!q.trim()) {
        setOpts([]);
        setOpen(false);
        return;
      }
      
      setLoading(true);
      try {
        const res = await itemPresetsApi.search(q.trim());
        setOpts(res || []);
      } catch {/* ignore */}
      setLoading(false);
      if (document.activeElement === inputRef.current && q.trim()) {
        setOpen(true);
        recompute();
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  function pick(p: Preset) {
    const amt = Number(p.unit_amount || 0);
    const tax = Number(p.tax_rate || 0);
    setDescription(p.name);
    setUnitAmount(amt);
    setTaxRate(tax);
    setQ(p.name);
    setOpen(false);                // ✅ close
    inputRef.current?.blur();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commitFreeText() {
    const name = q.trim();
    if (!name) { setOpen(false); return; }
    if (autoSave) {
      try {
        const saved = await itemPresetsApi.ensure({
          name,
          unit_amount: Number(unitAmount || 0),
          tax_rate: Number(taxRate || 0),
        });
        if (saved?.name) setDescription(saved.name);
      } catch {/* ignore */}
    } else {
      setDescription(name);
    }
    setOpen(false);                // ✅ close
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const exact = opts.find(o => o.name.toLowerCase() === q.trim().toLowerCase());
      exact ? pick(exact) : commitFreeText();
    } else if (e.key === "Escape") {
      setOpen(false);              // ✅ close
    }
  }

  // Hard-unmount menu so ghosts can't linger
  const menu = (
    open &&
    createPortal(
      <div
        key={`menu-${q}-${opts.length}`}     // 🔑 force teardown of previous menu
        ref={menuRef}
        style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 9999 }}
        className="rounded-md border bg-white shadow-lg max-h-[260px] overflow-auto"
        onMouseDown={(e) => e.preventDefault()} // keep focus on input
      >
        {loading && (
          <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
        )}
        {!loading && opts.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o)}           // ✅ closes on click
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
          >
            <div className="font-medium">{o.name}</div>
            <div className="text-xs text-gray-500">
              ${Number(o.unit_amount || 0).toFixed(2)} · Tax {Number(o.tax_rate || 0).toFixed(2)}%
            </div>
          </button>
        ))}
        {!loading && opts.length === 0 && (
          <div className="px-3 py-2 text-sm text-gray-500">
            Press <kbd>Enter</kbd> to use "{q}"
          </div>
        )}
      </div>,
      document.body
    )
  );

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setDescription(e.target.value); }}
        onFocus={() => {
          // Only open if there's text and results to show
          if (q.trim() && opts.length > 0) {
            setOpen(true);
            recompute();
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // give clicks on menu a chance to register
          setTimeout(() => {
            if (!menuRef.current?.matches(":hover")) setOpen(false);
          }, 0);
        }}
        placeholder="Type item… (e.g., Labour)"
        autoComplete="off"
        className="pr-8"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      {menu}
    </div>
  );
}