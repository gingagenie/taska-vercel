import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Wrench, Calendar, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function fmtDateTime(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString();
}

function fmtDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
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

export default function PortalEquipmentDetail() {
  const params = useParams() as any;
  const id = params?.id as string;
  const org = (params?.org || "fixmyforklift") as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/portal/${org}/equipment/${id}`, {
          credentials: "include",
        });
        if (r.ok) setData(await r.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [org, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex items-center justify-center">
        <div className="text-gray-400">Equipment not found.</div>
      </div>
    );
  }

  const eq = data.equipment;
  const serviceStatus = getServiceStatus(eq?.next_service_date);

  return (
    <div className="min-h-screen bg-[#0f1419] text-gray-100">
      {/* Header */}
      <div className="border-b border-white/8 bg-gradient-to-b from-[#1a1f2e] to-[#0f1419]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Link href={`/portal/${org}/equipment`}>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white hover:border-orange-500/30"
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Equipment
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Equipment Details Card */}
        <Card className="bg-gradient-to-br from-[#1a1f2e] to-[#151a27] border border-white/8 overflow-hidden">
          <CardHeader className="space-y-4 border-b border-white/8 pb-6">
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="text-2xl font-bold text-white font-mono tracking-tight">
                {eq?.name}
              </CardTitle>
              <Badge 
                variant="outline" 
                className={`${serviceStatus.color} border text-sm font-semibold px-3 py-1.5 whitespace-nowrap`}
              >
                {serviceStatus.label}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              {(eq?.make || eq?.model) && (
                <Badge variant="secondary" className="bg-white/5 text-gray-300 border-white/10 font-medium">
                  {[eq?.make, eq?.model].filter(Boolean).join(" ")}
                </Badge>
              )}
              {eq?.serial_number && (
                <Badge variant="outline" className="border-white/10 text-gray-400 font-mono">
                  Serial: {eq.serial_number}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Service Schedule */}
            <div className="bg-black/20 rounded-lg p-5 border-l-2 border-orange-500/50 space-y-4">
              <div className="flex items-center gap-2 text-gray-300 font-semibold mb-3">
                <Calendar className="h-5 w-5 text-orange-500" />
                <span>Service Schedule</span>
              </div>
              
              {eq?.last_service_date && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-medium">Last Service</span>
                  <span className="text-gray-200 font-semibold font-mono">{fmtDate(eq.last_service_date)}</span>
                </div>
              )}
              
              {eq?.last_service_date && eq?.next_service_date && (
                <div className="border-t border-white/5" />
              )}
              
              {eq?.next_service_date && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-medium">Next Service</span>
                  <span className="text-gray-200 font-semibold font-mono">{fmtDate(eq.next_service_date)}</span>
                </div>
              )}
              
              {!eq?.last_service_date && !eq?.next_service_date && (
                <div className="text-sm text-gray-500 text-center py-2">
                  No service schedule recorded
                </div>
              )}
            </div>

            {/* Equipment Notes */}
            {eq?.notes && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-300 font-semibold">
                  <FileText className="h-5 w-5 text-orange-500" />
                  <span>Notes</span>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-lg p-4 text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {eq.notes}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service History Card */}
        <Card className="bg-gradient-to-br from-[#1a1f2e] to-[#151a27] border border-white/8">
          <CardHeader className="border-b border-white/8">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-lg font-semibold text-white">Service History</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-3">
            {(data.jobs || []).map((j: any) => {
              const pdfUrl = `/api/portal/${org}/completed-jobs/${j.id}/service-sheet?download=1`;

              return (
                <div
                  key={j.id}
                  className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg p-4 hover:bg-black/30 hover:border-orange-500/20 transition-all duration-200 group"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="font-semibold text-white mb-1 truncate group-hover:text-orange-400 transition-colors">
                      {j.title}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {fmtDateTime(j.completed_at)}
                    </div>
                  </div>

                  <Button 
                    asChild 
                    variant="outline"
                    size="sm"
                    className="bg-white/5 border-white/10 text-gray-300 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400 flex-shrink-0"
                  >
                    <a href={pdfUrl} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </a>
                  </Button>
                </div>
              );
            })}

            {(!data.jobs || data.jobs.length === 0) && (
              <div className="text-center py-12 text-gray-500">
                <Wrench className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                <div>No service history yet</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
