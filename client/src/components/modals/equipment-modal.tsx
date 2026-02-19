import { useEffect, useState } from "react";
import { equipmentApi, jobsApi, customersApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipment?: any;           // if provided -> edit mode
  onSaved?: (row: any) => void;
};

export function EquipmentModal({ open, onOpenChange, equipment, onSaved }: Props) {
  const isEdit = !!equipment;
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [serviceInterval, setServiceInterval] = useState<string>("none");
  const [lastServiceDate, setLastServiceDate] = useState<string>("");

  const [customerList, setCustomerList] = useState<any[]>([]);
  const [customerAddress, setCustomerAddress] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  // Calculate next service date based on last service + interval
  const nextServiceDate = (() => {
    if (!lastServiceDate || serviceInterval === "none") return "";
    try {
      const lastDate = new Date(lastServiceDate);
      if (isNaN(lastDate.getTime())) return "";
      
      const months = parseInt(serviceInterval);
      const nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + months);
      
      return nextDate.toISOString().split('T')[0];
    } catch {
      return "";
    }
  })();

  // load dropdown (id + name)
  useEffect(() => {
    if (!open) return;
    jobsApi.customers().then(setCustomerList).catch(()=>setCustomerList([]));
  }, [open]);

  // prefill when editing
  useEffect(() => {
    if (open && isEdit) {
      setName(equipment.name || "");
      setMake(equipment.make || "");
      setModel(equipment.model || "");
      setSerial(equipment.serial || "");
      setNotes(equipment.notes || "");
      setCustomerId(equipment.customer_id || "none");
      setCustomerAddress(equipment.customer_address || "");
      setServiceInterval(
        equipment.service_interval_months === 6 ? "6" :
        equipment.service_interval_months === 12 ? "12" : "none"
      );
      // Format date for input (YYYY-MM-DD)
      if (equipment.last_service_date) {
        const d = new Date(equipment.last_service_date);
        if (!isNaN(d.getTime())) {
          setLastServiceDate(d.toISOString().split('T')[0]);
        }
      }
    }
    if (open && !isEdit) {
      setName(""); setMake(""); setModel(""); setSerial(""); setNotes("");
      setCustomerId("none"); setCustomerAddress(""); setServiceInterval("none"); 
      setLastServiceDate(""); setErr(null);
    }
  }, [open, isEdit, equipment]);

  // fetch address on customer selection
  useEffect(() => {
    (async () => {
      if (!customerId || customerId === "none") { setCustomerAddress(""); return; }
      try {
        const c = await customersApi.get(customerId);
        const addr = [c.street, c.suburb, c.state, c.postcode].filter(Boolean).join(", ");
        setCustomerAddress(addr);
      } catch {
        setCustomerAddress("");
      }
    })();
  }, [customerId]);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const finalCustomerId = customerId === "none" ? null : customerId;
      const finalServiceInterval = serviceInterval === "none" ? null : parseInt(serviceInterval);
      
      const payload: any = { 
        name, make, model, serial, notes, 
        customerId: finalCustomerId,
        serviceIntervalMonths: finalServiceInterval
      };

      // Add service dates if provided
      if (lastServiceDate) {
        payload.lastServiceDate = lastServiceDate;
        if (nextServiceDate) {
          payload.nextServiceDate = nextServiceDate;
        }
      }

      if (isEdit) {
        await equipmentApi.update(equipment.id, payload);
        // keep detail pages fresh if any
        qc.invalidateQueries({ queryKey: ["/api/equipment"] });
        qc.invalidateQueries({ queryKey: [`/api/equipment/${equipment.id}`] });
        onSaved?.({ 
          ...equipment, 
          ...payload,
          customer_id: finalCustomerId, 
          customer_address: customerAddress,
          service_interval_months: finalServiceInterval,
          last_service_date: lastServiceDate || null,
          next_service_date: nextServiceDate || null
        });
      } else {
        const res = await equipmentApi.create(payload);
        qc.invalidateQueries({ queryKey: ["/api/equipment"] });
      }
      onOpenChange(false);
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Equipment" : "New Equipment"}</DialogTitle></DialogHeader>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Name / ID</Label>
            <Input 
              value={name} 
              onChange={(e)=>setName(e.target.value)} 
              placeholder="e.g., Split System #04" 
              data-testid="input-equipment-name"
            />
          </div>

          <div>
            <Label>Make</Label>
            <Input 
              value={make} 
              onChange={(e)=>setMake(e.target.value)} 
              placeholder="Mitsubishi" 
              data-testid="input-equipment-make"
            />
          </div>
          <div>
            <Label>Model</Label>
            <Input 
              value={model} 
              onChange={(e)=>setModel(e.target.value)} 
              placeholder="SRK50ZSA" 
              data-testid="input-equipment-model"
            />
          </div>

          <div className="md:col-span-2">
            <Label>Serial</Label>
            <Input 
              value={serial} 
              onChange={(e)=>setSerial(e.target.value)} 
              placeholder="SN-123456" 
              data-testid="input-equipment-serial"
            />
          </div>

          <div className="md:col-span-2">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="select-customer">
                <SelectValue placeholder="Select a customer..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {customerList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Address (auto from customer)</Label>
            <Input 
              readOnly 
              value={customerAddress} 
              placeholder="Select a customer to auto-fill" 
              className="bg-gray-50 text-gray-600"
              data-testid="input-customer-address"
            />
          </div>

          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea 
              rows={4} 
              value={notes} 
              onChange={(e)=>setNotes(e.target.value)} 
              placeholder="Any relevant details…" 
              data-testid="textarea-notes"
            />
          </div>

          <div className="md:col-span-2">
            <Label>Service Interval</Label>
            <Select value={serviceInterval} onValueChange={setServiceInterval}>
              <SelectTrigger data-testid="select-service-interval">
                <SelectValue placeholder="Select service interval..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (no auto-scheduling)</SelectItem>
                <SelectItem value="6">Every 6 months</SelectItem>
                <SelectItem value="12">Every 12 months</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              When a service job is completed, a follow-up job will be auto-created for this interval.
            </p>
          </div>

          {/* NEW: Manual service date input */}
          <div className="md:col-span-2 space-y-3 p-3 bg-blue-50 rounded-md border border-blue-200">
            <div>
              <Label>Last Service Date (optional)</Label>
              <Input 
                type="date"
                value={lastServiceDate} 
                onChange={(e)=>setLastServiceDate(e.target.value)} 
                data-testid="input-last-service-date"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Set this to backfill service history. Next service date will be calculated automatically.
              </p>
            </div>

            {nextServiceDate && (
              <div>
                <Label>Next Service Date (auto-calculated)</Label>
                <Input 
                  type="date"
                  value={nextServiceDate} 
                  readOnly
                  className="bg-gray-50 text-gray-600"
                  data-testid="input-next-service-date"
                />
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={()=>onOpenChange(false)} 
            disabled={saving}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button 
            onClick={save} 
            disabled={saving}
            data-testid="button-save-equipment"
          >
            {saving ? "Saving…" : (isEdit ? "Save changes" : "Create equipment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
