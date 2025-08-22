import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { customersApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerModal } from "@/components/modals/customer-modal";
import { Building2, ArrowLeft } from "lucide-react";

export default function CustomerView() {
  const [match, params] = useRoute("/customers/:id");
  const id = params?.id as string;
  const [customer, setCustomer] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
        <Button onClick={() => setIsEditModalOpen(true)} data-testid="button-edit-customer">
          Edit Customer
        </Button>
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
              {[customer.street, customer.suburb, customer.state, customer.postcode]
                .filter(Boolean)
                .join(", ") || "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <CustomerModal 
        open={isEditModalOpen} 
        onOpenChange={setIsEditModalOpen} 
        customer={customer} 
        onSaved={(updated) => setCustomer(updated)} 
      />
    </div>
  );
}