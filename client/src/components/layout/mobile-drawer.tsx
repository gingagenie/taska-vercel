import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { 
  Briefcase, 
  Users, 
  Settings, 
  UsersRound, 
  FileText, 
  Receipt,
  BarChart3,
  Crown,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/Taska_1755842483680.png";

const navigationItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/equipment", label: "Equipment", icon: Settings },
  { path: "/teams", label: "Teams", icon: UsersRound },
  { path: "/quotes", label: "Quotes", icon: FileText, isPro: true },
  { path: "/invoices", label: "Invoices", icon: Receipt, isPro: true },
];

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const [location] = useLocation();
  const { user, isProUser } = useAuth();

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
        onClick={onClose}
        data-testid="drawer-backdrop"
      />

      {/* Slide-in drawer */}
      <div className="fixed left-0 top-0 w-4/5 max-w-xs h-full bg-white shadow-xl transform transition-transform translate-x-0">
        {/* Close button */}
        <div className="absolute top-4 right-4">
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-drawer">
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Drawer content */}
        <div className="p-6 h-full flex flex-col">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <img 
              src={logoUrl} 
              alt="Taska Logo" 
              className="w-8 h-8 object-contain"
            />
            <h1 className="text-xl font-bold text-gray-900">Taska</h1>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1 flex-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              const isLocked = item.isPro && !isProUser;
              
              return (
                <Link key={item.path} href={item.path}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer ${
                      isActive
                        ? "bg-primary text-white"
                        : isLocked
                        ? "text-gray-400 cursor-not-allowed"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={(e) => {
                      if (isLocked) {
                        e.preventDefault();
                        return;
                      }
                      onClose(); // close drawer on navigation
                    }}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                    {item.isPro && (
                      <div className="ml-auto flex items-center gap-1">
                        {!isProUser && <Crown className="w-3 h-3 text-amber-500" />}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isProUser ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          PRO
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.[0] || "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.name || "User"}
                </p>
                <p className="text-xs text-gray-500 truncate">Field Service Pro</p>
              </div>
            </div>
            
            {!isProUser && (
              <div className="text-xs text-gray-600 bg-amber-50 p-2 rounded border border-amber-200">
                <div className="flex items-center gap-1 mb-1">
                  <Crown className="w-3 h-3 text-amber-600" />
                  <span className="font-medium">Upgrade to Pro</span>
                </div>
                <p>Unlock quotes, invoices, and advanced features</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}