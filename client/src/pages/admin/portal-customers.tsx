import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Org {
  id: string;
  name: string;
  subscription: { status: string };
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "trial") return "secondary";
  return "outline";
}

function OrgRow({ org }: { org: Org }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: [`/api/admin/orgs/${org.id}/customers`],
    queryFn: () => api(`/api/admin/orgs/${org.id}/customers`),
    enabled: expanded,
  });

  async function openPortal(customerId: string) {
    setOpeningId(customerId);
    try {
      const result = await api(`/api/admin/customers/${customerId}/impersonate`, {
        method: "POST",
      });
      window.open(window.location.origin + result.portalUrl, "_blank");
    } catch (e: any) {
      toast({
        title: "Failed to open portal",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="border rounded-lg mb-2 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 bg-white"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <span className="font-medium text-gray-900">{org.name}</span>
          <Badge variant={statusVariant(org.subscription?.status || "")}>
            {org.subscription?.status || "unknown"}
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-gray-50 px-4 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading customers...
            </div>
          ) : !customers?.length ? (
            <p className="text-sm text-gray-500 py-2">No customers found for this organisation.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4 font-medium">Customer</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium text-gray-900">{c.name}</td>
                    <td className="py-2 pr-4 text-gray-600">{c.email || "—"}</td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPortal(c.id);
                        }}
                        disabled={openingId === c.id}
                        className="gap-1"
                      >
                        {openingId === c.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3 h-3" />
                        )}
                        View Portal
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortalCustomersAdmin() {
  const { data, isLoading } = useQuery<{ organizations: Org[] }>({
    queryKey: ["/api/admin/organizations"],
    queryFn: () => api("/api/admin/organizations"),
  });

  const orgs = data?.organizations || [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Portal Access</h1>
        <p className="text-sm text-gray-500 mt-1">
          View any customer's portal as an admin. Each session is logged and expires in 45 minutes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Organisations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-500 py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading organisations...
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-gray-500 py-4">No organisations found.</p>
          ) : (
            orgs.map((org) => <OrgRow key={org.id} org={org} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
