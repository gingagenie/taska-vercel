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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, 
  AlertCircle, 
  Wrench,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);

  // Fetch service requests (pending only)
  const { data: allRequests = [], isLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Filter to pending only
  const requests = allRequests.filter(r => r.status === "pending");

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/service-requests/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests/stats/unread"] });
      setDetailModalOpen(false);
      toast({
        title: "Request deleted",
        description: "Service request has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleCardClick = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setDetailModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation(); // Prevent card click
    setRequestToDelete(requestId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (requestToDelete) {
      deleteMutation.mutate(requestToDelete);
      setDeleteConfirmOpen(false);
      setRequestToDelete(null);
    }
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

  const RequestCard = ({ request }: { request: ServiceRequest }) => (
    <div 
      onClick={() => handleCardClick(request)}
      className="p-4 border border-blue-200 bg-blue-50/50 rounded-lg hover:bg-blue-100/50 transition-colors cursor-pointer"
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
        <span className="text-xs text-gray-500 ml-4">
          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
        </span>
      </div>

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
          variant="destructive"
          onClick={(e) => handleDeleteClick(e, request.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="h-5 w-5 text-gray-600" />
            {requests.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {requests.length > 9 ? "9+" : requests.length}
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

          <div className="mt-6 space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No pending requests</p>
                <p className="text-sm mt-1">You're all caught up!</p>
              </div>
            ) : (
              requests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))
            )}
          </div>
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
              {selectedRequest?.urgency === "urgent" && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Urgent
                </Badge>
              )}
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
            <Button
              variant="outline"
              onClick={() => {
                if (selectedRequest) {
                  setRequestToDelete(selectedRequest.id);
                  setDeleteConfirmOpen(true);
                }
              }}
              disabled={deleteMutation.isPending}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button
              onClick={() => selectedRequest && handleConvertToJob(selectedRequest)}
            >
              Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this service request. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRequestToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
