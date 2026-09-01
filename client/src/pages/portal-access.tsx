import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Loader2, Search } from "lucide-react";

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
    // Navigate directly to the server endpoint — it sets the session and redirects
    window.location.href = `/api/admin/portal-as/${customerId}`;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customer Portal Access</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open any customer's portal as an admin view. Sessions expire in 45 minutes.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading customers...
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">No customers found.</p>
      ) : (
        <div className="divide-y border rounded-lg bg-white">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-sm text-gray-500">
                  {[c.email, c.suburb].filter(Boolean).join(" · ") || "No contact info"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPortal(c.id)}
                className="gap-2 shrink-0 ml-4"
              >
                <ExternalLink className="w-3 h-3" />
                View Portal
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
