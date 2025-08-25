import { useEffect, useRef, useState } from "react";
import { itemPresetsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Search } from "lucide-react";

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
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search with better timing
  useEffect(()=>{
    if (!q.trim()) {
      setOpts([]);
      setOpen(false);
      return;
    }
    
    const t = setTimeout(async ()=>{
      const term = q.trim();
      setLoading(true);
      setSelectedIndex(-1);
      try {
        const res = await itemPresetsApi.search(term);
        setOpts(res || []);
        setOpen(true);
      } catch { 
        setOpts([]);
      }
      setLoading(false);
    }, 150); // Slightly faster response
    return ()=>clearTimeout(t);
  }, [q]);

  // Close popup on outside click
  useEffect(()=>{
    function onClick(e: MouseEvent){
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSelectedIndex(-1);
      }
    }
    document.addEventListener("mousedown", onClick);
    return ()=>document.removeEventListener("mousedown", onClick);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || opts.length === 0) {
      if (e.key === 'Enter' && q.trim() && autoSave) {
        e.preventDefault();
        maybeAutosave();
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => i < opts.length - 1 ? i + 1 : i);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => i > 0 ? i - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          applyPreset(opts[selectedIndex]);
        } else if (q.trim() && autoSave) {
          maybeAutosave();
          inputRef.current?.blur();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  async function applyPreset(p: Preset) {
    setDescription(p.name);
    setUnitAmount(Number(p.unit_amount || 0));
    setTaxRate(Number(p.tax_rate || 0));
    setQ(p.name);
    setOpen(false);
    setSelectedIndex(-1);
  }

  // Auto-save with better feedback
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
      if (saved?.name) {
        setDescription(saved.name);
        setQ(saved.name);
      }
    } catch { /* ignore */ }
  }

  const exactMatch = opts.find(o => o.name.toLowerCase() === q.toLowerCase());
  const showCreateOption = q.trim() && !exactMatch && !loading;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e)=>{ setQ(e.target.value); setDescription(e.target.value); }}
          onFocus={()=>{
            if (q.trim()) setOpen(true);
          }}
          onBlur={maybeAutosave}
          onKeyDown={handleKeyDown}
          placeholder="Type item name..."
          autoComplete="off"
          data-testid="input-item-preset"
          className="pr-8"
        />
        <Search className="absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
      </div>
      
      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-lg border bg-white dark:bg-gray-800 shadow-xl border-gray-200 dark:border-gray-700">
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border border-gray-300 border-t-blue-600"></div>
              Searching presets...
            </div>
          )}
          
          {!loading && opts.length > 0 && (
            <div className="py-2">
              <div className="px-3 pb-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Saved Presets
              </div>
              {opts.map((o, index) => (
                <button
                  key={o.id}
                  type="button"
                  className={`w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors border-l-2 ${
                    index === selectedIndex 
                      ? 'bg-blue-50 dark:bg-blue-950 border-l-blue-500' 
                      : 'border-l-transparent'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => applyPreset(o)}
                  data-testid={`button-preset-${o.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{o.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          ${Number(o.unit_amount).toFixed(2)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {Number(o.tax_rate).toFixed(0)}% tax
                        </Badge>
                      </div>
                    </div>
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && showCreateOption && (
            <>
              {opts.length > 0 && <div className="border-t border-gray-200 dark:border-gray-700"></div>}
              <div className="py-2">
                <div className="px-3 pb-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Create New
                </div>
                <button
                  type="button"
                  className={`w-full text-left px-4 py-3 hover:bg-green-50 dark:hover:bg-green-950 transition-colors border-l-2 ${
                    selectedIndex === opts.length 
                      ? 'bg-green-50 dark:bg-green-950 border-l-green-500' 
                      : 'border-l-transparent'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(opts.length)}
                  onClick={() => {
                    maybeAutosave();
                    inputRef.current?.blur();
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Plus className="h-4 w-4 text-green-600" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Create "{q}"</div>
                      <div className="text-sm text-gray-500">Save as new preset for future use</div>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {!loading && opts.length === 0 && !showCreateOption && q.trim() && (
            <div className="px-4 py-6 text-center text-gray-500">
              <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <div className="text-sm">No presets found for "{q}"</div>
              <div className="text-xs mt-1">Start typing to see suggestions</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}