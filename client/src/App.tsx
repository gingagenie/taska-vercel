import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { Topbar } from "@/components/layout/topbar";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { useState } from "react";

// Import pages
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import Customers from "@/pages/customers";
import Equipment from "@/pages/equipment";
import Teams from "@/pages/teams";
import Schedule from "@/pages/schedule";
import Quotes from "@/pages/quotes";
import Invoices from "@/pages/invoices";
import NotFound from "@/pages/not-found";
import Profile from "@/pages/Profile";
import JobView from "./pages/job-view";
import JobEdit from "./pages/job-edit";
import JobNotesCharges from "./pages/job-notes-charges";
import CustomerView from "./pages/customer-view";

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
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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
      case "/schedule":
        return {
          title: "Schedule",
          subtitle: "View jobs in calendar format",
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
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Mobile Header */}
      <Topbar onMenu={() => setIsMobileDrawerOpen(true)} title={pageConfig.title} />
      
      {/* Mobile Drawer */}
      <MobileDrawer 
        isOpen={isMobileDrawerOpen} 
        onClose={() => setIsMobileDrawerOpen(false)} 
      />
      
      <main className="md:pl-64">
        {/* Desktop TopBar */}
        <div className="hidden md:block">
          <TopBar {...pageConfig} />
        </div>
        
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/customers" component={Customers} />
          <Route path="/equipment" component={Equipment} />
          <Route path="/teams" component={Teams} />
          <Route path="/schedule" component={Schedule} />
          <Route path="/quotes" component={Quotes} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/profile" component={Profile} />
          <Route path="/jobs/:id">{() => <JobView />}</Route>
          <Route path="/jobs/:id/edit">{() => <JobEdit />}</Route>
          <Route path="/jobs/:id/notes">{() => <JobNotesCharges />}</Route>
          <Route path="/customers/:id">{() => <CustomerView />}</Route>
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
