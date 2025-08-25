import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(description || "");
  const [opts, setOpts] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(()=>{
    const t = setTimeout(async ()=>{
      const term = q.trim();
      setLoading(true);
      try {
        const res = await itemPresetsApi.search(term);
        setOpts(res || []);
      } catch { /* noop */ }
      setLoading(false);
      setOpen(true);
    }, 200);
    return ()=>clearTimeout(t);
  }, [q]);

  // Close popup on outside click
  useEffect(()=>{
    function onClick(e: MouseEvent){
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return ()=>document.removeEventListener("mousedown", onClick);
  }, []);

  async function applyPreset(p: Preset) {
    setDescription(p.name);
    setUnitAmount(Number(p.unit_amount || 0));
    setTaxRate(Number(p.tax_rate || 0));
    setQ(p.name);
    setOpen(false);
  }

  // Auto-save on blur if not matched
  async function maybeAutosave() {
    if (!autoSave) return;
    const name = q.trim();
    if (!name) return;
    const exists = opts.find(o => o.name.toLowerCase() === name.toLowerCase());
    if (exists) return; // already known
    try {
      const saved = await itemPresetsApi.ensure({
        name,
        unit_amount: Number(unitAmount || 0),
        tax_rate: Number(taxRate || 0),
      });
      // snap to any normalization the server did
      if (saved?.name) setDescription(saved.name);
    } catch { /* ignore */ }
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={q}
        onChange={(e)=>{ setQ(e.target.value); setDescription(e.target.value); }}
        onFocus={()=>setOpen(true)}
        onBlur={maybeAutosave}
        placeholder="Type item (e.g., Labour)…"
        autoComplete="off"
        data-testid="input-item-preset"
      />
      {open && (opts.length > 0 || loading) && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-white dark:bg-gray-800 shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>}
          {!loading && opts.map(o=>(
            <button
              key={o.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              onMouseDown={(e)=> e.preventDefault()}
              onClick={()=>applyPreset(o)}
              data-testid={`button-preset-${o.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="font-medium">{o.name}</div>
              <div className="text-xs text-gray-500">
                ${Number(o.unit_amount).toFixed(2)} · Tax {Number(o.tax_rate).toFixed(2)}%
              </div>
            </button>
          ))}
          {!loading && opts.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No presets—press Tab/Enter to use "{q}"</div>
          )}
        </div>
      )}
    </div>
  );
}