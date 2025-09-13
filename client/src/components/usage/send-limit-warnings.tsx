import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/subscription/upgrade-modal";
import { useUsageAlerts, UsageData } from "@/components/usage/usage-alerts";
import { AlertTriangle, MessageCircle, Mail, TrendingUp } from "lucide-react";

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

// SMS Send Limit Warning Component
interface SmsLimitWarningProps {
  onProceed?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function SmsLimitWarning({ onProceed, disabled, children }: SmsLimitWarningProps) {
  const { data: usageData, isLoading, error } = useQuery({
    queryKey: ["/api/usage"],
    staleTime: 30000, // 30 seconds cache for send flows
  });

  const { alerts } = useUsageAlerts(isValidUsageData(usageData) ? usageData : undefined);

  // Find SMS-related alerts
  const smsAlerts = alerts.filter(alert => alert.type === 'sms');
  const criticalSmsAlerts = smsAlerts.filter(alert => alert.severity === 'critical');
  const warningSmsAlerts = smsAlerts.filter(alert => 
    alert.severity === 'warning' || alert.severity === 'error'
  );

  // Don't show warnings while loading
  if (isLoading || error || !usageData || !isValidUsageData(usageData)) {
    return <>{children}</>;
  }

  const { sms, planId } = usageData;

  // Block sending if quota exceeded
  if (criticalSmsAlerts.length > 0) {
    return (
      <div className="space-y-3" data-testid="sms-limit-critical">
        <Alert className="border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-red-800">SMS Quota Exceeded</div>
            <div className="text-sm text-red-700">
              You've reached your limit of {sms.quota} SMS messages this month. 
              Upgrade your plan to continue sending notifications.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <UpgradeModal currentPlan={planId}>
                <Button size="sm" variant="destructive" data-testid="button-upgrade-sms-critical">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Upgrade Now
                </Button>
              </UpgradeModal>
            </div>
          </AlertDescription>
        </Alert>
        {/* Disable the send action */}
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  // Show warning if running low
  if (warningSmsAlerts.length > 0) {
    const alert = warningSmsAlerts[0]; // Get the most critical warning
    return (
      <div className="space-y-3" data-testid="sms-limit-warning">
        <Alert className="border-orange-400 bg-orange-50">
          <MessageCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-orange-800">{alert.title}</div>
            <div className="text-sm text-orange-700">
              {sms.remaining <= 5 ? (
                `Only ${sms.remaining} SMS remaining this month. Consider upgrading to avoid interruption.`
              ) : (
                `You've used ${Math.round(sms.percent)}% of your SMS quota (${sms.used}/${sms.quota}). Upgrade for more messages.`
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <UpgradeModal currentPlan={planId}>
                <Button size="sm" variant="outline" data-testid="button-upgrade-sms-warning">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Upgrade Plan
                </Button>
              </UpgradeModal>
              {onProceed && (
                <Button 
                  size="sm" 
                  variant="default" 
                  onClick={onProceed}
                  disabled={disabled}
                  data-testid="button-proceed-sms"
                >
                  Send Anyway
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
        {!onProceed && children}
      </div>
    );
  }

  // No alerts, show normal content
  return <>{children}</>;
}

// Email Send Limit Warning Component
interface EmailLimitWarningProps {
  onProceed?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function EmailLimitWarning({ onProceed, disabled, children }: EmailLimitWarningProps) {
  const { data: usageData, isLoading, error } = useQuery({
    queryKey: ["/api/usage"],
    staleTime: 30000, // 30 seconds cache for send flows
  });

  const { alerts } = useUsageAlerts(isValidUsageData(usageData) ? usageData : undefined);

  // Find email-related alerts
  const emailAlerts = alerts.filter(alert => alert.type === 'email');
  const criticalEmailAlerts = emailAlerts.filter(alert => alert.severity === 'critical');
  const warningEmailAlerts = emailAlerts.filter(alert => 
    alert.severity === 'warning' || alert.severity === 'error'
  );

  // Don't show warnings while loading
  if (isLoading || error || !usageData || !isValidUsageData(usageData)) {
    return <>{children}</>;
  }

  const { email, planId } = usageData;

  // Block sending if quota exceeded
  if (criticalEmailAlerts.length > 0) {
    return (
      <div className="space-y-3" data-testid="email-limit-critical">
        <Alert className="border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-red-800">Email Quota Exceeded</div>
            <div className="text-sm text-red-700">
              You've reached your limit of {email.quota} emails this month. 
              Upgrade your plan to continue sending notifications.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <UpgradeModal currentPlan={planId}>
                <Button size="sm" variant="destructive" data-testid="button-upgrade-email-critical">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Upgrade Now
                </Button>
              </UpgradeModal>
            </div>
          </AlertDescription>
        </Alert>
        {/* Disable the send action */}
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  // Show warning if running low
  if (warningEmailAlerts.length > 0) {
    const alert = warningEmailAlerts[0]; // Get the most critical warning
    return (
      <div className="space-y-3" data-testid="email-limit-warning">
        <Alert className="border-orange-400 bg-orange-50">
          <Mail className="h-4 w-4 text-orange-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-orange-800">{alert.title}</div>
            <div className="text-sm text-orange-700">
              {email.remaining <= 10 ? (
                `Only ${email.remaining} emails remaining this month. Consider upgrading to avoid interruption.`
              ) : (
                `You've used ${Math.round(email.percent)}% of your email quota (${email.used}/${email.quota}). Upgrade for more messages.`
              )}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <UpgradeModal currentPlan={planId}>
                <Button size="sm" variant="outline" data-testid="button-upgrade-email-warning">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Upgrade Plan
                </Button>
              </UpgradeModal>
              {onProceed && (
                <Button 
                  size="sm" 
                  variant="default" 
                  onClick={onProceed}
                  disabled={disabled}
                  data-testid="button-proceed-email"
                >
                  Send Anyway
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
        {!onProceed && children}
      </div>
    );
  }

  // No alerts, show normal content
  return <>{children}</>;
}