// client/src/pages/job-view.tsx
import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { api, photosApi, jobsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, AlertTriangle, Trash } from "lucide-react";

export default function JobView() {
  const [match, params] = useRoute("/jobs/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const jobId = params?.id as string;

  const [job, setJob] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Delete confirmation dialog state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errDelete, setErrDelete] = useState<string | null>(null);

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

  function openMaps(destinationLabel: string, address?: string, lat?: number, lng?: number) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const hasCoords = typeof lat === "number" && typeof lng === "number";

    if (isIOS) {
      // Apple Maps (native)
      const url = hasCoords
        ? `maps://?q=${encodeURIComponent(destinationLabel)}&daddr=${lat},${lng}`
        : `maps://?q=${encodeURIComponent(address || destinationLabel)}`;
      window.location.href = url;
      return;
    }

    // Android / Desktop → Google Maps universal URL
    const destination = hasCoords
      ? `${lat},${lng}`
      : (address || destinationLabel);
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination!)}`;
    window.location.href = gmaps;
  }

  return (
    <div className="space-y-6">
      <div className="header-row">
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <div className="header-actions">
          <Button
            variant="secondary"
            onClick={() => openMaps(job.customer_name || "Destination", job.customer_address)}
            disabled={!job.customer_address}
            title={!job.customer_address ? "No destination address available" : "Open in Maps"}
            className="flex-1 sm:flex-none"
          >
            <MapPin className="h-4 w-4 mr-1" />
            Navigate
          </Button>
          <Link href={`/jobs/${jobId}/notes`}>
            <Button variant="secondary" className="flex-1 sm:flex-none">Notes & Charges</Button>
          </Link>
          <Link href={`/jobs/${jobId}/edit`}>
            <Button className="flex-1 sm:flex-none">Edit Job</Button>
          </Link>
          <Button 
            variant="destructive" 
            onClick={() => setConfirmDelete(true)}
            data-testid="button-delete-job"
            className="flex-1 sm:flex-none"
          >
            <Trash className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-gray-500">Customer</div>
            <div className="font-medium">{job.customer_name || "—"}</div>
            {job.customer_address && (
              <div className="text-xs text-gray-500 mt-1">{job.customer_address}</div>
            )}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete <strong>{job.title}</strong>? This cannot be undone.</p>
          {errDelete && <div className="text-red-600 text-sm">{errDelete}</div>}
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                setErrDelete(null);
                try {
                  await jobsApi.delete(job.id);
                  queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
                  navigate("/jobs");
                } catch (e: any) {
                  setErrDelete(e.message || "Failed to delete");
                } finally {
                  setDeleting(false);
                }
              }}
              data-testid="button-confirm-delete"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
