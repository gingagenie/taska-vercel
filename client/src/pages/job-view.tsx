import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { api } from "@/lib/api";

export default function JobView() {
  const [match, params] = useRoute("/jobs/:id");
  const jobId = params?.id as string;
  const [job, setJob] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setJob(await api(`/jobs/${jobId}`)); }
      catch (e:any) { setErr(e.message || "Failed to load job"); }
    })();
  }, [jobId]);

  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!job) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <Link href={`/jobs/${jobId}/edit`}><a className="px-3 py-2 bg-gray-200 rounded">Edit</a></Link>
      </div>
      <div className="text-sm text-gray-600">Customer: {job.customer_name}</div>
      <div className="text-sm text-gray-600">Status: {job.status}</div>
      <div className="text-sm text-gray-600">Scheduled: {job.scheduled_at ?? "—"}</div>
      <p className="mt-2">{job.description || "No description"}</p>

      <div>
        <h2 className="font-semibold mt-6 mb-2">Technicians</h2>
        <ul className="list-disc pl-5">
          {job.technicians?.map((t:any) => <li key={t.id}>{t.name} ({t.email})</li>) || <li>None</li>}
        </ul>
      </div>

      <div>
        <h2 className="font-semibold mt-6 mb-2">Equipment</h2>
        <ul className="list-disc pl-5">
          {job.equipment?.map((e:any) => <li key={e.id}>{e.name}</li>) || <li>None</li>}
        </ul>
      </div>
    </div>
  );
}
