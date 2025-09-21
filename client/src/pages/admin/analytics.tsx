import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign,
  Calendar,
  RefreshCw,
  Download,
  AlertTriangle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface AnalyticsData {
  customer_lifetime_value: {
    average_clv_aud: number;
    total_organizations: number;
  };
  usage_trends: Array<{
    week: string;
    avg_sms_per_week: number;
    avg_emails_per_week: number;
    active_organizations: number;
  }>;
  support_correlation: {
    total_tickets: number;
    churned_organizations: number;
    organizations_with_tickets: number;
    churn_rate_with_tickets: number;
  };
  revenue_by_plan: Array<{
    plan_name: string;
    month: string;
    subscriptions: number;
    monthly_revenue_aud: number;
  }>;
  timeframe: string;
  generated_at: string;
}

export default function AnalyticsAdmin() {
  const [timeframe, setTimeframe] = useState("30d");

  // Fetch analytics data
  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics/overview', { timeframe }],
    queryFn: async () => {
      const response = await fetch(`/api/admin/analytics/overview?timeframe=${timeframe}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    }
  });

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

  const exportData = () => {
    if (!analytics) return;
    
    const dataStr = JSON.stringify(analytics, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taska-analytics-${timeframe}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Analytics Data</h3>
          <p className="text-gray-600">Unable to load analytics data at this time.</p>
          <Button onClick={() => refetch()} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Group revenue by plan for the chart
  const revenueByPlanSummary = analytics.revenue_by_plan.reduce((acc, item) => {
    if (!acc[item.plan_name]) {
      acc[item.plan_name] = {
        subscriptions: 0,
        revenue: 0
      };
    }
    acc[item.plan_name].subscriptions += item.subscriptions;
    acc[item.plan_name].revenue += item.monthly_revenue_aud;
    return acc;
  }, {} as Record<string, { subscriptions: number; revenue: number }>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="title-analytics">
              Business Analytics
            </h1>
            <p className="text-gray-600 mt-1">
              Customer insights and revenue analysis
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-48" data-testid="select-timeframe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            
            <Button variant="outline" onClick={exportData} data-testid="button-export">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        
        <p className="text-sm text-gray-500 mt-2">
          Last updated: {formatDate(analytics.generated_at)}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Average CLV */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Average Customer LTV</p>
              <p className="text-2xl font-bold text-green-600" data-testid="text-avg-clv">
                {formatCurrency(analytics.customer_lifetime_value.average_clv_aud)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {analytics.customer_lifetime_value.total_organizations} organizations
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </Card>

        {/* Usage Efficiency */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Weekly SMS Usage</p>
              <p className="text-2xl font-bold text-blue-600" data-testid="text-avg-sms">
                {Math.round(analytics.usage_trends[0]?.avg_sms_per_week || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                avg per active org
              </p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        {/* Support Correlation */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Support Tickets</p>
              <p className="text-2xl font-bold text-orange-600" data-testid="text-support-tickets">
                {analytics.support_correlation.total_tickets}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {analytics.support_correlation.organizations_with_tickets} orgs with tickets
              </p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-600" />
          </div>
        </Card>

        {/* Churn Correlation */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Churn Rate (w/ Support)</p>
              <p className="text-2xl font-bold text-red-600" data-testid="text-churn-with-support">
                {analytics.support_correlation.churn_rate_with_tickets}%
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {analytics.support_correlation.churned_organizations} churned
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-red-600" />
          </div>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Usage Trends */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Usage Trends (Weekly)
          </h3>
          <div className="space-y-4">
            {analytics.usage_trends.slice(0, 8).map((trend, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Week of {formatDate(trend.week)}</p>
                  <p className="text-xs text-gray-500">{trend.active_organizations} active orgs</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-blue-600">
                    {Math.round(trend.avg_sms_per_week)} SMS
                  </p>
                  <p className="text-xs text-gray-500">
                    {Math.round(trend.avg_emails_per_week)} emails
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue by Plan */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <DollarSign className="w-5 h-5 mr-2" />
            Revenue by Plan
          </h3>
          <div className="space-y-4">
            {Object.entries(revenueByPlanSummary).map(([planName, data]) => (
              <div key={planName} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant={
                    planName.toLowerCase().includes('enterprise') ? 'default' :
                    planName.toLowerCase().includes('pro') ? 'secondary' : 'outline'
                  }>
                    {planName}
                  </Badge>
                  <span className="text-sm font-medium">{data.subscriptions} subs</span>
                </div>
                <span className="text-green-600 font-semibold">
                  {formatCurrency(data.revenue)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Monthly Revenue Breakdown */}
      <Card className="p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2" />
          Monthly Revenue Breakdown (Last 6 Months)
        </h3>
        <div className="space-y-3">
          {analytics.revenue_by_plan
            .reduce((acc, item) => {
              const monthKey = formatDate(item.month);
              if (!acc[monthKey]) acc[monthKey] = [];
              acc[monthKey].push(item);
              return acc;
            }, {} as Record<string, typeof analytics.revenue_by_plan>)
            && Object.entries(
              analytics.revenue_by_plan.reduce((acc, item) => {
                const monthKey = formatDate(item.month);
                if (!acc[monthKey]) acc[monthKey] = [];
                acc[monthKey].push(item);
                return acc;
              }, {} as Record<string, typeof analytics.revenue_by_plan>)
            ).slice(0, 6).map(([month, plans]) => (
              <div key={month} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">{month}</h4>
                  <span className="text-lg font-semibold text-green-600">
                    {formatCurrency(plans.reduce((sum, plan) => sum + plan.monthly_revenue_aud, 0))}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {plans.map((plan, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        <Badge variant="outline" className="text-xs">{plan.plan_name}</Badge>
                        <p className="text-xs text-gray-500 mt-1">{plan.subscriptions} subs</p>
                      </div>
                      <span className="text-sm font-medium text-green-600">
                        {formatCurrency(plan.monthly_revenue_aud)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* Support Insights */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2" />
          Support & Churn Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {analytics.support_correlation.total_tickets}
            </p>
            <p className="text-sm text-gray-600">Total Support Tickets</p>
            <p className="text-xs text-gray-500 mt-1">(Last 90 days)</p>
          </div>
          
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">
              {analytics.support_correlation.organizations_with_tickets}
            </p>
            <p className="text-sm text-gray-600">Organizations with Tickets</p>
            <p className="text-xs text-gray-500 mt-1">Need attention</p>
          </div>
          
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              {analytics.support_correlation.churn_rate_with_tickets}%
            </p>
            <p className="text-sm text-gray-600">Churn Rate (with Tickets)</p>
            <p className="text-xs text-gray-500 mt-1">
              {analytics.support_correlation.churned_organizations} churned orgs
            </p>
          </div>
        </div>
        
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Insight:</strong> Organizations with support tickets show{' '}
            {analytics.support_correlation.churn_rate_with_tickets > 25 ? 'higher' : 'normal'} churn rates.
            Consider proactive support outreach for at-risk accounts.
          </p>
        </div>
      </Card>
    </div>
  );
}