import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Edit,
  CreditCard,
  Ban,
  RefreshCw,
  DollarSign,
  Calendar,
  Users as UsersIcon,
  MessageCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Organization {
  id: string;
  name: string;
  abn?: string;
  created_at: string;
  subscription: {
    status: string;
    plan_id: string;
    plan_name: string;
    monthly_revenue_aud: number;
    trial_end?: string;
    current_period_start?: string;
    current_period_end?: string;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
  };
  metrics: {
    user_count: number;
    sms_sent: number;
    emails_sent: number;
  };
}

interface OrganizationsResponse {
  organizations: Organization[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface SubscriptionUpdateRequest {
  plan_id?: string;
  status?: string;
  extend_trial_days?: number;
  notes?: string;
}

interface RefundRequest {
  amount_cents: number;
  reason: string;
  stripe_refund: boolean;
}

interface SuspensionRequest {
  suspend: boolean;
  reason?: string;
}

export default function OrganizationsAdmin() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'subscription' | 'refund' | 'suspend' | null>(null);
  
  // Form states for different actions
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionUpdateRequest>({});
  const [refundForm, setRefundForm] = useState<RefundRequest>({
    amount_cents: 0,
    reason: '',
    stripe_refund: true
  });
  const [suspensionForm, setSuspensionForm] = useState<SuspensionRequest>({
    suspend: false,
    reason: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch organizations
  const { data: orgData, isLoading, refetch } = useQuery<OrganizationsResponse>({
    queryKey: ['/api/admin/organizations', { page, search, status: statusFilter, plan: planFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (planFilter !== 'all') params.append('plan', planFilter);
      
      const response = await fetch(`/api/admin/organizations?${params}`);
      if (!response.ok) throw new Error('Failed to fetch organizations');
      return response.json();
    }
  });

  // Subscription update mutation
  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ orgId, data }: { orgId: string; data: SubscriptionUpdateRequest }) => {
      const response = await fetch(`/api/admin/organization/${orgId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update subscription');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Subscription updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      setActionDialogOpen(false);
      setSubscriptionForm({});
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to update subscription",
        variant: "destructive"
      });
    }
  });

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async ({ orgId, data }: { orgId: string; data: RefundRequest }) => {
      const response = await fetch(`/api/admin/organization/${orgId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to process refund');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Refund processed successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      setActionDialogOpen(false);
      setRefundForm({ amount_cents: 0, reason: '', stripe_refund: true });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to process refund",
        variant: "destructive"
      });
    }
  });

