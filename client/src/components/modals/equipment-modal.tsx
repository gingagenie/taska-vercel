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

  const [customerList, setCustomerList] = useState<any[]>([]);
  const [customerAddress, setCustomerAddress] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|null>(null);

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
      setCustomerId(equipment.customer_id || "");
      setCustomerAddress(equipment.customer_address || "");
    }
    if (open && !isEdit) {
      setName(""); setMake(""); setModel(""); setSerial(""); setNotes("");
      setCustomerId(""); setCustomerAddress(""); setErr(null);
    }
  }, [open, isEdit, equipment]);

  // fetch address on customer selection
  useEffect(() => {
    (async () => {
      if (!customerId) { setCustomerAddress(""); return; }
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
      if (isEdit) {
        await equipmentApi.update(equipment.id, { name, make, model, serial, notes, customerId });
        // keep detail pages fresh if any
        qc.invalidateQueries({ queryKey: ["/api/equipment"] });
        qc.invalidateQueries({ queryKey: [`/api/equipment/${equipment.id}`] });
        onSaved?.({ ...equipment, name, make, model, serial, notes, customer_id: customerId, customer_address: customerAddress });
      } else {
        const res = await equipmentApi.create({ name, make, model, serial, notes, customerId });
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
      <DialogContent className="max-w-xl">
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
                <SelectItem value="">— None —</SelectItem>
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