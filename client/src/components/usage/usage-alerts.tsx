import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UpgradeModal } from "@/components/subscription/upgrade-modal";
import { PackSelectionModal } from "@/components/packs/PackSelectionModal";
import { 
  AlertTriangle, 
  AlertCircle, 
  TrendingUp, 
  X, 
  Users, 
  MessageCircle, 
  Mail,
  Crown,
  Zap,
  Star,
  ShoppingCart
} from "lucide-react";
import { cn } from "@/lib/utils";

// Usage data interface matching API response
export interface UsageData {
  users: { used: number; quota: number; percent: number };
  sms: { 
    used: number; 
    quota: number; 
    remaining: number; 
    percent: number; 
    quotaExceeded: boolean; 
    packCredits: number; 
    totalAvailable: number; 
    allExhausted: boolean;
  };
  email: { 
    used: number; 
    quota: number; 
    remaining: number; 
    percent: number; 
    quotaExceeded: boolean; 
    packCredits: number; 
    totalAvailable: number; 
    allExhausted: boolean;
  };
  periodEnd: string;
  planId: string;
  subscriptionStatus: string;
}

// Alert severity levels
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertType = 'users' | 'sms' | 'email';

// Alert dismissal key generator
const getDismissalKey = (type: AlertType, severity: AlertSeverity) => 
  `usage-alert-dismissed-${type}-${severity}`;

// Check if alert was dismissed recently (within 24 hours)
const isAlertDismissed = (type: AlertType, severity: AlertSeverity): boolean => {
  const key = getDismissalKey(type, severity);
  const dismissedAt = localStorage.getItem(key);
  if (!dismissedAt) return false;
  
  const dismissTime = new Date(dismissedAt).getTime();
  const now = Date.now();
  const hoursSinceDismissed = (now - dismissTime) / (1000 * 60 * 60);
  
  // Allow dismissal for 24 hours for warnings, 4 hours for critical
  const dismissalPeriod = severity === 'critical' ? 4 : 24;
  return hoursSinceDismissed < dismissalPeriod;
};

// Dismiss an alert
const dismissAlert = (type: AlertType, severity: AlertSeverity) => {
  const key = getDismissalKey(type, severity);
  localStorage.setItem(key, new Date().toISOString());
};

