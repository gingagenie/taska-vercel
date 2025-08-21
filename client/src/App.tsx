import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { useState } from "react";

// Import pages
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import Customers from "@/pages/customers";
import Equipment from "@/pages/equipment";
import Teams from "@/pages/teams";
import Quotes from "@/pages/quotes";
import Invoices from "@/pages/invoices";
import NotFound from "@/pages/not-found";
import Profile from "@/pages/Profile";
import JobView from "./pages/job-view";
import JobEdit from "./pages/job-edit";

// Import modals
import { JobModal } from "@/components/modals/job-modal";
import { CustomerModal } from "@/components/modals/customer-modal";
import { UpgradeModal } from "@/components/modals/upgrade-modal";

function AppContent() {
  const [location] = useLocation();
  const { isProUser } = useAuth();
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Page configuration
  const getPageConfig = () => {
    switch (location) {
      case "/":
        return {
          title: "Dashboard",
          subtitle: "Monitor your field service operations",
          addNewText: "New Job",
          onAddNew: () => setIsJobModalOpen(true),
        };
      case "/jobs":
        return {
          title: "Jobs",
          subtitle: "Manage all service jobs",
          addNewText: "New Job",
          onAddNew: () => setIsJobModalOpen(true),
        };
      case "/customers":
        return {
          title: "Customers",
          subtitle: "Manage customer relationships",
          addNewText: "New Customer",
          onAddNew: () => setIsCustomerModalOpen(true),
        };
      case "/equipment":
        return {
          title: "Equipment",
          subtitle: "Track and manage equipment",
          addNewText: "New Equipment",
          onAddNew: () => {}, // TODO: Implement equipment modal
        };
      case "/teams":
        return {
          title: "Teams",
          subtitle: "Manage team members and assignments",
          addNewText: "Add Member",
          onAddNew: () => {}, // TODO: Implement team member modal
        };
      case "/quotes":
        return {
          title: "Quotes",
          subtitle: "Generate and manage quotes",
          addNewText: "New Quote",
          onAddNew: isProUser ? () => {} : () => setIsUpgradeModalOpen(true),
        };
      case "/invoices":
        return {
          title: "Invoices",
          subtitle: "Track payments and billing",
          addNewText: "New Invoice",
          onAddNew: isProUser ? () => {} : () => setIsUpgradeModalOpen(true),
        };
      default:
        return {
          title: "Page Not Found",
          subtitle: "The requested page could not be found",
        };
    }
  };

  const pageConfig = getPageConfig();

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Mobile Sidebar */}
      <div className={`fixed left-0 top-0 h-full z-50 lg:hidden transform transition-transform duration-300 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>
      
      <main className="flex-1 lg:ml-56">
        <TopBar 
          {...pageConfig} 
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
        
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/customers" component={Customers} />
          <Route path="/equipment" component={Equipment} />
          <Route path="/teams" component={Teams} />
          <Route path="/quotes" component={Quotes} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/profile" component={Profile} />
          <Route path="/jobs/:id">{() => <JobView />}</Route>
          <Route path="/jobs/:id/edit">{() => <JobEdit />}</Route>
         <Route component={NotFound} />
        </Switch>
      </main>

      {/* Global Modals */}
      <JobModal open={isJobModalOpen} onOpenChange={setIsJobModalOpen} />
      <CustomerModal open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen} />
      <UpgradeModal open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen} />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
