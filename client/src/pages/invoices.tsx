import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UpgradeModal } from "@/components/modals/upgrade-modal";
import { useAuth } from "@/hooks/use-auth";
import { invoicesApi } from "@/lib/api";
import { Receipt, Eye, Download } from "lucide-react";

export default function Invoices() {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { isProUser } = useAuth();

  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ["/api/invoices"],
    queryFn: invoicesApi.getAll,
    enabled: isProUser,
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "draft": return "status-badge status-draft";
      case "sent": return "status-badge status-sent";
      case "paid": return "status-badge status-paid";
      case "overdue": return "status-badge status-overdue";
      default: return "status-badge status-draft";
    }
  };

  const filteredInvoices = invoices.filter((invoice: any) => {
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesSearch = invoice.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Show upgrade modal if not pro user
  if (!isProUser) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="text-center py-12">
            <Receipt className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to Pro</h3>
            <p className="text-gray-600 mb-6">Access invoices and advanced features with Tasca Pro.</p>
            <Button onClick={() => setIsUpgradeModalOpen(true)} className="bg-warning hover:bg-yellow-600">
              Upgrade Now
            </Button>
          </CardContent>
        </Card>
        <UpgradeModal open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="bg-white rounded-xl border border-gray-200 animate-pulse">
          <div className="h-64"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="text-center py-12">
            <Receipt className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to load invoices</h3>
            <p className="text-gray-600">There was an error loading your invoices. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Invoices</CardTitle>
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
              <Button>
                New Invoice
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No invoices found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {invoices.length === 0 ? "Get started by creating your first invoice." : "Try adjusting your search or filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredInvoices.map((invoice: any) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">Service Invoice</div>
                          <div className="text-sm text-gray-500">#{invoice.id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {invoice.customer_id || "Not assigned"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${(invoice.total || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={getStatusBadgeClass(invoice.status)}>
                          {invoice.status || "Draft"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : "Not set"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {invoice.status === "overdue" ? (
                          <Button variant="ghost" size="sm" className="text-danger hover:text-red-700">
                            Send Reminder
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800 ml-2">
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
