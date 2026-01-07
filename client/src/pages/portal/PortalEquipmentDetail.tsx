import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Wrench } from "lucide-react";
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

export default function PortalEquipmentDetail() {
  const params = useParams() as any;
  const id = params?.id as string;
  const org = (params?.org || "fixmyforklift") as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/portal/${org}/equipment/${id}`, { credentials: "include" });
        if (r.ok) setData(await r.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [org, id]);

  async function download(jobId: string, title?: string) {
    try {
      setDownloadingId(jobId);

      const url = `/api/jobs/completed/${jobId}/service-sheet?download=1`;
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) return;

      const blob = await resp.blob();
      if (!blob || blob.size === 0) return;

      const safe = (title || "service-sheet")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `service-sheet-${safe || jobId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (!data) return <div className="p-6">Not found.</div>;

  const eq = data.equipment;

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-100 space-y-4">
      <Link href={`/portal/${org}/equipment`}>
        <Button variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </Link>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">{eq?.name}</CardTitle>

          <div className="flex flex-wrap gap-2">
            {(eq?.make || eq?.model) && (
              <Badge variant="secondary">{[eq?.make, eq?.model].filter(Boolean).join(" ")}</Badge>
            )}
            {eq?.serial_number && <Badge variant="outline">SN: {eq.serial_number}</Badge>}
          </div>
        </CardHeader>

        <CardContent className="text-sm text-gray-700 space-y-2">
          {eq?.last_service_date && (
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-gray-500" />
              <span>Last service: {fmtDate(eq.last_service_date)}</span>
            </div>
          )}
          {eq?.next_service_date && (
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-gray-500" />
              <span>Next service: {fmtDate(eq.next_service_date)}</span>
            </div>
          )}
          {eq?.notes && (
            <div className="bg-gray-50 border rounded p-3 text-gray-700 whitespace-pre-wrap">
              {eq.notes}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service History</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2">
          {(data.jobs || []).map((j: any) => (
            <div key={j.id} className="flex items-center justify-between bg-white border rounded p-3">
              <div>
                <div className="font-medium text-gray-900">{j.title}</div>
                <div className="text-xs text-gray-500">{fmtDateTime(j.completed_at)}</div>
              </div>

              <Button
                variant="outline"
                onClick={() => download(j.id, j.title)}
                disabled={downloadingId === j.id}
              >
                <Download className="h-4 w-4 mr-2" />
                {downloadingId === j.id ? "Preparing…" : "PDF"}
              </Button>
            </div>
          ))}

          {(!data.jobs || data.jobs.length === 0) && (
            <div className="text-gray-500">No service history yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
