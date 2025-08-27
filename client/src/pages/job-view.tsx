// client/src/pages/job-view.tsx
import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { api, photosApi, jobsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, AlertTriangle, Trash, MessageSquare, CheckCircle, Clock, Wrench } from "lucide-react";
import { utcIsoToLocalString } from "@/lib/time";

export default function JobView() {
  const [match, params] = useRoute("/jobs/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const jobId = params?.id as string;

  const [job, setJob] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [hours, setHours] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
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

  // Hours/Parts entry state
  const [selectedHours, setSelectedHours] = useState<string>("");
  const [hoursDescription, setHoursDescription] = useState<string>("");
  const [addingHours, setAddingHours] = useState(false);
  const [newPartName, setNewPartName] = useState<string>("");
  const [newPartQuantity, setNewPartQuantity] = useState<string>("1");
  const [addingPart, setAddingPart] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Load job data, photos, hours, and parts
        const [jobData, photoData, hoursData, partsData] = await Promise.all([
          api(`/api/jobs/${jobId}`),
          photosApi.list(jobId),
          api(`/api/jobs/${jobId}/hours`),
          api(`/api/jobs/${jobId}/parts`),
        ]);
        setJob(jobData);
        setPhotos(photoData);
        setHours(hoursData);
        setParts(partsData);
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

  function buildDefaultPreview() {
    const when = job.scheduled_at
      ? new Date(job.scheduled_at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })
      : "Not scheduled";
    return `Hi from Taska! Job "${job.title}" is scheduled for ${when}. Reply YES to confirm or call if you need to reschedule.`;
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
      await jobsApi.sendConfirm(job.id, {
        phone: smsPhone || undefined,
        messageOverride: smsPreview || undefined,
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

  async function addHours() {
    if (!selectedHours) return;
    setAddingHours(true);
    try {
      await api(`/api/jobs/${jobId}/hours`, {
        method: 'POST',
        body: JSON.stringify({
          hours: parseFloat(selectedHours),
          description: hoursDescription
        })
      });
      // Refresh hours list
      const hoursData = await api(`/api/jobs/${jobId}/hours`);
      setHours(hoursData);
      setSelectedHours("");
      setHoursDescription("");
      setToast("Hours added ✔");
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setToast(e?.message || "Failed to add hours");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setAddingHours(false);
    }
  }

  async function addPart() {
    if (!newPartName) return;
    setAddingPart(true);
    try {
      await api(`/api/jobs/${jobId}/parts`, {
        method: 'POST',
        body: JSON.stringify({
          partName: newPartName,
          quantity: parseInt(newPartQuantity)
        })
      });
      // Refresh parts list
      const partsData = await api(`/api/jobs/${jobId}/parts`);
      setParts(partsData);
      setNewPartName("");
      setNewPartQuantity("1");
      setToast("Part added ✔");
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setToast(e?.message || "Failed to add part");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setAddingPart(false);
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
      window.open(gmaps, '_blank');
    } catch (error) {
      console.error("Failed to open maps:", error);
      // Fallback: try a simple Google search
      const searchQuery = address || destinationLabel;
      window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery + " directions")}`, '_blank');
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

      {/* Hours Worked Section */}
      <Card className="border-jobs bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Hours Worked
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Add hours form */}
            <div className="flex gap-2 flex-wrap">
              <Select value={selectedHours} onValueChange={setSelectedHours}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Hours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5 hours</SelectItem>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="1.5">1.5 hours</SelectItem>
                  <SelectItem value="2">2 hours</SelectItem>
                  <SelectItem value="2.5">2.5 hours</SelectItem>
                  <SelectItem value="3">3 hours</SelectItem>
                  <SelectItem value="3.5">3.5 hours</SelectItem>
                  <SelectItem value="4">4 hours</SelectItem>
                  <SelectItem value="4.5">4.5 hours</SelectItem>
                  <SelectItem value="5">5 hours</SelectItem>
                  <SelectItem value="5.5">5.5 hours</SelectItem>
                  <SelectItem value="6">6 hours</SelectItem>
                  <SelectItem value="6.5">6.5 hours</SelectItem>
                  <SelectItem value="7">7 hours</SelectItem>
                  <SelectItem value="7.5">7.5 hours</SelectItem>
                  <SelectItem value="8">8 hours</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Description (optional)"
                value={hoursDescription}
                onChange={(e) => setHoursDescription(e.target.value)}
                className="flex-1 min-w-48"
                data-testid="input-hours-description"
              />
              <Button 
                onClick={addHours}
                disabled={!selectedHours || addingHours}
                data-testid="button-add-hours"
              >
                {addingHours ? "Adding..." : "Add Hours"}
              </Button>
            </div>
            
            {/* Hours list */}
            {hours.length > 0 ? (
              <div className="space-y-2">
                {hours.map((h: any) => (
                  <div key={h.id} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                    <div>
                      <span className="font-medium">{h.hours} hours</span>
                      {h.description && <span className="text-gray-600 ml-2">- {h.description}</span>}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(h.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2">
                  <span className="font-medium">Total: {hours.reduce((sum, h) => sum + parseFloat(h.hours || 0), 0)} hours</span>
                </div>
              </div>
            ) : (
              <div className="text-gray-500">No hours logged yet</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parts Used Section */}
      <Card className="border-jobs bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Parts Used
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Add parts form */}
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Part name (e.g., Exhaust)"
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                className="flex-1 min-w-48"
                data-testid="input-part-name"
              />
              <Select value={newPartQuantity} onValueChange={setNewPartQuantity}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={addPart}
                disabled={!newPartName || addingPart}
                data-testid="button-add-part"
              >
                {addingPart ? "Adding..." : "Add Part"}
              </Button>
            </div>
            
            {/* Parts list */}
            {parts.length > 0 ? (
              <div className="space-y-2">
                {parts.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                    <div>
                      <span className="font-medium">{p.part_name}</span>
                      <span className="text-gray-600 ml-2">× {p.quantity}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">No parts used yet</div>
            )}
          </div>
        </CardContent>
      </Card>

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

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSmsOpen(false)}>Cancel</Button>
            <Button 
              onClick={sendSms} 
              disabled={sending || !smsPhone}
              data-testid="button-send-sms-confirm"
            >
              {sending ? "Sending…" : "Send SMS"}
            </Button>
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
