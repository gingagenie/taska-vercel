import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi, itemPresetsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, AlertCircle, Trash2, Crown, Star, Zap,
  CreditCard, Users, Mail, BarChart3, ShoppingCart, Package, MessageCircle
} from "lucide-react";
import { useSubscription, useCancelSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "@/components/subscription/upgrade-modal";
import { Badge } from "@/components/ui/badge";
import { useSmsUsage } from "@/hooks/useSmsUsage";
import { Progress } from "@/components/ui/progress";
import { useUsageAlerts, UsageAlertList, UsageData } from "@/components/usage/usage-alerts";
import { PackSelectionModal } from "@/components/packs/PackSelectionModal";
import { PurchasedPacksList } from "@/components/packs/PurchasedPacksList";
import { usePackPurchase } from "@/hooks/usePackPurchase";

// ── Pack Usage Stats ─────────────────────────────────────────────
function PackUsageStats({ packType }: { packType?: 'sms' | 'email' }) {
  const queryParams = new URLSearchParams();
  if (packType) queryParams.append('packType', packType);
  const queryString = queryParams.toString();
  const endpoint = queryString ? `/api/usage/packs?${queryString}` : '/api/usage/packs';

  const { data: packsResponse, isLoading } = useQuery<{ data?: any[] }>({
    queryKey: [endpoint, 'stats', packType],
    staleTime: 2 * 60 * 1000,
  });

  const packs = packsResponse?.data || [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    );
  }

  const stats = [
    { label: 'Total Packs', value: packs.length, color: 'text-blue-600' },
    { label: 'Active Packs', value: packs.filter((p: any) => p.status === 'active').length, color: 'text-green-600' },
    { label: 'Total Credits', value: packs.reduce((s: number, p: any) => s + p.quantity, 0).toLocaleString(), color: 'text-purple-600' },
    { label: 'Available Credits', value: packs.reduce((s: number, p: any) => s + p.remainingQuantity, 0).toLocaleString(), color: 'text-orange-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500">{s.label}</div>
          <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Billing Tab ──────────────────────────────────────────────────
function BillingTab() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: smsUsage, isLoading: smsLoading } = useSmsUsage();
  const cancelMutation = useCancelSubscription();
  const [selectedPackType, setSelectedPackType] = useState<'all' | 'sms' | 'email'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'expired' | 'used_up'>('all');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const { data: usageData, isLoading: usageLoading, error: usageError } = useQuery<any>({
    queryKey: ["/api/usage"],
    refetchOnWindowFocus: true,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  const isValidUsageData = (data: any): data is {
    users: { used: number; quota: number; percent: number };
    sms: { used: number; quota: number; remaining: number; percent: number; quotaExceeded: boolean };
    email: { used: number; quota: number; remaining: number; percent: number; quotaExceeded: boolean };
    periodEnd: string; planId: string; subscriptionStatus: string;
  } => {
    return data &&
      data.users && typeof data.users.used === 'number' && typeof data.users.quota === 'number' &&
      data.sms && typeof data.sms.used === 'number' && typeof data.sms.quota === 'number' &&
      data.email && typeof data.email.used === 'number' && typeof data.email.quota === 'number' &&
      typeof data.periodEnd === 'string' && typeof data.planId === 'string' && typeof data.subscriptionStatus === 'string';
  };

  const pct = (p: number) => Math.round(p);
  const usageColor = (p: number, exceeded = false) =>
    exceeded || p >= 100 ? "text-red-600" : p >= 80 ? "text-orange-600" : "text-green-600";
  const progressColor = (p: number, exceeded = false) =>
    exceeded || p >= 100 ? "bg-red-500" : p >= 80 ? "bg-orange-500" : "bg-green-500";
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'solo': return <Star className="w-5 h-5 text-blue-500" />;
      case 'pro': return <Zap className="w-5 h-5 text-purple-500" />;
      case 'enterprise': return <Crown className="w-5 h-5 text-orange-500" />;
      default: return <CreditCard className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'trial': return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>;
      case 'past_due': return <Badge className="bg-red-100 text-red-800">Past Due</Badge>;
      case 'canceled': return <Badge className="bg-gray-100 text-gray-800">Canceled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const valid = usageData && isValidUsageData(usageData);

  return (
    <div className="space-y-6">

      {/* ── Current Plan ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {subscription ? getPlanIcon(subscription.subscription.planId) : <CreditCard className="w-5 h-5 text-gray-500" />}
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ) : !subscription ? (
            <p className="text-gray-500">Unable to load subscription information</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span>Plan:</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold" data-testid="text-subscription-plan">{subscription.plan.name}</span>
                  {getStatusBadge(subscription.subscription.status)}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Price:</span>
                <span className="font-semibold" data-testid="text-subscription-price">{formatPrice(subscription.plan.priceMonthly)}/month</span>
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
                  <p className="text-sm text-orange-800">Your subscription will be canceled at the end of the current billing period.</p>
                </div>
              )}
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-medium text-gray-700 mb-3">Plan Features</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {subscription.plan.features.map((feature: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <UpgradeModal currentPlan={subscription.subscription.planId}>
                  <Button className="flex-1" data-testid="button-upgrade-plan">Upgrade Plan</Button>
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
              <p className="text-xs text-gray-500">Changes will be prorated and reflected in your next billing cycle.</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Usage This Period ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            Usage This Period
          </CardTitle>
          {valid && <CardDescription>Resets {formatDate(usageData.periodEnd as string)}</CardDescription>}
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-gray-200 rounded" />)}
            </div>
          ) : !valid ? (
            <div className="flex items-center gap-2 text-gray-500">
              <AlertCircle className="w-5 h-5 text-red-400" />
              Unable to load usage information
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><Users className="w-4 h-4 text-blue-500" />Team Members</span>
                  <span className={`font-semibold ${usageColor(usageData.users.percent)}`} data-testid="text-users-usage">
                    {usageData.users.used} / {usageData.users.quota}
                  </span>
                </div>
                <Progress value={Math.min(usageData.users.percent, 100)} className={`h-2 [&>div]:${progressColor(usageData.users.percent)}`} data-testid="progress-users-usage" />
                <p className="text-xs text-gray-500">{Math.max(0, usageData.users.quota - usageData.users.used)} slots remaining</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><MessageCircle className="w-4 h-4 text-green-500" />SMS</span>
                  <span className={`font-semibold ${usageColor(usageData.sms.percent, usageData.sms.quotaExceeded)}`} data-testid="text-sms-usage-detailed">
                    {usageData.sms.used} / {usageData.sms.quota}
                  </span>
                </div>
                <Progress value={Math.min(usageData.sms.percent, 100)} className={`h-2 [&>div]:${progressColor(usageData.sms.percent, usageData.sms.quotaExceeded)}`} data-testid="progress-sms-usage-detailed" />
                <div className="flex items-center justify-between">
                  <p className="text-xs">
                    <span className={`font-medium ${usageData.sms.remaining <= 5 ? 'text-red-600' : 'text-green-600'}`}>{usageData.sms.remaining} remaining</span>
                  </p>
                  {usageData.sms.quotaExceeded && (
                    <UpgradeModal currentPlan={subscription?.subscription.planId}>
                      <button className="text-xs text-blue-600 underline" data-testid="button-upgrade-sms">Upgrade plan</button>
                    </UpgradeModal>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><Mail className="w-4 h-4 text-purple-500" />Email</span>
                  <span className={`font-semibold ${usageColor(usageData.email.percent, usageData.email.quotaExceeded)}`} data-testid="text-email-usage">
                    {usageData.email.used} / {usageData.email.quota}
                  </span>
                </div>
                <Progress value={Math.min(usageData.email.percent, 100)} className={`h-2 [&>div]:${progressColor(usageData.email.percent, usageData.email.quotaExceeded)}`} data-testid="progress-email-usage" />
                <p className="text-xs">
                  <span className={`font-medium ${usageData.email.remaining <= 10 ? 'text-red-600' : 'text-green-600'}`}>{usageData.email.remaining} remaining</span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Communication Packs ── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-green-500" />
              Communication Packs
            </CardTitle>
            <PackSelectionModal open={showPurchaseModal} onOpenChange={setShowPurchaseModal}>
              <Button className="flex items-center gap-2 shrink-0" data-testid="button-buy-packs" onClick={() => setShowPurchaseModal(true)}>
                <ShoppingCart className="w-4 h-4" />
                Buy Packs
              </Button>
            </PackSelectionModal>
          </div>
          <CardDescription>Top up your SMS and email credits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-600">Type:</span>
              <div className="flex gap-1 flex-wrap">
                {(['all', 'sms', 'email'] as const).map(t => (
                  <Button key={t} variant={selectedPackType === t ? 'default' : 'outline'} size="sm"
                    onClick={() => setSelectedPackType(t)} data-testid={`filter-pack-type-${t}`}
                    className="flex items-center gap-1"
                  >
                    {t === 'sms' && <MessageCircle className="w-3 h-3" />}
                    {t === 'email' && <Mail className="w-3 h-3" />}
                    {t === 'all' ? 'All' : t.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              <div className="flex gap-1 flex-wrap">
                {(['all', 'active', 'expired', 'used_up'] as const).map(s => (
                  <Button key={s} variant={selectedStatus === s ? 'default' : 'outline'} size="sm"
                    onClick={() => setSelectedStatus(s)} data-testid={`filter-status-${s}`}
                  >
                    {s === 'used_up' ? 'Used Up' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <PackUsageStats packType={selectedPackType === 'all' ? undefined : selectedPackType} />
        </CardContent>
      </Card>

      <PurchasedPacksList
        status={selectedStatus === 'all' ? 'all' : selectedStatus}
        packType={selectedPackType === 'all' ? undefined : selectedPackType}
        className="space-y-4"
      />

      {/* ── Billing Info Footer ── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div><div className="font-medium">Secure Payments</div><div className="text-gray-500 text-xs">Processed by Stripe</div></div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <CreditCard className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div><div className="font-medium">Instant Activation</div><div className="text-gray-500 text-xs">Credits available immediately</div></div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <Star className="w-5 h-5 text-purple-500 flex-shrink-0" />
              <div><div className="font-medium">Never Expire</div><div className="text-gray-500 text-xs">Use credits anytime</div></div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

// ── Integrations Tab ─────────────────────────────────────────────
function IntegrationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  const { data: xeroStatus, isLoading: xeroLoading } = useQuery({
    queryKey: ["/api/xero/status"],
    refetchOnWindowFocus: true,
  });

  const { data: xeroAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/xero/accounts"],
    enabled: !!(xeroStatus as any)?.connected,
  });

  // Pre-select saved account when data loads
  useEffect(() => {
    const savedCode = (xeroStatus as any)?.paymentAccountCode;
    if (savedCode) setSelectedAccount(savedCode);
  }, [xeroStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xeroSuccess = params.get('xero_success');
    const xeroError = params.get('xero_error');
    const tenant = params.get('tenant');

    if (xeroSuccess === 'true') {
      toast({ title: "Xero connected!", description: `Connected to ${tenant || 'your Xero organisation'} successfully.` });
      qc.invalidateQueries({ queryKey: ["/api/xero/status"] });
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('xero_success');
      newUrl.searchParams.delete('tenant');
      window.history.replaceState({}, '', newUrl.toString());
    } else if (xeroError) {
      const messages: Record<string, string> = {
        invalid_code: 'Invalid authorisation code from Xero.',
        missing_org: 'Session expired. Please try again.',
        connection_failed: 'Failed to connect to Xero. Please try again.',
      };
      toast({ title: "Xero connection failed", description: messages[xeroError] || 'Something went wrong.', variant: "destructive" });
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('xero_error');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, []);

  async function connectXero() {
    setConnecting(true);
    try {
      const res = await fetch('/api/xero/connect', { credentials: 'include' });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error('No auth URL returned');
      }
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to initiate Xero connection", variant: "destructive" });
      setConnecting(false);
    }
  }

  async function disconnectXero() {
    if (!confirm('Disconnect Xero? This will stop syncing invoices and quotes.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/xero/disconnect', { method: 'DELETE', credentials: 'include' });
      qc.invalidateQueries({ queryKey: ["/api/xero/status"] });
      toast({ title: "Xero disconnected", description: "Your Xero integration has been removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to disconnect Xero", variant: "destructive" });
    }
    setDisconnecting(false);
  }

  async function savePaymentAccount() {
    if (!selectedAccount) return;
    setSavingAccount(true);
    try {
      const res = await fetch('/api/xero/payment-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accountCode: selectedAccount }),
      });
      if (!res.ok) throw new Error('Failed to save');
      qc.invalidateQueries({ queryKey: ["/api/xero/status"] });
      toast({ title: "Payment account saved", description: "Payments will be posted to this account in Xero." });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to save payment account", variant: "destructive" });
    }
    setSavingAccount(false);
  }

  const accounts = (xeroAccounts as any)?.accounts || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <img src="https://www.xero.com/favicon.ico" alt="Xero" className="w-5 h-5" />
            Xero Accounting
          </CardTitle>
          <CardDescription>Connect your Xero account to automatically sync invoices and quotes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {xeroLoading ? (
            <div className="animate-pulse h-10 bg-gray-200 rounded w-1/3" />
          ) : (xeroStatus as any)?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-800">Connected to Xero</p>
                  <p className="text-xs text-green-600">{(xeroStatus as any).tenantName}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" />Invoices sync to Xero as drafts</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" />Quotes sync to Xero as drafts</div>
              </div>

              {/* Payment account picker */}
              <div className="border rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Payment Account</p>
                  <p className="text-xs text-gray-500 mt-1">When you mark an invoice as paid in Taska, the payment will be posted to this account in Xero.</p>
                </div>
                {accountsLoading ? (
                  <div className="animate-pulse h-9 bg-gray-200 rounded" />
                ) : accounts.length === 0 ? (
                  <p className="text-sm text-gray-500">No bank accounts found in Xero.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedAccount}
                      onChange={e => setSelectedAccount(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a bank account...</option>
                      {accounts.map((a: any) => (
                        <option key={a.code} value={a.code}>
                          {a.name} ({a.code})
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={savePaymentAccount}
                      disabled={savingAccount || !selectedAccount}
                      size="sm"
                    >
                      {savingAccount ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
                {(xeroStatus as any)?.paymentAccountCode && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Payment account configured
                  </p>
                )}
              </div>

              <Button variant="outline" onClick={disconnectXero} disabled={disconnecting} className="text-red-600 border-red-200 hover:bg-red-50">
                {disconnecting ? "Disconnecting..." : "Disconnect Xero"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" />Auto-sync invoices to Xero</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" />Auto-sync quotes to Xero</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" />Customers matched automatically</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" />All amounts in AUD</div>
              </div>
              <Button onClick={connectXero} disabled={connecting} className="bg-[#13B5EA] hover:bg-[#0da0d4] text-white">
                {connecting ? "Connecting..." : "Connect to Xero"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Settings Page ───────────────────────────────────────────
export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { handleSuccess, handleError } = usePackPurchase();
  const { data, isLoading } = useQuery({ queryKey: ["/api/me"], queryFn: meApi.get });

  const [profile, setProfile] = useState({ name: "", role: "", phone: "" });
  const [org, setOrg] = useState({
    name: "", abn: "", street: "", suburb: "", state: "", postcode: "",
    invoice_terms: "", quote_terms: "", account_name: "", bsb: "", account_number: ""
  });
  const [presets, setPresets] = useState<any[]>([]);
  const [presetForm, setPresetForm] = useState({ name: "", unit: "0", tax: "10" });
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetSearch, setPresetSearch] = useState("");
  const [presetEditId, setPresetEditId] = useState<string | null>(null);
  const [presetEditForm, setPresetEditForm] = useState({ name: "", unit: "0", tax: "10" });

  const filteredPresets = presets.filter(p =>
    p.name.toLowerCase().includes(presetSearch.toLowerCase())
  );

  useEffect(() => {
    if (!data) return;
    const u = data.user || {};
    const o = data.org || {};
    setProfile({ name: u.name || "", role: u.role || "", phone: u.phone || "" });
    setOrg({
      name: o.name || "", abn: o.abn || "", street: o.street || "", suburb: o.suburb || "",
      state: o.state || "", postcode: o.postcode || "", invoice_terms: o.invoice_terms || "",
      quote_terms: o.quote_terms || "", account_name: o.account_name || "", bsb: o.bsb || "",
      account_number: o.account_number || ""
    });
  }, [data]);

  useEffect(() => {
    if (!data?.user) return;
    const timer = setTimeout(() => {
      const u = data.user || {};
      const hasChanges = profile.name !== (u.name || "") || profile.role !== (u.role || "") || profile.phone !== (u.phone || "");
      if (hasChanges && !saving) saveProfile();
    }, 1000);
    return () => clearTimeout(timer);
  }, [profile, data?.user, saving]);

  async function saveProfile() {
    setSaving(true);
    try {
      await meApi.updateProfile({ name: profile.name || null, role: profile.role || null, phone: profile.phone || null });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      toast({ title: "Profile updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to update profile", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function saveOrg() {
    setSaving(true);
    try {
      await meApi.updateOrg({
        name: org.name || null, abn: org.abn || null, street: org.street || null,
        suburb: org.suburb || null, state: org.state || null, postcode: org.postcode || null,
        invoice_terms: org.invoice_terms || null, quote_terms: org.quote_terms || null,
        account_name: org.account_name || null, bsb: org.bsb || null, account_number: org.account_number || null
      });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      toast({ title: "Organisation updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to update organisation", variant: "destructive" });
    } finally { setSaving(false); }
  }

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
      await itemPresetsApi.create({ name: presetForm.name.trim(), unit_amount: Number(presetForm.unit || 0), tax_rate: Number(presetForm.tax || 0) });
      setPresetForm({ name: "", unit: "0", tax: "10" });
      await loadPresets();
      toast({ title: "Preset added", description: `${presetForm.name} added.` });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to create preset", variant: "destructive" });
    }
    setSaving(false);
  }

  async function deletePreset(id: string, name: string) {
    if (!confirm(`Delete "${name}" preset? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await itemPresetsApi.delete(id);
      await loadPresets();
      toast({ title: "Preset deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to delete preset", variant: "destructive" });
    }
    setSaving(false);
  }

  async function savePresetEdit(id: string) {
    if (!presetEditForm.name.trim()) return;
    setSaving(true);
    try {
      await itemPresetsApi.update(id, { name: presetEditForm.name.trim(), unit_amount: Number(presetEditForm.unit || 0), tax_rate: Number(presetEditForm.tax || 0) });
      setPresetEditId(null);
      await loadPresets();
      toast({ title: "Preset updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to update preset", variant: "destructive" });
    }
    setSaving(false);
  }

  useEffect(() => { loadPresets(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const packSuccess = params.get('pack_success');
    const packCanceled = params.get('pack_canceled');
    if (packSuccess === 'true') {
      handleSuccess();
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('pack_success');
      window.history.replaceState({}, '', newUrl.toString());
    } else if (packCanceled === 'true') {
      handleError('Purchase was canceled. You can try again anytime.');
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('pack_canceled');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [handleSuccess, handleError]);

  const getDefaultTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tab') || 'profile';
  };

  if (isLoading) return <div className="p-6">Loading settings...</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-management">Settings</h1>

      <Tabs defaultValue={getDefaultTab()} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto gap-1">
          <TabsTrigger value="profile" data-testid="tab-profile" className="text-xs px-2 py-2">Profile</TabsTrigger>
          <TabsTrigger value="org" data-testid="tab-organization" className="text-xs px-2 py-2">Organisation</TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing" className="text-xs px-2 py-2">Billing</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations" className="text-xs px-2 py-2">Integrations</TabsTrigger>
          <TabsTrigger value="items" data-testid="tab-items" className="col-span-2 text-xs px-2 py-2">Items</TabsTrigger>
        </TabsList>

        {/* ── Profile ── */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} data-testid="input-profile-name" />
              </div>
              <div>
                <Label>Role / Title</Label>
                <Input value={profile.role} onChange={e => setProfile(p => ({ ...p, role: e.target.value }))} data-testid="input-profile-role" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} data-testid="input-profile-phone" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={saveProfile} disabled={saving} data-testid="button-save-profile">
                  {saving ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Organisation + T&C ── */}
        <TabsContent value="org" className="mt-4">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Company Name</Label><Input value={org.name} onChange={e => setOrg(o => ({ ...o, name: e.target.value }))} data-testid="input-org-name" /></div>
                <div><Label>ABN / Company No</Label><Input value={org.abn} onChange={e => setOrg(o => ({ ...o, abn: e.target.value }))} data-testid="input-org-abn" /></div>
                <div><Label>Street</Label><Input value={org.street} onChange={e => setOrg(o => ({ ...o, street: e.target.value }))} data-testid="input-org-street" /></div>
                <div><Label>Suburb</Label><Input value={org.suburb} onChange={e => setOrg(o => ({ ...o, suburb: e.target.value }))} data-testid="input-org-suburb" /></div>
                <div><Label>State</Label><Input value={org.state} onChange={e => setOrg(o => ({ ...o, state: e.target.value }))} data-testid="input-org-state" /></div>
                <div><Label>Postcode</Label><Input value={org.postcode} onChange={e => setOrg(o => ({ ...o, postcode: e.target.value }))} data-testid="input-org-postcode" /></div>
                <div className="md:col-span-2 border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-4">Payment Details (for Invoices)</h3>
                </div>
                <div><Label>Account Name</Label><Input value={org.account_name} onChange={e => setOrg(o => ({ ...o, account_name: e.target.value }))} placeholder="Business Account Name" data-testid="input-org-account-name" /></div>
                <div><Label>BSB</Label><Input value={org.bsb} onChange={e => setOrg(o => ({ ...o, bsb: e.target.value }))} placeholder="123-456" data-testid="input-org-bsb" /></div>
                <div className="md:col-span-2">
                  <Label>Account Number</Label>
                  <Input value={org.account_number} onChange={e => setOrg(o => ({ ...o, account_number: e.target.value }))} placeholder="123456789" data-testid="input-org-account-number" />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={saveOrg} disabled={saving} data-testid="button-save-organization">
                    {saving ? "Saving..." : "Save Organisation"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Default Terms &amp; Conditions</CardTitle>
                <CardDescription>Automatically added to new quotes and invoices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Quote Terms</Label>
                  <textarea
                    value={org.quote_terms}
                    onChange={e => setOrg(o => ({ ...o, quote_terms: e.target.value }))}
                    className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    rows={5}
                    placeholder="Default terms for quotes..."
                    data-testid="textarea-quote-terms"
                  />
                </div>
                <div>
                  <Label>Invoice Terms</Label>
                  <textarea
                    value={org.invoice_terms}
                    onChange={e => setOrg(o => ({ ...o, invoice_terms: e.target.value }))}
                    className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    rows={5}
                    placeholder="Default terms for invoices..."
                    data-testid="textarea-invoice-terms"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveOrg} disabled={saving} data-testid="button-save-terms">
                    {saving ? "Saving..." : "Save Terms"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Items ── */}
        <TabsContent value="items" className="mt-4">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Add Item Preset</CardTitle></CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-3 max-w-3xl">
                  <Input placeholder="Name (e.g., Labour)" value={presetForm.name} onChange={e => setPresetForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && addPreset()} data-testid="input-preset-name" />
                  <Input placeholder="Unit $" inputMode="decimal" value={presetForm.unit} onChange={e => setPresetForm(p => ({ ...p, unit: e.target.value }))} data-testid="input-preset-unit" />
                  <Input placeholder="Tax %" inputMode="decimal" value={presetForm.tax} onChange={e => setPresetForm(p => ({ ...p, tax: e.target.value }))} data-testid="input-preset-tax" />
                  <Button onClick={addPreset} disabled={saving || !presetForm.name.trim()} data-testid="button-add-preset">
                    {saving ? "Adding..." : "Add"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  Item Presets
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({filteredPresets.length}{presetSearch ? ` of ${presets.length}` : ""})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3">
                  <Input placeholder="Search presets…" value={presetSearch} onChange={e => setPresetSearch(e.target.value)} className="max-w-xs" />
                </div>
                {presetsLoading ? (
                  <div className="text-center py-4">Loading presets...</div>
                ) : (
                  <div className="max-w-3xl rounded-md border">
                    <div className="overflow-y-auto max-h-[420px]">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Name</th>
                            <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                            <th className="px-3 py-2 text-right font-medium">Tax %</th>
                            <th className="px-3 py-2 text-center font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPresets.length === 0 ? (
                            <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                              {presetSearch ? `No presets matching "${presetSearch}"` : "No presets yet. Add common items above to speed up billing."}
                            </td></tr>
                          ) : filteredPresets.map((p: any) =>
                            presetEditId === p.id ? (
                              <tr key={p.id} className="border-b bg-blue-50">
                                <td className="px-2 py-1"><Input value={presetEditForm.name} onChange={e => setPresetEditForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" autoFocus /></td>
                                <td className="px-2 py-1"><Input value={presetEditForm.unit} onChange={e => setPresetEditForm(f => ({ ...f, unit: e.target.value }))} inputMode="decimal" className="h-8 text-sm text-right" /></td>
                                <td className="px-2 py-1"><Input value={presetEditForm.tax} onChange={e => setPresetEditForm(f => ({ ...f, tax: e.target.value }))} inputMode="decimal" className="h-8 text-sm text-right" /></td>
                                <td className="px-2 py-1 text-center">
                                  <div className="flex gap-1 justify-center">
                                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => savePresetEdit(p.id)} disabled={saving}>{saving ? "…" : "Save"}</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPresetEditId(null)}>Cancel</Button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr key={p.id} className="border-b hover:bg-gray-50"
                                data-testid={`row-preset-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                                onDoubleClick={() => { setPresetEditId(p.id); setPresetEditForm({ name: p.name, unit: String(p.unit_amount), tax: String(p.tax_rate) }); }}
                              >
                                <td className="px-3 py-2 font-medium">{p.name}</td>
                                <td className="px-3 py-2 text-right font-mono">${Number(p.unit_amount).toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-mono">{Number(p.tax_rate).toFixed(2)}%</td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex gap-1 justify-center">
                                    <button
                                      onClick={() => { setPresetEditId(p.id); setPresetEditForm({ name: p.name, unit: String(p.unit_amount), tax: String(p.tax_rate) }); }}
                                      className="text-xs text-blue-500 hover:text-blue-700 px-1" title="Edit"
                                    >✏️</button>
                                    <Button variant="ghost" size="sm" onClick={() => deletePreset(p.id, p.name)} disabled={saving}
                                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      data-testid={`button-delete-preset-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Billing ── */}
        <TabsContent value="billing" className="mt-4">
          <BillingTab />
        </TabsContent>

        {/* ── Integrations ── */}
        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
