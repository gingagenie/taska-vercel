import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

export default function PortalEquipmentDetail() {
  const params = useParams() as any;
  const id = params?.id as string;
  const org = (params?.org || "fixmyforklift") as string;

  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/portal/${org}/equipment/${id}`, {
        credentials: "include",
      });
      if (r.ok) setData(await r.json());
    })();
  }, [org, id]);

  async function download(jobId: string, title?: string) {
    const url = `/api/portal/${org}/completed-jobs/${jobId}/service-sheet?download=1`;

    const resp = await fetch(url, {
      credentials: "include",
    });
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
  }

  if (!data) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-100 space-y-4">
      <Link href={`/portal/${org}/equipment`}>
        <Button variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{data.equipment?.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          {data.equipment?.asset_number && <div>Asset: {data.equipment.asset_number}</div>}
          {data.equipment?.serial_number && <div>Serial: {data.equipment.serial_number}</div>}
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
                <div className="text-xs text-gray-500">{new Date(j.completed_at).toLocaleString()}</div>
              </div>
              <Button variant="outline" onClick={() => download(j.id, j.title)}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          ))}
          {(!data.jobs || data.jobs.length === 0) && <div className="text-gray-500">No service history yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
