import { AlertTriangle, Crown } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { UpgradeModal } from "./upgrade-modal"

interface SubscriptionBannerProps {
  status: 'trial' | 'active' | 'past_due' | 'canceled'
  planId: string
  trialEnd?: string
  currentPeriodEnd?: string
}

export function SubscriptionBanner({ status, planId, trialEnd, currentPeriodEnd }: SubscriptionBannerProps) {
  const isTrialExpiring = status === 'trial' && trialEnd && new Date(trialEnd) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const isPastDue = status === 'past_due'
  const isCanceled = status === 'canceled'
  const isFree = planId === 'free'

  if (status === 'active' && !isFree) {
    return null // No banner for active paid subscriptions
  }

  if (isFree || status === 'trial') {
    return (
      <Alert className="mb-4 border-blue-200 bg-blue-50">
        <Crown className="h-4 w-4 text-blue-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-blue-800">
            {isFree ? 'You are on the free plan.' : `Your trial expires ${trialEnd ? new Date(trialEnd).toLocaleDateString() : 'soon'}.`} 
            {' '}Upgrade to unlock all features and unlimited access.
          </span>
          <UpgradeModal currentPlan={planId}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="upgrade-banner-button">
              Upgrade Now
            </Button>
          </UpgradeModal>
        </AlertDescription>
      </Alert>
    )
  }

  if (isPastDue) {
    return (
      <Alert className="mb-4 border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-red-800">
            Your payment is past due. Please update your payment method to continue using Taska.
          </span>
          <UpgradeModal currentPlan={planId}>
            <Button size="sm" variant="destructive" data-testid="update-payment-button">
              Update Payment
            </Button>
          </UpgradeModal>
        </AlertDescription>
      </Alert>
    )
  }

  if (isCanceled) {
    return (
      <Alert className="mb-4 border-orange-200 bg-orange-50">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-orange-800">
            Your subscription has been canceled. Access ends {currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : 'soon'}.
          </span>
          <UpgradeModal currentPlan={planId}>
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700" data-testid="resubscribe-button">
              Resubscribe
            </Button>
          </UpgradeModal>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}