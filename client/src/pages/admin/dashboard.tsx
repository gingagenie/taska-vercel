import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  DollarSign, 
  Users, 
  TrendingDown, 
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Activity,
  Clock
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface DashboardMetrics {
  mrr: {
    amount_aud: number;
    active_subscriptions: number;
  };
  organizations: {
    active_count: number;
    total_count: number;
  };
  churn: {
    rate_30_day_percent: number;
    churned_last_30: number;
    total_churned: number;
  };
  subscription_breakdown: Array<{
    status: string;
    count: number;
    revenue_aud: number;
  }>;
  recent_activity: Array<{
    date: string;
    new_organizations: number;
  }>;
  support: {
    open_tickets: number;
    resolved_this_week: number;
    total_tickets: number;
  };
  generated_at: string;
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  data: any;
}

interface AlertsResponse {
  alerts: Alert[];
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  generated_at: string;
}

export default function AdminDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch dashboard metrics
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<DashboardMetrics>({
    queryKey: ['/api/admin/dashboard'],
    refetchInterval: autoRefresh ? 30000 : false, // Auto refresh every 30 seconds if enabled
  });

  // Fetch alerts
  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<AlertsResponse>({
    queryKey: ['/api/admin/alerts'],
    refetchInterval: autoRefresh ? 60000 : false, // Auto refresh every minute if enabled
  });

  // Manual refresh all data
  const handleRefresh = () => {
    refetchMetrics();
    refetchAlerts();
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

  if (metricsLoading || alertsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  const alerts = alertsData?.alerts || [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900" data-testid="title-admin-dashboard">
                Taska Admin Portal
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Business oversight and subscription management</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center justify-between sm:justify-start gap-3">
                <label className="text-sm text-gray-600">Auto Refresh</label>
                <Button
                  variant={autoRefresh ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="h-9"
                  data-testid="button-auto-refresh"
                >
                  <Clock className="w-4 h-4 mr-1" />
                  {autoRefresh ? 'ON' : 'OFF'}
                </Button>
              </div>
              
              <Button 
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="h-9 w-full sm:w-auto"
                data-testid="button-refresh-dashboard"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {metrics && (
            <p className="text-xs sm:text-sm text-gray-500 mt-2">
              Last updated: {formatDate(metrics.generated_at)}
            </p>
          )}
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Business Alerts</h2>
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <Alert 
                  key={index} 
                  className={alert.severity === 'critical' ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'}
                  data-testid={`alert-${alert.type}`}
                >
                  <AlertTriangle className={`h-4 w-4 ${alert.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'}`} />
                  <AlertDescription>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <strong className="font-medium text-sm sm:text-base">{alert.title}</strong>
                        <p className="text-xs sm:text-sm mt-1">{alert.message}</p>
                      </div>
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="self-start sm:self-auto">
                        {alert.severity}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* MRR Card */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Monthly Recurring Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 mt-1" data-testid="text-mrr-amount">
                  {formatCurrency(metrics?.mrr.amount_aud || 0)}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  {metrics?.mrr.active_subscriptions || 0} active subscriptions
                </p>
              </div>
              <DollarSign className="w-8 h-8 sm:w-10 sm:h-10 text-green-600 flex-shrink-0" />
            </div>
          </Card>

          {/* Active Organizations */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Active Organizations</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-1" data-testid="text-active-orgs">
                  {metrics?.organizations.active_count || 0}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  of {metrics?.organizations.total_count || 0} total
                </p>
              </div>
              <Users className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600 flex-shrink-0" />
            </div>
          </Card>

          {/* Churn Rate */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">30-Day Churn Rate</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600 mt-1" data-testid="text-churn-rate">
                  {metrics?.churn.rate_30_day_percent || 0}%
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  {metrics?.churn.churned_last_30 || 0} churned last 30 days
                </p>
              </div>
              <TrendingDown className="w-8 h-8 sm:w-10 sm:h-10 text-red-600 flex-shrink-0" />
            </div>
          </Card>

          {/* Support Tickets */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Open Support Tickets</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600 mt-1" data-testid="text-open-tickets">
                  {metrics?.support.open_tickets || 0}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                  {metrics?.support.resolved_this_week || 0} resolved this week
                </p>
              </div>
              <Activity className="w-8 h-8 sm:w-10 sm:h-10 text-orange-600 flex-shrink-0" />
            </div>
          </Card>
        </div>

        {/* Subscription Breakdown and Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Subscription Status Breakdown */}
          <Card className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Subscription Breakdown
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {metrics?.subscription_breakdown.map((sub, index) => (
                <div key={index} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <Badge 
                      variant={sub.status === 'active' ? 'default' : 
                               sub.status === 'trial' ? 'secondary' : 
                               'destructive'}
                      className="self-start"
                    >
                      {sub.status}
                    </Badge>
                    <span className="text-sm sm:text-base font-medium">{sub.count} organizations</span>
                  </div>
                  <span className="text-green-600 font-semibold text-sm sm:text-base">
                    {formatCurrency(sub.revenue_aud)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent Growth Activity */}
          <Card className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Recent Growth (Last 7 Days)
            </h3>
            <div className="space-y-2 sm:space-y-3">
              {metrics?.recent_activity.slice(0, 7).map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-2 border-b border-gray-100 last:border-b-0">
                  <span className="text-xs sm:text-sm text-gray-600">
                    {formatDate(activity.date)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium">
                      {activity.new_organizations} new org{activity.new_organizations !== 1 ? 's' : ''}
                    </span>
                    {activity.new_organizations > 0 && (
                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                        +{activity.new_organizations}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Button 
              variant="outline" 
              className="h-14 sm:h-16 flex-col p-3"
              onClick={() => window.location.href = '/admin/organizations'}
              data-testid="button-manage-organizations"
            >
              <Users className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
              <span className="text-sm sm:text-base">Manage Organizations</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-14 sm:h-16 flex-col p-3"
              onClick={() => window.location.href = '/admin/analytics'}
              data-testid="button-view-analytics"
            >
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
              <span className="text-sm sm:text-base">View Analytics</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-14 sm:h-16 flex-col p-3"
              disabled
              data-testid="button-system-settings"
            >
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
              <span className="text-sm sm:text-base">System Settings</span>
              <span className="text-xs text-gray-500">(Coming Soon)</span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}