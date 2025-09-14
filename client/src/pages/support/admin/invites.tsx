import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Mail, 
  Copy, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle,
  Send,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

// Support API client for invite management
const supportInviteApi = {
  getInvites: async (params?: any) => {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`/support/api/admin/invites?${searchParams}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch invites');
    return response.json();
  },
  
  createInvite: async (data: any) => {
    const response = await fetch('/support/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to create invite');
    return response.json();
  },
  
  deleteInvite: async (id: string) => {
    const response = await fetch(`/support/api/admin/invites/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to cancel invite');
    return response.json();
  }
};

// Form schema
const createInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(['support_agent', 'support_admin']),
  expires_hours: z.number().min(1).max(168).default(72)
});

type CreateInviteData = z.infer<typeof createInviteSchema>;

interface SupportInvite {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  created_at: string;
  is_expired: boolean;
  created_by_id: string;
  created_by_name: string;
}

export default function SupportInvitesAdmin() {
  const [page, setPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SupportInvite | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { toast } = useToast();

  // Query for invites list
  const { data: invitesData, isLoading } = useQuery({
    queryKey: ['/support/api/admin/invites', { page }],
    queryFn: () => supportInviteApi.getInvites({ page }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Mutations
  const createInviteMutation = useMutation({
    mutationFn: supportInviteApi.createInvite,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/support/api/admin/invites'] });
      setIsCreateDialogOpen(false);
      toast({ 
        title: "Success", 
        description: "Invite created successfully! You can copy the invite URL below." 
      });
      // Optionally auto-copy the invite URL
      if (data.invite_url) {
        navigator.clipboard.writeText(data.invite_url);
        setCopiedToken(data.invite.token);
        setTimeout(() => setCopiedToken(null), 3000);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create invite", variant: "destructive" });
    }
  });

  const deleteInviteMutation = useMutation({
    mutationFn: supportInviteApi.deleteInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/support/api/admin/invites'] });
      setDeleteConfirm(null);
      toast({ title: "Success", description: "Invite cancelled successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to cancel invite", variant: "destructive" });
    }
  });

  // Form
  const createForm = useForm<CreateInviteData>({
    resolver: zodResolver(createInviteSchema),
    defaultValues: {
      email: "",
      role: "support_agent",
      expires_hours: 72
    }
  });

  const handleCreateInvite = (data: CreateInviteData) => {
    createInviteMutation.mutate(data);
  };

  const handleDeleteInvite = () => {
    if (deleteConfirm) {
      deleteInviteMutation.mutate(deleteConfirm.id);
    }
  };

  const handleCopyInviteUrl = (invite: SupportInvite) => {
    const inviteUrl = `${window.location.origin}/support/register?token=${invite.token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(invite.token);
    setTimeout(() => setCopiedToken(null), 3000);
    toast({ title: "Copied!", description: "Invite URL copied to clipboard" });
  };

  const isInviteExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const formatExpiryTime = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    
    if (diffMs < 0) {
      return 'Expired';
    }
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} left`;
    } else {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} left`;
    }
  };

  const getExpiryBadgeColor = (expiresAt: string, isExpired: boolean) => {
    if (isExpired) return 'bg-red-100 text-red-800';
    
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 24) return 'bg-orange-100 text-orange-800';
    return 'bg-green-100 text-green-800';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">Support Invites Management</h1>
          <p className="text-gray-600" data-testid="text-subtitle">Manage invitations for new support staff</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-invite">
              <Send className="h-4 w-4 mr-2" />
              Create Invite
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle data-testid="text-create-invite-title">Create Support Invite</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateInvite)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="invite@example.com" {...field} data-testid="input-invite-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-invite-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="support_agent">Support Agent</SelectItem>
                          <SelectItem value="support_admin">Support Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="expires_hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires In (Hours)</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger data-testid="select-invite-expiry">
                            <SelectValue placeholder="Select expiry time" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="24">24 hours (1 day)</SelectItem>
                          <SelectItem value="72">72 hours (3 days)</SelectItem>
                          <SelectItem value="168">168 hours (1 week)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-invite-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createInviteMutation.isPending}
                    data-testid="button-invite-submit"
                  >
                    {createInviteMutation.isPending ? "Creating..." : "Create Invite"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-total">Total Invites</p>
                <p className="text-2xl font-bold" data-testid="text-stat-total-count">{invitesData?.pagination?.total || 0}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-pending">Pending</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-stat-pending-count">
                  {invitesData?.invites?.filter((i: SupportInvite) => !i.is_expired).length || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-expired">Expired</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-stat-expired-count">
                  {invitesData?.invites?.filter((i: SupportInvite) => i.is_expired).length || 0}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-expiring">Expiring Soon</p>
                <p className="text-2xl font-bold text-orange-600" data-testid="text-stat-expiring-count">
                  {invitesData?.invites?.filter((i: SupportInvite) => {
                    const expiry = new Date(i.expires_at);
                    const now = new Date();
                    const diffHours = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60));
                    return diffHours > 0 && diffHours < 24;
                  }).length || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invites Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-invites-table-title">Support Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="text-gray-500" data-testid="text-loading">Loading invites...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitesData?.invites?.map((invite: SupportInvite) => (
                  <TableRow key={invite.id} data-testid={`row-invite-${invite.id}`}>
                    <TableCell className="font-medium" data-testid={`text-invite-email-${invite.id}`}>
                      {invite.email}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={getExpiryBadgeColor(invite.expires_at, invite.is_expired)} 
                        data-testid={`badge-invite-status-${invite.id}`}
                      >
                        {invite.is_expired ? 'Expired' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-invite-creator-${invite.id}`}>
                      {invite.created_by_name || 'Unknown'}
                    </TableCell>
                    <TableCell data-testid={`text-invite-created-${invite.id}`}>
                      {new Date(invite.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell data-testid={`text-invite-expires-${invite.id}`}>
                      {formatExpiryTime(invite.expires_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!invite.is_expired && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyInviteUrl(invite)}
                            data-testid={`button-copy-invite-${invite.id}`}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            {copiedToken === invite.token ? 'Copied!' : 'Copy URL'}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirm(invite)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-invite-${invite.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {invitesData?.invites?.length === 0 && (
            <div className="text-center py-8 text-gray-500" data-testid="text-no-invites">
              No invites found. Create your first invite to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-invite-title">Cancel Invite</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-delete-invite-description">
              Are you sure you want to cancel the invite for {deleteConfirm?.email}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInvite}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteInviteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteInviteMutation.isPending ? "Cancelling..." : "Cancel Invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}