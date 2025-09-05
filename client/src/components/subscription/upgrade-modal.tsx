import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Star, Zap, Crown } from "lucide-react"
import { apiRequest } from "@/lib/queryClient"
import { useToast } from "@/hooks/use-toast"

interface Plan {
  id: string
  name: string
  priceMonthly: number
  features: string[]
  isActive: boolean
}

interface UpgradeModalProps {
  children: React.ReactNode
  currentPlan?: string
}

const planIcons = {
  solo: Star,
  pro: Zap,
  enterprise: Crown,
}

const planColors = {
  solo: "bg-blue-500",
  pro: "bg-purple-500", 
  enterprise: "bg-orange-500",
}

export function UpgradeModal({ children, currentPlan }: UpgradeModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const { toast } = useToast()

  const fetchPlans = async () => {
    try {
      const response = await apiRequest("GET", "/api/subscriptions/plans")
      const data = await response.json()
      setPlans(data.filter((plan: Plan) => plan.id !== 'free'))
    } catch (error) {
      console.error("Error fetching plans:", error)
      toast({
        title: "Error",
        description: "Failed to load subscription plans",
        variant: "destructive",
      })
    }
  }

  const handleUpgrade = async (planId: string) => {
    if (isLoading) return
    
    setIsLoading(true)
    try {
      const response = await apiRequest("POST", "/api/subscriptions/create-checkout", {
        planId,
      })
      
      if (response.ok) {
        const { url } = await response.json()
        window.location.href = url
      } else {
        throw new Error("Failed to create checkout session")
      }
    } catch (error) {
      console.error("Error creating checkout:", error)
      toast({
        title: "Error",
        description: "Failed to start checkout process",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild onClick={fetchPlans}>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Upgrade Your Plan
          </DialogTitle>
          <DialogDescription className="text-center text-lg">
            Choose the perfect plan for your business needs
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {plans.map((plan) => {
            const Icon = planIcons[plan.id as keyof typeof planIcons] || Star
            const colorClass = planColors[plan.id as keyof typeof planColors] || "bg-blue-500"
            const isCurrent = currentPlan === plan.id
            const isPopular = plan.id === 'pro'

            return (
              <div
                key={plan.id}
                className={`relative rounded-lg border-2 p-6 ${
                  isPopular ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200'
                }`}
                data-testid={`plan-card-${plan.id}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-500">
                    Most Popular
                  </Badge>
                )}

                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${colorClass} text-white mb-4`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  
                  <div className="mb-4">
                    <span className="text-3xl font-bold">{formatPrice(plan.priceMonthly)}</span>
                    <span className="text-gray-600">/month</span>
                  </div>

                  {isCurrent ? (
                    <Badge variant="secondary" className="mb-4">
                      Current Plan
                    </Badge>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isLoading}
                      className={`w-full mb-4 ${
                        isPopular ? 'bg-purple-500 hover:bg-purple-600' : ''
                      }`}
                      data-testid={`upgrade-${plan.id}`}
                    >
                      {isLoading ? "Processing..." : "Upgrade Now"}
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 text-center">
            All plans include 30-day money-back guarantee • Cancel anytime • Secure payment processing
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}