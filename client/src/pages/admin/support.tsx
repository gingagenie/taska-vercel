import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  Users, 
  Ticket,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Search,
  Plus,
  Filter,
  Calendar,
  Building,
  MessageSquare,
  UserPlus,
  Shield,
  Activity,
  Eye,
  Mail,
  User
} from "lucide-react";
import { api } from "@/lib/api";

interface TicketStats {
  statusStats: Array<{ status: string; count: number }>;
  priorityStats: Array<{ priority: string; count: number }>;
  unassignedCount: number;
  orgStats: Array<{ org_id: string; org_name: string; count: number }>;
}

interface SupportTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  category_name: string;
  customer_name?: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at: string;
}

interface TicketsResponse {
  tickets: SupportTicket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Support API for admin page
const adminSupportApi = {
  getStats: (): Promise<TicketStats> => api("/api/support-tickets/stats"),
  getAll: (params?: { 
    status?: string; 
    priority?: string; 
    page?: number; 
    limit?: number; 
  }): Promise<TicketsResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.priority) searchParams.set('priority', params.priority);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    
    return api(`/api/support-tickets?${searchParams}`);
  }
};

export default function AdminSupportPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch support stats
  const { data: stats, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["/api/support-tickets/stats"],
    queryFn: adminSupportApi.getStats,
    refetchInterval: 60000,
  });

  // Fetch recent tickets
  const { data: ticketsData, isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ["/api/support-tickets", { 
      status: statusFilter === "all" ? undefined : statusFilter,
      priority: priorityFilter === "all" ? undefined : priorityFilter,
      page: currentPage,
      limit: 10 
    }],
    queryFn: () => adminSupportApi.getAll({ 
      status: statusFilter === "all" ? undefined : statusFilter,
      priority: priorityFilter === "all" ? undefined : priorityFilter,
      page: currentPage,
      limit: 10 
    }),
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case "in_progress": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "resolved": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "closed": return <CheckCircle className="h-4 w-4 text-gray-500" />;
      default: return <Ticket className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-blue-100 text-blue-800 border-blue-200";
      case "in_progress": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "resolved": return "bg-green-100 text-green-800 border-green-200";
      case "closed": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-800 border-red-200";
      case "high": return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const handleRefreshAll = () => {
    refetchStats();
    refetchTickets();
  };

  const tickets = ticketsData?.tickets || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">
            Support Management
          </h1>
          <p className="text-gray-600" data-testid="text-subtitle">
            Monitor and manage customer support tickets
          </p>
        </div>
        <Button onClick={handleRefreshAll} variant="outline" size="sm" data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="grid grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tickets">All Tickets</TabsTrigger>
          <TabsTrigger value="queue">Unassigned</TabsTrigger>
          <TabsTrigger value="staff">Staff Management</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.statusStats?.map((stat: { status: string; count: number }) => (
                <Card key={stat.status}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 capitalize">
                          {stat.status.replace('_', ' ')}
                        </p>
                        <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                      </div>
                      {getStatusIcon(stat.status)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Priority Breakdown */}
          {stats?.priorityStats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Priority Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {stats.priorityStats.map((priority: { priority: string; count: number }) => (
                    <div key={priority.priority} className="text-center">
                      <Badge className={getPriorityColor(priority.priority)} variant="outline">
                        {priority.priority}
                      </Badge>
                      <p className="text-2xl font-bold mt-2">{priority.count}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unassigned Tickets Alert */}
          {stats?.unassignedCount > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-semibold text-orange-800">
                      {stats.unassignedCount} Unassigned Tickets
                    </p>
                    <p className="text-sm text-orange-600">
                      These tickets need to be assigned to support staff
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search tickets..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-priority-filter">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tickets List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Tickets</CardTitle>
                <Link href="/support/tickets">
                  <Button variant="outline" size="sm">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <div className="text-center py-8">
                  <div className="text-gray-500">Loading tickets...</div>
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8">
                  <Ticket className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No tickets found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map((ticket: SupportTicket) => (
                    <Link key={ticket.id} href={`/support/ticket/${ticket.id}`}>
                      <a className="block hover:bg-gray-50 p-3 rounded-lg border border-transparent hover:border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {ticket.title}
                              </p>
                              <Badge className={getStatusColor(ticket.status)} variant="outline">
                                {ticket.status.replace('_', ' ')}
                              </Badge>
                              <Badge className={getPriorityColor(ticket.priority)} variant="outline">
                                {ticket.priority}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              {ticket.customer_name && (
                                <span className="flex items-center gap-1">
                                  <Building className="h-3 w-3" />
                                  {ticket.customer_name}
                                </span>
                              )}
                              {ticket.assigned_to_name && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {ticket.assigned_to_name}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(ticket.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(ticket.status)}
                          </div>
                        </div>
                      </a>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Unassigned Tickets ({stats?.unassignedCount || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                These tickets need to be assigned to support staff members for handling.
              </p>
              <div className="text-center py-8">
                <Link href="/support/tickets?status=unassigned">
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    View Unassigned Tickets
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Staff Management</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Manage support staff accounts and permissions
                </p>
                <Link href="/support-admin/users">
                  <Button size="sm" variant="outline">
                    <Shield className="h-4 w-4 mr-2" />
                    View Staff
                  </Button>
                </Link>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 text-center">
                <Mail className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Invitations</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Send invites to new support team members
                </p>
                <Link href="/support-admin/invites">
                  <Button size="sm" variant="outline">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Manage Invites
                  </Button>
                </Link>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6 text-center">
                <Activity className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Audit Logs</h3>
                <p className="text-sm text-gray-600 mb-4">
                  View detailed activity and audit trails
                </p>
                <Link href="/support-admin/audit">
                  <Button size="sm" variant="outline">
                    <Eye className="h-4 w-4 mr-2" />
                    View Logs
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}