// Smart alert logic to determine what alerts to show
export function useUsageAlerts(usageData?: UsageData) {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const alerts: Array<{
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    action?: string;
    isDismissible: boolean;
    data: any;
  }> = [];

  if (!usageData) return { alerts, dismissAlert: () => {} };

  const { users, sms, email, planId } = usageData;

  // Users alerts
  if (users.used >= users.quota) {
    const key = `users-critical`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('users', 'critical')) {
      alerts.push({
        type: 'users',
        severity: 'critical',
        title: 'User Limit Reached',
        message: `You've reached your limit of ${users.quota} team members. Upgrade to add more users.`,
        action: 'upgrade',
        isDismissible: false,
        data: { used: users.used, quota: users.quota, percent: users.percent }
      });
    }
  } else if (users.percent >= 80) {
    const key = `users-warning`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('users', 'warning')) {
      alerts.push({
        type: 'users',
        severity: 'warning',
        title: 'Approaching User Limit',
        message: `You're using ${users.used} of ${users.quota} team member slots (${users.percent}%). Consider upgrading soon.`,
        action: 'upgrade',
        isDismissible: true,
        data: { used: users.used, quota: users.quota, percent: users.percent }
      });
    }
  }

  // SMS alerts - Pack-aware logic
  if (sms.allExhausted) {
    const key = `sms-critical`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('sms', 'critical')) {
      alerts.push({
        type: 'sms',
        severity: 'critical',
        title: 'All SMS Credits Exhausted',
        message: `You've used all available SMS credits (${sms.quota} plan${sms.packCredits > 0 ? ` + ${sms.packCredits} pack` : ''}). Buy packs or upgrade to continue.`,
        action: 'packs_or_upgrade',
        isDismissible: false,
        data: { used: sms.used, quota: sms.quota, packCredits: sms.packCredits, totalAvailable: sms.totalAvailable }
      });
    }
  } else if (sms.totalAvailable <= 5 && sms.totalAvailable > 0) {
    const key = `sms-error`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('sms', 'error')) {
      alerts.push({
        type: 'sms',
        severity: 'error',
        title: 'SMS Credits Running Low',
        message: `Only ${sms.totalAvailable} total SMS remaining (${sms.remaining} plan + ${sms.packCredits} pack). Buy more packs to avoid interruption.`,
        action: 'packs',
        isDismissible: true,
        data: { used: sms.used, quota: sms.quota, packCredits: sms.packCredits, totalAvailable: sms.totalAvailable }
      });
    }
  } else if (sms.quotaExceeded && sms.packCredits > 0) {
    const key = `sms-info`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('sms', 'info')) {
      alerts.push({
        type: 'sms',
        severity: 'info',
        title: 'Using SMS Pack Credits',
        message: `Plan quota exceeded, now using ${sms.packCredits} pack credits. ${sms.totalAvailable} total SMS remaining.`,
        action: 'packs',
        isDismissible: true,
        data: { used: sms.used, quota: sms.quota, packCredits: sms.packCredits, totalAvailable: sms.totalAvailable }
      });
    }
  } else if (sms.percent >= 80 && !sms.quotaExceeded) {
    const key = `sms-warning`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('sms', 'warning')) {
      alerts.push({
        type: 'sms',
        severity: 'warning',
        title: 'High SMS Usage',
        message: `You've used ${sms.percent}% of your SMS quota (${sms.used}/${sms.quota}). Consider buying packs for additional capacity.`,
        action: 'packs_or_upgrade',
        isDismissible: true,
        data: { used: sms.used, quota: sms.quota, packCredits: sms.packCredits, totalAvailable: sms.totalAvailable }
      });
    }
  }

  // Email alerts - Pack-aware logic
  if (email.allExhausted) {
    const key = `email-critical`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('email', 'critical')) {
      alerts.push({
        type: 'email',
        severity: 'critical',
        title: 'All Email Credits Exhausted',
        message: `You've used all available email credits (${email.quota} plan${email.packCredits > 0 ? ` + ${email.packCredits} pack` : ''}). Buy packs or upgrade to continue.`,
        action: 'packs_or_upgrade',
        isDismissible: false,
        data: { used: email.used, quota: email.quota, packCredits: email.packCredits, totalAvailable: email.totalAvailable }
      });
    }
  } else if (email.totalAvailable <= 20 && email.totalAvailable > 0) {
    const key = `email-error`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('email', 'error')) {
      alerts.push({
        type: 'email',
        severity: 'error',
        title: 'Email Credits Running Low',
        message: `Only ${email.totalAvailable} total emails remaining (${email.remaining} plan + ${email.packCredits} pack). Buy more packs to avoid interruption.`,
        action: 'packs',
        isDismissible: true,
        data: { used: email.used, quota: email.quota, packCredits: email.packCredits, totalAvailable: email.totalAvailable }
      });
    }
  } else if (email.quotaExceeded && email.packCredits > 0) {
    const key = `email-info`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('email', 'info')) {
      alerts.push({
        type: 'email',
        severity: 'info',
        title: 'Using Email Pack Credits',
        message: `Plan quota exceeded, now using ${email.packCredits} pack credits. ${email.totalAvailable} total emails remaining.`,
        action: 'packs',
        isDismissible: true,
        data: { used: email.used, quota: email.quota, packCredits: email.packCredits, totalAvailable: email.totalAvailable }
      });
    }
  } else if (email.percent >= 80 && !email.quotaExceeded) {
    const key = `email-warning`;
    if (!dismissedAlerts.has(key) && !isAlertDismissed('email', 'warning')) {
      alerts.push({
        type: 'email',
        severity: 'warning',
        title: 'High Email Usage',
        message: `You've used ${email.percent}% of your email quota (${email.used}/${email.quota}). Consider buying packs for additional capacity.`,
        action: 'packs_or_upgrade',
        isDismissible: true,
        data: { used: email.used, quota: email.quota, packCredits: email.packCredits, totalAvailable: email.totalAvailable }
      });
    }
  }

  const handleDismissAlert = (type: AlertType, severity: AlertSeverity) => {
    dismissAlert(type, severity);
    const key = `${type}-${severity}`;
    setDismissedAlerts(prev => new Set([...prev, key]));
  };

  return { alerts, dismissAlert: handleDismissAlert };
}

