import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  User,
  Clock,
  AlertCircle,
  CheckCircle,
  Building,
  Calendar,
  MessageSquare,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { api } from "@/lib/api";

const supportTicketsApi = {
  getMyAssignments: () => api("/api/support-tickets/assignments/my"),
};

export default function MyTickets() {
  const { data: myTicketsData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/support-tickets/assignments/my"],
    queryFn: supportTicketsApi.getMyAssignments,
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true,
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

  const tickets = myTicketsData?.tickets || [];
  
  // Group tickets by status
  const ticketsByStatus = tickets.reduce((acc: any, ticket: any) => {
    if (!acc[ticket.status]) {
      acc[ticket.status] = [];
    }
    acc[ticket.status].push(ticket);
    return acc;
  }, {});

  const statusOrder = ["open", "in_progress", "resolved", "closed"];
  const statusLabels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress", 
    resolved: "Resolved",
    closed: "Closed"
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">My Assigned Tickets</h1>
          <p className="text-gray-600" data-testid="text-subtitle">
            Tickets currently assigned to you ({tickets.length} total)
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" data-testid="button-all-tickets">
            <Link href="/support/tickets">
              <a className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                All Tickets
              </a>
            </Link>
          </Button>
          <Button asChild data-testid="button-dashboard">
            <Link href="/support">
              <a className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Dashboard
              </a>
            </Link>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-800" data-testid="text-error-title">
                    Unable to load your tickets
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

      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-2" data-testid="text-loading">Loading your tickets...</p>
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2" data-testid="text-no-tickets">
              No tickets assigned
            </h3>
            <p className="text-gray-500 mb-4" data-testid="text-no-tickets-desc">
              You currently have no tickets assigned to you.
            </p>
            <Button asChild data-testid="button-view-queue">
              <Link href="/support/tickets">
                <a>View Ticket Queue</a>
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {statusOrder.map((status) => {
              const count = ticketsByStatus[status]?.length || 0;
              return (
                <Card key={status}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600" data-testid={`text-status-${status}`}>
                          {statusLabels[status]}
                        </p>
                        <p className="text-2xl font-bold" data-testid={`text-count-${status}`}>{count}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-100">
                        {getStatusIcon(status)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Tickets by Status */}
          {statusOrder.map((status) => {
            const statusTickets = ticketsByStatus[status] || [];
            if (statusTickets.length === 0) return null;

            return (
              <Card key={status}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" data-testid={`text-section-${status}`}>
                    {getStatusIcon(status)}
                    {statusLabels[status]} Tickets ({statusTickets.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {statusTickets.map((ticket: any) => (
                      <Link key={ticket.id} href={`/support/tickets/${ticket.id}`}>
                        <a 
                          className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                          data-testid={`ticket-card-${ticket.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-medium" data-testid={`ticket-title-${ticket.id}`}>
                                  {ticket.title}
                                </h3>
                                <Badge 
                                  className={getPriorityColor(ticket.priority)}
                                  data-testid={`ticket-priority-${ticket.id}`}
                                >
                                  {ticket.priority}
                                </Badge>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Building className="h-4 w-4" />
                                  <span data-testid={`ticket-org-${ticket.id}`}>
                                    {ticket.org_name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span data-testid={`ticket-created-${ticket.id}`}>
                                    {new Date(ticket.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              
                              {ticket.description && (
                                <p 
                                  className="text-sm text-gray-600 mt-2 line-clamp-2"
                                  data-testid={`ticket-description-${ticket.id}`}
                                >
                                  {ticket.description.length > 100 
                                    ? `${ticket.description.substring(0, 100)}...`
                                    : ticket.description
                                  }
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 ml-4">
                              <div className="flex items-center gap-1">
                                {getStatusIcon(ticket.status)}
                                <span 
                                  className="text-sm capitalize"
                                  data-testid={`ticket-status-${ticket.id}`}
                                >
                                  {ticket.status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </a>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}