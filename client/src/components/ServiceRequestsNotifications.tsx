import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bell, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Calendar,
  Wrench,
  Image as ImageIcon,
  ChevronRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  urgency: "normal" | "urgent";
  status: "pending" | "viewed" | "job_created" | "declined";
  created_at: string;
  customer_name?: string;
  equipment_name?: string;
  photos?: Array<{ id: string; url: string }>;
}

export function ServiceRequestsNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Fetch service requests
  const { data: requests = [], isLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Fetch unread count
  const { data: unreadData } = useQuery({
    queryKey: ["/api/service-requests/stats/unread"],
    refetchInterval: 30000,
  });

  const unreadCount = (unreadData as any)?.count || 0;

  // Mark as viewed mutation
  const markAsViewedMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/service-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "viewed" }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests/stats/unread"] });
    },
  });

  // Convert to job mutation
  const convertToJobMutation = useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: string; scheduled_at?: string }) => {
      const response = await fetch(`/api/service-requests/${id}/convert-to-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to convert");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Job created!",
        description: "Service request converted to job successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create job",
        variant: "destructive",
      });
    },
  });

  const handleMarkAsViewed = (id: string) => {
    markAsViewedMutation.mutate(id);
  };

  const handleConvertToJob = (id: string) => {
    convertToJobMutation.mutate({ id });
    setOpen(false);
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const viewedRequests = requests.filter(r => r.status === "viewed");
  const completedRequests = requests.filter(r => r.status === "job_created" || r.status === "declined");

  const getUrgencyColor = (urgency: string) => {
    return urgency === "urgent" ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "viewed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "job_created":
        return <Calendar className="h-4 w-4" />;
      case "declined":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const RequestCard = ({ request }: { request: ServiceRequest }) => (
    <div 
      className={`p-4 border rounded-lg hover:bg-gray-50 transition-colors ${
        request.status === "pending" ? "border-blue-200 bg-blue-50/50" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900">{request.title}</h4>
            {request.urgency === "urgent" && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Urgent
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {request.description}
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {request.customer_name && (
              <span className="flex items-center gap-1">
                👤 {request.customer_name}
              </span>
            )}
            {request.equipment_name && (
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {request.equipment_name}
              </span>
            )}
            {request.photos && request.photos.length > 0 && (
              <span className="flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                {request.photos.length} {request.photos.length === 1 ? "photo" : "photos"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 ml-4">
          <span className="text-xs text-gray-500">
            {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
          </span>
          <div className="flex items-center gap-1">
            {getStatusIcon(request.status)}
          </div>
        </div>
      </div>

      {request.status === "pending" && (
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={() => handleConvertToJob(request.id)}
            className="flex-1"
            disabled={convertToJobMutation.isPending}
          >
            Create Job
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleMarkAsViewed(request.id)}
            disabled={markAsViewedMutation.isPending}
          >
            Mark Viewed
          </Button>
        </div>
      )}

      {request.status === "viewed" && (
        <Button
          size="sm"
          onClick={() => handleConvertToJob(request.id)}
          className="w-full mt-3"
          disabled={convertToJobMutation.isPending}
        >
          Create Job
        </Button>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Service Requests</SheetTitle>
          <SheetDescription>
            Customer-initiated service requests from the portal
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="pending" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending" className="relative">
              Pending
              {pendingRequests.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="viewed">
              Viewed
              {viewedRequests.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
                  {viewedRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3 mt-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No pending requests</p>
              </div>
            ) : (
              pendingRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))
            )}
          </TabsContent>

          <TabsContent value="viewed" className="space-y-3 mt-4">
            {viewedRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No viewed requests</p>
              </div>
            ) : (
              viewedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3 mt-4">
            {completedRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No completed requests</p>
              </div>
            ) : (
              completedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
