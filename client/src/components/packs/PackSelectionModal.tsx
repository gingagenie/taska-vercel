import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PackCard, PackOption } from "./PackCard";
import { usePackPurchase } from "@/hooks/usePackPurchase";
import { Loader2, MessageCircle, Mail, ShoppingCart, Info } from "lucide-react";

interface PackSelectionModalProps {
  children: React.ReactNode;
  initialType?: 'sms' | 'email';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface AvailablePacksResponse {
  success: boolean;
  data: PackOption[];
}

// Helper function to get popular pack for each type
const getPopularPack = (packs: PackOption[], type: 'sms' | 'email') => {
  const typePacks = packs.filter(p => p.type === type);
  // Middle tier is usually most popular
  return typePacks.length >= 2 ? typePacks[1] : typePacks[0];
};

export function PackSelectionModal({ 
  children, 
  initialType = 'sms', 
  open, 
  onOpenChange 
}: PackSelectionModalProps) {
  const [isOpen, setIsOpen] = useState(open || false);
  const [activeTab, setActiveTab] = useState<'sms' | 'email'>(initialType);
  const { purchasePack, isLoading } = usePackPurchase();

  // Sync external open state
  useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open);
    }
  }, [open]);

  // Handle open change
  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  // Fetch available packs
  const { data: packsResponse, isLoading: isLoadingPacks, error: packsError } = useQuery<AvailablePacksResponse>({
    queryKey: ['/api/usage/packs/available'],
    enabled: isOpen, // Only fetch when modal is open
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const availablePacks = packsResponse?.data || [];
  const smsPacks = availablePacks.filter(pack => pack.type === 'sms');
  const emailPacks = availablePacks.filter(pack => pack.type === 'email');

  const handlePurchase = async (productId: string) => {
    await purchasePack(productId);
    // Modal will stay open during loading, Stripe redirect will close it
  };

  const PackGrid = ({ packs, type }: { packs: PackOption[], type: 'sms' | 'email' }) => {
    const popularPack = getPopularPack(packs, type);
    
    if (packs.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No {type.toUpperCase()} packs available at this time.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {packs.map((pack) => (
          <PackCard
            key={pack.productId}
            pack={pack}
            isPopular={pack.productId === popularPack?.productId}
            onPurchase={handlePurchase}
            isLoading={isLoading}
          />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
            <ShoppingCart className="w-6 h-6" />
            Purchase Communication Packs
          </DialogTitle>
          <DialogDescription className="text-center text-lg">
            Top up your SMS and email allowances with our flexible pack options
          </DialogDescription>
        </DialogHeader>

        {/* Info Alert */}
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-blue-800">
            <strong>How it works:</strong> Purchase packs to add credits to your account. 
            Credits are used automatically when you send SMS or emails, and never expire.
          </AlertDescription>
        </Alert>

        {/* Loading State */}
        {isLoadingPacks && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600">Loading available packs...</span>
          </div>
        )}

        {/* Error State */}
        {packsError && (
          <Alert className="bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">
              Failed to load available packs. Please try again later.
            </AlertDescription>
          </Alert>
        )}

        {/* Pack Selection Tabs */}
        {!isLoadingPacks && !packsError && availablePacks.length > 0 && (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'sms' | 'email')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sms" className="flex items-center gap-2" data-testid="tab-sms">
                <MessageCircle className="w-4 h-4" />
                SMS Packs
                {smsPacks.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {smsPacks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center gap-2" data-testid="tab-email">
                <Mail className="w-4 h-4" />
                Email Packs
                {emailPacks.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {emailPacks.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sms" className="mt-6" data-testid="sms-packs">
              <div className="mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-green-500" />
                  SMS Communication Packs
                </h3>
                <p className="text-gray-600 mt-1">
                  Send SMS notifications to customers for job updates, confirmations, and reminders.
                </p>
              </div>
              <PackGrid packs={smsPacks} type="sms" />
            </TabsContent>

            <TabsContent value="email" className="mt-6" data-testid="email-packs">
              <div className="mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Mail className="w-5 h-5 text-purple-500" />
                  Email Communication Packs
                </h3>
                <p className="text-gray-600 mt-1">
                  Send email notifications, invoices, and follow-ups to your customers.
                </p>
              </div>
              <PackGrid packs={emailPacks} type="email" />
            </TabsContent>
          </Tabs>
        )}

        {/* Footer */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="text-center">
              <strong>Secure Payment</strong>
              <br />
              Processed by Stripe
            </div>
            <div className="text-center">
              <strong>Instant Activation</strong>
              <br />
              Credits available immediately
            </div>
            <div className="text-center">
              <strong>Never Expire</strong>
              <br />
              Use credits anytime
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}