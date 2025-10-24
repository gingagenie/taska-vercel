import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { meApi, itemPresetsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, ExternalLink, AlertCircle, Trash2, Crown, Star, Zap, CreditCard, Users, Mail, BarChart3, ShoppingCart, Package } from "lucide-react";
import { useSubscription, useCancelSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "@/components/subscription/upgrade-modal";
import { Badge } from "@/components/ui/badge";
import { useSmsUsage } from "@/hooks/useSmsUsage";
import { Progress } from "@/components/ui/progress";
import { MessageCircle } from "lucide-react";
import { useUsageAlerts, UsageAlertList, UsageData } from "@/components/usage/usage-alerts";
import { PackSelectionModal } from "@/components/packs/PackSelectionModal";
import { PurchasedPacksList } from "@/components/packs/PurchasedPacksList";
import { usePackPurchase } from "@/hooks/usePackPurchase";

// Usage Tab Component
function UsageTab() {
  const { data: usageData, isLoading, error } = useQuery({
    queryKey: ["/api/usage"],
    refetchOnWindowFocus: true,
    staleTime: 60000, // Refresh every minute
    refetchInterval: 60000, // Auto-refresh every minute
    refetchIntervalInBackground: true, // Continue refreshing in background
  });

  // Type guard to check if usageData has the expected structure
  const isValidUsageData = (data: any): data is {
    users: { used: number; quota: number; percent: number };
    sms: { used: number; quota: number; remaining: number; percent: number; quotaExceeded: boolean };
    email: { used: number; quota: number; remaining: number; percent: number; quotaExceeded: boolean };
    periodEnd: string;
    planId: string;
    subscriptionStatus: string;
  } => {
    return data && 
           data.users && typeof data.users.used === 'number' && typeof data.users.quota === 'number' &&
           data.sms && typeof data.sms.used === 'number' && typeof data.sms.quota === 'number' &&
           data.email && typeof data.email.used === 'number' && typeof data.email.quota === 'number' &&
           typeof data.periodEnd === 'string' &&
           typeof data.planId === 'string' &&
           typeof data.subscriptionStatus === 'string';
  };

  const formatPercentage = (percent: number) => Math.round(percent);
  
  const getUsageColor = (percent: number, exceeded: boolean = false) => {
    if (exceeded || percent >= 100) return "text-red-600";
    if (percent >= 80) return "text-orange-600";
    return "text-green-600";
  };

  const getProgressColor = (percent: number, exceeded: boolean = false) => {
    if (exceeded || percent >= 100) return "bg-red-500";
    if (percent >= 80) return "bg-orange-500";
    return "bg-green-500";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton for three cards */}
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                <div className="h-2 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !usageData || !isValidUsageData(usageData)) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-gray-500">Unable to load usage information</p>
          <p className="text-sm text-gray-400 mt-1">Please try refreshing the page</p>
        </CardContent>
      </Card>
    );
  }

  const { users, sms, email, periodEnd, planId, subscriptionStatus } = usageData;
  const resetDate = formatDate(periodEnd);
  
  // Get smart alerts for usage data
  const { alerts, dismissAlert } = useUsageAlerts(usageData as UsageData);

  return (
    <div className="space-y-6">
      {/* Global Smart Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Usage Alerts
          </h3>
          <UsageAlertList
            alerts={alerts}
            currentPlan={planId}
            onDismiss={dismissAlert}
            variant="compact"
            showUpgrade={true}
          />
        </div>
      )}
      {/* Users Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Team Members
          </CardTitle>
          <CardDescription>
            Active users in your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold" data-testid="text-users-usage">
              {users.used} of {users.quota}
            </span>
            <span className={`text-sm font-medium ${getUsageColor(users.percent)}`}>
              {formatPercentage(users.percent)}% used
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Usage</span>
              <span>{formatPercentage(users.percent)}%</span>
            </div>
            <Progress 
              value={Math.min(users.percent, 100)} 
              className={`h-2 [&>div]:${getProgressColor(users.percent)}`}
              data-testid="progress-users-usage"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span>Available slots:</span>
            <span className={`font-semibold ${users.used >= users.quota ? 'text-red-600' : 'text-green-600'}`}>
              {Math.max(0, users.quota - users.used)} remaining
            </span>
          </div>

          {/* User alerts are now handled by the global smart alerts section above */}
        </CardContent>
      </Card>

      {/* SMS Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            SMS Notifications
          </CardTitle>
          <CardDescription>
            SMS messages sent this billing period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold" data-testid="text-sms-usage-detailed">
              {sms.used} of {sms.quota}
            </span>
            <span className={`text-sm font-medium ${getUsageColor(sms.percent, sms.quotaExceeded)}`}>
              {formatPercentage(sms.percent)}% used
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Usage</span>
              <span>{formatPercentage(sms.percent)}%</span>
            </div>
            <Progress 
              value={Math.min(sms.percent, 100)} 
              className={`h-2 [&>div]:${getProgressColor(sms.percent, sms.quotaExceeded)}`}
              data-testid="progress-sms-usage-detailed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span>Remaining:</span>
              <span className={`font-semibold ${sms.remaining <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                {sms.remaining} SMS
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Resets:</span>
              <span className="font-semibold text-gray-600">
                {resetDate}
              </span>
            </div>
          </div>

          {/* SMS alerts are now handled by the global smart alerts section above */}
        </CardContent>
      </Card>

      {/* Email Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-purple-500" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Email messages sent this billing period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold" data-testid="text-email-usage">
              {email.used} of {email.quota}
            </span>
            <span className={`text-sm font-medium ${getUsageColor(email.percent, email.quotaExceeded)}`}>
              {formatPercentage(email.percent)}% used
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Usage</span>
              <span>{formatPercentage(email.percent)}%</span>
            </div>
            <Progress 
              value={Math.min(email.percent, 100)} 
              className={`h-2 [&>div]:${getProgressColor(email.percent, email.quotaExceeded)}`}
              data-testid="progress-email-usage"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span>Remaining:</span>
              <span className={`font-semibold ${email.remaining <= 10 ? 'text-red-600' : 'text-green-600'}`}>
                {email.remaining} emails
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Resets:</span>
              <span className="font-semibold text-gray-600">
                {resetDate}
              </span>
            </div>
          </div>

          {/* Email alerts are now handled by the global smart alerts section above */}
        </CardContent>
      </Card>

      {/* Usage Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            Usage Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span>Plan:</span>
              <span className="font-semibold capitalize">{planId || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span>Status:</span>
              <Badge variant={subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                {subscriptionStatus || 'Unknown'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span>Period ends:</span>
              <span className="font-semibold">{resetDate}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pack Management Section */}
      <PackManagementSection />
    </div>
  );
}

