import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ExternalLink,
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
  customer_id?: string;
  customer_name?: string;
  equipment_id?: string;
  equipment_name?: string;
  photos?: Array<{ id: string; url: string }>;
}

interface ServiceRequestsNotificationsProps {
  onCreateJob?: (data: {
    title: string;
    description: string;
    customerId: string;
    equipmentId: string;
    serviceRequestId: string;
  }) => void;
}

export function ServiceRequestsNotifications({ onCreateJob }: ServiceRequestsNotificationsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

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
      toast({
        title: "Request marked as viewed",
        description: "Status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleMarkAsViewed = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent card click
    markAsViewedMutation.mutate(id);
  };

  const handleCardClick = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setDetailModalOpen(true);
  };

  const handleConvertToJob = (request: ServiceRequest) => {
    if (!onCreateJob) return;
    
    // Close both modals
    setDetailModalOpen(false);
    setOpen(false);
    
    // Call the callback with prefill data
    onCreateJob({
      title: request.title,
      description: request.description,
      customerId: request.customer_id || '',
      equipmentId: request.equipment_id || '',
      serviceRequestId: request.id,
    });
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const viewedRequests = requests.filter(r => r.status === "viewed");
  const completedRequests = requests.filter(r => r.status === "job_created" || r.status === "declined");

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Pending</Badge>;
      case "viewed":
        return <Badge variant="secondary" className="bg-green-100 text-green-700">Viewed</Badge>;
      case "job_created":
        return <Badge variant="secondary" className="bg-purple-100 text-purple-700">Job Created</Badge>;
      case "declined":
        return <Badge variant="secondary" className="bg-gray-100 text-gray-700">Declined</Badge>;
      default:
        return null;
    }
  };

  const RequestCard = ({ request }: { request: ServiceRequest }) => (
    <div 
      onClick={() => handleCardClick(request)}
      className={`p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${
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
            onClick={(e) => {
              e.stopPropagation();
              handleConvertToJob(request);
            }}
            className="flex-1"
          >
            Create Job
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => handleMarkAsViewed(e, request.id)}
            disabled={markAsViewedMutation.isPending}
          >
            Mark Viewed
          </Button>
        </div>
      )}

      {request.status === "viewed" && (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleConvertToJob(request);
          }}
          className="w-full mt-3"
        >
          Create Job
        </Button>
      )}
    </div>
  );

  return (
    <>
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

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle className="text-xl">{selectedRequest?.title}</DialogTitle>
                <DialogDescription className="mt-2">
                  {new Date(selectedRequest?.created_at || '').toLocaleString()}
                </DialogDescription>
              </div>
              <div className="flex flex-col gap-2 items-end">
                {selectedRequest?.urgency === "urgent" && (
                  <Badge variant="destructive">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Urgent
                  </Badge>
                )}
                {getStatusBadge(selectedRequest?.status || '')}
              </div>
            </div>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Customer & Equipment Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                {selectedRequest.customer_name && (
                  <div>
                    <div className="text-sm font-medium text-gray-500">Customer</div>
                    <div className="mt-1 font-medium">{selectedRequest.customer_name}</div>
                  </div>
                )}
                {selectedRequest.equipment_name && (
                  <div>
                    <div className="text-sm font-medium text-gray-500">Equipment</div>
                    <div className="mt-1 font-medium">{selectedRequest.equipment_name}</div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Description</div>
                <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                  {selectedRequest.description}
                </div>
              </div>

              {/* Photos */}
              {selectedRequest.photos && selectedRequest.photos.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-3">
                    Photos ({selectedRequest.photos.length})
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedRequest.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-500 transition-colors"
                      >
                        <img
                          src={photo.url}
                          alt="Service request"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <ExternalLink className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {selectedRequest?.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedRequest) {
                      markAsViewedMutation.mutate(selectedRequest.id);
                      setDetailModalOpen(false);
                    }
                  }}
                  disabled={markAsViewedMutation.isPending}
                >
                  Mark as Viewed
                </Button>
                <Button
                  onClick={() => selectedRequest && handleConvertToJob(selectedRequest)}
                >
                  Create Job
                </Button>
              </>
            )}
            {selectedRequest?.status === "viewed" && (
              <Button
                onClick={() => selectedRequest && handleConvertToJob(selectedRequest)}
                className="w-full"
              >
                Create Job
              </Button>
            )}
            {(selectedRequest?.status === "job_created" || selectedRequest?.status === "declined") && (
              <Button variant="outline" onClick={() => setDetailModalOpen(false)} className="w-full">
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
