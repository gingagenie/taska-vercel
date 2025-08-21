import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, Check } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const features = [
    "Generate professional quotes",
    "Create and send invoices",
    "Advanced analytics and reporting",
    "Priority customer support",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to Pro</DialogTitle>
        </DialogHeader>
        
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-warning rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="text-white text-xl" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Unlock Advanced Features</h4>
          <p className="text-gray-600">Access quotes, invoices, and advanced reporting with Pro.</p>
        </div>
        
        <div className="space-y-3 mb-6">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-3">
              <Check className="text-success h-5 w-5" />
              <span className="text-gray-700">{feature}</span>
            </div>
          ))}
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Button className="flex-1 bg-warning hover:bg-yellow-600">
            Upgrade Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
