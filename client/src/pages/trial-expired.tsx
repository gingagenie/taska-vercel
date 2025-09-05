import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, Star } from "lucide-react";
import { UpgradeModal } from "@/components/subscription/upgrade-modal";

export default function TrialExpiredPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <CardTitle className="text-xl font-semibold">Trial Expired</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-600">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Your 14-day Pro trial has ended</span>
          </div>
          
          <p className="text-gray-700">
            To continue using Taska and manage your field service operations, please upgrade to a paid plan.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">What you'll keep:</span>
            </div>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• All your jobs and customer data</li>
              <li>• Team member access</li>
              <li>• Mobile scheduling</li>
              <li>• Xero integration</li>
            </ul>
          </div>

          <div className="space-y-2 pt-2">
            <UpgradeModal currentPlan="trial">
              <Button className="w-full" data-testid="button-upgrade-now">
                Upgrade Now
              </Button>
            </UpgradeModal>
            
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => window.location.href = '/logout'}
              data-testid="button-logout"
            >
              Sign Out
            </Button>
          </div>
          
          <p className="text-xs text-gray-500">
            Need help? Contact support at{" "}
            <a href="mailto:support@taska.app" className="text-blue-600 hover:underline">
              support@taska.app
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}