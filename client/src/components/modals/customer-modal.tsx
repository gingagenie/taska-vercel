import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer?: any; // if present -> edit mode
  onSaved?: (c: any) => void;
};

export function CustomerModal({ open, onOpenChange, customer, onSaved }: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!customer;
  
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open && isEdit) {
      setName(customer.name || "");
      setContactName(customer.contact_name || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");
      setStreet(customer.street || "");
      setSuburb(customer.suburb || "");
      setState(customer.state || "");
      setPostcode(customer.postcode || "");
    }
    if (open && !isEdit) {
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setStreet("");
      setSuburb("");
      setState("");
      setPostcode("");
      setErr(null);
    }
  }, [open, isEdit, customer]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error("Company name is required");
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error("Enter a valid email");
      }
      
      const data = {
        name,
        contact_name: contactName || null,
        email: email || null,
        phone: phone || null,
        street: street || null,
        suburb: suburb || null,
        state: state || null,
        postcode: postcode || null,
      };

      if (isEdit) {
        const result = await customersApi.update(customer.id, data);
        // Refresh lists
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        // Refresh this customer's detail query
        queryClient.setQueryData([`/api/customers/${customer.id}`], (prev: any) => ({
          ...(prev || {}),
          ...data,
          id: customer.id,
        }));
        onSaved?.({ ...customer, ...data });
        return result;
      } else {
        const result = await customersApi.create(data);
        
        // Optimistically append the new customer before refetch
        const next = { 
          id: result.id, 
          name,
          contact_name: contactName || null,
          email: email || null,
          phone: phone || null,
          street: street || null,
          suburb: suburb || null,
          state: state || null,
          postcode: postcode || null,
        };

        queryClient.setQueryData<any[]>(["/api/customers"], (prev = []) => {
          if (prev.some(c => c.id === next.id)) return prev;
          return [next, ...prev];
        });
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        
        return result;
      }
    },
    onSuccess: () => {
      onOpenChange(false);
      setErr(null);
    },
    onError: (error: any) => {
      setErr(error?.message || "Failed to save");
    },
  });

  const handleSave = () => {
    setErr(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Customer" : "New Customer"}</DialogTitle>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-1">
          {err && <div className="text-red-600 text-sm mb-4">{err}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
            <div className="md:col-span-2">
              <Label>Company name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ABC Manufacturing"
                data-testid="input-company-name"
              />
            </div>

            <div>
              <Label>Contact name</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Primary contact person"
                data-testid="input-contact-name"
              />
            </div>
            
            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                data-testid="input-phone"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@company.com"
                type="email"
                data-testid="input-email"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Street Address</Label>
              <Input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="123 Main Street"
                data-testid="input-street"
              />
            </div>

            <div>
              <Label>Suburb</Label>
              <Input
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                placeholder="Suburb"
                data-testid="input-suburb"
              />
            </div>

            <div>
              <Label>State</Label>
              <Input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                data-testid="input-state"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Postcode</Label>
              <Input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Postcode"
                data-testid="input-postcode"
              />
            </div>
          </div>
        </div>

        {/* Sticky footer actions */}
        <div className="sticky bottom-0 border-t bg-white/95 backdrop-blur px-1 py-4 mt-2">
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={mutation.isPending}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={mutation.isPending} 
              data-testid="button-save-customer"
              className="flex-1 sm:flex-none"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Update" : "Create"} Customer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}