  // Suspension mutation
  const suspensionMutation = useMutation({
    mutationFn: async ({ orgId, data }: { orgId: string; data: SuspensionRequest }) => {
      const response = await fetch(`/api/admin/organization/${orgId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update suspension status');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Account status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      setActionDialogOpen(false);
      setSuspensionForm({ suspend: false, reason: '' });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to update account status",
        variant: "destructive"
      });
    }
  });

  const handleAction = (org: Organization, action: 'subscription' | 'refund' | 'suspend') => {
    setSelectedOrg(org);
    setActionType(action);
    setActionDialogOpen(true);
    
    // Pre-populate forms with current data
    if (action === 'subscription') {
      setSubscriptionForm({
        plan_id: org.subscription.plan_id,
        status: org.subscription.status
      });
    } else if (action === 'refund') {
      setRefundForm({
        amount_cents: org.subscription.monthly_revenue_aud * 100,
        reason: '',
        stripe_refund: true
      });
    } else if (action === 'suspend') {
      setSuspensionForm({
        suspend: false,
        reason: ''
      });
    }
  };

  const handleSubmitAction = () => {
    if (!selectedOrg) return;

    if (actionType === 'subscription') {
      updateSubscriptionMutation.mutate({ orgId: selectedOrg.id, data: subscriptionForm });
    } else if (actionType === 'refund') {
      refundMutation.mutate({ orgId: selectedOrg.id, data: refundForm });
    } else if (actionType === 'suspend') {
      suspensionMutation.mutate({ orgId: selectedOrg.id, data: suspensionForm });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', { 
      style: 'currency', 
      currency: 'AUD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'default',
      trial: 'secondary',
      past_due: 'destructive',
      canceled: 'outline',
      suspended: 'destructive'
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const organizations = orgData?.organizations || [];
  const pagination = orgData?.pagination;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="title-organizations">
          Organization Management
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Manage subscriptions, billing, and account status
        </p>
      </div>

      {/* Filters */}
      <Card className="p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Search - Full width on mobile */}
          <div className="w-full">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search organizations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-search-organizations"
              />
            </div>
          </div>
          
          {/* Filters row - stacked on mobile, side by side on larger screens */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 h-11" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full sm:w-48 h-11" data-testid="select-plan-filter">
                <SelectValue placeholder="Filter by plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="solo">Solo ($29)</SelectItem>
                <SelectItem value="pro">Pro ($49)</SelectItem>
                <SelectItem value="enterprise">Enterprise ($99)</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              onClick={() => refetch()} 
              className="w-full sm:w-auto h-11 px-6"
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Organizations List */}
      <div className="space-y-3 sm:space-y-4">
        {organizations.map((org) => (
          <Card key={org.id} className="p-4 sm:p-6">
            <div className="flex flex-col space-y-4">
              {/* Header with badges */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">{org.name}</h3>
                  <div className="flex gap-2">
                    {getStatusBadge(org.subscription.status)}
                    <Badge variant="outline" className="text-xs">{org.subscription.plan_name}</Badge>
                  </div>
                </div>
              </div>
              
              {/* Metrics grid - 2 cols on mobile, 4 on larger screens */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{formatCurrency(org.subscription.monthly_revenue_aud)}/mo</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <UsersIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{org.metrics.user_count} users</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{org.metrics.sms_sent} SMS</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Created {formatDate(org.created_at)}</span>
                </div>
              </div>
              
              {/* Trial warning */}
              {org.subscription.trial_end && (
                <div className="text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
                  Trial ends: {formatDate(org.subscription.trial_end)}
                </div>
              )}
              
              {/* Action buttons - full width on mobile, compact on larger screens */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 pt-2 border-t border-gray-100">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleAction(org, 'subscription')}
                  className="w-full sm:w-auto justify-center sm:justify-start h-9"
                  data-testid={`button-edit-subscription-${org.id}`}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Subscription
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleAction(org, 'refund')}
                  className="w-full sm:w-auto justify-center sm:justify-start h-9"
                  data-testid={`button-refund-${org.id}`}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Process Refund
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleAction(org, 'suspend')}
                  className="w-full sm:w-auto justify-center sm:justify-start h-9"
                  data-testid={`button-suspend-${org.id}`}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Suspend Account
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-2 mt-6 px-4">
          <Button 
            variant="outline" 
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="w-full sm:w-auto h-10"
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          
          <span className="text-sm text-gray-600 px-4 py-2 order-first sm:order-none">
            Page {page} of {pagination.totalPages}
          </span>
          
          <Button 
            variant="outline" 
            disabled={page === pagination.totalPages}
            onClick={() => setPage(page + 1)}
            className="w-full sm:w-auto h-10"
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      )}

      {/* Action Dialogs */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'subscription' && 'Update Subscription'}
              {actionType === 'refund' && 'Process Refund'}
              {actionType === 'suspend' && 'Suspend Account'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedOrg && (
              <div className="text-sm text-gray-600">
                Organization: <strong>{selectedOrg.name}</strong>
              </div>
            )}

            {actionType === 'subscription' && (
              <>
                <div>
                  <Label htmlFor="plan">Plan</Label>
                  <Select 
                    value={subscriptionForm.plan_id || ''} 
                    onValueChange={(value) => setSubscriptionForm({...subscriptionForm, plan_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solo">Solo ($29/month)</SelectItem>
                      <SelectItem value="pro">Pro ($49/month)</SelectItem>
                      <SelectItem value="enterprise">Enterprise ($99/month)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={subscriptionForm.status || ''} 
                    onValueChange={(value) => setSubscriptionForm({...subscriptionForm, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="past_due">Past Due</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="trial-days">Extend Trial (days)</Label>
                  <Input
                    id="trial-days"
                    type="number"
                    placeholder="0"
                    value={subscriptionForm.extend_trial_days || ''}
                    onChange={(e) => setSubscriptionForm({
                      ...subscriptionForm, 
                      extend_trial_days: parseInt(e.target.value) || 0
                    })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Reason for change..."
                    value={subscriptionForm.notes || ''}
                    onChange={(e) => setSubscriptionForm({...subscriptionForm, notes: e.target.value})}
                  />
                </div>
              </>
            )}

            {actionType === 'refund' && (
              <>
                <div>
                  <Label htmlFor="amount">Refund Amount (AUD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0"
                    value={refundForm.amount_cents / 100}
                    onChange={(e) => setRefundForm({
                      ...refundForm, 
                      amount_cents: (parseFloat(e.target.value) || 0) * 100
                    })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    placeholder="Reason for refund..."
                    value={refundForm.reason}
                    onChange={(e) => setRefundForm({...refundForm, reason: e.target.value})}
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="stripe-refund"
                    checked={refundForm.stripe_refund}
                    onCheckedChange={(checked) => setRefundForm({...refundForm, stripe_refund: checked})}
                  />
                  <Label htmlFor="stripe-refund">Process Stripe refund</Label>
                </div>
              </>
            )}

            {actionType === 'suspend' && (
              <>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="suspend"
                    checked={suspensionForm.suspend}
                    onCheckedChange={(checked) => setSuspensionForm({...suspensionForm, suspend: checked})}
                  />
                  <Label htmlFor="suspend">Suspend account</Label>
                </div>
                
                <div>
                  <Label htmlFor="suspend-reason">Reason</Label>
                  <Textarea
                    id="suspend-reason"
                    placeholder="Reason for suspension..."
                    value={suspensionForm.reason || ''}
                    onChange={(e) => setSuspensionForm({...suspensionForm, reason: e.target.value})}
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setActionDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitAction}
                className="flex-1"
                disabled={
                  updateSubscriptionMutation.isPending || 
                  refundMutation.isPending || 
                  suspensionMutation.isPending
                }
                data-testid="button-submit-action"
              >
                {(updateSubscriptionMutation.isPending || refundMutation.isPending || suspensionMutation.isPending) ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}