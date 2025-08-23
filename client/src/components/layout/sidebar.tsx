import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { apiRequest } from "@/lib/queryClient";
import Avatar from "boring-avatars";
import { 
  Briefcase, 
  Users, 
  Settings, 
  UsersRound, 
  FileText, 
  Receipt,
  BarChart3,
  Crown,
  Calendar,
  LogOut
} from "lucide-react";
import logoUrl from "@assets/Taska_1755842483680.png";

const navigationItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/equipment", label: "Equipment", icon: Settings },
  { path: "/teams", label: "Teams", icon: UsersRound },
  { path: "/members", label: "Members", icon: Users },
  { path: "/schedule", label: "Schedule", icon: Calendar },
  { path: "/quotes", label: "Quotes", icon: FileText, isPro: true },
  { path: "/invoices", label: "Invoices", icon: Receipt, isPro: true },
];

interface SidebarContentProps {
  onClose?: () => void;
}

export function SidebarContent({ onClose }: SidebarContentProps) {
  const [location] = useLocation();
  const { user, isProUser } = useAuth();

  return (
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
                  onClose?.();
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
      <Link href="/profile">
        <div 
          className="mt-6 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => onClose?.()}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
              {user?.avatar_seed && user?.avatar_variant ? (
                <Avatar 
                  size={32} 
                  name={user.avatar_seed} 
                  variant={user.avatar_variant as any} 
                  colors={["#92A1C6", "#146A7C", "#F0AB3D", "#C271B4", "#C20D90"]}
                />
              ) : user?.avatar_url ? (
                <img src={user.avatar_url} alt="avatar" className="h-8 w-8 object-cover" />
              ) : (
                <span className="text-white text-sm font-medium">{user?.name?.[0] || "U"}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">Field Service Pro</p>
            </div>
          </div>
        </div>
      </Link>
      
      {/* Logout Button */}
      <button
        onClick={async () => {
          try {
            await apiRequest("/api/auth/logout", "POST");
            window.location.href = "/";
          } catch (error) {
            console.error("Logout failed:", error);
          }
        }}
        className="w-full mt-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
        data-testid="button-logout"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
      
      <div className="mt-2">
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
  );
}

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <aside className="hidden sm:block w-64 bg-white border-r border-gray-200 fixed h-full z-30">
      <SidebarContent onClose={onClose} />
    </aside>
  );
}
