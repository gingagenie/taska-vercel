import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomerModal } from "@/components/modals/customer-modal";
import { customersApi } from "@/lib/api";
import { MoreHorizontal, Users } from "lucide-react";

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

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getBackgroundColor = (index: number) => {
    const colors = ["bg-primary", "bg-green-500", "bg-purple-500", "bg-yellow-500", "bg-red-500"];
    return colors[index % colors.length];
  };

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
    <div className="p-4 sm:p-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg sm:text-xl">Customers</CardTitle>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Input
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64"
              />
              <Button onClick={() => setIsCustomerModalOpen(true)}>
                New Customer
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {customers.length === 0 ? "Get started by adding your first customer." : "Try adjusting your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredCustomers.map((customer: any, index: number) => (
                <div key={customer.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 ${getBackgroundColor(index)} rounded-lg flex items-center justify-center`}>
                      <span className="text-white font-semibold">{getInitials(customer.name)}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-1">{customer.name}</h4>
                  {customer.email && (
                    <p className="text-sm text-gray-500 mb-2">{customer.email}</p>
                  )}
                  {customer.phone && (
                    <p className="text-sm text-gray-500 mb-3">{customer.phone}</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Customer since {new Date().getFullYear()}</span>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700 font-medium">
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomerModal open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen} />
    </div>
  );
}
