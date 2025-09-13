import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface PackCheckoutResponse {
  success: boolean;
  url: string;
  sessionId: string;
}

interface PackCheckoutRequest {
  productId: string;
}

export function usePackPurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (request: PackCheckoutRequest): Promise<PackCheckoutResponse> => {
      setIsLoading(true);
      
      try {
        const response = await apiRequest('POST', '/api/usage/packs/checkout', request);
        
        if (!response.ok) {
          const errorData = await response.text();
          let errorMessage = 'Failed to create checkout session';
          
          try {
            const errorJson = JSON.parse(errorData);
            errorMessage = errorJson.error || errorMessage;
          } catch {
            // Use default error message if JSON parsing fails
          }
          
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Pack checkout error:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    onSuccess: (data: PackCheckoutResponse) => {
      // Redirect to Stripe checkout
      if (data.url) {
        console.log('Redirecting to Stripe checkout:', data.url);
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    },
    onError: (error: Error) => {
      console.error('Pack purchase failed:', error);
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Unable to start checkout process. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const purchasePack = async (productId: string) => {
    try {
      await mutation.mutateAsync({ productId });
    } catch (error) {
      // Error is already handled in onError
      console.error('Purchase pack error:', error);
    }
  };

  const handleSuccess = () => {
    // Invalidate relevant queries to refresh usage data
    queryClient.invalidateQueries({ queryKey: ['/api/usage'] });
    queryClient.invalidateQueries({ queryKey: ['/api/usage/packs'] });
    queryClient.invalidateQueries({ queryKey: ['/api/usage/packs/active'] });
    
    toast({
      title: 'Purchase Successful!',
      description: 'Your pack has been added to your account and is ready to use.',
      variant: 'default',
    });
  };

  const handleError = (error?: string) => {
    toast({
      title: 'Purchase Failed',
      description: error || 'Your purchase could not be completed. Please try again.',
      variant: 'destructive',
    });
  };

  return {
    purchasePack,
    isLoading: isLoading || mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    handleSuccess,
    handleError,
  };
}