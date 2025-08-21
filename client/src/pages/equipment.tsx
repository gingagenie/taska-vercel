import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { equipmentApi } from "@/lib/api";
import { Settings, Wrench, Edit } from "lucide-react";

export default function Equipment() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: equipmentApi.getAll,
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "available": return "status-badge status-completed";
      case "in_use": return "status-badge status-in-progress";
      case "maintenance": return "status-badge status-new";
      default: return "status-badge status-completed";
    }
  };

  const getEquipmentIcon = (index: number) => {
    const icons = [Settings, Wrench];
    const Icon = icons[index % icons.length];
    const colors = ["text-blue-600", "text-yellow-600"];
    const bgColors = ["bg-blue-100", "bg-yellow-100"];
    return {
      icon: <Icon className={colors[index % colors.length]} />,
      bgColor: bgColors[index % bgColors.length]
    };
  };

  const filteredEquipment = equipment.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (item.make && item.make.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (item.model && item.model.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

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
            <CardTitle className="text-lg sm:text-xl">Equipment</CardTitle>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search equipment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64"
              />
              <Button>
                New Equipment
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEquipment.length === 0 ? (
            <div className="text-center py-8">
              <Settings className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No equipment found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {equipment.length === 0 ? "Get started by adding your first equipment." : "Try adjusting your search or filter."}
              </p>
            </div>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-4">
              {filteredEquipment.map((item: any, index: number) => {
                const iconData = getEquipmentIcon(index);
                const status = "available"; // Default status since backend doesn't track this yet
                
                return (
                  <Card key={item.id} className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 ${iconData.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        {iconData.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 text-sm">{item.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.make && item.model ? `${item.make} / ${item.model}` : item.make || item.model || "Not specified"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Serial: {item.serial || "Not specified"}</p>
                      </div>
                      <Badge className={getStatusBadgeClass(status)}>
                        {status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Location: {item.location || "Not specified"}</span>
                      <Button variant="ghost" size="sm" className="p-1">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Equipment</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Make/Model</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serial</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEquipment.map((item: any, index: number) => {
                    const iconData = getEquipmentIcon(index);
                    const status = "available"; // Default status since backend doesn't track this yet
                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`w-10 h-10 ${iconData.bgColor} rounded-lg flex items-center justify-center mr-3`}>
                              {iconData.icon}
                            </div>
                            <div className="text-sm font-medium text-gray-900">{item.name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.make && item.model ? `${item.make} / ${item.model}` : item.make || item.model || "Not specified"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.serial || "Not specified"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={getStatusBadgeClass(status)}>
                            Available
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          Warehouse
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
                            Assign
                          </Button>
                          <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800 ml-2">
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
