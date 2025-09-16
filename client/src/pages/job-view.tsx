// client/src/pages/job-view.tsx
import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api, photosApi, jobsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, AlertTriangle, Trash, MessageSquare, CheckCircle, Check } from "lucide-react";
import { utcIsoToLocalString } from "@/lib/time";
import { SmsLimitWarning } from "@/components/usage/send-limit-warnings";

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
  
  // SMS confirmation dialog state
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsPhone, setSmsPhone] = useState<string>("");
  const [smsPreview, setSmsPreview] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  // Complete job dialog state
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [errComplete, setErrComplete] = useState<string | null>(null);
  
  // Manual job confirmation dialog state
  const [confirmJobDialog, setConfirmJobDialog] = useState(false);
  const [confirmingJob, setConfirmingJob] = useState(false);
  const [errConfirmJob, setErrConfirmJob] = useState<string | null>(null);

  // Fetch organization data for SMS
  const { data: meData } = useQuery<{
    user: any;
    org: { name: string; [key: string]: any };
  }>({
    queryKey: ["/api/me"],
    retry: false,
  });

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

  // Watch for job status changes and update main jobs cache
  useEffect(() => {
    if (job?.status === 'confirmed') {
      // Update cached jobs list to show confirmed status
      queryClient.setQueryData(['/api/jobs'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((j: any) => 
          j.id === job.id ? { ...j, status: 'confirmed' } : j
        );
      });
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
    }
  }, [job?.status, job?.id, queryClient]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!job) return null;

  const niceStatus = (job.status || "new").replace("_", " ");

  function buildDefaultPreview() {
    const when = job.scheduled_at
      ? new Date(job.scheduled_at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })
      : "Not scheduled";
    const orgName = meData?.org?.name || "Taska";
    const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://www.taska.info';
    return `Hi from ${orgName}! Job "${job.title}" is scheduled for ${when}. Confirm here: ${baseUrl}/api/public/jobs/confirm?token=... or call if you need to reschedule.`;
  }

  function formatAustralianPhone(phone: string): string {
    if (!phone) return "";
    
    // Remove any spaces, dashes, or parentheses
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    
    // If already has country code, return as is
    if (cleaned.startsWith("+61") || cleaned.startsWith("61")) {
      return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
    }
    
    // If starts with 0, remove it and add +61
    if (cleaned.startsWith("0")) {
      return "+61" + cleaned.slice(1);
    }
    
    // If it's just the mobile number without 0, add +61
    if (/^\d{9}$/.test(cleaned)) {
      return "+61" + cleaned;
    }
    
    // Otherwise, assume it needs +61 prefix
    return "+61" + cleaned;
  }

  function openSmsDialog() {
    const formattedPhone = formatAustralianPhone(job.customer_phone || "");
    setSmsPhone(formattedPhone);
    setSmsPreview(buildDefaultPreview());
    setSmsOpen(true);
  }

  async function sendSms() {
    setSending(true);
    try {
      // Only send messageOverride if user actually changed it from the default
      const defaultPreview = buildDefaultPreview();
      const isCustomMessage = smsPreview !== defaultPreview;
      
      await jobsApi.sendConfirm(job.id, {
        phone: smsPhone || undefined,
        messageOverride: isCustomMessage ? smsPreview : undefined,
      });
      setToast("SMS sent ✔");
      setSmsOpen(false);
      // Clear toast after 3 seconds
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setToast(e?.message || "Failed to send SMS");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSending(false);
    }
  }


  async function completeJob() {
    setCompleting(true);
    setErrComplete(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to complete job');
      }
      
      // Success - refresh the page or redirect
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      navigate('/schedule');
    } catch (e: any) {
      setErrComplete(e.message || 'Failed to complete job');
    } finally {
      setCompleting(false);
    }
  }

  async function confirmJob() {
    setConfirmingJob(true);
    setErrConfirmJob(null);
    try {
      if (!job.confirmationToken) {
        throw new Error('No confirmation token available for this job');
      }

      const response = await fetch(`/api/public/jobs/confirm?token=${job.confirmationToken}`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to confirm job');
      }
      
      // Success - refresh job data and show success message
      const [jobData, photoData] = await Promise.all([
        api(`/api/jobs/${jobId}`),
        photosApi.list(jobId),
      ]);
      setJob(jobData);
      setPhotos(photoData);
      
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      
      setToast("Job confirmed successfully ✔");
      setConfirmJobDialog(false);
      // Clear toast after 3 seconds
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setErrConfirmJob(e.message || 'Failed to confirm job');
    } finally {
      setConfirmingJob(false);
    }
  }

  function openMaps(destinationLabel: string, address?: string, lat?: number, lng?: number) {
    // If no address or coordinates, fallback to searching by customer name
    if (!address && !destinationLabel && !lat && !lng) {
      console.warn("No navigation destination available");
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const hasCoords = typeof lat === "number" && typeof lng === "number";

    try {
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
      const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
      
      // Try to open in new tab, fallback to current tab if blocked
      const newWindow = window.open(gmaps, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
        // Popup blocked - use current tab instead
        window.location.href = gmaps;
      }
    } catch (error) {
      console.error("Failed to open maps:", error);
      // Fallback: try a simple Google search in current tab
      const searchQuery = address || destinationLabel;
      const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery + " directions")}`;
      console.log("Using fallback search:", fallbackUrl);
      window.location.href = fallbackUrl;
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
      <div className="header-row">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-jobs">{job.title}</h1>
          {job.status === 'confirmed' && (
            <span className="status-badge status-confirmed flex items-center gap-1">
              ✓ Confirmed
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
          <Button
            variant="secondary"
            onClick={() => {
              console.log("Navigate button clicked", { 
                customer_name: job.customer_name, 
                customer_address: job.customer_address 
              });
              
              // Use customer address if available, otherwise fallback to customer name search
              const address = job.customer_address;
              const customerName = job.customer_name || "Unknown Location";
              
              if (address) {
                console.log("Opening maps with customer address:", address);
                openMaps(customerName, address);
              } else if (customerName && customerName !== "Unknown Location") {
                console.log("Opening maps with customer name search:", customerName);
                openMaps(customerName);
              } else {
                console.warn("No navigation destination available");
              }
            }}
            disabled={!job.customer_address && !job.customer_name}
            title={
              !job.customer_address && !job.customer_name 
                ? "No destination available" 
                : job.customer_address 
                  ? "Navigate to customer address" 
                  : "Search for customer location"
            }
            className="w-full"
            data-testid="button-navigate"
          >
            <MapPin className="h-4 w-4 mr-1" />
            Navigate
          </Button>
          <Button 
            variant="secondary" 
            onClick={openSmsDialog}
            className="w-full"
            data-testid="button-send-sms"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Send SMS
          </Button>
          <Link href={`/jobs/${jobId}/notes`} className="w-full">
            <Button variant="secondary" className="w-full">Notes & Charges</Button>
          </Link>
          <Link href={`/jobs/${jobId}/edit`} className="w-full">
            <Button className="w-full">Edit Job</Button>
          </Link>
          {job.status === 'new' && job.confirmationToken && (
            <Button 
              onClick={() => setConfirmJobDialog(true)}
              data-testid="button-confirm-job"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Check className="h-4 w-4 mr-1" /> Confirm Job
            </Button>
          )}
          <Button 
            onClick={() => setConfirmComplete(true)}
            data-testid="button-complete-job"
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="h-4 w-4 mr-1" /> Complete
          </Button>
          <Button 
            variant="destructive" 
            onClick={() => setConfirmDelete(true)}
            data-testid="button-delete-job"
            className="w-full"
          >
            <Trash className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      <Card className="border-jobs bg-white">
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
              {job.scheduled_at ? utcIsoToLocalString(job.scheduled_at, { 
                dateStyle: "full", 
                timeStyle: "short" 
              }) : "—"}
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
        <Card className="border-jobs bg-white">
          <CardHeader><CardTitle>Assigned Technicians</CardTitle></CardHeader>
          <CardContent>
            {job.technicians?.length ? (
              <div className="space-y-2">
                {job.technicians.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                      style={{ backgroundColor: t.color || '#3b82f6' }}
                      title={`${t.name}'s color`}
                    />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-gray-500">({t.email})</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">No technicians assigned</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-jobs bg-white">
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
      <Card className="border-jobs bg-white">
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

      {/* Complete Job Confirmation Dialog */}
      <Dialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Complete Job
            </DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to mark <strong>{job.title}</strong> as completed? This will move the job to your completed jobs list.</p>
          {errComplete && <div className="text-red-600 text-sm">{errComplete}</div>}
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmComplete(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={completing}
              onClick={completeJob}
              data-testid="button-confirm-complete"
            >
              {completing ? "Completing…" : "Complete Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Job Confirmation Dialog */}
      <Dialog open={confirmJobDialog} onOpenChange={setConfirmJobDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Check className="h-5 w-5" />
              Confirm Job
            </DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to confirm <strong>{job.title}</strong>? This will mark the job as confirmed.</p>
          {errConfirmJob && <div className="text-red-600 text-sm">{errConfirmJob}</div>}
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmJobDialog(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={confirmingJob}
              onClick={confirmJob}
              data-testid="button-confirm-job-dialog"
            >
              {confirmingJob ? "Confirming…" : "Confirm Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMS Confirmation Dialog */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send confirmation SMS</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">To (mobile)</label>
              <Input 
                value={smsPhone} 
                onChange={(e) => setSmsPhone(e.target.value)} 
                placeholder="+61..."
                data-testid="input-sms-phone"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Message</label>
              <textarea
                className="w-full border rounded p-2 min-h-[120px]"
                value={smsPreview}
                onChange={(e) => setSmsPreview(e.target.value)}
                data-testid="textarea-sms-message"
              />
            </div>
          </div>

          <DialogFooter className="flex-col space-y-3">
            <SmsLimitWarning onProceed={sendSms} disabled={sending || !smsPhone}>
              <Button 
                onClick={sendSms} 
                disabled={sending || !smsPhone}
                data-testid="button-send-sms-confirm"
                className="w-full"
              >
                {sending ? "Sending…" : "Send SMS"}
              </Button>
            </SmsLimitWarning>
            <Button variant="ghost" onClick={() => setSmsOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-black text-white px-3 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