// Pack Management Section Component
function PackManagementSection() {
  const [selectedPackType, setSelectedPackType] = useState<'all' | 'sms' | 'email'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'expired' | 'used_up'>('all');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Pack Management Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-green-500" />
                Communication Packs
              </CardTitle>
              <CardDescription>
                Manage your SMS and Email pack inventory and track usage
              </CardDescription>
            </div>
            <PackSelectionModal 
              open={showPurchaseModal}
              onOpenChange={setShowPurchaseModal}
            >
              <Button 
                className="flex items-center gap-2" 
                data-testid="button-buy-packs"
                onClick={() => setShowPurchaseModal(true)}
              >
                <ShoppingCart className="w-4 h-4" />
                Buy Packs
              </Button>
            </PackSelectionModal>
          </div>
        </CardHeader>
        <CardContent>
          {/* Pack Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Type:</Label>
              <div className="flex gap-1">
                <Button
                  variant={selectedPackType === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPackType('all')}
                  data-testid="filter-pack-type-all"
                >
                  All
                </Button>
                <Button
                  variant={selectedPackType === 'sms' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPackType('sms')}
                  data-testid="filter-pack-type-sms"
                  className="flex items-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" />
                  SMS
                </Button>
                <Button
                  variant={selectedPackType === 'email' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPackType('email')}
                  data-testid="filter-pack-type-email"
                  className="flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" />
                  Email
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Status:</Label>
              <div className="flex gap-1">
                <Button
                  variant={selectedStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('all')}
                  data-testid="filter-status-all"
                >
                  All
                </Button>
                <Button
                  variant={selectedStatus === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('active')}
                  data-testid="filter-status-active"
                >
                  Active
                </Button>
                <Button
                  variant={selectedStatus === 'expired' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('expired')}
                  data-testid="filter-status-expired"
                >
                  Expired
                </Button>
                <Button
                  variant={selectedStatus === 'used_up' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedStatus('used_up')}
                  data-testid="filter-status-used-up"
                >
                  Used Up
                </Button>
              </div>
            </div>
          </div>

          {/* Pack Usage Statistics */}
          <PackUsageStats 
            packType={selectedPackType === 'all' ? undefined : selectedPackType}
          />
        </CardContent>
      </Card>

      {/* Purchased Packs List */}
      <PackListWithEmptyState
        selectedStatus={selectedStatus}
        selectedPackType={selectedPackType}
        onPurchase={() => setShowPurchaseModal(true)}
      />
    </div>
  );
}

