import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MessageCircle, Mail, Calendar, TrendingDown, Package, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PurchasedPack {
  id: string;
  packType: 'sms' | 'email';
  quantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  purchasedAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'used_up';
  usagePercent: number;
}

interface PurchasedPacksResponse {
  success: boolean;
  data: PurchasedPack[];
}

interface PurchasedPacksListProps {
  status?: 'active' | 'expired' | 'used_up' | 'all';
  packType?: 'sms' | 'email';
  compact?: boolean;
  className?: string;
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'expired':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'used_up':
      return 'bg-gray-100 text-gray-800 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

const getProgressColor = (percent: number, status: string) => {
  if (status !== 'active') return 'bg-gray-400';
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-orange-500';
  return 'bg-green-500';
};

export function PurchasedPacksList({ 
  status = 'all', 
  packType, 
  compact = false,
  className 
}: PurchasedPacksListProps) {
  // Build query parameters
  const queryParams = new URLSearchParams();
  if (status !== 'all') queryParams.append('status', status);
  if (packType) queryParams.append('packType', packType);
  
  const queryString = queryParams.toString();
  const endpoint = queryString ? `/api/usage/packs?${queryString}` : '/api/usage/packs';

  const { data: packsResponse, isLoading, error } = useQuery<PurchasedPacksResponse>({
    queryKey: [endpoint, status, packType],
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });

  const packs = packsResponse?.data || [];

  // Group packs by type for better organization
  const smsPacks = packs.filter(pack => pack.packType === 'sms');
  const emailPacks = packs.filter(pack => pack.packType === 'email');

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)} data-testid="purchased-packs-loading">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                <div className="h-2 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-gray-500">Unable to load purchased packs</p>
          <p className="text-sm text-gray-400 mt-1">Please try refreshing the page</p>
        </CardContent>
      </Card>
    );
  }

  if (packs.length === 0) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="p-6 text-center">
          <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No packs found</p>
          <p className="text-sm text-gray-400 mt-1">
            {status === 'active' ? 'No active packs available' : 'No purchased packs yet'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const PackCard = ({ pack }: { pack: PurchasedPack }) => {
    const Icon = pack.packType === 'sms' ? MessageCircle : Mail;
    const typeLabel = pack.packType.toUpperCase();

    return (
      <Card 
        key={pack.id} 
        className={cn(
          "transition-all duration-200",
          pack.status !== 'active' && "opacity-75"
        )}
        data-testid={`pack-${pack.id}`}
      >
        <CardHeader className={cn("pb-3", compact && "pb-2")}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon className={cn(
                "w-5 h-5",
                pack.packType === 'sms' ? "text-green-500" : "text-purple-500"
              )} />
              {pack.quantity} {typeLabel}
            </CardTitle>
            <Badge 
              variant="outline" 
              className={getStatusColor(pack.status)}
              data-testid={`status-${pack.status}`}
            >
              {pack.status.replace('_', ' ')}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Usage Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Usage</span>
              <span className="font-medium">
                {pack.usedQuantity} / {pack.quantity} used
              </span>
            </div>
            <Progress 
              value={pack.usagePercent} 
              className={`h-2 [&>div]:${getProgressColor(pack.usagePercent, pack.status)}`}
              data-testid="usage-progress"
            />
            <div className="text-right">
              <span className={cn(
                "text-sm font-medium",
                pack.status === 'active' && pack.remainingQuantity > 0 ? "text-green-600" : "text-gray-500"
              )}>
                {pack.remainingQuantity} remaining
              </span>
            </div>
          </div>

          {/* Pack Details */}
          {!compact && (
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <div>
                  <div className="font-medium">Purchased</div>
                  <div>{formatDate(pack.purchasedAt)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                <div>
                  <div className="font-medium">Expires</div>
                  <div>{formatDate(pack.expiresAt)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Compact view details */}
          {compact && (
            <div className="text-xs text-gray-500">
              Purchased {formatDate(pack.purchasedAt)} • Expires {formatDate(pack.expiresAt)}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // If filtering by type, show that type only
  if (packType) {
    return (
      <div className={cn("space-y-4", className)}>
        {packs.map(pack => <PackCard key={pack.id} pack={pack} />)}
      </div>
    );
  }

  // Show all packs grouped by type
  return (
    <div className={cn("space-y-6", className)}>
      {smsPacks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            SMS Packs ({smsPacks.length})
          </h3>
          <div className="space-y-4">
            {smsPacks.map(pack => <PackCard key={pack.id} pack={pack} />)}
          </div>
        </div>
      )}

      {emailPacks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-purple-500" />
            Email Packs ({emailPacks.length})
          </h3>
          <div className="space-y-4">
            {emailPacks.map(pack => <PackCard key={pack.id} pack={pack} />)}
          </div>
        </div>
      )}
    </div>
  );
}