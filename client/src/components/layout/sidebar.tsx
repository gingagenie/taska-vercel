import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Briefcase,
  Users,
  Settings,
  UsersRound,
  FileText,
  Receipt,
  BarChart3,
  Crown,
} from "lucide-react";

const navigationItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/equipment", label: "Equipment", icon: Settings },
  { path: "/teams", label: "Teams", icon: UsersRound },
  { path: "/quotes", label: "Quotes", icon: FileText, isPro: true },
  { path: "/invoices", label: "Invoices", icon: Receipt, isPro: true },
  { path: "/profile", label: "Profile", icon: Crown }, // optional shortcut
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, isProUser } = useAuth();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 fixed h-full z-10 flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Settings className="text-white text-sm" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Taska</h1>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            const lockPro = item.isPro && !isProUser;

            return (
              <Link key={item.path} href={lockPro ? "/billing" : item.path}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={onClose}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {item.isPro && (
                    <span className="bg-warning text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                      PRO
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

      </div>
      
      {/* User Profile - Fixed at bottom */}
      <div className="p-4 border-t border-gray-200">
        <Link href="/profile">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors" onClick={onClose}>
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.initials ?? "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name ?? "Your Profile"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.role ?? "Member"}
              </p>
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
