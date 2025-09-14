import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  Users, 
  Ticket,
  TrendingUp,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { api } from "@/lib/api";

interface TicketStats {
  statusStats: Array<{ status: string; count: number }>;
  priorityStats: Array<{ priority: string; count: number }>;
  unassignedCount: number;
  orgStats: Array<{ org_id: string; org_name: string; count: number }>;
}

const supportTicketsApi = {
  getStats: (): Promise<TicketStats> => api("/api/support-tickets/stats"),
  getMyAssignments: () => api("/api/support-tickets/assignments/my"),
};

export default function SupportDashboard() {
  const { data: stats, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["/api/support-tickets/stats"],
    queryFn: supportTicketsApi.getStats,
    refetchInterval: 60000, // Poll every minute for stats
    refetchIntervalInBackground: true,
  });

  const { data: myTickets, error: myTicketsError, refetch: refetchMyTickets } = useQuery({
    queryKey: ["/api/support-tickets/assignments/my"],
    queryFn: supportTicketsApi.getMyAssignments,
    refetchInterval: 30000, // Poll every 30 seconds for my tickets
    refetchIntervalInBackground: true,
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-800 border-red-200";
      case "high": return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const statusTotals = (stats?.statusStats.reduce((acc, item) => ({ ...acc, [item.status]: item.count }), {}) ?? {}) as Record<string, number>;
  const priorityTotals = (stats?.priorityStats.reduce((acc, item) => ({ ...acc, [item.priority]: item.count }), {}) ?? {}) as Record<string, number>;

  return (
    <div className="p-6 space-y-6">
      {/* Error States */}
      {(statsError || myTicketsError) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-800" data-testid="text-error-title">
                    Unable to load dashboard data
                  </h3>
                  <p className="text-sm text-red-600 mt-1" data-testid="text-error-message">
                    {statsError || myTicketsError ? 'Failed to load some dashboard information' : 'Something went wrong'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {statsError && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => refetchStats()}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                    data-testid="button-retry-stats"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Stats
                  </Button>
                )}
                {myTicketsError && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => refetchMyTickets()}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                    data-testid="button-retry-my-tickets"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry My Tickets
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">Support Dashboard</h1>
          <p className="text-gray-600" data-testid="text-subtitle">Manage customer support tickets across all organizations</p>
        </div>
        <div className="flex gap-3">
          <Button asChild data-testid="button-queue">
            <Link href="/support/tickets">
              <a className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                View Queue
              </a>
            </Link>
          </Button>
          <Button asChild variant="outline" data-testid="button-my-tickets">
            <Link href="/support/my-tickets">
              <a className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                My Tickets ({myTickets?.tickets?.length || 0})
              </a>
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-open">Open Tickets</p>
                <p className="text-2xl font-bold text-blue-600" data-testid="text-stat-open-count">{statusTotals.open || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <AlertCircle className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-progress">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600" data-testid="text-stat-progress-count">{statusTotals.in_progress || 0}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-unassigned">Unassigned</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-stat-unassigned-count">{stats?.unassignedCount || 0}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <Users className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-urgent">Urgent Priority</p>
                <p className="text-2xl font-bold text-purple-600" data-testid="text-stat-urgent-count">{priorityTotals.urgent || 0}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Priority Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-priority-breakdown">
              <TrendingUp className="h-5 w-5" />
              Priority Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.priorityStats.map((priority) => (
                <div key={priority.priority} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getPriorityColor(priority.priority)} data-testid={`badge-priority-${priority.priority}`}>
                      {priority.priority.charAt(0).toUpperCase() + priority.priority.slice(1)}
                    </Badge>
                  </div>
                  <span className="font-semibold" data-testid={`text-priority-${priority.priority}-count`}>{priority.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-status-breakdown">
              <Ticket className="h-5 w-5" />
              Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.statusStats.map((status) => (
                <div key={status.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(status.status)}
                    <span className="capitalize" data-testid={`text-status-${status.status}`}>
                      {status.status.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="font-semibold" data-testid={`text-status-${status.status}-count`}>{status.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Organizations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-top-orgs">
            <Users className="h-5 w-5" />
            Organizations by Ticket Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats?.orgStats.slice(0, 10).map((org) => (
              <div key={org.org_id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium" data-testid={`text-org-${org.org_id}`}>{org.org_name || 'Unknown Organization'}</p>
                  <p className="text-sm text-gray-500" data-testid={`text-org-id-${org.org_id}`}>{org.org_id}</p>
                </div>
                <Badge variant="secondary" data-testid={`badge-org-count-${org.org_id}`}>{org.count} tickets</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* My Recent Assignments */}
      {myTickets?.tickets && myTickets.tickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-my-assignments">
              <Users className="h-5 w-5" />
              My Recent Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myTickets.tickets.slice(0, 5).map((ticket: any) => (
                <Link key={ticket.id} href={`/support/tickets/${ticket.id}`}>
                  <a className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors" data-testid={`link-ticket-${ticket.id}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium" data-testid={`text-ticket-title-${ticket.id}`}>{ticket.title}</p>
                        <p className="text-sm text-gray-500" data-testid={`text-ticket-org-${ticket.id}`}>{ticket.org_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getPriorityColor(ticket.priority)} data-testid={`badge-ticket-priority-${ticket.id}`}>
                          {ticket.priority}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(ticket.status)}
                          <span className="text-sm capitalize" data-testid={`text-ticket-status-${ticket.id}`}>
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
      )}
    </div>
  );
}