import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/subscription/upgrade-modal";
import { PackSelectionModal } from "@/components/packs/PackSelectionModal";
import { useUsageAlerts, UsageData } from "@/components/usage/usage-alerts";
import { AlertTriangle, MessageCircle, Mail, TrendingUp, ShoppingCart } from "lucide-react";

// Type guard to check if usageData has the expected structure
const isValidUsageData = (data: any): data is UsageData => {
  return data && 
         data.users && typeof data.users.used === 'number' && typeof data.users.quota === 'number' &&
         data.sms && typeof data.sms.used === 'number' && typeof data.sms.quota === 'number' &&
         typeof data.sms.totalAvailable === 'number' && typeof data.sms.allExhausted === 'boolean' &&
         data.email && typeof data.email.used === 'number' && typeof data.email.quota === 'number' &&
         typeof data.email.totalAvailable === 'number' && typeof data.email.allExhausted === 'boolean' &&
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

  // Block sending only if ALL credits are exhausted (plan + packs)
  if (sms.allExhausted) {
    return (
      <div className="space-y-3" data-testid="sms-limit-critical">
        <Alert className="border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-red-800">All SMS Credits Exhausted</div>
            <div className="text-sm text-red-700">
              You've used all {sms.quota} plan SMS credits{sms.packCredits > 0 ? ` and ${sms.packCredits} pack credits` : ''}. 
              Buy more packs or upgrade to continue sending.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <PackSelectionModal initialType="sms">
                <Button size="sm" variant="default" data-testid="button-buy-sms-packs">
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Buy SMS Packs
                </Button>
              </PackSelectionModal>
              <UpgradeModal currentPlan={planId}>
                <Button size="sm" variant="outline" data-testid="button-upgrade-sms-critical">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Upgrade Plan
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

  // Show pack-aware warnings based on total available credits
  if (sms.quotaExceeded && sms.packCredits > 0) {
    // Quota exceeded but pack credits available
    return (
      <div className="space-y-3" data-testid="sms-using-packs">
        <Alert className="border-blue-400 bg-blue-50">
          <MessageCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-blue-800">Using SMS Pack Credits</div>
            <div className="text-sm text-blue-700">
              Plan quota exceeded ({sms.used}/{sms.quota}), now using {sms.packCredits} pack credits.
              {sms.totalAvailable <= 10 && ` Only ${sms.totalAvailable} total SMS remaining.`}
            </div>
            {sms.totalAvailable <= 10 && (
              <div className="flex items-center gap-2 mt-3">
                <PackSelectionModal initialType="sms">
                  <Button size="sm" variant="default" data-testid="button-buy-more-sms-packs">
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    Buy More SMS
                  </Button>
                </PackSelectionModal>
                <UpgradeModal currentPlan={planId}>
                  <Button size="sm" variant="outline" data-testid="button-upgrade-sms-using-packs">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Upgrade Plan
                  </Button>
                </UpgradeModal>
              </div>
            )}
          </AlertDescription>
        </Alert>
        {children}
      </div>
    );
  }

  // Show warning if running low on total credits
  if (sms.totalAvailable <= 10 && sms.totalAvailable > 0) {
    return (
      <div className="space-y-3" data-testid="sms-limit-warning">
        <Alert className="border-orange-400 bg-orange-50">
          <MessageCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-orange-800">Low SMS Credits</div>
            <div className="text-sm text-orange-700">
              Only {sms.totalAvailable} SMS remaining ({sms.remaining} plan + {sms.packCredits} pack credits). 
              Buy more packs to continue sending.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <PackSelectionModal initialType="sms">
                <Button size="sm" variant="default" data-testid="button-buy-sms-warning">
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Buy SMS Packs
                </Button>
              </PackSelectionModal>
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

  // Block sending only if ALL credits are exhausted (plan + packs)
  if (email.allExhausted) {
    return (
      <div className="space-y-3" data-testid="email-limit-critical">
        <Alert className="border-red-500 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-red-800">All Email Credits Exhausted</div>
            <div className="text-sm text-red-700">
              You've used all {email.quota} plan email credits{email.packCredits > 0 ? ` and ${email.packCredits} pack credits` : ''}. 
              Buy more packs or upgrade to continue sending.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <PackSelectionModal initialType="email">
                <Button size="sm" variant="default" data-testid="button-buy-email-packs">
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Buy Email Packs
                </Button>
              </PackSelectionModal>
              <UpgradeModal currentPlan={planId}>
                <Button size="sm" variant="outline" data-testid="button-upgrade-email-critical">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Upgrade Plan
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

  // Show pack-aware warnings based on total available credits
  if (email.quotaExceeded && email.packCredits > 0) {
    // Quota exceeded but pack credits available
    return (
      <div className="space-y-3" data-testid="email-using-packs">
        <Alert className="border-blue-400 bg-blue-50">
          <Mail className="h-4 w-4 text-blue-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-blue-800">Using Email Pack Credits</div>
            <div className="text-sm text-blue-700">
              Plan quota exceeded ({email.used}/{email.quota}), now using {email.packCredits} pack credits.
              {email.totalAvailable <= 20 && ` Only ${email.totalAvailable} total emails remaining.`}
            </div>
            {email.totalAvailable <= 20 && (
              <div className="flex items-center gap-2 mt-3">
                <PackSelectionModal initialType="email">
                  <Button size="sm" variant="default" data-testid="button-buy-more-email-packs">
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    Buy More Email
                  </Button>
                </PackSelectionModal>
                <UpgradeModal currentPlan={planId}>
                  <Button size="sm" variant="outline" data-testid="button-upgrade-email-using-packs">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Upgrade Plan
                  </Button>
                </UpgradeModal>
              </div>
            )}
          </AlertDescription>
        </Alert>
        {children}
      </div>
    );
  }

  // Show warning if running low on total credits
  if (email.totalAvailable <= 20 && email.totalAvailable > 0) {
    return (
      <div className="space-y-3" data-testid="email-limit-warning">
        <Alert className="border-orange-400 bg-orange-50">
          <Mail className="h-4 w-4 text-orange-600" />
          <AlertDescription className="space-y-2">
            <div className="font-medium text-orange-800">Low Email Credits</div>
            <div className="text-sm text-orange-700">
              Only {email.totalAvailable} emails remaining ({email.remaining} plan + {email.packCredits} pack credits). 
              Buy more packs to continue sending.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <PackSelectionModal initialType="email">
                <Button size="sm" variant="default" data-testid="button-buy-email-warning">
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Buy Email Packs
                </Button>
              </PackSelectionModal>
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