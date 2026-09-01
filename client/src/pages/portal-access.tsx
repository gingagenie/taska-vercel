import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Loader2, Search, User, MapPin, Mail } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  suburb?: string;
}

export default function PortalAccess() {
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => api("/api/customers"),
  });

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  function openPortal(customerId: string) {
    window.location.href = `/api/admin/portal-as/${customerId}`;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 min-h-screen bg-gray-100">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Customer Portal Access</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open any customer's portal as an admin view.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading customers...</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">No customers found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-semibold text-gray-900 truncate">{c.name}</span>
                    </div>
                    {c.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.suburb && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>{c.suburb}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => openPortal(c.id)}
                    className="gap-2 w-full sm:w-auto shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Portal
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
