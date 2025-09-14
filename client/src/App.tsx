import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { TopBar } from "@/components/layout/top-bar";
import { Topbar } from "@/components/layout/topbar";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { SubscriptionErrorModalProvider } from "@/components/modals/subscription-error-modal";
import { useState, useEffect } from "react";

// Import pages
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import Customers from "@/pages/customers";
import Equipment from "@/pages/equipment";

import ScheduleResponsive from "@/pages/schedule-responsive";
import Quotes from "@/pages/quotes";
import QuoteEdit from "@/pages/quote-edit";
import QuoteView from "@/pages/quote-view";
import Invoices from "@/pages/invoices";
import InvoiceEdit from "@/pages/invoice-edit";
import InvoiceView from "@/pages/invoice-view";
import NotFound from "@/pages/not-found";
import JobView from "./pages/job-view";
import JobEdit from "./pages/job-edit";
import JobNotesCharges from "./pages/job-notes-charges";
import CompletedJobs from "./pages/completed-jobs";
import CompletedJobView from "./pages/completed-job-view";
import CustomerView from "./pages/customer-view";
import CustomerNew from "./pages/customers-new";
import EquipmentView from "./pages/equipment-view";
import SettingsPage from "@/pages/settings";
import MembersPage from "@/pages/members";
import Landing from "@/pages/landing";
import Register from "@/pages/auth-register";
import Login from "@/pages/auth-login";
import TrialExpired from "@/pages/trial-expired";

// Import customer support pages
import CustomerSupportDashboard from "@/pages/support";
import CreateSupportTicket from "@/pages/support-new";
import SupportTicketDetail from "@/pages/support-ticket";
import SupportTicketsList from "@/pages/support-tickets";

// Import modals
import { JobModal } from "@/components/modals/job-modal";
import { CustomerModal } from "@/components/modals/customer-modal";
import { UpgradeModal } from "@/components/modals/upgrade-modal";

// Import AI chat widget
import { AIChatWidget } from "@/components/ai-chat/AIChatWidget";

// Import usage banner
import { UsageBanner } from "@/components/usage/usage-banner";

// Import support portal components
import { SupportLayout } from "@/components/support/SupportLayout";
import SupportDashboard from "@/pages/support/dashboard";
import TicketQueue from "@/pages/support/tickets";
import TicketDetail from "@/pages/support/ticket-detail";
import MyTickets from "@/pages/support/my-tickets";

// Import support admin components
import SupportAdminDashboard from "@/pages/support/admin/dashboard";
import SupportUsersAdmin from "@/pages/support/admin/users";
import SupportInvitesAdmin from "@/pages/support/admin/invites";
import SupportAuditAdmin from "@/pages/support/admin/audit";

// Role-based route protection
function ProtectedRoute({ 
  component: Component, 
  allowedRoles = ["admin", "manager", "technician"],
  ...props 
}: { 
  component: React.ComponentType<any>; 
  allowedRoles?: string[];
  [key: string]: any;
}) {
  const { user } = useAuth();
  
  if (!user?.role || !allowedRoles.includes(user.role)) {
    return <NotFound />;
  }
  
  return <Component {...props} />;
}

// Support Portal App for support staff
function SupportApp() {
  return (
    <SupportLayout>
      <Switch>
        <Route path="/support" component={SupportDashboard} />
        <Route path="/support/tickets" component={TicketQueue} />
        <Route path="/support/tickets/:id" component={TicketDetail} />
        <Route path="/support/my-tickets" component={MyTickets} />
        
        {/* Admin Routes - Only accessible to support_admin role */}
        <Route path="/support/admin" component={SupportAdminDashboard} />
        <Route path="/support/admin/users" component={SupportUsersAdmin} />
        <Route path="/support/admin/invites" component={SupportInvitesAdmin} />
        <Route path="/support/admin/audit" component={SupportAuditAdmin} />
        
        <Route component={SupportDashboard} />
      </Switch>
    </SupportLayout>
  );
}

function AuthenticatedApp() {
  const [location, setLocation] = useLocation();
  const { user, isProUser } = useAuth();
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Automatic routing for support staff
  useEffect(() => {
    if (user?.role === "support_staff" && !location.startsWith("/support")) {
      setLocation("/support");
    }
  }, [user?.role, location, setLocation]);

  // Support staff should be routed to the dedicated support portal
  if (user?.role === "support_staff") {
    return <SupportApp />;
  }

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
          onAddNew: () => (window as any).location = "/customers/new",
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
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Desktop sidebar */}
      <Sidebar />
      
      {/* Main content */}
      <div className="flex-1 sm:ml-64 flex flex-col min-h-0">
        {/* Mobile header */}
        <MobileHeader />
        
        {/* Global Usage Banner for Critical Alerts */}
        <UsageBanner />
        
        {/* Page container - scrollable content */}
        <main className="flex-1 overflow-y-auto page">
        
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/customers" component={Customers} />
          <Route path="/customers/new" component={CustomerNew} />
          <Route path="/equipment" component={Equipment} />

          <Route path="/schedule" component={ScheduleResponsive} />
          <Route path="/completed-jobs" component={CompletedJobs} />
          <Route path="/completed-jobs/:id">{() => <CompletedJobView />}</Route>
          <Route path="/quotes">{() => <ProtectedRoute component={Quotes} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/quotes/new">{() => <ProtectedRoute component={QuoteEdit} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/quotes/:id">{() => <ProtectedRoute component={QuoteView} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/quotes/:id/edit">{() => <ProtectedRoute component={QuoteEdit} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/invoices">{() => <ProtectedRoute component={Invoices} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/invoices/new">{() => <ProtectedRoute component={InvoiceEdit} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/invoices/:id">{() => <ProtectedRoute component={InvoiceView} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/invoices/:id/edit">{() => <ProtectedRoute component={InvoiceEdit} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/settings">{() => <ProtectedRoute component={SettingsPage} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/members">{() => <ProtectedRoute component={MembersPage} allowedRoles={["admin", "manager"]} />}</Route>
          <Route path="/jobs/:id">{() => <JobView />}</Route>
          <Route path="/jobs/:id/edit">{() => <JobEdit />}</Route>
          <Route path="/jobs/:id/notes">{() => <JobNotesCharges />}</Route>
          <Route path="/customers/:id">{() => <CustomerView />}</Route>
          <Route path="/equipment/:id">{() => <EquipmentView />}</Route>
          <Route path="/support" component={CustomerSupportDashboard} />
          <Route path="/support/new" component={CreateSupportTicket} />
          <Route path="/support/tickets" component={SupportTicketsList} />
          <Route path="/support/ticket/:id" component={SupportTicketDetail} />
          <Route path="/trial-expired" component={TrialExpired} />
          <Route component={NotFound} />
        </Switch>
        </main>
      </div>

      {/* Global Modals */}
      <JobModal open={isJobModalOpen} onOpenChange={setIsJobModalOpen} />
      <CustomerModal open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen} />
      <UpgradeModal open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen} />
      
      {/* AI Chat Widget */}
      <AIChatWidget />
    </div>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/auth/register" component={Register} />
        <Route path="/auth/login" component={Login} />
        <Route path="*" component={Landing} />
      </Switch>
    );
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SubscriptionErrorModalProvider>
            <Toaster />
            <AppContent />
          </SubscriptionErrorModalProvider>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
