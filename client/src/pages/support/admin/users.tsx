import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  UserPlus, 
  Search, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Shield, 
  User, 
  CheckCircle, 
  XCircle,
  Eye,
  Calendar,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

// Helper function to convert "all_*" values to undefined for filtering
const normalizeFilterValue = (value: string | undefined) => {
  if (!value || value.startsWith('all_')) return undefined;
  return value;
};

// Support API client specifically for admin routes
const supportAdminApi = {
  getUsers: async (params?: any) => {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`/support/api/admin/users?${searchParams}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch support users');
    return response.json();
  },
  
  getUser: async (id: string) => {
    const response = await fetch(`/support/api/admin/users/${id}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch user details');
    return response.json();
  },
  
  createUser: async (data: any) => {
    const response = await fetch('/support/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to create user');
    return response.json();
  },
  
  updateUser: async (id: string, data: any) => {
    const response = await fetch(`/support/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to update user');
    return response.json();
  },
  
  updateUserStatus: async (id: string, is_active: boolean) => {
    const response = await fetch(`/support/api/admin/users/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to update user status');
    return response.json();
  },
  
  deleteUser: async (id: string) => {
    const response = await fetch(`/support/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to delete user');
    return response.json();
  }
};

// Form schemas
const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address"),
  role: z.enum(['support_agent', 'support_admin']),
  password: z.string().min(8, "Password must be at least 8 characters")
});

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address"),
  role: z.enum(['support_agent', 'support_admin'])
});

type CreateUserData = z.infer<typeof createUserSchema>;
type EditUserData = z.infer<typeof editUserSchema>;

interface SupportUser {
  id: string;
  name: string;
  email: string;
  role: 'support_agent' | 'support_admin';
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  action_count: number;
}

export default function SupportUsersAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SupportUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SupportUser | null>(null);
  const [viewingUser, setViewingUser] = useState<SupportUser | null>(null);

  const { toast } = useToast();

  // Query for users list
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['/support/api/admin/users', { search: searchTerm, role: roleFilter, status: statusFilter, page }],
    queryFn: () => supportAdminApi.getUsers({ 
      search: searchTerm || undefined, 
      role: normalizeFilterValue(roleFilter), 
      status: normalizeFilterValue(statusFilter), 
      page 
    }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Query for user details
  const { data: userDetails } = useQuery({
    queryKey: ['/support/api/admin/users', viewingUser?.id],
    queryFn: () => viewingUser ? supportAdminApi.getUser(viewingUser.id) : null,
    enabled: !!viewingUser,
  });

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: supportAdminApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/support/api/admin/users'] });
      setIsCreateDialogOpen(false);
      toast({ title: "Success", description: "Support user created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditUserData }) => supportAdminApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/support/api/admin/users'] });
      setEditingUser(null);
      toast({ title: "Success", description: "Support user updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => supportAdminApi.updateUserStatus(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/support/api/admin/users'] });
      toast({ title: "Success", description: "User status updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: supportAdminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/support/api/admin/users'] });
      setDeleteConfirm(null);
      toast({ title: "Success", description: "Support user deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
    }
  });

  // Forms
  const createForm = useForm<CreateUserData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "support_agent",
      password: ""
    }
  });

  const editForm = useForm<EditUserData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: editingUser?.name || "",
      email: editingUser?.email || "",
      role: editingUser?.role || "support_agent"
    }
  });

  // Update edit form when editing user changes
  if (editingUser && editForm.getValues().name !== editingUser.name) {
    editForm.reset({
      name: editingUser.name,
      email: editingUser.email,
      role: editingUser.role
    });
  }

  const handleCreateUser = (data: CreateUserData) => {
    createUserMutation.mutate(data);
  };

  const handleEditUser = (data: EditUserData) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data });
    }
  };

  const handleStatusToggle = (user: SupportUser) => {
    updateStatusMutation.mutate({ id: user.id, is_active: !user.is_active });
  };

  const handleDeleteUser = () => {
    if (deleteConfirm) {
      deleteUserMutation.mutate(deleteConfirm.id);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    return role === 'support_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  const formatLastLogin = (lastLogin: string | null | undefined) => {
    if (!lastLogin) return 'Never';
    return new Date(lastLogin).toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-title">Support Users Management</h1>
          <p className="text-gray-600" data-testid="text-subtitle">Manage support staff accounts and permissions</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-user">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Support User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle data-testid="text-create-user-title">Create Support User</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateUser)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-create-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-create-email" />
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
                          <SelectTrigger data-testid="select-create-role">
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
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} data-testid="input-create-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-create-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    data-testid="button-create-submit"
                  >
                    {createUserMutation.isPending ? "Creating..." : "Create User"}
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
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-total">Total Users</p>
                <p className="text-2xl font-bold" data-testid="text-stat-total-count">{usersData?.pagination?.total || 0}</p>
              </div>
              <User className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-active">Active Users</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-stat-active-count">
                  {usersData?.users?.filter((u: SupportUser) => u.is_active).length || 0}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-admins">Admins</p>
                <p className="text-2xl font-bold text-purple-600" data-testid="text-stat-admins-count">
                  {usersData?.users?.filter((u: SupportUser) => u.role === 'support_admin').length || 0}
                </p>
              </div>
              <Shield className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="text-stat-inactive">Inactive</p>
                <p className="text-2xl font-bold text-gray-600" data-testid="text-stat-inactive-count">
                  {usersData?.users?.filter((u: SupportUser) => !u.is_active).length || 0}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-role-filter">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_roles">All Roles</SelectItem>
                <SelectItem value="support_agent">Support Agent</SelectItem>
                <SelectItem value="support_admin">Support Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_status">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-users-table-title">Support Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="text-gray-500" data-testid="text-loading">Loading users...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData?.users?.map((user: SupportUser) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium" data-testid={`text-user-name-${user.id}`}>
                      {user.name}
                    </TableCell>
                    <TableCell data-testid={`text-user-email-${user.id}`}>{user.email}</TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(user.role)} data-testid={`badge-user-role-${user.id}`}>
                        {user.role === 'support_admin' ? 'Admin' : 'Agent'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(user.is_active)} data-testid={`badge-user-status-${user.id}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-user-login-${user.id}`}>
                      {formatLastLogin(user.last_login_at)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.is_active}
                        onCheckedChange={() => handleStatusToggle(user)}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`switch-user-status-${user.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-user-menu-${user.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewingUser(user)} data-testid={`menu-view-${user.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingUser(user)} data-testid={`menu-edit-${user.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeleteConfirm(user)}
                            className="text-red-600"
                            data-testid={`menu-delete-${user.id}`}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle data-testid="text-edit-user-title">Edit Support User</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditUser)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} data-testid="input-edit-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-role">
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
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                  data-testid="button-edit-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  data-testid="button-edit-submit"
                >
                  {updateUserMutation.isPending ? "Updating..." : "Update User"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View User Details Dialog */}
      <Dialog open={!!viewingUser} onOpenChange={() => setViewingUser(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle data-testid="text-view-user-title">User Details</DialogTitle>
          </DialogHeader>
          {userDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Name</label>
                  <p className="text-sm" data-testid="text-view-user-name">{userDetails.user.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Email</label>
                  <p className="text-sm" data-testid="text-view-user-email">{userDetails.user.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Role</label>
                  <Badge className={getRoleBadgeColor(userDetails.user.role)} data-testid="badge-view-user-role">
                    {userDetails.user.role === 'support_admin' ? 'Admin' : 'Agent'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <Badge className={getStatusBadgeColor(userDetails.user.is_active)} data-testid="badge-view-user-status">
                    {userDetails.user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Last Login</label>
                  <p className="text-sm flex items-center gap-2" data-testid="text-view-user-last-login">
                    <Calendar className="h-4 w-4" />
                    {formatLastLogin(userDetails.user.last_login_at)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Total Actions</label>
                  <p className="text-sm flex items-center gap-2" data-testid="text-view-user-actions">
                    <Activity className="h-4 w-4" />
                    {userDetails.user.action_count}
                  </p>
                </div>
              </div>
              
              {userDetails.recent_activity?.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-2 block">Recent Activity</label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {userDetails.recent_activity.map((activity: any, index: number) => (
                      <div key={index} className="text-xs p-2 bg-gray-50 rounded" data-testid={`text-activity-${index}`}>
                        <span className="font-medium">{activity.action}</span>
                        <span className="text-gray-500 ml-2">
                          {new Date(activity.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-confirm-title">Delete Support User</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-delete-confirm-description">
              Are you sure you want to delete {deleteConfirm?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteUserMutation.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}