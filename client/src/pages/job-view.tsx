// client/src/pages/job-view.tsx
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { api, photosApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function JobView() {
  const [match, params] = useRoute("/jobs/:id");
  const jobId = params?.id as string;

  const [job, setJob] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Load job data and photos
        const [jobData, photoData] = await Promise.all([
          api(`/api/jobs/${jobId}`),
          photosApi.list(jobId),
        ]);
        setJob(jobData);
        setPhotos(photoData);
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
        <div className="flex gap-2">
          <Link href={`/jobs/${jobId}/notes`}>
            <a><Button variant="secondary">Notes & Charges</Button></a>
          </Link>
          <Link href={`/jobs/${jobId}/edit`}>
            <a><Button>Edit Job</Button></a>
          </Link>
        </div>
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

      {/* Photos Section */}
      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map((photo: any) => (
                <div key={photo.id} className="relative">
                  <img 
                    src={photo.url} 
                    alt="Job photo" 
                    className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity" 
                    onClick={() => window.open(photo.url, '_blank')}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b text-center">
                    {new Date(photo.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">No photos uploaded</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
