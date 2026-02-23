import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarContent } from "@/components/layout/sidebar";
import { RouteHeader } from "@/components/layout/route-header";
import { UsageWidget } from "@/components/layout/usage-widget";
import { ServiceRequestsNotifications } from "@/components/ServiceRequestsNotifications";

export function MobileHeader({ title }: { title?: string }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="sm:hidden sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="flex items-center justify-between px-4 py-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72">
            <SidebarContent onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="text-base font-semibold truncate">
          {title ? <span>{title}</span> : <RouteHeader />}
        </div>
        
        <div className="flex items-center gap-2">
          <ServiceRequestsNotifications />
          <UsageWidget variant="mobile" showText={false} />
        </div>
      </div>
    </div>
  );
}
