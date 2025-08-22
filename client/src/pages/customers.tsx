import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomerModal } from "@/components/modals/customer-modal";
import { customersApi } from "@/lib/api";
import { Building2 } from "lucide-react";
import { Link } from "wouter";

export default function Customers() {
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: customersApi.getAll,
  });

  const filteredCustomers = customers.filter((customer: any) =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (customer.email && customer.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 animate-pulse">
          <div className="h-64"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <div className="flex gap-2">
          <Input 
            placeholder="Search by company…" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-64" 
            data-testid="input-search"
          />
          <Button onClick={() => setIsCustomerModalOpen(true)} data-testid="button-new-customer">
            New Customer
          </Button>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Building2 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {customers.length === 0 ? "Get started by creating a new customer." : "Try adjusting your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCustomers.map((c: any) => (
            <Link key={c.id} href={`/customers/${c.id}`}>
              <a>
                <Card className="hover:shadow-md cursor-pointer transition-shadow" data-testid={`card-customer-${c.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      {c.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {c.contact_name && (
                      <div>
                        <span className="text-gray-500">Contact:</span> {c.contact_name}
                      </div>
                    )}
                    {c.email && (
                      <div>
                        <span className="text-gray-500">Email:</span> {c.email}
                      </div>
                    )}
                    {c.phone && (
                      <div>
                        <span className="text-gray-500">Phone:</span> {c.phone}
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Address:</span>
                      <div className="mt-1">
                        {[c.street, c.suburb, c.state, c.postcode].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
            </Link>
          ))}
        </div>
      )}

      <CustomerModal 
        open={isCustomerModalOpen} 
        onOpenChange={setIsCustomerModalOpen} 
      />
    </div>
  );
}