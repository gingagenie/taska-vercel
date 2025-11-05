import { useState } from "react";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/context/auth-context";
import { clearDevAuth } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FacebookPixelEvents } from "@/components/tracking/FacebookPixel";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Register() {
  const [, nav] = useLocation();
  const { reload } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"solo" | "pro" | "enterprise">("solo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  const plans = [
    {
      id: "solo" as const,
      name: "Solo",
      price: 29,
      features: ["1 user", "100 SMS/month", "100 emails/month"]
    },
    {
      id: "pro" as const,
      name: "Pro",
      price: 49,
      features: ["5 users", "500 SMS/month", "500 emails/month"],
      popular: true
    },
    {
      id: "enterprise" as const,
      name: "Enterprise",
      price: 99,
      features: ["12 users", "2000 SMS/month", "2000 emails/month"]
    }
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    
    try {
      // Create checkout session with trial period
      const res = await apiRequest("POST", "/api/auth/register-with-trial", {
        orgName,
        name,
        email,
        password,
        planId: selectedPlan
      });
      
      const response = await res.json();
      console.log('Registration response:', response);
      
      // Track registration initiation event
      FacebookPixelEvents.trackRegistration('email');
      
      // Redirect to Stripe Checkout
      if (response?.checkoutUrl) {
        console.log('Redirecting to:', response.checkoutUrl);
        window.location.href = response.checkoutUrl;
      } else {
        console.error('Response missing checkoutUrl:', response);
        throw new Error("No checkout URL returned");
      }
    } catch (e: any) {
      console.error('Registration error:', e);
      setError(e.message || "Failed to start registration");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-white to-gray-50">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
          <p className="text-gray-600">Start your 14-day free trial - no charge until day 15</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md" data-testid="text-register-error">
                {error}
              </div>
            )}
            
            {/* Plan Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Choose your plan</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={cn(
                      "relative p-4 border-2 rounded-lg text-left transition-all hover:border-blue-300",
                      selectedPlan === plan.id 
                        ? "border-blue-600 bg-blue-50" 
                        : "border-gray-200 bg-white",
                      plan.popular && "ring-2 ring-blue-400"
                    )}
                    data-testid={`button-plan-${plan.id}`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                        Popular
                      </span>
                    )}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-lg">{plan.name}</div>
                        <div className="text-2xl font-bold text-blue-600">
                          ${plan.price}
                          <span className="text-sm text-gray-500 font-normal">/mo</span>
                        </div>
                      </div>
                      {selectedPlan === plan.id && (
                        <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm text-gray-600">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Business name</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Field Services"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  data-testid="input-org-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  placeholder="John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@acmefield.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="font-medium text-blue-900">14-day free trial included</p>
              <p className="text-blue-700 mt-1">
                You'll enter payment details next, but won't be charged until day 15. 
                Cancel anytime during your trial at no cost.
              </p>
            </div>

            <Button 
              className="w-full" 
              type="submit" 
              disabled={saving}
              data-testid="button-create-account"
            >
              {saving ? "Starting trial..." : "Start Free Trial →"}
            </Button>
            <div className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-blue-600 hover:underline" data-testid="link-login">
                Log in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}