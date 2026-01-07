import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Eq = { id: string; name: string; serial_number?: string; asset_number?: string };

export default function PortalEquipmentList() {
  const params = useParams() as any;
  const org = (params?.org || "fixmyforklift") as string;

  const [equipment, setEquipment] = useState<Eq[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/portal/${org}/equipment`, {
        credentials: "include",
      });
      if (r.ok) setEquipment(await r.json());
    })();
  }, [org]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return equipment;
    return equipment.filter((e) =>
      [e.name, e.serial_number, e.asset_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [equipment, q]);

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Your Equipment</h1>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="max-w-xs" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((e) => (
          <Link key={e.id} href={`/portal/${org}/equipment/${e.id}`}>
            <Card className="cursor-pointer hover:shadow">
              <CardHeader>
                <CardTitle className="text-base">{e.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600">
                {e.asset_number && <div>Asset: {e.asset_number}</div>}
                {e.serial_number && <div>Serial: {e.serial_number}</div>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
