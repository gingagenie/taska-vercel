import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supportTicketsApi } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  LifeBuoy, 
  Plus, 
  MessageCircle, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Ticket,
  ArrowRight,
  RefreshCw
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

export default function SupportDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: ticketsData, isLoading, error, refetch } = useQuery<TicketsResponse>({
    queryKey: ["/api/support-tickets", { page: 1, limit: 5 }, refreshKey],
    queryFn: () => supportTicketsApi.getAll({ page: 1, limit: 5 }),
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
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const tickets = ticketsData?.tickets || [];
  const openTickets = tickets.filter(t => t.status === "open" || t.status === "in_progress");
  const recentTickets = tickets.slice(0, 3);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="header-row">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-support-title">Support Center</h1>
          <p className="text-gray-600" data-testid="text-support-subtitle">
            Get help and track your support requests
          </p>
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

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <h3 className="font-medium text-red-800" data-testid="text-error-title">
                  Unable to load support tickets
                </h3>
                <p className="text-sm text-red-600 mt-1" data-testid="text-error-message">
                  Please try refreshing the page or contact support if the problem persists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600" data-testid="text-stat-open">Open Tickets</p>
                <p className="text-2xl font-bold text-blue-700" data-testid="text-stat-open-count">
                  {isLoading ? "..." : openTickets.length}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <LifeBuoy className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600" data-testid="text-stat-total">Total Tickets</p>
                <p className="text-2xl font-bold text-green-700" data-testid="text-stat-total-count">
                  {isLoading ? "..." : ticketsData?.pagination?.total || 0}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <Ticket className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600" data-testid="text-stat-response">Avg Response</p>
                <p className="text-2xl font-bold text-purple-700" data-testid="text-stat-response-time">
                  &lt; 4 hrs
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <MessageCircle className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-quick-actions">
            <LifeBuoy className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button asChild className="h-auto py-4" data-testid="button-create-new-ticket">
              <Link href="/support/new">
                <a className="flex flex-col items-center gap-2">
                  <Plus className="h-6 w-6" />
                  <span className="font-medium">Create New Ticket</span>
                  <span className="text-xs text-white/80">Report an issue or ask for help</span>
                </a>
              </Link>
            </Button>
            
            <Button asChild variant="outline" className="h-auto py-4" data-testid="button-view-all-tickets">
              <Link href="/support/tickets">
                <a className="flex flex-col items-center gap-2">
                  <Ticket className="h-6 w-6" />
                  <span className="font-medium">View All Tickets</span>
                  <span className="text-xs text-gray-600">Browse your support history</span>
                </a>
              </Link>
            </Button>
            
            <div className="flex flex-col items-center gap-2 p-4 border rounded-lg bg-gray-50">
              <MessageCircle className="h-6 w-6 text-gray-600" />
              <span className="font-medium text-gray-700">Need Urgent Help?</span>
              <span className="text-xs text-gray-600 text-center">
                For urgent issues, create a ticket and select "High" priority
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2" data-testid="text-recent-tickets">
              <Clock className="h-5 w-5" />
              Recent Tickets
            </CardTitle>
            {tickets.length > 3 && (
              <Button asChild variant="outline" size="sm" data-testid="button-view-all">
                <Link href="/support/tickets">
                  <a className="flex items-center gap-1">
                    View All
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-6" data-testid="text-loading">
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              Loading tickets...
            </div>
          ) : recentTickets.length === 0 ? (
            <div className="text-center py-6" data-testid="text-no-tickets">
              <Ticket className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-3">You haven't created any support tickets yet.</p>
              <Button asChild data-testid="button-create-first-ticket">
                <Link href="/support/new">
                  <a>Create Your First Ticket</a>
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTickets.map((ticket) => (
                <Link key={ticket.id} href={`/support/ticket/${ticket.id}`}>
                  <a 
                    className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    data-testid={`link-ticket-${ticket.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(ticket.status)}
                          <h3 className="font-medium truncate" data-testid={`text-ticket-title-${ticket.id}`}>
                            {ticket.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span data-testid={`text-ticket-category-${ticket.id}`}>
                            {ticket.category_name}
                          </span>
                          <span>•</span>
                          <span data-testid={`text-ticket-date-${ticket.id}`}>
                            {formatDate(ticket.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Badge className={getPriorityColor(ticket.priority)} data-testid={`badge-priority-${ticket.id}`}>
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
        </CardContent>
      </Card>

      {/* Help Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-help-info">
            <MessageCircle className="h-5 w-5" />
            How We Can Help
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Response Times</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• High Priority: Within 2 hours</li>
                <li>• Medium Priority: Within 4 hours</li>
                <li>• Low Priority: Within 24 hours</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">What to Include</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• Clear description of the issue</li>
                <li>• Steps to reproduce the problem</li>
                <li>• Screenshots if applicable</li>
                <li>• Browser and device information</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}