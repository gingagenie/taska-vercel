import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  Settings,
  AlertTriangle,
  LogOut,
  Menu,
  X,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface AlertsResponse {
  alerts: Array<{
    type: string;
    severity: 'critical' | 'warning';
    title: string;
    message: string;
  }>;
  total_alerts: number;
  critical_count: number;
  warning_count: number;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch alerts for notification badge
  const { data: alertsData } = useQuery<AlertsResponse>({
    queryKey: ['/api/admin/alerts'],
    refetchInterval: 60000, // Check for alerts every minute
  });

  const navigation = [
    {
      name: 'Dashboard',
      href: '/admin',
      icon: LayoutDashboard,
      current: location === '/admin'
    },
    {
      name: 'Organizations',
      href: '/admin/organizations',
      icon: Users,
      current: location.startsWith('/admin/organizations')
    },
    {
      name: 'Analytics',
      href: '/admin/analytics',
      icon: BarChart3,
      current: location.startsWith('/admin/analytics')
    },
    {
      name: 'Blog Posts',
      href: '/admin/blog',
      icon: FileText,
      current: location.startsWith('/admin/blog')
    },
    {
      name: 'System Settings',
      href: '/admin/settings',
      icon: Settings,
      current: location.startsWith('/admin/settings'),
      disabled: true
    }
  ];

  const handleLogout = () => {
    // Clear any admin session and redirect to main app
    window.location.href = '/auth/login';
  };

  const criticalAlerts = alertsData?.critical_count || 0;
  const totalAlerts = alertsData?.total_alerts || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold text-gray-900">Taska Admin</h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </Button>
      </div>

      <div className="flex">
        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="mobile-menu-overlay"
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col
          transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:transform-none transition-transform duration-300 ease-in-out
        `}>
          {/* Header - Desktop only */}
          <div className="hidden lg:block p-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-gray-900">Taska Admin</h1>
                <p className="text-xs text-gray-500">Business Portal</p>
              </div>
            </div>
          </div>

          {/* Alert Status */}
          {totalAlerts > 0 && (
            <div className="p-4 border-b border-gray-200">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="w-4 h-4 text-red-600 mr-2" />
                    <span className="text-sm font-medium text-red-800">
                      Business Alerts
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {criticalAlerts > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {criticalAlerts} critical
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {totalAlerts} total
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.name} href={item.href}>
                  <Button
                    variant={item.current ? "default" : "ghost"}
                    className={`w-full justify-start ${
                      item.disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={item.disabled}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {item.name}
                    {item.disabled && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        Soon
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* Admin User Info */}
          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-2">Logged in as:</div>
            <div className="text-sm font-medium text-gray-900">Business Owner</div>
            <div className="text-xs text-gray-500">keith.richmond@live.com</div>
            
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-3"
              onClick={handleLogout}
              data-testid="button-admin-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Exit Admin
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0 lg:ml-0">
          {/* Content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}