import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { itemPresetsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";

type Preset = { id: string; name: string; unit_amount: number; tax_rate: number; };

export default function ItemPresetInput({
  description, setDescription,
  unitAmount, setUnitAmount,
  taxRate, setTaxRate,
  autoSave = true,
}: {
  description: string; setDescription: (v: string)=>void;
  unitAmount: number; setUnitAmount: (v: number)=>void;
  taxRate: number; setTaxRate: (v: number)=>void;
  autoSave?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(description || "");
  const [opts, setOpts] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Popup geometry
  const [rect, setRect] = useState<{left:number; top:number; width:number; height:number}>({
    left: 0, top: 0, width: 0, height: 0
  });
  const [openUp, setOpenUp] = useState(false);

  // Recompute position when opening/typing/scrolling/resizing
  function recompute() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuH = Math.min(260, 44 + (opts.length || 1) * 44); // rough guess
    const shouldOpenUp = r.bottom + menuH > vh && r.top - menuH > 0;
    setOpenUp(shouldOpenUp);
    setRect({ left: r.left, top: shouldOpenUp ? r.top - menuH : r.bottom, width: r.width, height: r.height });
  }

  useLayoutEffect(() => { recompute(); }, [open, opts.length]);
  useEffect(() => {
    function onWin() { recompute(); }
    window.addEventListener("resize", onWin, { passive:true });
    window.addEventListener("scroll", onWin, { passive:true, capture:true });
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true as any);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try { setOpts(await itemPresetsApi.search(q.trim())); } catch {}
      setLoading(false);
      setOpen(true);
      recompute();
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  // Auto-save unknown item on blur
  async function maybeAutosave() {
    if (!autoSave) return;
    const name = q.trim();
    if (!name) return;
    const exists = opts.find(o => o.name.toLowerCase() === name.toLowerCase());
    if (exists) return;
    try {
      const saved = await itemPresetsApi.ensure({
        name,
        unit_amount: Number(unitAmount || 0),
        tax_rate: Number(taxRate || 0),
      });
      if (saved?.name) setDescription(saved.name);
    } catch {}
  }

  function applyPreset(p: Preset) {
    setDescription(p.name);
    setUnitAmount(Number(p.unit_amount || 0));
    setTaxRate(Number(p.tax_rate || 0));
    setQ(p.name);
    setOpen(false);
  }

  // Render dropdown via portal (never clipped)
  const menu = open ? createPortal(
    <div
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        zIndex: 9999,
      }}
      className="rounded-md border bg-white shadow-lg max-h-[260px] overflow-auto"
      onMouseDown={(e)=> e.preventDefault()}
    >
      {loading && <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>}
      {!loading && opts.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={()=>applyPreset(o)}
          className="w-full text-left px-3 py-2 hover:bg-gray-50"
        >
          <div className="font-medium">{o.name}</div>
          <div className="text-xs text-gray-500">
            ${Number(o.unit_amount).toFixed(2)} · Tax {Number(o.tax_rate).toFixed(2)}%
          </div>
        </button>
      ))}
      {!loading && opts.length === 0 && (
        <div className="px-3 py-2 text-sm text-gray-500">Press Enter to use "{q}"</div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={q}
        onChange={(e)=>{ setQ(e.target.value); setDescription(e.target.value); }}
        onFocus={()=>{ setOpen(true); recompute(); }}
        onBlur={maybeAutosave}
        placeholder="Type item… (e.g., Labour)"
        autoComplete="off"
        className="pr-8"
      />
      {/* little search icon */}
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      {menu}
    </div>
  );
}