import { useState } from "react";
import Avatar from "boring-avatars";
import { Button } from "@/components/ui/button";

const seeds = ["taska-1","taska-2","taska-3","taska-4","taska-5","taska-6","taska-7","taska-8","taska-9","taska-10"];
const variants = ["beam","marble","pixel","sunset","ring","bauhaus"] as const;
const colors = ["#92A1C6", "#146A7C", "#F0AB3D", "#C271B4", "#C20D90"];

export function AvatarPicker({
  value,
  onSelect
}: {
  value?: { seed?: string; variant?: typeof variants[number] } | null;
  onSelect: (v: { seed?: string; variant?: typeof variants[number]; url?: string | null }) => void;
}) {
  const [variant, setVariant] = useState<typeof variants[number]>(value?.variant || "beam");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Choose a style</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={variant}
          onChange={(e)=>setVariant(e.target.value as any)}
        >
          {variants.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {seeds.map((seed) => (
          <button
            key={seed}
            type="button"
            className="rounded-full border p-1 hover:border-blue-400 transition"
            onClick={() => onSelect({ seed, variant, url: null })}
            title={`${variant}:${seed}`}
          >
            <div className="h-14 w-14 rounded-full overflow-hidden">
              <Avatar size={56} name={seed} variant={variant} colors={colors} />
            </div>
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        Prefer your own image? Use the upload button above.
      </div>

      <div>
        <Button variant="outline" onClick={()=>onSelect({ seed: undefined, variant: undefined, url: null })}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}