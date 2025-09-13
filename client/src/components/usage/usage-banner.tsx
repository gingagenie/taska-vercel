import { useQuery } from "@tanstack/react-query";
import { useUsageAlerts, UsageAlertList, UsageData } from "@/components/usage/usage-alerts";

// Type guard to check if usageData has the expected structure
const isValidUsageData = (data: any): data is UsageData => {
  return data && 
         data.users && typeof data.users.used === 'number' && typeof data.users.quota === 'number' &&
         data.sms && typeof data.sms.used === 'number' && typeof data.sms.quota === 'number' &&
         data.email && typeof data.email.used === 'number' && typeof data.email.quota === 'number' &&
         typeof data.periodEnd === 'string' &&
         typeof data.planId === 'string' &&
         typeof data.subscriptionStatus === 'string';
};

// Global Usage Banner Component for Critical Alerts
export function UsageBanner() {
  const { data: usageData, isLoading, error } = useQuery({
    queryKey: ["/api/usage"],
    refetchOnWindowFocus: true,
    staleTime: 60000, // Refresh every minute
    refetchInterval: 60000, // Auto-refresh every minute
    refetchIntervalInBackground: true, // Continue refreshing in background
  });

  // Get smart alerts for usage data
  const { alerts, dismissAlert } = useUsageAlerts(isValidUsageData(usageData) ? usageData : undefined);

  // Only show critical and error-level alerts in the global banner
  const globalAlerts = alerts.filter(alert => 
    alert.severity === 'critical' || alert.severity === 'error'
  );

  // Don't render anything if loading, error, or no critical alerts
  if (isLoading || error || !usageData || !isValidUsageData(usageData) || globalAlerts.length === 0) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6" data-testid="usage-banner-global">
      <UsageAlertList
        alerts={globalAlerts}
        currentPlan={usageData.planId}
        onDismiss={dismissAlert}
        variant="full"
        maxAlerts={2} // Only show top 2 most critical alerts in global banner
        showUpgrade={true}
      />
    </div>
  );
}