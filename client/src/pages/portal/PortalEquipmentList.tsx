import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RequestServiceButton } from "@/components/RequestServiceButton";
import { Search, AlertTriangle } from "lucide-react";

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
      label: 'No Schedule', 
      color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' 
    };
  }
  
  const next = new Date(nextServiceDate);
  const now = new Date();
  const diffDays = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { 
      status: 'overdue', 
      label: 'Overdue', 
      color: 'bg-red-500/15 text-red-400 border-red-500/20' 
    };
  } else if (diffDays <= 30) {
    return { 
      status: 'due-soon', 
      label: 'Due Soon', 
      color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' 
    };
  } else {
    return { 
      status: 'current', 
      label: 'Operational', 
      color: 'bg-green-500/15 text-green-400 border-green-500/20' 
    };
  }
}

export default function PortalEquipmentList() {
  const params = useParams() as any;
  const org = (params?.org || "fixmyforklift") as string;
  const [equipment, setEquipment] = useState<Eq[]>([]);
  const [customerData, setCustomerData] = useState<any>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        
        // Fetch equipment
        const equipmentRes = await fetch(`/api/portal/${org}/equipment`, { 
          credentials: "include" 
        });
        if (equipmentRes.ok) {
          setEquipment(await equipmentRes.json());
        }

        // Fetch customer info for Request Service button
        const customerRes = await fetch(`/api/portal/${org}/me`, { 
          credentials: "include" 
        });
        if (customerRes.ok) {
          setCustomerData(await customerRes.json());
        }
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

  // Prepare equipment list for Request Service button
  const equipmentForRequest = equipment.map(e => ({
    id: e.id,
    name: e.name,
  }));

  return (
    <div className="min-h-screen bg-[#0f1419] text-gray-100">
      {/* Header */}
      <div className="border-b border-white/8 bg-gradient-to-b from-[#1a1f2e] to-[#0f1419]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Taska</h1>
              <p className="text-sm text-gray-400 font-medium">
                {customerData?.customer_name || 'Equipment Portal'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Request Service Button */}
        {customerData && (
          <div>
            <RequestServiceButton
              orgId={customerData.org_id}
              customerId={customerData.customer_id}
              customerName={customerData.customer_name || customerData.name}
              customerEmail={customerData.email}
              customerPhone={customerData.phone}
              equipment={equipmentForRequest}
            />
          </div>
        )}

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Your Equipment</h2>
            <p className="text-sm text-gray-400 mt-1">
              {filtered.length} {filtered.length === 1 ? 'unit' : 'units'}
            </p>
          </div>
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by ID, make, model, or serial..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-orange-500/30 focus:ring-orange-500/20"
            />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12 text-gray-400">
            Loading equipment…
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">No equipment found</div>
            {q && (
              <div className="text-sm text-gray-500">
                Try adjusting your search terms
              </div>
            )}
          </div>
        )}

        {/* Equipment Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((e) => {
            const last = fmtDate(e.last_service_date);
            const next = fmtDate(e.next_service_date);
            const serviceStatus = getServiceStatus(e.next_service_date);

            return (
              <Link key={e.id} href={`/portal/${org}/equipment/${e.id}`}>
                <Card className="cursor-pointer group h-full bg-gradient-to-br from-[#1a1f2e] to-[#151a27] border border-white/8 hover:border-orange-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 relative overflow-hidden">
                  {/* Hover accent bar */}
                  <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-orange-500 to-orange-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <CardHeader className="space-y-3 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg font-semibold text-white font-mono tracking-tight">
                        {e.name}
                      </CardTitle>
                      <Badge 
                        variant="outline" 
                        className={`${serviceStatus.color} border text-xs font-semibold px-2.5 py-1 whitespace-nowrap`}
                      >
                        {serviceStatus.label}
                      </Badge>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {(e.make || e.model) && (
                        <Badge variant="secondary" className="bg-white/5 text-gray-300 border-white/10 text-xs font-medium">
                          {[e.make, e.model].filter(Boolean).join(" ")}
                        </Badge>
                      )}
                      {e.serial_number && (
                        <Badge variant="outline" className="border-white/10 text-gray-400 text-xs font-mono">
                          SN: {e.serial_number}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-0 pt-0">
                    {/* Service Dates Section */}
                    <div className="bg-black/20 rounded-lg p-4 border-l-2 border-orange-500/50 space-y-3">
                      {last && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 font-medium">Last Service</span>
                          <span className="text-gray-200 font-semibold font-mono">{last}</span>
                        </div>
                      )}
                      
                      {last && next && (
                        <div className="border-t border-white/5" />
                      )}
                      
                      {next && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 font-medium">Next Service</span>
                          <span className="text-gray-200 font-semibold font-mono">{next}</span>
                        </div>
                      )}
                      
                      {!last && !next && (
                        <div className="text-sm text-gray-500 text-center py-1">
                          No service dates recorded
                        </div>
                      )}
                    </div>

                    {/* View History Button */}
                    <div className="pt-4">
                      <div className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-orange-500/30 rounded-lg text-center text-sm font-semibold text-gray-300 group-hover:text-white transition-all duration-200">
                        View Service History →
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