// Get appropriate icon for alert type
const getAlertIcon = (type: AlertType) => {
  switch (type) {
    case 'users': return Users;
    case 'sms': return MessageCircle;
    case 'email': return Mail;
    default: return AlertCircle;
  }
};

// Get recommended plan based on current usage
const getRecommendedPlan = (type: AlertType, data: any, currentPlan: string) => {
  if (currentPlan === 'enterprise') return null; // Already on highest plan
  
  switch (type) {
    case 'users':
      if (currentPlan === 'free' || currentPlan === 'solo') return 'pro'; // 5 users
      return 'enterprise'; // 12 users
      
    case 'sms':
      if (currentPlan === 'free') return 'solo'; // 100 SMS
      if (currentPlan === 'solo') return 'pro'; // 500 SMS
      return 'enterprise'; // 2000 SMS
      
    case 'email':
      if (currentPlan === 'free') return 'solo'; // 100 emails
      if (currentPlan === 'solo') return 'pro'; // 500 emails
      return 'enterprise'; // 2000 emails
      
    default:
      return 'pro';
  }
};

// Get plan details for recommendations
const getPlanDetails = (planId: string) => {
  switch (planId) {
    case 'solo': 
      return { name: 'Taska Solo', price: '$29/month', icon: Star, users: 1, sms: 100, email: 100 };
    case 'pro': 
      return { name: 'Taska Pro', price: '$49/month', icon: Zap, users: 5, sms: 500, email: 500 };
    case 'enterprise': 
      return { name: 'Taska Enterprise', price: '$99/month', icon: Crown, users: 12, sms: 2000, email: 2000 };
    default: 
      return { name: 'Taska Pro', price: '$49/month', icon: Zap, users: 5, sms: 500, email: 500 };
  }
};

// Usage Alert Component Props
interface UsageAlertProps {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  action?: string;
  isDismissible: boolean;
  data: any;
  currentPlan: string;
  onDismiss?: () => void;
  variant?: 'full' | 'compact' | 'minimal';
  showUpgrade?: boolean;
}

