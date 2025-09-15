import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { 
  Search, 
  Filter, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  User,
  Building,
  Calendar,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { api } from "@/lib/api";

interface TicketListParams {
  status?: string;
  priority?: string;
  assigned_to?: string;
  category_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Helper function to convert "all_*" values to undefined for filtering
const normalizeFilterValue = (value: string | undefined) => {
  if (!value || value.startsWith('all_')) return undefined;
  return value;
};

const supportTicketsApi = {
  getTickets: (params: TicketListParams = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
    return api(`/api/support-tickets?${searchParams}`);
  },
  getCategories: () => api("/api/support-tickets/categories"),
  getSupportStaff: () => api("/api/support-tickets/staff"),
};

export default function TicketQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: ticketsData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/support-tickets", { 
      status: statusFilter, 
      priority: priorityFilter, 
      assigned_to: assignedFilter,
      category_id: categoryFilter,
      search: searchTerm,
      page: currentPage,
      limit: 20
    }],
    queryFn: () => supportTicketsApi.getTickets({
      status: normalizeFilterValue(statusFilter),
      priority: normalizeFilterValue(priorityFilter),
      assigned_to: normalizeFilterValue(assignedFilter),
      category_id: normalizeFilterValue(categoryFilter),
      search: searchTerm || undefined,
      page: currentPage,
      limit: 20
    }),
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["/api/support-tickets/categories"],
    queryFn: supportTicketsApi.getCategories,
  });

  const { data: staffData } = useQuery({
    queryKey: ["/api/support-tickets/staff"],
    queryFn: supportTicketsApi.getSupportStaff,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case "in_progress": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "resolved": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "closed": return <CheckCircle className="h-4 w-4 text-gray-500" />;
      default: return <AlertCircle className="h-4 w-4" />;
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

  const clearFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setCategoryFilter("");
    setSearchTerm("");
    setCurrentPage(1);
  };

  const tickets = ticketsData?.tickets || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">Ticket Queue</h1>
          <p className="text-gray-600" data-testid="text-subtitle">
            Manage support tickets across all customer organizations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500" data-testid="text-total-count">
            {tickets.length} tickets
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-filters">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tickets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_statuses">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            {/* Priority Filter */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger data-testid="select-priority">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_priorities">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Assignment Filter */}
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger data-testid="select-assigned">
                <SelectValue placeholder="All Assignments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_assignments">All Assignments</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staffData?.staff?.map((staff: any) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name || staff.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-800" data-testid="text-error-title">
                    Unable to load tickets
                  </h3>
                  <p className="text-sm text-red-600 mt-1" data-testid="text-error-message">
                    {error instanceof Error ? error.message : 'Something went wrong'}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={() => refetch()}
                disabled={isLoading}
                className="border-red-300 text-red-700 hover:bg-red-100"
                data-testid="button-retry"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-ticket-list">Support Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2" data-testid="text-loading">Loading tickets...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-ticket-id">Ticket ID</TableHead>
                    <TableHead data-testid="header-title">Title</TableHead>
                    <TableHead data-testid="header-organization">Organization</TableHead>
                    <TableHead data-testid="header-priority">Priority</TableHead>
                    <TableHead data-testid="header-status">Status</TableHead>
                    <TableHead data-testid="header-assigned">Assigned To</TableHead>
                    <TableHead data-testid="header-created">Created</TableHead>
                    <TableHead data-testid="header-updated">Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <p className="text-gray-500" data-testid="text-no-tickets">No tickets found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    tickets.map((ticket: any) => (
                      <TableRow key={ticket.id} className="hover:bg-gray-50">
                        <TableCell>
                          <Link href={`/support-admin/tickets/${ticket.id}`}>
                            <a className="font-mono text-sm text-blue-600 hover:text-blue-800" data-testid={`link-ticket-${ticket.id}`}>
                              {ticket.id.slice(0, 8)}...
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/support-admin/tickets/${ticket.id}`}>
                            <a className="font-medium hover:text-blue-600" data-testid={`text-ticket-title-${ticket.id}`}>
                              {ticket.title}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-gray-400" />
                            <span data-testid={`text-org-${ticket.id}`}>{ticket.org_name || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(ticket.priority)} data-testid={`badge-priority-${ticket.id}`}>
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(ticket.status)}
                            <span className="capitalize" data-testid={`text-status-${ticket.id}`}>
                              {ticket.status.replace('_', ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {ticket.assigned_to_name ? (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <span data-testid={`text-assigned-${ticket.id}`}>{ticket.assigned_to_name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-500" data-testid={`text-unassigned-${ticket.id}`}>Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span className="text-sm" data-testid={`text-created-${ticket.id}`}>
                              {new Date(ticket.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm" data-testid={`text-updated-${ticket.id}`}>
                            {new Date(ticket.updated_at).toLocaleDateString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {ticketsData?.pagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500" data-testid="text-pagination-info">
            Showing {((currentPage - 1) * 20) + 1} to {Math.min(currentPage * 20, ticketsData.pagination.total)} of {ticketsData.pagination.total} tickets
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <span className="text-sm" data-testid="text-current-page">
              Page {currentPage} of {ticketsData.pagination.pages}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= ticketsData.pagination.pages}
              onClick={() => setCurrentPage(p => p + 1)}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}