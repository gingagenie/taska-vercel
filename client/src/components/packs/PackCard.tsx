import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Mail, Check, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PackOption {
  productId: string;
  type: 'sms' | 'email';
  quantity: number;
  priceUsd: number;
  displayPrice: string;
  description: string;
}

interface PackCardProps {
  pack: PackOption;
  isPopular?: boolean;
  onPurchase: (productId: string) => void;
  isLoading?: boolean;
  className?: string;
}

// Calculate per-unit pricing
const getPerUnitPrice = (priceUsd: number, quantity: number) => {
  const pricePerUnit = (priceUsd / 100) / quantity;
  return pricePerUnit.toFixed(3);
};

// Get savings compared to smallest pack of same type
const getSavings = (pack: PackOption, allPacks: PackOption[]) => {
  const samePacks = allPacks.filter(p => p.type === pack.type);
  const smallestPack = samePacks.reduce((smallest, current) => 
    current.quantity < smallest.quantity ? current : smallest
  );
  
  if (pack.productId === smallestPack.productId) return null;
  
  const smallestPerUnit = parseFloat(getPerUnitPrice(smallestPack.priceUsd, smallestPack.quantity));
  const currentPerUnit = parseFloat(getPerUnitPrice(pack.priceUsd, pack.quantity));
  const savingsPercent = Math.round(((smallestPerUnit - currentPerUnit) / smallestPerUnit) * 100);
  
  return savingsPercent > 0 ? savingsPercent : null;
};

export function PackCard({ 
  pack, 
  isPopular = false, 
  onPurchase, 
  isLoading = false,
  className 
}: PackCardProps) {
  const Icon = pack.type === 'sms' ? MessageCircle : Mail;
  const typeLabel = pack.type.toUpperCase();
  const perUnitPrice = getPerUnitPrice(pack.priceUsd, pack.quantity);
  
  // All packs for savings calculation with real Stripe product IDs
  const allPacks: PackOption[] = [
    { productId: 'prod_T3LRPF1hSGF3ya', type: 'sms', quantity: 100, priceUsd: 500, displayPrice: '$5.00', description: '100 SMS pack' },
    { productId: 'prod_T3LRvcI7quZRJt', type: 'sms', quantity: 500, priceUsd: 2000, displayPrice: '$20.00', description: '500 SMS pack' },
    { productId: 'prod_T3LT77WnDcdc96', type: 'sms', quantity: 1000, priceUsd: 3500, displayPrice: '$35.00', description: '1000 SMS pack' },
    { productId: 'prod_T3LUS1xJ6MCi7k', type: 'email', quantity: 200, priceUsd: 300, displayPrice: '$3.00', description: '200 Email pack' },
    { productId: 'prod_T3LWiTXVFDcW1x', type: 'email', quantity: 500, priceUsd: 700, displayPrice: '$7.00', description: '500 Email pack' },
    { productId: 'prod_T3LaJFFqiZ4CNp', type: 'email', quantity: 1000, priceUsd: 1200, displayPrice: '$12.00', description: '1000 Email pack' },
  ];
  
  const savings = getSavings(pack, allPacks);

  return (
    <Card 
      className={cn(
        "relative transition-all duration-200 hover:shadow-lg",
        isPopular && "ring-2 ring-blue-500 ring-offset-2",
        className
      )}
      data-testid={`pack-card-${pack.productId}`}
    >
      {isPopular && (
        <Badge 
          className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white z-10"
          data-testid="popular-badge"
        >
          Most Popular
        </Badge>
      )}
      
      {savings && (
        <Badge 
          variant="secondary" 
          className="absolute -top-3 right-4 bg-green-100 text-green-800 border-green-300"
          data-testid="savings-badge"
        >
          <TrendingUp className="w-3 h-3 mr-1" />
          Save {savings}%
        </Badge>
      )}

      <CardHeader className="text-center pb-4">
        <div className={cn(
          "inline-flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3",
          pack.type === 'sms' ? "bg-green-100 text-green-600" : "bg-purple-100 text-purple-600"
        )}>
          <Icon className="w-6 h-6" />
        </div>
        
        <CardTitle className="text-lg">
          {pack.quantity} {typeLabel}
        </CardTitle>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {pack.displayPrice}
          </div>
          <div className="text-sm text-gray-500">
            ${perUnitPrice} per {pack.type}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span>Credits never expire</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span>Use across your organization</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span>Instant activation</span>
          </div>
          {pack.quantity >= 500 && (
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span>Volume pricing discount</span>
            </div>
          )}
        </div>

        <Button
          onClick={() => onPurchase(pack.productId)}
          disabled={isLoading}
          className={cn(
            "w-full",
            isPopular && "bg-blue-600 hover:bg-blue-700"
          )}
          data-testid={`purchase-${pack.productId}`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            `Purchase ${pack.quantity} ${typeLabel}`
          )}
        </Button>

        <div className="text-xs text-gray-500 text-center">
          Secure payment via Stripe
        </div>
      </CardContent>
    </Card>
  );
}