import { useEffect, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { jobsApi, membersApi, customersApi, equipmentApi } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { isoFromLocalInput } from "@/lib/datetime";

type Props = { 
  open: boolean; 
  onOpenChange: (v: boolean) => void; 
  onCreated?: (id: string) => void;
  defaultCustomerId?: string;
};

export function JobModal({ open, onOpenChange, onCreated, defaultCustomerId }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [equipmentId, setEquipmentId] = useState<string>(""); // single-select
  const [assignedTechIds, setAssignedTechIds] = useState<string[]>([]);

  const [customers, setCustomers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch members for assignment
  const { data: members = [] } = useQuery({
    queryKey: ["/api/members"],
    queryFn: membersApi.getAll,
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const cs = await jobsApi.customers();
        setCustomers(cs || []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load customers");
      }
    })();
  }, [open]);

  // Fetch equipment filtered by selected customer
  useEffect(() => {
    if (!customerId) {
      setEquipment([]);
      setEquipmentId("");
      return;
    }
    
    (async () => {
      try {
        const url = `/api/jobs/equipment?customerId=${encodeURIComponent(customerId)}`;
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
        const eq = await response.json();
        setEquipment(eq || []);
        setEquipmentId(""); // Reset selection when customer changes
      } catch (e: any) {
        setErr(e?.message || "Failed to load equipment");
        setEquipment([]);
      }
    })();
  }, [customerId]);

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
        jobType: jobType || null,
        description,
        customerId: customerId || null,
        scheduledAt: isoFromLocalInput(scheduledAt),
        equipmentId: equipmentId || null, // single equipment
        assignedTechIds,
      };
      const r = await jobsApi.create(body);
      // Invalidate jobs list and schedule range to refresh
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/range"] });
      onOpenChange(false);
      onCreated?.(r?.id);
      // reset
      setTitle(""); setJobType(""); setDescription(""); setScheduledAt("");
      setCustomerId(""); setEquipmentId(""); setAssignedTechIds([]);
    } catch (e: any) {
      setErr(e?.message || "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
            <Label>Job Type</Label>
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger data-testid="select-job-type">
                <SelectValue placeholder="Select job type (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Service">Service</SelectItem>
                <SelectItem value="Repair">Repair</SelectItem>
                <SelectItem value="Installation">Installation</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Service jobs will auto-create follow-up jobs based on equipment service intervals.
            </p>
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
            <Label>Scheduled At (Melbourne Time)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div>
            <Label>Customer</Label>
            <SearchableCombobox
              items={customers.map(c => ({ id: c.id, name: c.name }))}
              value={customerId}
              onValueChange={setCustomerId}
              onCreateNew={async (name) => {
                try {
                  const result = await customersApi.create({ name });
                  const newCustomer = result.customer;
                  // Update local customers list
                  setCustomers(prev => [...prev, newCustomer]);
                  return { id: newCustomer.id, name: newCustomer.name };
                } catch (error) {
                  throw new Error("Failed to create customer");
                }
              }}
              placeholder="Select or create customer"
              searchPlaceholder="Search customers..."
              emptyText="No customers found"
              createNewLabel={(name) => `Create new customer: ${name}`}
              data-testid="customer-combobox"
            />
          </div>

          <div>
            <Label>Equipment</Label>
            <SearchableCombobox
              items={equipment.map(e => ({ id: e.id, name: e.name }))}
              value={equipmentId}
              onValueChange={setEquipmentId}
              onCreateNew={async (name) => {
                if (!customerId) {
                  throw new Error("Please select a customer first");
                }
                try {
                  const result = await equipmentApi.create({ 
                    name, 
                    customerId 
                  });
                  const newEquipment = { id: result.id, name, customerId };
                  // Update local equipment list
                  setEquipment(prev => [...prev, newEquipment]);
                  return { id: result.id, name };
                } catch (error) {
                  throw new Error("Failed to create equipment");
                }
              }}
              placeholder={customerId ? "Select or create equipment" : "Select a customer first"}
              searchPlaceholder="Search equipment..."
              emptyText="No equipment found"
              createNewLabel={(name) => `Create new equipment: ${name}`}
              disabled={!customerId}
              data-testid="equipment-combobox"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Assign technicians</label>
            {/* Simple multi-select using native <select multiple>. */}
            <select
              multiple
              className="w-full border rounded p-2 h-28"
              value={assignedTechIds}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                setAssignedTechIds(opts);
              }}
              data-testid="select-assigned-techs"
            >
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
              ))}
            </select>
            <div className="text-xs text-gray-500 mt-1">Tip: Ctrl/Cmd-click to select multiple</div>
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