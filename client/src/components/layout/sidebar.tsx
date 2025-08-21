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
  Crown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navigationItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/equipment", label: "Equipment", icon: Settings },
  { path: "/teams", label: "Teams", icon: UsersRound },
  { path: "/quotes", label: "Quotes", icon: FileText, isPro: true },
  { path: "/invoices", label: "Invoices", icon: Receipt, isPro: true },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, selectedOrgId, organizations, setSelectedOrgId, isProUser } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 fixed h-full z-10">
      <div className="p-6">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <img 
            src="/assets/taska-logo.png"
            alt="Taska Logo"
            className="w-15 h-15 object-contain"
          />
          <h1 className="text-xl font-bold text-gray-900">Taska</h1>
        </div>
        
        {/* Organization Selector */}
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Organization
          </label>
          <Select value={selectedOrgId || ""} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="mt-1 w-full bg-transparent border-0 text-sm font-medium text-gray-900 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Navigation Menu */}
        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            const isProFeature = item.isPro && !isProUser;
            
            return (
              <Link key={item.path} href={item.path}>
                <a className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg ${
                  isActive 
                    ? "bg-primary text-white" 
                    : "text-gray-700 hover:bg-gray-100"
                }`}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {item.isPro && (
                    <span className="bg-warning text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                      PRO
                    </span>
                  )}
                </a>
              </Link>
            );
          })}
        </nav>
        
        {/* User Profile */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">{user?.initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
