import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building,
  Calendar,
  User,
  MessageSquare,
  AlertCircle,
  Clock,
  CheckCircle,
  Send,
  Lock,
  Edit,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { api } from "@/lib/api";

const supportTicketsApi = {
  getTicket: (id: string) => api(`/api/support-tickets/${id}`),
  updateTicket: (id: string, data: any) => 
    api(`/api/support-tickets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  addMessage: (id: string, data: any) => 
    api(`/api/support-tickets/${id}/messages`, { method: "POST", body: JSON.stringify(data) }),
  getSupportStaff: () => api("/api/support-tickets/staff"),
};

export default function TicketDetail() {
  const params = useParams();
  const ticketId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [messageText, setMessageText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isEditingPriority, setIsEditingPriority] = useState(false);
  const [isEditingAssignment, setIsEditingAssignment] = useState(false);

  const { data: ticketData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/support-tickets", ticketId],
    queryFn: () => supportTicketsApi.getTicket(ticketId!),
    enabled: !!ticketId,
    refetchInterval: 15000, // Poll every 15 seconds for ticket details
    refetchIntervalInBackground: true,
  });

  const { data: staffData } = useQuery({
    queryKey: ["/api/support-tickets/staff"],
    queryFn: supportTicketsApi.getSupportStaff,
    refetchInterval: 300000, // Poll every 5 minutes for staff updates
    refetchIntervalInBackground: true,
  });

  const updateTicketMutation = useMutation({
    mutationFn: (data: any) => supportTicketsApi.updateTicket(ticketId!, data),
    onSuccess: () => {
      toast({ title: "Ticket updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/support-tickets", ticketId] });
      setIsEditingStatus(false);
      setIsEditingPriority(false);
      setIsEditingAssignment(false);
    },
    onError: (error: any) => {
      toast({ title: "Error updating ticket", description: error.message, variant: "destructive" });
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: (data: any) => supportTicketsApi.addMessage(ticketId!, data),
    onSuccess: () => {
      toast({ title: "Message added successfully" });
      setMessageText("");
      setIsInternalNote(false);
      queryClient.invalidateQueries({ queryKey: ["/api/support-tickets", ticketId] });
    },
    onError: (error: any) => {
      toast({ title: "Error adding message", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-2" data-testid="text-loading">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-800" data-testid="text-error-title">
                    Unable to load ticket details
                  </h3>
                  <p className="text-sm text-red-600 mt-1" data-testid="text-error-message">
                    {error instanceof Error ? error.message : 'Something went wrong'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  data-testid="button-retry"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Retry
                </Button>
                <Button asChild data-testid="button-back-to-queue">
                  <Link href="/support/tickets">
                    <a className="flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Back to Queue
                    </a>
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ticketData?.ticket) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <p className="text-gray-500" data-testid="text-not-found">Ticket not found</p>
          <Button asChild className="mt-4" data-testid="button-back-to-queue">
            <Link href="/support/tickets">
              <a>Back to Queue</a>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { ticket, messages = [], assignments = [] } = ticketData;

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

  const handleStatusUpdate = (newStatus: string) => {
    updateTicketMutation.mutate({ status: newStatus });
  };

  const handlePriorityUpdate = (newPriority: string) => {
    updateTicketMutation.mutate({ priority: newPriority });
  };

  const handleAssignmentUpdate = (assignedTo: string) => {
    updateTicketMutation.mutate({ assigned_to: assignedTo === "unassigned" ? null : assignedTo });
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    
    addMessageMutation.mutate({
      message: messageText.trim(),
      is_internal: isInternalNote
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild data-testid="button-back">
            <Link href="/support/tickets">
              <a className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Queue
              </a>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-ticket-title">
              {ticket.title}
            </h1>
            <p className="text-gray-500 text-sm" data-testid="text-ticket-id">
              Ticket ID: {ticket.id}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Details */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-ticket-details">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-600">Description</Label>
                <p className="mt-1" data-testid="text-ticket-description">{ticket.description}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Category</Label>
                <p className="mt-1" data-testid="text-ticket-category">{ticket.category_name}</p>
              </div>
            </CardContent>
          </Card>

          {/* Conversation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="text-conversation">
                <MessageSquare className="h-5 w-5" />
                Conversation ({messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-gray-500 text-center py-4" data-testid="text-no-messages">
                    No messages yet
                  </p>
                ) : (
                  messages.map((message: any) => (
                    <div
                      key={message.id}
                      className={`p-3 rounded-lg border ${
                        message.is_internal
                          ? "bg-yellow-50 border-yellow-200"
                          : message.author_role === "support_staff"
                          ? "bg-blue-50 border-blue-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                      data-testid={`message-${message.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm" data-testid={`message-author-${message.id}`}>
                            {message.author_name || "Unknown"}
                          </span>
                          {message.is_internal && (
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-internal-${message.id}`}>
                              <Lock className="h-3 w-3 mr-1" />
                              Internal
                            </Badge>
                          )}
                          {message.author_role === "support_staff" && !message.is_internal && (
                            <Badge className="bg-blue-100 text-blue-800 text-xs" data-testid={`badge-support-${message.id}`}>
                              Support
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-500" data-testid={`message-time-${message.id}`}>
                          {new Date(message.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm" data-testid={`message-content-${message.id}`}>{message.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Message Composer */}
              <div className="mt-6 space-y-4 border-t pt-4">
                <div>
                  <Label className="text-sm font-medium">Add Message</Label>
                  <Textarea
                    placeholder="Type your message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="mt-1"
                    rows={3}
                    data-testid="textarea-message"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="internal-note"
                      checked={isInternalNote}
                      onCheckedChange={setIsInternalNote}
                      data-testid="switch-internal"
                    />
                    <Label htmlFor="internal-note" className="text-sm">
                      Internal note (not visible to customer)
                    </Label>
                  </div>
                  
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || addMessageMutation.isPending}
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Actions */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-status-actions">Status & Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div>
                <Label className="text-sm font-medium text-gray-600">Status</Label>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(ticket.status)}
                    <span className="capitalize" data-testid="text-current-status">
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  {!isEditingStatus ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingStatus(true)}
                      data-testid="button-edit-status"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Select value={ticket.status} onValueChange={handleStatusUpdate}>
                      <SelectTrigger className="w-32" data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Priority */}
              <div>
                <Label className="text-sm font-medium text-gray-600">Priority</Label>
                <div className="mt-1 flex items-center justify-between">
                  <Badge className={getPriorityColor(ticket.priority)} data-testid="badge-current-priority">
                    {ticket.priority}
                  </Badge>
                  {!isEditingPriority ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingPriority(true)}
                      data-testid="button-edit-priority"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Select value={ticket.priority} onValueChange={handlePriorityUpdate}>
                      <SelectTrigger className="w-32" data-testid="select-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Assignment */}
              <div>
                <Label className="text-sm font-medium text-gray-600">Assigned To</Label>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span data-testid="text-current-assignment">
                      {ticket.assigned_to_name || "Unassigned"}
                    </span>
                  </div>
                  {!isEditingAssignment ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingAssignment(true)}
                      data-testid="button-edit-assignment"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Select
                      value={ticket.assigned_to || "unassigned"}
                      onValueChange={handleAssignmentUpdate}
                    >
                      <SelectTrigger className="w-32" data-testid="select-assignment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {staffData?.staff?.map((staff: any) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name || staff.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="text-customer-info">
                <Building className="h-5 w-5" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-gray-600">Organization</Label>
                <p className="mt-1" data-testid="text-customer-org">{ticket.org_name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Submitted By</Label>
                <p className="mt-1" data-testid="text-submitted-by">
                  {ticket.submitted_by_name} ({ticket.submitted_by_email})
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Created</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm" data-testid="text-created-date">
                    {new Date(ticket.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Last Updated</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-sm" data-testid="text-updated-date">
                    {new Date(ticket.updated_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}