// Main Usage Alert Component
export function UsageAlert({
  type,
  severity,
  title,
  message,
  action,
  isDismissible,
  data,
  currentPlan,
  onDismiss,
  variant = 'full',
  showUpgrade = true
}: UsageAlertProps) {
  const AlertIcon = getAlertIcon(type);
  const recommendedPlan = getRecommendedPlan(type, data, currentPlan);
  const planDetails = recommendedPlan ? getPlanDetails(recommendedPlan) : null;
  
  // Get alert styling based on severity
  const getAlertClass = () => {
    switch (severity) {
      case 'critical':
        return 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100';
      case 'error':
        return 'border-red-400 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200';
      case 'warning':
        return 'border-orange-400 bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200';
      default:
        return 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200';
    }
  };

  const getIconColor = () => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-orange-500';
      default: return 'text-blue-500';
    }
  };

  // Compact variant for usage tab cards
  if (variant === 'compact') {
    return (
      <div className={cn('p-3 rounded border', getAlertClass())} data-testid={`alert-${type}-${severity}`}>
        <div className="flex items-start gap-2">
          <AlertIcon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', getIconColor())} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs mt-1 opacity-90">{message}</p>
            {showUpgrade && planDetails && (
              <div className="flex items-center gap-2 mt-2">
                {(type === 'sms' || type === 'email') && (
                  <PackSelectionModal initialType={type}>
                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-buy-packs-${type}`}>
                      <ShoppingCart className="w-3 h-3 mr-1" />
                      Buy {type.toUpperCase()}
                    </Button>
                  </PackSelectionModal>
                )}
                <UpgradeModal currentPlan={currentPlan}>
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-upgrade-${type}`}>
                    Upgrade to {planDetails.name}
                  </Button>
                </UpgradeModal>
                {isDismissible && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2 text-xs opacity-70" 
                    onClick={onDismiss}
                    data-testid={`button-dismiss-${type}`}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Minimal variant for header widgets
  if (variant === 'minimal') {
    return (
      <div className="flex items-center gap-1" data-testid={`alert-minimal-${type}-${severity}`}>
        <AlertIcon className={cn('w-3 h-3', getIconColor())} />
        {severity === 'critical' && <span className="text-xs font-medium text-red-600">!</span>}
      </div>
    );
  }

  // Full variant for banners and detailed alerts
  return (
    <Alert className={cn(getAlertClass())} data-testid={`alert-${type}-${severity}`}>
      <AlertIcon className={cn('h-4 w-4', getIconColor())} />
      <div className="flex-1">
        <AlertTitle className="flex items-center gap-2">
          {title}
          {severity === 'critical' && <Badge variant="destructive" className="text-xs">Action Required</Badge>}
        </AlertTitle>
        <AlertDescription className="mt-1">
          <div className="flex items-center justify-between">
            <span>{message}</span>
            <div className="flex items-center gap-2 ml-4">
              {showUpgrade && planDetails && (
                <UpgradeModal currentPlan={currentPlan}>
                  <Button size="sm" variant={severity === 'critical' ? 'destructive' : 'default'} data-testid={`button-upgrade-${type}`}>
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Upgrade to {planDetails.name}
                  </Button>
                </UpgradeModal>
              )}
              {isDismissible && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="px-2" 
                  onClick={onDismiss}
                  data-testid={`button-dismiss-${type}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
          {planDetails && showUpgrade && (
            <div className="mt-2 text-xs opacity-90">
              <strong>{planDetails.name} Plan ({planDetails.price}):</strong> {
                type === 'users' ? `${planDetails.users} team members` :
                type === 'sms' ? `${planDetails.sms} SMS/month` :
                `${planDetails.email} emails/month`
              }
            </div>
          )}
        </AlertDescription>
      </div>
    </Alert>
  );
}

// Usage Alert List Component - renders multiple alerts
interface UsageAlertListProps {
  alerts: ReturnType<typeof useUsageAlerts>['alerts'];
  currentPlan: string;
  onDismiss: (type: AlertType, severity: AlertSeverity) => void;
  variant?: 'full' | 'compact' | 'minimal';
  maxAlerts?: number;
  showUpgrade?: boolean;
}

export function UsageAlertList({ 
  alerts, 
  currentPlan, 
  onDismiss, 
  variant = 'full', 
  maxAlerts,
  showUpgrade = true 
}: UsageAlertListProps) {
  // Sort alerts by severity (critical first)
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const displayAlerts = maxAlerts ? sortedAlerts.slice(0, maxAlerts) : sortedAlerts;

  if (displayAlerts.length === 0) return null;

  return (
    <div className={cn('space-y-2', variant === 'full' && 'space-y-3')} data-testid="usage-alert-list">
      {displayAlerts.map((alert, index) => (
        <UsageAlert
          key={`${alert.type}-${alert.severity}`}
          {...alert}
          currentPlan={currentPlan}
          onDismiss={() => onDismiss(alert.type, alert.severity)}
          variant={variant}
          showUpgrade={showUpgrade}
        />
      ))}
    </div>
  );
}