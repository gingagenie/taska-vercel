import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { 
  open: boolean; 
  onOpenChange: (v: boolean) => void; 
  onCreated?: (id: string) => void;
  defaultCustomerId?: string;
};

export function JobModal({ open, onOpenChange, onCreated, defaultCustomerId }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [equipmentId, setEquipmentId] = useState<string>(""); // single-select

  const [customers, setCustomers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [cs, eq] = await Promise.all([jobsApi.customers(), jobsApi.equipment()]);
        setCustomers(cs || []);
        setEquipment(eq || []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load dropdowns");
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open && defaultCustomerId) {
      setCustomerId(defaultCustomerId);
    }
  }, [open, defaultCustomerId]);

  function normalizeDate(v: string | null | undefined): string | null {
    if (!v) return null;
    if (v.includes("T")) {
      const [d, t] = v.split("T");
      const tt = t.length === 5 ? `${t}:00` : t; // HH:MM -> HH:MM:SS
      return `${d} ${tt}`.slice(0, 19);
    }
    return v;
  }

  async function createJob() {
    if (!title.trim()) {
      setErr("Title is required");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        title,
        description,
        customerId: customerId || null,
        scheduledAt: normalizeDate(scheduledAt) || null,
        equipmentId: equipmentId || null, // single equipment
      };
      const r = await jobsApi.create(body);
      // Invalidate jobs list and schedule range to refresh
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/range"] });
      onOpenChange(false);
      onCreated?.(r?.id);
      // reset
      setTitle(""); setDescription(""); setScheduledAt("");
      setCustomerId(""); setEquipmentId("");
      onCreated?.(r?.id);
    } catch (e: any) {
      setErr(e?.message || "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Job</DialogTitle>
        </DialogHeader>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="Job title" 
              data-testid="input-job-title"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea 
              rows={3} 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              data-testid="input-job-description"
            />
          </div>

          <div>
            <Label>Scheduled At</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div>
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipment</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select equipment" />
              </SelectTrigger>
              <SelectContent>
                {equipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={createJob} disabled={saving}>{saving ? "Saving…" : "Create job"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}