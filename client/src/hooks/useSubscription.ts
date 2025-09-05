import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRequest } from "@/lib/queryClient"
import { useToast } from "@/hooks/use-toast"

interface SubscriptionPlan {
  id: string
  name: string
  priceMonthly: number
  features: string[]
  isActive: boolean
}

interface Subscription {
  subscription: {
    planId: string
    status: string
    currentPeriodStart?: string
    currentPeriodEnd?: string
    trialEnd?: string
    cancelAtPeriodEnd: boolean
  }
  plan: SubscriptionPlan
}

export function useSubscription() {
  return useQuery({
    queryKey: ["/api/subscriptions/status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/subscriptions/status")
      if (!response.ok) {
        throw new Error("Failed to fetch subscription")
      }
      return response.json() as Promise<Subscription>
    },
    retry: false,
  })
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ["/api/subscriptions/plans"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/subscriptions/plans")
      if (!response.ok) {
        throw new Error("Failed to fetch plans")
      }
      return response.json() as Promise<SubscriptionPlan[]>
    },
  })
}

export function useCancelSubscription() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscriptions/cancel")
      if (!response.ok) {
        throw new Error("Failed to cancel subscription")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/status"] })
      toast({
        title: "Subscription Canceled",
        description: "Your subscription will remain active until the end of the current billing period.",
      })
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      })
    },
  })
}