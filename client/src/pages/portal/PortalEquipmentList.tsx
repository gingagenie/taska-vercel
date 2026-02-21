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

// Helper to determine service status
function getServiceStatus(nextServiceDate?: string | null): { 
  status: 'current' | 'due-soon' | 'overdue' | 'unknown';
  label: string;
  color: string;
} {
  if (!nextServiceDate) {
    return { 
      status: 'unknown', 
      label: 'No schedule', 
      color: 'bg-gray-100 text-gray-600 border-gray-200' 
    };
  }
  
  const next = new Date(nextServiceDate);
  const now = new Date();
  const diffDays = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { 
      status: 'overdue', 
      label: 'Overdue', 
      color: 'bg-red-100 text-red-700 border-red-200' 
    };
  } else if (diffDays <= 30) {
    return { 
      status: 'due-soon', 
      label: 'Due Soon', 
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200' 
    };
  } else {
    return { 
      status: 'current', 
      label: 'Current', 
      color: 'bg-green-100 text-green-700 border-green-200' 
    };
  }
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
          const serviceStatus = getServiceStatus(e.next_service_date);

          return (
            <Link key={e.id} href={`/portal/${org}/equipment/${e.id}`}>
              <Card className="cursor-pointer hover:shadow transition-shadow border-2 border-gray-300">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{e.name}</CardTitle>
                    <Badge 
                      variant="outline" 
                      className={`${serviceStatus.color} border font-medium`}
                    >
                      {serviceStatus.label}
                    </Badge>
                  </div>
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
                  {last && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Last service:</span>
                      <span className="font-medium">{last}</span>
                    </div>
                  )}
                  {next && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Next service:</span>
                      <span className="font-medium">{next}</span>
                    </div>
                  )}
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
