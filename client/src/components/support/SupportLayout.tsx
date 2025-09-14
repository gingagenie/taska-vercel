import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Ticket,
  User,
  LogOut,
  Menu,
  X,
  HelpCircle,
  Settings
} from "lucide-react";

export function SupportLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    {
      name: "Dashboard",
      href: "/support",
      icon: LayoutDashboard,
      active: location === "/support"
    },
    {
      name: "Ticket Queue",
      href: "/support/tickets",
      icon: Ticket,
      active: location.startsWith("/support/tickets")
    },
    {
      name: "My Tickets",
      href: "/support/my-tickets",
      icon: User,
      active: location === "/support/my-tickets"
    }
  ];

  // Admin navigation for support_admin users only
  const adminNavigation = [
    {
      name: "Admin Console",
      href: "/support/admin",
      icon: Settings,
      active: location.startsWith("/support/admin")
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left section */}
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                type="button"
                className="lg:hidden -ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                data-testid="button-mobile-menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>

              {/* Logo and brand */}
              <div className="flex-shrink-0 flex items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <HelpCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900" data-testid="text-brand">
                      Taska Support
                    </h1>
                    <Badge variant="secondary" className="text-xs" data-testid="badge-support-portal">
                      Support Portal
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden lg:ml-6 lg:flex lg:space-x-8">
                {navigation.map((item) => (
                  <Link key={item.name} href={item.href}>
                    <a
                      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                        item.active
                          ? "border-blue-500 text-gray-900"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                      }`}
                      data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                    >
                      <item.icon className="h-4 w-4 mr-2" />
                      {item.name}
                    </a>
                  </Link>
                ))}
                {/* Admin Navigation - Only shown to support_admin users */}
                {user?.role === 'support_admin' && adminNavigation.map((item) => (
                  <Link key={item.name} href={item.href}>
                    <a
                      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                        item.active
                          ? "border-orange-500 text-gray-900"
                          : "border-transparent text-orange-600 hover:border-orange-300 hover:text-orange-700"
                      }`}
                      data-testid={`nav-admin-${item.name.toLowerCase().replace(' ', '-')}`}
                    >
                      <item.icon className="h-4 w-4 mr-2" />
                      {item.name}
                    </a>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-4">
              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user?.avatar_url || undefined} />
                      <AvatarFallback className="bg-blue-100 text-blue-600">
                        {user?.initials || "SS"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      <p className="font-medium" data-testid="text-user-name">{user?.name}</p>
                      <p className="text-sm text-gray-500" data-testid="text-user-email">{user?.email}</p>
                      <Badge className="bg-green-100 text-green-800 text-xs w-fit" data-testid="badge-support-staff">
                        Support Staff
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden">
            <div className="pt-2 pb-3 space-y-1 bg-white border-t border-gray-200">
              {navigation.map((item) => (
                <Link key={item.name} href={item.href}>
                  <a
                    className={`block pl-3 pr-4 py-2 text-base font-medium transition-colors ${
                      item.active
                        ? "bg-blue-50 border-r-4 border-blue-500 text-blue-700"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid={`mobile-nav-${item.name.toLowerCase().replace(' ', '-')}`}
                  >
                    <div className="flex items-center">
                      <item.icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </div>
                  </a>
                </Link>
              ))}
              {/* Admin Navigation - Mobile */}
              {user?.role === 'support_admin' && adminNavigation.map((item) => (
                <Link key={item.name} href={item.href}>
                  <a
                    className={`block pl-3 pr-4 py-2 text-base font-medium transition-colors ${
                      item.active
                        ? "bg-orange-50 border-r-4 border-orange-500 text-orange-700"
                        : "text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid={`mobile-nav-admin-${item.name.toLowerCase().replace(' ', '-')}`}
                  >
                    <div className="flex items-center">
                      <item.icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}