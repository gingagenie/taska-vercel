import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Users, MessageCircle, Mail, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface UsageData {
  users: { used: number; quota: number; percent: number };
  sms: { used: number; quota: number; remaining: number; percent: number; quotaExceeded: boolean };
  email: { used: number; quota: number; remaining: number; percent: number; quotaExceeded: boolean };
  periodEnd: string;
  planId: string;
  subscriptionStatus: string;
}

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

const getUsageColor = (percent: number, exceeded: boolean = false) => {
  if (exceeded || percent >= 100) return "text-red-600";
  if (percent >= 80) return "text-orange-600";
  return "text-green-600";
};

const getStatusIcon = (percent: number, exceeded: boolean = false) => {
  if (exceeded || percent >= 100) return "🔴";
  if (percent >= 80) return "🟠";
  return "🟢";
};

interface UsageWidgetProps {
  variant?: "mobile" | "desktop";
  showText?: boolean;
}

export function UsageWidget({ variant = "desktop", showText = true }: UsageWidgetProps) {
  const { data: usageData, isLoading, error } = useQuery({
    queryKey: ["/api/usage"],
    refetchOnWindowFocus: true,
    staleTime: 60000, // Refresh every minute
    refetchInterval: 60000, // Auto-refresh every minute
    refetchIntervalInBackground: true, // Continue refreshing in background
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2" data-testid="usage-widget-loading">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
          {showText && <div className="w-12 h-3 bg-gray-200 rounded"></div>}
        </div>
      </div>
    );
  }

  // Error or invalid data state
  if (error || !usageData || !isValidUsageData(usageData)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1" data-testid="usage-widget-error">
              <AlertCircle className="w-4 h-4 text-gray-400" />
              {showText && <span className="text-xs text-gray-400">Usage</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Unable to load usage data</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const { users, sms, email } = usageData;

  // Mobile compact variant - just status dots
  if (variant === "mobile") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/settings?tab=usage">
              <a>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-8 hover:bg-gray-100"
                  data-testid="button-usage-widget-mobile"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{getStatusIcon(users.percent)}</span>
                    <span className="text-xs">{getStatusIcon(sms.percent, sms.quotaExceeded)}</span>
                    <span className="text-xs">{getStatusIcon(email.percent, email.quotaExceeded)}</span>
                  </div>
                </Button>
              </a>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <div>👥 Users: {users.used}/{users.quota}</div>
              <div>📱 SMS: {sms.used}/{sms.quota}</div>
              <div>📧 Email: {email.used}/{email.quota}</div>
              <div className="text-gray-400 mt-1">Click for details</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Desktop detailed variant
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/settings?tab=usage">
            <a>
              <Button
                variant="ghost"
                size="sm"
                className="px-3 py-1 h-8 hover:bg-gray-100 transition-colors"
                data-testid="button-usage-widget-desktop"
              >
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-blue-500" />
                    <span className={getUsageColor(users.percent)}>{users.used}/{users.quota}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-green-500" />
                    <span className={getUsageColor(sms.percent, sms.quotaExceeded)}>{sms.used}/{sms.quota}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-purple-500" />
                    <span className={getUsageColor(email.percent, email.quotaExceeded)}>{email.used}/{email.quota}</span>
                  </div>
                </div>
              </Button>
            </a>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-2 text-xs">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-6">
                <span>👥 Users:</span>
                <span className={getUsageColor(users.percent)}>{users.used}/{users.quota} ({Math.round(users.percent)}%)</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span>📱 SMS:</span>
                <span className={getUsageColor(sms.percent, sms.quotaExceeded)}>{sms.used}/{sms.quota} ({Math.round(sms.percent)}%)</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span>📧 Email:</span>
                <span className={getUsageColor(email.percent, email.quotaExceeded)}>{email.used}/{email.quota} ({Math.round(email.percent)}%)</span>
              </div>
            </div>
            <div className="border-t pt-1 text-gray-400">
              Click for detailed usage information
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}