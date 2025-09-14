import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { supportTicketsApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ArrowLeft, 
  Send, 
  MessageCircle, 
  Clock, 
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  Tag,
  TrendingUp,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TicketMessage {
  id: string;
  message: string;
  author_name: string;
  author_role: string;
  created_at: string;
  is_internal: boolean;
}

interface TicketDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category_name: string;
  category_description?: string;
  submitted_by_name: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

interface TicketDetailResponse {
  ticket: TicketDetail;
  messages: TicketMessage[];
  assignments: any[];
}

export default function SupportTicketDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);

  const { data: ticketData, isLoading, error, refetch } = useQuery<TicketDetailResponse>({
    queryKey: ["/api/support-tickets", id],
    queryFn: () => supportTicketsApi.get(id!),
    enabled: !!id,
  });

  const addMessageMutation = useMutation({
    mutationFn: (message: string) => supportTicketsApi.addMessage(id!, { message }),
    onSuccess: () => {
      setNewMessage("");
      refetch();
      toast({
        title: "Message Sent",
        description: "Your message has been sent to our support team.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message before sending.",
        variant: "destructive",
      });
      return;
    }

    addMessageMutation.mutate(newMessage.trim());
  };

  const handleRefresh = () => {
    refetch();
  };

  if (!id) {
    return (
      <div className="page">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Invalid Ticket</h2>
          <p className="text-gray-600 mb-4">The ticket ID is missing or invalid.</p>
          <Button onClick={() => setLocation("/support")}>
            Return to Support
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="text-center py-12" data-testid="loading-state">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2" data-testid="error-title">Unable to Load Ticket</h2>
          <p className="text-gray-600 mb-4" data-testid="error-message">
            {error.message || "There was an error loading the ticket details."}
          </p>
          <div className="flex items-center gap-3 justify-center">
            <Button onClick={handleRefresh} data-testid="button-retry">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" onClick={() => setLocation("/support")} data-testid="button-back-to-support">
              Return to Support
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ticketData?.ticket) {
    return (
      <div className="page">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Ticket Not Found</h2>
          <p className="text-gray-600 mb-4">This ticket doesn't exist or you don't have permission to view it.</p>
          <Button onClick={() => setLocation("/support")}>
            Return to Support
          </Button>
        </div>
      </div>
    );
  }

  const { ticket, messages } = ticketData;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case "in_progress": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "resolved": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "closed": return <CheckCircle className="h-4 w-4 text-gray-500" />;
      default: return <AlertCircle className="h-4 w-4" />;
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

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return "Today at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return "Yesterday at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString() + " at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  const canReply = ticket.status !== "closed";

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="header-row">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/support")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Support
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-ticket-title">
              {ticket.title}
            </h1>
            <p className="text-gray-600" data-testid="text-ticket-id">
              Ticket #{ticket.id.split('-')[0]}
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Original Description */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Original Request
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-blue-100 text-blue-600">
                      {ticket.submitted_by_name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium" data-testid="text-submitted-by">
                        {ticket.submitted_by_name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDate(ticket.created_at)}
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none" data-testid="text-ticket-description">
                      <p className="whitespace-pre-wrap">{ticket.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conversation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Conversation ({messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="text-center py-8" data-testid="no-messages">
                  <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No messages yet. Start the conversation below.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className="flex items-start gap-3" data-testid={`message-${message.id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={
                          message.author_role === "support_staff" 
                            ? "bg-green-100 text-green-600" 
                            : "bg-blue-100 text-blue-600"
                        }>
                          {message.author_name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium" data-testid={`message-author-${message.id}`}>
                            {message.author_name}
                          </span>
                          {message.author_role === "support_staff" && (
                            <Badge variant="secondary" className="text-xs">
                              Support Team
                            </Badge>
                          )}
                          <span className="text-sm text-gray-500" data-testid={`message-date-${message.id}`}>
                            {formatMessageDate(message.created_at)}
                          </span>
                        </div>
                        <div className="prose prose-sm max-w-none" data-testid={`message-content-${message.id}`}>
                          <p className="whitespace-pre-wrap">{message.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reply Form */}
          {canReply && (
            <Card>
              <CardHeader>
                <CardTitle>Reply to Support Team</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Textarea
                    placeholder="Type your message here..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="min-h-[100px]"
                    disabled={addMessageMutation.isPending}
                    data-testid="textarea-reply"
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || addMessageMutation.isPending}
                      className="flex items-center gap-2"
                      data-testid="button-send-reply"
                    >
                      {addMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {addMessageMutation.isPending ? "Sending..." : "Send Reply"}
                    </Button>
                    <p className="text-sm text-gray-600">
                      Our support team will be notified of your message
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {ticket.status === "closed" && (
            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-gray-500" />
                  <div>
                    <h3 className="font-medium text-gray-700">This ticket is closed</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      If you need further assistance with this issue, please create a new support ticket.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Ticket Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ticket Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusIcon(ticket.status)}
                <span className="font-medium">Status:</span>
                <Badge className={getStatusColor(ticket.status)} data-testid="badge-status">
                  {ticket.status.replace('_', ' ')}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Priority:</span>
                <Badge className={getPriorityColor(ticket.priority)} data-testid="badge-priority">
                  {ticket.priority}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Category:</span>
                <span data-testid="text-category">{ticket.category_name}</span>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Created:</span>
                <span data-testid="text-created-date">{formatDate(ticket.created_at)}</span>
              </div>

              {ticket.assigned_to_name && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Assigned to:</span>
                  <span data-testid="text-assigned-to">{ticket.assigned_to_name}</span>
                </div>
              )}

              {ticket.resolved_at && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-medium">Resolved:</span>
                  <span data-testid="text-resolved-date">{formatDate(ticket.resolved_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Help Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Need More Help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>If this ticket doesn't resolve your issue, you can:</p>
              <ul className="space-y-1 text-gray-600">
                <li>• Add more details to this conversation</li>
                <li>• Create a new ticket for a different issue</li>
                <li>• Reference this ticket in future requests</li>
              </ul>
              <Button asChild size="sm" className="w-full mt-3" data-testid="button-create-new-ticket">
                <a href="/support/new">Create New Ticket</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}