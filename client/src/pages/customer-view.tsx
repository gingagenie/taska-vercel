import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { customersApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerModal } from "@/components/modals/customer-modal";
import { JobModal } from "@/components/modals/job-modal";
import { Building2, ArrowLeft, MapPin, Clipboard, Plus } from "lucide-react";

// helper to build a single-line address
function buildAddress(c: any) {
  return [c?.street, c?.suburb, c?.state, c?.postcode].filter(Boolean).join(", ");
}

// platform-aware maps opener
function openMaps(destinationLabel: string, address?: string, lat?: number, lng?: number) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  if (isIOS) {
    const url = hasCoords
      ? `maps://?q=${encodeURIComponent(destinationLabel)}&daddr=${lat},${lng}`
      : `maps://?q=${encodeURIComponent(address || destinationLabel)}`;
    window.location.href = url;
    return;
  }
  const destination = hasCoords ? `${lat},${lng}` : (address || destinationLabel);
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination!)}`;
  window.location.href = gmaps;
}

export default function CustomerView() {
  const [match, params] = useRoute("/customers/:id");
  const id = params?.id as string;
  const [, navigate] = useLocation();
  
  const [customer, setCustomer] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      customersApi.get(id)
        .then(setCustomer)
        .catch((err) => setError(err?.message || "Failed to load customer"))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!customer) return <div className="p-6">Customer not found</div>;

  const addr = buildAddress(customer);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: open a prompt
      window.prompt("Copy address:", addr);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/customers">
            <a>
              <Button variant="outline" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </a>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold">{customer.name}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => openMaps(customer.name || "Destination", addr)}
            disabled={!addr}
            title={addr ? "Open in Maps" : "No address"}
            data-testid="button-navigate"
          >
            <MapPin className="h-4 w-4 mr-1" />
            Navigate
          </Button>
          <Button 
            variant="secondary" 
            onClick={copyAddress} 
            disabled={!addr} 
            title={addr ? "Copy address" : "No address"}
            data-testid="button-copy-address"
          >
            <Clipboard className="h-4 w-4 mr-1" />
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button onClick={() => setIsJobModalOpen(true)} data-testid="button-create-job">
            <Plus className="h-4 w-4 mr-1" />
            Create Job
          </Button>
          <Button variant="outline" onClick={() => setIsEditModalOpen(true)} data-testid="button-edit-customer">
            Edit
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Company Name</div>
            <div className="font-medium">{customer.name}</div>
          </div>
          
          <div>
            <div className="text-gray-500">Contact Person</div>
            <div className="font-medium">{customer.contact_name || "—"}</div>
          </div>

          <div>
            <div className="text-gray-500">Email</div>
            <div className="font-medium">
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">
                  {customer.email}
                </a>
              ) : "—"}
            </div>
          </div>

          <div>
            <div className="text-gray-500">Phone</div>
            <div className="font-medium">
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">
                  {customer.phone}
                </a>
              ) : "—"}
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="text-gray-500">Address</div>
            <div className="font-medium mt-1">
              {addr || "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <CustomerModal 
        open={isEditModalOpen} 
        onOpenChange={setIsEditModalOpen} 
        customer={customer} 
        onSaved={(updated) => setCustomer(updated)} 
      />
      <JobModal
        open={isJobModalOpen}
        onOpenChange={setIsJobModalOpen}
        defaultCustomerId={customer.id}
        onCreated={(newId) => navigate(`/jobs/${newId}`)}
      />
    </div>
  );
}