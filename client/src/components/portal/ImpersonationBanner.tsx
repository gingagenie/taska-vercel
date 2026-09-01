import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

interface PortalMe {
  customer_name?: string;
  name?: string;
  impersonated_by?: string | null;
}

export function ImpersonationBanner({ org }: { org: string }) {
  const [, navigate] = useLocation();
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${org}/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPortalMe(data))
      .catch(() => null);
  }, [org]);

  if (!portalMe?.impersonated_by) return null;

  const customerName = portalMe.customer_name || portalMe.name || "Customer";

  async function handleExit() {
    setExiting(true);
    try {
      await fetch(`/api/portal/${org}/impersonate-exit`, {
        method: "POST",
        credentials: "include",
      });
    } catch (_) {
      // ignore
    }
    window.location.href = "/";
  }

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>Admin view — viewing portal as {customerName}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-700 text-amber-950 hover:bg-amber-600 h-7 px-3 text-xs"
        onClick={handleExit}
        disabled={exiting}
      >
        {exiting ? "Exiting..." : "Exit"}
      </Button>
    </div>
  );
}
