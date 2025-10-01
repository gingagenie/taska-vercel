import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { invoicesApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation, useSearch } from "wouter";
import { FileText, User, ArrowRight, Edit, Trash } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { trackClickButton } from "@/lib/tiktok-tracking";

export default function InvoicesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const currentTab = (params.get('tab') || 'all') as 'all' | 'paid' | 'unpaid' | 'overdue';
  
  const { data: counts = { all: 0, paid: 0, unpaid: 0, overdue: 0 } } = useQuery<{
    all: number;
    paid: number;
    unpaid: number;
    overdue: number;
  }>({ 
    queryKey: ["/api/invoices/counts"],
  });
  
  const { data: list = [], isLoading } = useQuery<any[]>({ 
    queryKey: ["/api/invoices", { tab: currentTab }],
  });
  
  const [q, setQ] = useState("");

  const deleteInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => invoicesApi.delete(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/invoices/counts"] });
      toast({
        title: "Invoice deleted",
        description: "The invoice has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete invoice. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const handleTabChange = (tab: string) => {
    navigate(`/invoices?tab=${tab}`);
  };

  const handleDeleteInvoice = (invoice: any) => {
    if (window.confirm(`Are you sure you want to delete "${invoice.title}"? This action cannot be undone.`)) {
      deleteInvoiceMutation.mutate(invoice.id);
    }
  };

  const filtered = (list || []).filter((x: any) => [x.title,x.customer_name,x.status].join(" ").toLowerCase().includes(q.toLowerCase()));

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 min-h-screen bg-gray-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-financial">Invoices</h1>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Input 
            className="w-full sm:w-64" 
            placeholder="Search invoices…" 
            value={q} 
            onChange={(e)=>setQ(e.target.value)} 
          />
          <Link href="/invoices/new">
            <a>
              <Button 
                data-mobile-full="true" 
                className="bg-financial hover:bg-financial/90 text-financial-foreground w-full sm:w-auto"
                onClick={() => {
                  trackClickButton({
                    contentName: "New Invoice Button (Header)",
                    contentCategory: "lead_generation",
                  });
                }}
                data-testid="button-new-invoice-header"
              >
                <FileText className="h-4 w-4 mr-2" />
                New Invoice
              </Button>
            </a>
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1">
            <TabsTrigger value="all" className="gap-1 sm:gap-2" data-testid="tab-all">
              <span className="text-xs sm:text-sm">All</span>
              <Badge variant="secondary" className="text-xs" data-testid="count-all">{counts.all}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unpaid" className="gap-1 sm:gap-2" data-testid="tab-unpaid">
              <span className="text-xs sm:text-sm">Unpaid</span>
              <Badge variant="secondary" className="text-xs" data-testid="count-unpaid">{counts.unpaid}</Badge>
            </TabsTrigger>
            <TabsTrigger value="paid" className="gap-1 sm:gap-2" data-testid="tab-paid">
              <span className="text-xs sm:text-sm">Paid</span>
              <Badge variant="secondary" className="text-xs" data-testid="count-paid">{counts.paid}</Badge>
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-1 sm:gap-2" data-testid="tab-overdue">
              <span className="text-xs sm:text-sm">Overdue</span>
              <Badge variant="secondary" className="text-xs" data-testid="count-overdue">{counts.overdue}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading invoices…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-xl font-semibold text-gray-600 mb-2">
            {q ? "No invoices found" : "No invoices yet"}
          </div>
          <div className="text-gray-500 mb-4">
            {q ? "Try adjusting your search terms" : "Create your first invoice to get started"}
          </div>
          {!q && (
            <Link href="/invoices/new">
              <a>
                <Button 
                  className="bg-financial hover:bg-financial/90 text-financial-foreground"
                  onClick={() => {
                    trackClickButton({
                      contentName: "New Invoice Button (Empty State)",
                      contentCategory: "lead_generation",
                    });
                  }}
                  data-testid="button-new-invoice-empty"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  New Invoice
                </Button>
              </a>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((invoice: any) => (
            <Card 
              key={invoice.id} 
              className="border-financial bg-white hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer group"
              onClick={() => navigate(`/invoices/${invoice.id}`)}
              data-testid={`card-invoice-${invoice.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="space-y-1">
                        <div className="font-semibold text-lg group-hover:text-financial transition-colors">
                          {invoice.title || "Untitled Invoice"}
                        </div>
                        <div className="text-sm text-gray-500 font-medium">
                          {invoice.number || 'inv-0001'}
                        </div>
                      </div>
                      <Badge className={getStatusBadgeClass(invoice.status)}>
                        {(invoice.status || "draft").replace("_", " ")}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Customer</div>
                        <div className="font-medium flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {invoice.customer_name || "No customer assigned"}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-gray-500">Total</div>
                        <div className="font-medium">
                          {invoice.total_amount ? `$${Number(invoice.total_amount).toFixed(2)}` : "—"}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-financial transition-colors pt-1">
                      <span>Click for details</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                  
                  <div className="ml-4" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" data-testid={`menu-invoice-${invoice.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => {
                          navigate(`/invoices/${invoice.id}/edit`);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteInvoice(invoice)}
                          className="text-red-600 focus:text-red-600"
                          data-testid={`delete-invoice-${invoice.id}`}
                        >
                          <Trash className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}