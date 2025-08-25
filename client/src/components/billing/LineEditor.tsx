import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ItemPresetInput from "./ItemPresetInput";

export type Line = { description: string; quantity: number; unit_amount: number; tax_rate: number; };

interface LineEditorProps {
  lines: Line[];
  setLines: (v: Line[]) => void;
  currency?: string;
}

export default function LineEditor({
  lines, 
  setLines, 
  currency = "AUD"
}: LineEditorProps) {
  function add() { 
    setLines([...lines, { description:"", quantity:1, unit_amount:0, tax_rate:10 }]); 
  }
  
  function remove(i: number) { 
    const next = [...lines]; 
    next.splice(i, 1); 
    setLines(next); 
  }
  
  function change(i: number, patch: Partial<Line>) { 
    console.log(`Line ${i} change:`, patch);
    const next = [...lines]; 
    next[i] = { ...next[i], ...patch }; 
    setLines(next); 
  }

  const totals = useMemo(() => {
    const sub = lines.reduce((a,l) => a + (Number(l.quantity||0) * Number(l.unit_amount||0)), 0);
    const tax = lines.reduce((a,l) => a + (Number(l.quantity||0) * Number(l.unit_amount||0)) * (Number(l.tax_rate||0)/100), 0);
    const grand = sub + tax;
    const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return { sub: r(sub), tax: r(tax), grand: r(grand) };
  }, [lines]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit Price</th>
              <th className="px-3 py-2 text-right font-medium">Tax %</th>
              <th className="px-3 py-2 text-right font-medium">Line Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const lineTotal = (Number(l.quantity||0) * Number(l.unit_amount||0)) * (1 + Number(l.tax_rate||0)/100);
              return (
                <tr key={i} className="border-b dark:border-gray-700">
                  <td className="px-3 py-4">
                    <ItemPresetInput
                      description={l.description}
                      setDescription={(v)=>change(i,{ description: v })}
                      unitAmount={Number(l.unit_amount)}
                      setUnitAmount={(v)=>change(i,{ unit_amount: Number(v) })}
                      taxRate={Number(l.tax_rate)}
                      setTaxRate={(v)=>change(i,{ tax_rate: Number(v) })}
                      autoSave={true}
                    />
                  </td>
                  <td className="px-3 py-4">
                    <Input 
                      inputMode="decimal" 
                      className="text-right w-20" 
                      value={l.quantity} 
                      onChange={e => change(i, {quantity: Number(e.target.value||0)})}
                      data-testid={`input-line-${i}-quantity`}
                    />
                  </td>
                  <td className="px-3 py-4">
                    <Input 
                      inputMode="decimal" 
                      className="text-right w-24" 
                      value={l.unit_amount} 
                      onChange={e => change(i, {unit_amount: Number(e.target.value||0)})}
                      data-testid={`input-line-${i}-unit-amount`}
                    />
                  </td>
                  <td className="px-3 py-4">
                    <Input 
                      inputMode="decimal" 
                      className="text-right w-20" 
                      value={l.tax_rate} 
                      onChange={e => change(i, {tax_rate: Number(e.target.value||0)})}
                      data-testid={`input-line-${i}-tax-rate`}
                    />
                  </td>
                  <td className="px-3 py-4 text-right font-mono" data-testid={`text-line-${i}-total`}>
                    ${lineTotal.toFixed(2)}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700" 
                      onClick={() => remove(i)}
                      data-testid={`button-line-${i}-delete`}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pt-12">
        <Button onClick={add} variant="secondary" data-testid="button-add-line">
          Add Line Item
        </Button>
      </div>

      <div className="flex flex-col items-end gap-1 pt-4 border-t">
        <div className="text-sm font-mono" data-testid="text-subtotal">
          Subtotal: <strong>${totals.sub.toFixed(2)}</strong>
        </div>
        <div className="text-sm font-mono" data-testid="text-tax-total">
          Tax: <strong>${totals.tax.toFixed(2)}</strong>
        </div>
        <div className="text-base font-mono" data-testid="text-grand-total">
          Total: <strong>${totals.grand.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  );
}