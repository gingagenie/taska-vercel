// client/src/pages/job-view.tsx
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function JobView() {
  const [match, params] = useRoute("/jobs/:id");
  const jobId = params?.id as string;

  const [job, setJob] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // ✅ IMPORTANT: use /api prefix so we hit the backend, not the SPA
        const data = await api(`/api/jobs/${jobId}`);
        setJob(data);
      } catch (e: any) {
        setErr(e?.message || "Failed to load job");
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!job) return null;

  const niceStatus = (job.status || "new").replace("_", " ");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <Link href={`/jobs/${jobId}/edit`}>
          <a><Button>Edit Job</Button></a>
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-gray-500">Customer</div>
            <div className="font-medium">{job.customer_name || "—"}</div>
          </div>
          <div>
            <div className="text-gray-500">Status</div>
            <Badge>{niceStatus}</Badge>
          </div>
          <div>
            <div className="text-gray-500">Scheduled</div>
            <div className="font-medium">
              {job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : "—"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-gray-500">Description</div>
            <div className="font-medium whitespace-pre-wrap">
              {job.description || "No description"}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Assigned Technicians</CardTitle></CardHeader>
          <CardContent>
            {job.technicians?.length ? (
              <ul className="list-disc pl-5">
                {job.technicians.map((t: any) => (
                  <li key={t.id}>
                    {t.name} <span className="text-gray-500">({t.email})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500">No technicians assigned</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Equipment</CardTitle></CardHeader>
          <CardContent>
            {job.equipment?.length ? (
              <ul className="list-disc pl-5">
                {job.equipment.map((e: any) => (
                  <li key={e.id}>{e.name}</li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500">No equipment assigned</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
