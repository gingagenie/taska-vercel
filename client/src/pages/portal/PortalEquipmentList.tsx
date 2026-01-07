import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Eq = {
  id: string;
  name: string;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  next_service_date?: string | null;
  last_service_date?: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString();
}

export default function PortalEquipmentList() {
  const params = useParams() as any;
  const org = (params?.org || "fixmyforklift") as string;

  const [equipment, setEquipment] = useState<Eq[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/portal/${org}/equipment`, { credentials: "include" });
        if (r.ok) setEquipment(await r.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return equipment;

    return equipment.filter((e) => {
      const hay = [e.name, e.make, e.model, e.serial_number]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return hay.some((v) => v.includes(s));
    });
  }, [equipment, q]);

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Your Equipment</h1>
          <p className="text-sm text-gray-500">Search by name, make/model, or serial number.</p>
        </div>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search..."
          className="max-w-xs"
        />
      </div>

      {loading && <div className="text-gray-600">Loading equipment…</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-gray-600">No equipment found.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((e) => {
          const last = fmtDate(e.last_service_date);
          const next = fmtDate(e.next_service_date);

          return (
            <Link key={e.id} href={`/portal/${org}/equipment/${e.id}`}>
              <Card className="cursor-pointer hover:shadow transition-shadow">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-base">{e.name}</CardTitle>

                  <div className="flex flex-wrap gap-2">
                    {(e.make || e.model) && (
                      <Badge variant="secondary">
                        {[e.make, e.model].filter(Boolean).join(" ")}
                      </Badge>
                    )}
                    {e.serial_number && (
                      <Badge variant="outline">SN: {e.serial_number}</Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="text-sm text-gray-600 space-y-1">
                  {last && <div>Last service: {last}</div>}
                  {next && <div>Next service: {next}</div>}
                  {!last && !next && <div>No service dates recorded yet.</div>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