// Pack List with Enhanced Empty State Component
function PackListWithEmptyState({
  selectedStatus,
  selectedPackType,
  onPurchase
}: {
  selectedStatus: 'all' | 'active' | 'expired' | 'used_up';
  selectedPackType: 'all' | 'sms' | 'email';
  onPurchase: () => void;
}) {
  return (
    <>
      <PurchasedPacksList
        status={selectedStatus === 'all' ? 'all' : selectedStatus}
        packType={selectedPackType === 'all' ? undefined : selectedPackType}
        className="space-y-4"
      />
      
      {/* Enhanced Empty State for First-Time Users */}
      <PackEmptyStateCta onPurchase={onPurchase} />
    </>
  );
}

// Enhanced Empty State Call-to-Action Component
function PackEmptyStateCta({ onPurchase }: { onPurchase: () => void }) {
  const { data: packsResponse, isLoading } = useQuery({
    queryKey: ['/api/usage/packs', 'all'],
    staleTime: 2 * 60 * 1000,
  });

  const packs = packsResponse?.data || [];
  const hasAnyPacks = packs.length > 0;
  
  // Only show CTA if user has never purchased packs
  if (isLoading || hasAnyPacks) {
    return null;
  }

  return (
    <Card className="border-2 border-dashed border-gray-200">
      <CardContent className="p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-green-50 rounded-full">
              <Package className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <h3 className="text-lg font-semibold mb-2">Get Started with Communication Packs</h3>
          <p className="text-gray-500 mb-6">
            Purchase SMS and Email packs to ensure uninterrupted service when your plan limits are reached. 
            Packs never expire and provide extra capacity for busy periods.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm">
            <div className="bg-blue-50 p-4 rounded-lg">
              <MessageCircle className="w-5 h-5 text-blue-500 mx-auto mb-2" />
              <div className="font-medium text-blue-900">SMS Packs</div>
              <div className="text-blue-600">Starting from $5</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <Mail className="w-5 h-5 text-purple-500 mx-auto mb-2" />
              <div className="font-medium text-purple-900">Email Packs</div>
              <div className="text-purple-600">Starting from $3</div>
            </div>
          </div>
          
          <Button 
            onClick={onPurchase}
            className="flex items-center gap-2"
            data-testid="button-get-started-packs"
          >
            <ShoppingCart className="w-4 h-4" />
            Get Your First Pack
          </Button>
          
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Never expire
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Instant activation
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Automatic billing
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Pack Usage Statistics Component
function PackUsageStats({ packType }: { packType?: 'sms' | 'email' }) {
  // Build query parameters for pack statistics
  const queryParams = new URLSearchParams();
  if (packType) queryParams.append('packType', packType);
  
  const queryString = queryParams.toString();
  const endpoint = queryString ? `/api/usage/packs?${queryString}` : '/api/usage/packs';

  // Query for pack statistics
  const { data: packsResponse, isLoading } = useQuery({
    queryKey: [endpoint, 'stats', packType],
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const packs = packsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-200 rounded"></div>
        ))}
      </div>
    );
  }

  // Calculate statistics
  const totalPacks = packs.length;
  const activePacks = packs.filter(p => p.status === 'active').length;
  const totalQuantity = packs.reduce((sum, p) => sum + p.quantity, 0);
  const usedQuantity = packs.reduce((sum, p) => sum + p.usedQuantity, 0);
  const remainingQuantity = packs.reduce((sum, p) => sum + p.remainingQuantity, 0);

  const stats = [
    { label: 'Total Packs', value: totalPacks, color: 'text-blue-600' },
    { label: 'Active Packs', value: activePacks, color: 'text-green-600' },
    { label: 'Total Credits', value: totalQuantity.toLocaleString(), color: 'text-purple-600' },
    { label: 'Available Credits', value: remainingQuantity.toLocaleString(), color: 'text-orange-600' }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600">{stat.label}</div>
          <div className={`text-2xl font-bold ${stat.color}`} data-testid={`stat-${stat.label.toLowerCase().replace(' ', '-')}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// Subscription Tab Component
function SubscriptionTab() {
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription();
  const { data: smsUsage, isLoading: smsLoading } = useSmsUsage();
  const cancelMutation = useCancelSubscription();

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'trial':
        return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>;
      case 'past_due':
        return <Badge className="bg-red-100 text-red-800">Past Due</Badge>;
      case 'canceled':
        return <Badge className="bg-gray-100 text-gray-800">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'solo': return <Star className="w-5 h-5 text-blue-500" />;
      case 'pro': return <Zap className="w-5 h-5 text-purple-500" />;
      case 'enterprise': return <Crown className="w-5 h-5 text-orange-500" />;
      default: return <CreditCard className="w-5 h-5 text-gray-500" />;
    }
  };

  if (subscriptionLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">Unable to load subscription information</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getPlanIcon(subscription.subscription.planId)}
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Plan:</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold" data-testid="text-subscription-plan">
                {subscription.plan.name}
              </span>
              {getStatusBadge(subscription.subscription.status)}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span>Price:</span>
            <span className="font-semibold" data-testid="text-subscription-price">
              {formatPrice(subscription.plan.priceMonthly)}/month
            </span>
          </div>

          {subscription.subscription.currentPeriodEnd && (
            <div className="flex items-center justify-between">
              <span>Next billing:</span>
              <span data-testid="text-subscription-renewal">
                {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}

          {subscription.subscription.trialEnd && subscription.subscription.status === 'trial' && (
            <div className="flex items-center justify-between">
              <span>Trial ends:</span>
              <span data-testid="text-trial-end">
                {new Date(subscription.subscription.trialEnd).toLocaleDateString()}
              </span>
            </div>
          )}

          {subscription.subscription.cancelAtPeriodEnd && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded">
              <p className="text-sm text-orange-800">
                Your subscription will be canceled at the end of the current billing period.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Features */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {subscription.plan.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SMS Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-500" />
            SMS Usage
          </CardTitle>
          <CardDescription>
            Track your monthly SMS notifications to customers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {smsLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="h-2 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
          ) : smsUsage ? (
            <>
              <div className="flex items-center justify-between">
                <span>This month ({smsUsage.month}):</span>
                <span className="font-semibold" data-testid="text-sms-usage">
                  {smsUsage.usage} / {smsUsage.quota} SMS
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Usage</span>
                  <span>{smsUsage.usagePercentage}%</span>
                </div>
                <Progress 
                  value={smsUsage.usagePercentage} 
                  className="h-2"
                  data-testid="progress-sms-usage"
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Remaining:</span>
                <span className={`font-semibold ${smsUsage.remaining <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                  {smsUsage.remaining} SMS
                </span>
              </div>

              {smsUsage.quotaExceeded && (
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-800">SMS Quota Exceeded</p>
                      <p className="text-xs text-red-600">Upgrade your plan to send more SMS notifications</p>
                    </div>
                    <UpgradeModal currentPlan={subscription?.subscription.planId}>
                      <Button size="sm" variant="destructive" data-testid="button-upgrade-sms">
                        Upgrade Now
                      </Button>
                    </UpgradeModal>
                  </div>
                </div>
              )}

              {smsUsage.remaining <= 5 && smsUsage.remaining > 0 && !smsUsage.quotaExceeded && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-800">Low SMS Remaining</p>
                      <p className="text-xs text-orange-600">Consider upgrading to avoid interruptions</p>
                    </div>
                    <UpgradeModal currentPlan={subscription?.subscription.planId}>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700" data-testid="button-upgrade-sms-low">
                        Upgrade Plan
                      </Button>
                    </UpgradeModal>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">Unable to load SMS usage data</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <UpgradeModal currentPlan={subscription.subscription.planId}>
              <Button className="flex-1" data-testid="button-upgrade-plan">
                Upgrade Plan
              </Button>
            </UpgradeModal>
            
            {subscription.subscription.status === 'active' && !subscription.subscription.cancelAtPeriodEnd && (
              <Button
                variant="outline"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1"
                data-testid="button-cancel-subscription"
              >
                {cancelMutation.isPending ? "Canceling..." : "Cancel Subscription"}
              </Button>
            )}
          </div>
          
          <p className="text-xs text-gray-500">
            Changes to your subscription will be prorated and reflected in your next billing cycle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { handleSuccess, handleError } = usePackPurchase();
  const { data, isLoading } = useQuery({ queryKey: ["/api/me"], queryFn: meApi.get });

  const [profile, setProfile] = useState({ name: "", role: "", phone: "" });
  const [org, setOrg] = useState({ name: "", abn: "", street: "", suburb: "", state: "", postcode: "", invoice_terms: "", quote_terms: "", account_name: "", bsb: "", account_number: "" });
  
  // Item presets state
  const [presets, setPresets] = useState<any[]>([]);
  const [presetForm, setPresetForm] = useState({ name: "", unit: "0", tax: "10" });
  const [presetsLoading, setPresetsLoading] = useState(false);
  
  const [saving, setSaving] = useState(false);

  // Xero integration state and hooks
  const { data: xeroStatus, refetch: refetchXeroStatus } = useQuery<{
    connected: boolean;
    tenantName?: string;
    connectedAt?: string;
  }>({
    queryKey: ["/api/xero/status"],
    retry: false,
  });

  const connectXeroMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/xero/connect");
      const data = await response.json();
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error?.message || "Failed to connect to Xero",
        variant: "destructive",
      });
    },
  });

  const disconnectXeroMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/xero/disconnect"),
    onSuccess: () => {
      refetchXeroStatus();
      toast({
        title: "Disconnected",
        description: "Xero integration has been disconnected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to disconnect Xero",
        variant: "destructive",
      });
    },
  });

  // Check for Xero callback success/error in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('xero_success')) {
      const tenant = urlParams.get('tenant');
      toast({
        title: "Connected Successfully",
        description: tenant ? `Connected to Xero organization: ${tenant}` : "Connected to Xero successfully",
      });
      refetchXeroStatus();
      // Clean up URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('xero_error')) {
      const error = urlParams.get('xero_error');
      toast({
        title: "Connection Failed",
        description: error === 'invalid_code' ? "Invalid authorization code" :
                    error === 'session_expired' ? "Session expired, please try again" :
                    error === 'connection_failed' ? "Failed to establish connection" : "Unknown error occurred",
        variant: "destructive",
      });
      // Clean up URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, refetchXeroStatus]);


  useEffect(() => {
    if (!data) return;
    const u = data.user || {};
    const o = data.org || {};
    setProfile({ name: u.name || "", role: u.role || "", phone: u.phone || "" });
    setOrg({
      name: o.name || "", abn: o.abn || "", street: o.street || "", suburb: o.suburb || "",
      state: o.state || "", postcode: o.postcode || "", invoice_terms: o.invoice_terms || "", quote_terms: o.quote_terms || "",
      account_name: o.account_name || "", bsb: o.bsb || "", account_number: o.account_number || ""
    });
  }, [data]);

  // Auto-save profile changes after a delay
  useEffect(() => {
    if (!data?.user) return; // Don't auto-save until initial data is loaded
    
    const timer = setTimeout(() => {
      const originalProfile = data.user || {};
      const hasChanges = profile.name !== (originalProfile.name || "") || 
                        profile.role !== (originalProfile.role || "") || 
                        profile.phone !== (originalProfile.phone || "");
      
      if (hasChanges && !saving) {
        saveProfile();
      }
    }, 1000); // Auto-save 1 second after changes

    return () => clearTimeout(timer);
  }, [profile, data?.user, saving]);

  // Removed auto-save for organization to prevent infinite loops

  async function saveProfile() {
    setSaving(true);
    try {
      await meApi.updateProfile({
        name: profile.name || null,
        role: profile.role || null,
        phone: profile.phone || null
      });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }
  
  
  async function saveOrg() {
    setSaving(true);
    try {
      await meApi.updateOrg({
        name: org.name || null,
        abn: org.abn || null,
        street: org.street || null,
        suburb: org.suburb || null,
        state: org.state || null,
        postcode: org.postcode || null,
        invoice_terms: org.invoice_terms || null,
        quote_terms: org.quote_terms || null,
        account_name: org.account_name || null,
        bsb: org.bsb || null,
        account_number: org.account_number || null
      });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Organisation updated",
        description: "Your organisation information has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update organisation",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Item presets functions
  async function loadPresets() {
    setPresetsLoading(true);
    try {
      const data = await itemPresetsApi.search("");
      setPresets(data || []);
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
    setPresetsLoading(false);
  }

  async function addPreset() {
    if (!presetForm.name.trim()) return;
    setSaving(true);
    try {
      await itemPresetsApi.create({
        name: presetForm.name.trim(),
        unit_amount: Number(presetForm.unit || 0),
        tax_rate: Number(presetForm.tax || 0),
      });
      setPresetForm({ name: "", unit: "0", tax: "10" });
      await loadPresets();
      toast({
        title: "Preset added",
        description: `${presetForm.name} has been added to your item presets.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create preset",
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  async function deletePreset(id: string, name: string) {
    if (!confirm(`Delete "${name}" preset? This cannot be undone.`)) return;
    
    setSaving(true);
    try {
      await itemPresetsApi.delete(id);
      await loadPresets();
      toast({
        title: "Preset deleted",
        description: `${name} has been removed from your item presets.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete preset",
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  // Load presets when component mounts
  useEffect(() => {
    loadPresets();
  }, []);

  // Handle URL parameters for pack purchase results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const packSuccess = params.get('pack_success');
    const packCanceled = params.get('pack_canceled');
    
    if (packSuccess === 'true') {
      handleSuccess();
      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('pack_success');
      window.history.replaceState({}, '', newUrl.toString());
    } else if (packCanceled === 'true') {
      handleError('Purchase was canceled. You can try again anytime.');
      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('pack_canceled');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [handleSuccess, handleError]);

  // Get the tab from URL parameter
  const getDefaultTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    return tabParam || 'profile';
  };

  if (isLoading) return <div className="p-6">Loading settings...</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-management">Settings</h1>

      <Tabs defaultValue={getDefaultTab()} className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 h-auto">
          <TabsTrigger value="profile" data-testid="tab-profile" className="text-xs px-2 py-2">Profile</TabsTrigger>
          <TabsTrigger value="org" data-testid="tab-organization" className="text-xs px-2 py-2">Org</TabsTrigger>
          <TabsTrigger value="terms" data-testid="tab-terms" className="text-xs px-2 py-2">T&C</TabsTrigger>
          <TabsTrigger value="items" data-testid="tab-items" className="text-xs px-2 py-2">Items</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations" className="text-xs px-2 py-2">Integrations</TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage" className="text-xs px-2 py-2">Usage</TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing" className="text-xs px-2 py-2">Billing</TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-subscription" className="text-xs px-2 py-2">Sub</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input 
                  value={profile.name} 
                  onChange={(e)=>setProfile(p=>({...p, name: e.target.value}))} 
                  data-testid="input-profile-name"
                />
              </div>
              <div>
                <Label>Role / Title</Label>
                <Input 
                  value={profile.role} 
                  onChange={(e)=>setProfile(p=>({...p, role: e.target.value}))} 
                  data-testid="input-profile-role"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input 
                  value={profile.phone} 
                  onChange={(e)=>setProfile(p=>({...p, phone: e.target.value}))} 
                  data-testid="input-profile-phone"
                />
              </div>
              <div className="md:col-span-2">
                <div className="grid grid-cols-1 max-w-md ml-auto">
                  <Button 
                    onClick={saveProfile} 
                    disabled={saving}
                    data-testid="button-save-profile"
                    className="w-full"
                  >
                    {saving ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organisation */}
        <TabsContent value="org" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Company name</Label>
                <Input 
                  value={org.name} 
                  onChange={(e)=>setOrg(o=>({...o, name: e.target.value}))} 
                  data-testid="input-org-name"
                />
              </div>
              <div>
                <Label>ABN / Company No</Label>
                <Input 
                  value={org.abn} 
                  onChange={(e)=>setOrg(o=>({...o, abn: e.target.value}))} 
                  data-testid="input-org-abn"
                />
              </div>
              <div>
                <Label>Street</Label>
                <Input 
                  value={org.street} 
                  onChange={(e)=>setOrg(o=>({...o, street: e.target.value}))} 
                  data-testid="input-org-street"
                />
              </div>
              <div>
                <Label>Suburb</Label>
                <Input 
                  value={org.suburb} 
                  onChange={(e)=>setOrg(o=>({...o, suburb: e.target.value}))} 
                  data-testid="input-org-suburb"
                />
              </div>
              <div>
                <Label>State</Label>
                <Input 
                  value={org.state} 
                  onChange={(e)=>setOrg(o=>({...o, state: e.target.value}))} 
                  data-testid="input-org-state"
                />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input 
                  value={org.postcode} 
                  onChange={(e)=>setOrg(o=>({...o, postcode: e.target.value}))} 
                  data-testid="input-org-postcode"
                />
              </div>
              
              {/* Payment Details Section */}
              <div className="md:col-span-2">
                <h3 className="font-medium text-gray-900 mb-3 border-t pt-4">Payment Details (for Invoices)</h3>
              </div>
              <div>
                <Label>Account Name</Label>
                <Input 
                  value={org.account_name} 
                  onChange={(e)=>setOrg(o=>({...o, account_name: e.target.value}))} 
                  placeholder="Business Account Name"
                  data-testid="input-org-account-name"
                />
              </div>
              <div>
                <Label>BSB</Label>
                <Input 
                  value={org.bsb} 
                  onChange={(e)=>setOrg(o=>({...o, bsb: e.target.value}))} 
                  placeholder="123-456"
                  data-testid="input-org-bsb"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Account Number</Label>
                <Input 
                  value={org.account_number} 
                  onChange={(e)=>setOrg(o=>({...o, account_number: e.target.value}))} 
                  placeholder="123456789"
                  data-testid="input-org-account-number"
                />
              </div>
              <div className="md:col-span-2">
                <div className="grid grid-cols-1 max-w-md ml-auto">
                  <Button 
                    onClick={saveOrg} 
                    disabled={saving}
                    data-testid="button-save-organization"
                    className="w-full"
                  >
                    {saving ? "Saving..." : "Save Organisation"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <p className="text-sm text-muted-foreground">
                Connect your accounting software to sync quotes and invoices
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Xero Integration */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm">
                      X
                    </div>
                    <div>
                      <h3 className="font-medium">Xero</h3>
                      <p className="text-sm text-muted-foreground">
                        Sync quotes and invoices to your Xero accounting
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {xeroStatus?.connected ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {xeroStatus?.connected ? (
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="text-green-600 font-medium">✓ Connected</p>
                      <p className="text-muted-foreground">
                        Organisation: {xeroStatus.tenantName}
                      </p>
                      {xeroStatus.connectedAt && (
                        <p className="text-xs text-muted-foreground">
                          Connected {new Date(xeroStatus.connectedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <Button
                        variant="outline"
                        onClick={() => disconnectXeroMutation.mutate()}
                        disabled={disconnectXeroMutation.isPending}
                        data-testid="button-disconnect-xero"
                        className="w-full"
                      >
                        {disconnectXeroMutation.isPending ? "Disconnecting..." : "Disconnect"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open('https://my.xero.com', '_blank')}
                        data-testid="button-xero-dashboard"
                        className="w-full"
                      >
                        Open Xero <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Connect to automatically create quotes and invoices in Xero as drafts
                    </p>
                    <Button
                      onClick={() => connectXeroMutation.mutate()}
                      disabled={connectXeroMutation.isPending}
                      data-testid="button-connect-xero"
                    >
                      {connectXeroMutation.isPending ? "Connecting..." : "Connect to Xero"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Coming Soon */}
              <div className="border border-dashed rounded-lg p-4 text-center text-muted-foreground">
                <p className="text-sm">More integrations coming soon...</p>
                <p className="text-xs mt-1">QuickBooks, MYOB, and more</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Terms & Conditions */}
        <TabsContent value="terms" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Default Terms & Conditions</CardTitle>
              <CardDescription>Set default terms that will automatically appear on new quotes and invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-sm font-medium">Quote Terms</Label>
                <textarea 
                  value={org.quote_terms} 
                  onChange={(e) => setOrg(o => ({ ...o, quote_terms: e.target.value }))}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  rows={6}
                  placeholder="Default terms for quotes - e.g., validity period, payment terms..."
                  data-testid="textarea-quote-terms"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Invoice Terms</Label>
                <textarea 
                  value={org.invoice_terms} 
                  onChange={(e) => setOrg(o => ({ ...o, invoice_terms: e.target.value }))}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  rows={6}
                  placeholder="Default terms for invoices - e.g., payment due dates, late fees, conditions..."
                  data-testid="textarea-invoice-terms"
                />
              </div>
              <Button 
                onClick={saveOrg} 
                disabled={saving}
                data-testid="button-save-terms"
              >
                {saving ? "Saving..." : "Save Terms"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage */}
        <TabsContent value="usage" className="mt-4">
          <UsageTab />
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing" className="mt-4">
          <div className="space-y-6">
            {/* Header */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-500" />
                  Billing & Pack Purchases
                </CardTitle>
                <CardDescription>
                  Purchase communication packs to extend your SMS and email allowances
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Quick Purchase Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-green-500" />
                  Purchase Communication Packs
                </CardTitle>
                <CardDescription>
                  Top up your account with additional SMS and email credits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-green-500" />
                      SMS Packs
                    </h4>
                    <p className="text-sm text-gray-600">
                      Send notifications, confirmations, and updates to customers
                    </p>
                    <PackSelectionModal initialType="sms">
                      <Button className="w-full" data-testid="button-buy-sms-packs">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Buy SMS Packs
                      </Button>
                    </PackSelectionModal>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-purple-500" />
                      Email Packs
                    </h4>
                    <p className="text-sm text-gray-600">
                      Send invoices, quotes, and follow-up communications
                    </p>
                    <PackSelectionModal initialType="email">
                      <Button className="w-full" data-testid="button-buy-email-packs">
                        <Mail className="w-4 h-4 mr-2" />
                        Buy Email Packs
                      </Button>
                    </PackSelectionModal>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <PackSelectionModal>
                    <Button variant="outline" className="w-full" data-testid="button-view-all-packs">
                      <Package className="w-4 h-4 mr-2" />
                      View All Pack Options
                    </Button>
                  </PackSelectionModal>
                </div>
              </CardContent>
            </Card>

            {/* Purchased Packs Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  Your Purchased Packs
                </CardTitle>
                <CardDescription>
                  View and manage your active communication packs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PurchasedPacksList />
              </CardContent>
            </Card>

            {/* Billing Information */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Information</CardTitle>
                <CardDescription>
                  Pack purchase details and security
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Secure Payments</div>
                      <div className="text-gray-600">Processed by Stripe</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <CreditCard className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Instant Activation</div>
                      <div className="text-gray-600">Credits available immediately</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                    <Star className="w-5 h-5 text-purple-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium">Never Expire</div>
                      <div className="text-gray-600">Use credits anytime</div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t text-xs text-gray-500">
                  <p>
                    <strong>How it works:</strong> Purchase packs to add credits to your account. 
                    Credits are automatically used when you send SMS or emails, starting with the oldest packs first. 
                    All packs include GST and are processed securely through Stripe.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscription */}
        <TabsContent value="subscription" className="mt-4">
          <SubscriptionTab />
        </TabsContent>

        {/* Items */}
        <TabsContent value="items" className="mt-4">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Item Preset</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-3 max-w-3xl">
                  <Input 
                    placeholder="Name (e.g., Labour)" 
                    value={presetForm.name} 
                    onChange={e=>setPresetForm(p=>({...p, name: e.target.value}))}
                    data-testid="input-preset-name"
                  />
                  <Input 
                    placeholder="Unit $" 
                    inputMode="decimal" 
                    value={presetForm.unit} 
                    onChange={e=>setPresetForm(p=>({...p, unit: e.target.value}))}
                    data-testid="input-preset-unit"
                  />
                  <Input 
                    placeholder="Tax %" 
                    inputMode="decimal" 
                    value={presetForm.tax} 
                    onChange={e=>setPresetForm(p=>({...p, tax: e.target.value}))}
                    data-testid="input-preset-tax"
                  />
                  <Button 
                    onClick={addPreset} 
                    disabled={saving || !presetForm.name.trim()}
                    data-testid="button-add-preset"
                  >
                    {saving ? "Adding..." : "Add / Update"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Item Presets</CardTitle>
              </CardHeader>
              <CardContent>
                {presetsLoading ? (
                  <div className="text-center py-4">Loading presets...</div>
                ) : (
                  <div className="max-w-3xl overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                          <th className="px-3 py-2 text-right font-medium">Tax %</th>
                          <th className="px-3 py-2 text-center font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {presets.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                              No presets yet. Add some common items above to speed up billing.
                            </td>
                          </tr>
                        ) : (
                          presets.map((p:any)=>(
                            <tr key={p.id} className="border-b dark:border-gray-700" data-testid={`row-preset-${p.name.toLowerCase().replace(/\s+/g, '-')}`}>
                              <td className="px-3 py-2 font-medium">{p.name}</td>
                              <td className="px-3 py-2 text-right font-mono">${Number(p.unit_amount).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono">{Number(p.tax_rate).toFixed(2)}%</td>
                              <td className="px-3 py-2 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deletePreset(p.id, p.name)}
                                  disabled={saving}
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  data-testid={`button-delete-preset-${p.name.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}