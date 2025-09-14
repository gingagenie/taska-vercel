import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supportTicketsApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { 
  Search, 
  Plus, 
  Filter,
  ArrowLeft,
  Clock, 
  CheckCircle,
  AlertCircle,
  Ticket,
  ArrowRight,
  RefreshCw,
  Calendar,
  TrendingUp
} from "lucide-react";

interface SupportTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  category_name: string;
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

export default function SupportTicketsList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: ticketsData, isLoading, error, refetch } = useQuery<TicketsResponse>({
    queryKey: ["/api/support-tickets", { 
      status: statusFilter === "all" ? undefined : statusFilter,
      priority: priorityFilter === "all" ? undefined : priorityFilter,
      page: currentPage,
      limit: 20 
    }, refreshKey],
    queryFn: () => supportTicketsApi.getAll({ 
      status: statusFilter === "all" ? undefined : statusFilter,
      priority: priorityFilter === "all" ? undefined : priorityFilter,
      page: currentPage,
      limit: 20 
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
      case "high": return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return "Today";
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handlePriorityFilterChange = (value: string) => {
    setPriorityFilter(value);
    setCurrentPage(1);
  };

  const tickets = ticketsData?.tickets || [];
  const pagination = ticketsData?.pagination;

  // Client-side search filtering (basic implementation)
  const filteredTickets = tickets.filter(ticket => 
    search === "" || 
    ticket.title.toLowerCase().includes(search.toLowerCase()) ||
    ticket.category_name.toLowerCase().includes(search.toLowerCase())
  );

  const hasFilters = statusFilter !== "all" || priorityFilter !== "all" || search !== "";

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="header-row">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="button-back"
          >
            <Link href="/support">
              <a className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Support
              </a>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-tickets-title">All Support Tickets</h1>
            <p className="text-gray-600" data-testid="text-tickets-subtitle">
              View and manage your support history
              {pagination && (
                <span className="ml-2">({pagination.total} total)</span>
              )}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild data-testid="button-create-ticket">
            <Link href="/support/new">
              <a className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Ticket
              </a>
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select value={priorityFilter} onValueChange={handlePriorityFilterChange}>
                <SelectTrigger data-testid="select-priority-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            <div className="space-y-2">
              <label className="text-sm font-medium">&nbsp;</label>
              {hasFilters && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setPriorityFilter("all");
                    setCurrentPage(1);
                  }}
                  className="w-full"
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <h3 className="font-medium text-red-800" data-testid="text-error-title">
                  Unable to load tickets
                </h3>
                <p className="text-sm text-red-600 mt-1" data-testid="text-error-message">
                  Please try refreshing the page or contact support if the problem persists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tickets List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Tickets
              {filteredTickets.length !== tickets.length && (
                <span className="text-sm font-normal text-gray-500">
                  ({filteredTickets.length} of {tickets.length})
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8" data-testid="loading-state">
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              Loading tickets...
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-8" data-testid="empty-state">
              <Ticket className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              {hasFilters ? (
                <>
                  <p className="text-gray-600 mb-3">No tickets match your current filters.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                      setPriorityFilter("all");
                    }}
                    data-testid="button-clear-filters-empty"
                  >
                    Clear Filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-3">You haven't created any support tickets yet.</p>
                  <Button asChild data-testid="button-create-first-ticket">
                    <Link href="/support/new">
                      <a>Create Your First Ticket</a>
                    </Link>
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <Link key={ticket.id} href={`/support/ticket/${ticket.id}`}>
                  <a 
                    className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    data-testid={`link-ticket-${ticket.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(ticket.status)}
                          <h3 className="font-medium truncate" data-testid={`text-ticket-title-${ticket.id}`}>
                            {ticket.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span data-testid={`text-ticket-date-${ticket.id}`}>
                              {formatDate(ticket.created_at)}
                            </span>
                          </div>
                          <span data-testid={`text-ticket-category-${ticket.id}`}>
                            {ticket.category_name}
                          </span>
                          <span className="text-xs text-gray-400" data-testid={`text-ticket-id-${ticket.id}`}>
                            #{ticket.id.split('-')[0]}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Badge className={getPriorityColor(ticket.priority)} data-testid={`badge-priority-${ticket.id}`}>
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {ticket.priority}
                        </Badge>
                        <Badge className={getStatusColor(ticket.status)} data-testid={`badge-status-${ticket.id}`}>
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-gray-600" data-testid="text-pagination-info">
                Showing page {pagination.page} of {pagination.pages}
                ({pagination.total} total tickets)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  data-testid="button-previous-page"
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  {currentPage} / {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= pagination.pages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      {!isLoading && tickets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-700">
                {tickets.filter(t => t.status === "open" || t.status === "in_progress").length}
              </div>
              <div className="text-sm text-blue-600">Active Tickets</div>
            </CardContent>
          </Card>
          
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-700">
                {tickets.filter(t => t.status === "resolved" || t.status === "closed").length}
              </div>
              <div className="text-sm text-green-600">Resolved</div>
            </CardContent>
          </Card>
          
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-700">
                {tickets.filter(t => t.priority === "high").length}
              </div>
              <div className="text-sm text-orange-600">High Priority</div>
            </CardContent>
          </Card>
          
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-700">
                {tickets.length}
              </div>
              <div className="text-sm text-purple-600">Total Tickets</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}