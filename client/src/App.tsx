import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { SupportAuthProvider, useSupportAuth } from "@/context/support-auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { TopBar } from "@/components/layout/top-bar";
import { Topbar } from "@/components/layout/topbar";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { SubscriptionErrorModalProvider } from "@/components/modals/subscription-error-modal";
import { useState, useEffect, Suspense, lazy } from "react";

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

// ✅ Customer Portal pages
import PortalLogin from "@/pages/portal/PortalLogin";
import PortalEquipmentList from "@/pages/portal/PortalEquipmentList";
import PortalEquipmentDetail from "@/pages/portal/PortalEquipmentDetail";

// Lazy load heavy settings pages
const SettingsPage = lazy(() => import("@/pages/settings"));
const MembersPage = lazy(() => import("@/pages/members"));
import Landing from "@/pages/landing";
import Blog from "@/pages/blog";
import BlogPost from "@/pages/blog-post";
import Register from "@/pages/auth-register";
import Login from "@/pages/auth-login";
import TrialExpired from "@/pages/trial-expired";
import PrivacyPolicy from "@/pages/privacy";

// Lazy load customer support pages for performance
const CustomerSupportDashboard = lazy(() => import("@/pages/support"));
const CreateSupportTicket = lazy(() => import("@/pages/support-new"));
const SupportTicketDetail = lazy(() => import("@/pages/support-ticket"));
const SupportTicketsList = lazy(() => import("@/pages/support-tickets"));

// Import support admin pages
import SupportLogin from "@/pages/support-login";

// Import modals
import { JobModal } from "@/components/modals/job-modal";
import { CustomerModal } from "@/components/modals/customer-modal";
import { UpgradeModal } from "@/components/modals/upgrade-modal";

// Import AI chat widget
import { AIChatWidget } from "@/components/ai-chat/AIChatWidget";

// Import Facebook Pixel tracking
import { FacebookPixel } from "@/components/tracking/FacebookPixel";

// Import support portal components
import { SupportLayout } from "@/components/support/SupportLayout";
import SupportDashboard from "@/pages/support/dashboard";
import TicketQueue from "@/pages/support/tickets";
import TicketDetail from "@/pages/support/ticket-detail";
import MyTickets from "@/pages/support/my-tickets";

// Lazy load support admin components for performance
const SupportAdminDashboard = lazy(() => import("@/pages/support/admin/dashboard"));
const SupportUsersAdmin = lazy(() => import("@/pages/support/admin/users"));
const SupportInvitesAdmin = lazy(() => import("@/pages/support/admin/invites"));
const SupportAuditAdmin = lazy(() => import("@/pages/support/admin/audit"));

// Lazy load business admin components for performance
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const OrganizationsAdmin = lazy(() => import("@/pages/admin/organizations"));
const AnalyticsAdmin = lazy(() => import("@/pages/admin/analytics"));
const BlogAdmin = lazy(() => import("@/pages/admin/blog"));
const AdminSupportPage = lazy(() => import("@/pages/admin/support"));
import { AdminLayout } from "@/components/admin/AdminLayout";

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

// Business Admin Route Protection - only for keith.richmond@live.com
function AdminRoute({
  component: Component,
  ...props
}: {
  component: React.ComponentType<any>;
  [key: string]: any;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking admin access...</p>
        </div>
      </div>
    );
  }

  // Only allow admin portal access for business owner
  if (!user || user.email !== "keith.richmond@live.com") {
    return <NotFound />;
  }

  return <Component {...props} />;
}

// Support Portal App content - authenticated support users
function SupportAppContent() {
  const { isLoading, isAuthenticated } = useSupportAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading support portal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/support-admin/login" component={SupportLogin} />
        <Route path="*" component={SupportLogin} />
      </Switch>
    );
  }

  return (
    <SupportLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }
      >
        <Switch>
          <Route path="/support-admin/tickets" component={TicketQueue} />
          <Route path="/support-admin/tickets/:id" component={TicketDetail} />
          <Route path="/support-admin/my-tickets" component={MyTickets} />

          {/* Admin Routes - Only accessible to support_admin role */}
          <Route path="/support-admin/admin" component={SupportAdminDashboard} />
          <Route path="/support-admin/users" component={SupportUsersAdmin} />
          <Route path="/support-admin/invites" component={SupportInvitesAdmin} />
          <Route path="/support-admin/audit" component={SupportAuditAdmin} />

          {/* Default dashboard route - must be last */}
          <Route path="/support-admin" component={SupportDashboard} />
          <Route component={SupportDashboard} />
        </Switch>
      </Suspense>
    </SupportLayout>
  );
}

// Support Portal App wrapper
function SupportApp() {
  return (
    <SupportAuthProvider>
      <SupportAppContent />
    </SupportAuthProvider>
  );
}

// Business Admin Portal App content
function AdminAppContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin portal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/auth/login" component={Login} />
        <Route path="*" component={Login} />
      </Switch>
    );
  }

  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }
      >
        <Switch>
          <Route path="/admin/organizations" component={() => <AdminRoute component={OrganizationsAdmin} />} />
          <Route path="/admin/analytics" component={() => <AdminRoute component={AnalyticsAdmin} />} />
          <Route path="/admin/blog" component={() => <AdminRoute component={BlogAdmin} />} />
          <Route path="/admin/support" component={() => <AdminRoute component={AdminSupportPage} />} />

          {/* Default admin dashboard route - must be last */}
          <Route path="/admin" component={() => <AdminRoute component={AdminDashboard} />} />
          <Route component={() => <AdminRoute component={AdminDashboard} />} />
        </Switch>
      </Suspense>
    </AdminLayout>
  );
}

// Business Admin Portal App wrapper
function AdminApp() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <AdminAppContent />
      </TooltipProvider>
    </AuthProvider>
  );
}

function AuthenticatedApp() {
  const [location] = useLocation();
  const { user, isProUser } = useAuth();
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  
  // 🆕 Service request prefill data
  const [jobModalPrefillData, setJobModalPrefillData] = useState<any>(null);

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
          onAddNew: () => ((window as any).location = "/customers/new"),
        };
      case "/equipment":
        return {
          title: "Equipment",
          subtitle: "Track and manage equipment",
          addNewText: "New Equipment",
          onAddNew: () => {},
        };
      case "/teams":
        return {
          title: "Teams",
          subtitle: "Manage team members and assignments",
          addNewText: "Add Member",
          onAddNew: () => {},
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
      {/* 🆕 Pass callback to Sidebar */}
      <Sidebar 
        onCreateJobFromServiceRequest={(data) => {
          setJobModalPrefillData(data);
          setIsJobModalOpen(true);
        }}
      />

      <div className="flex-1 sm:ml-64 flex flex-col min-h-0">
        {/* 🆕 Pass callback to MobileHeader */}
        <MobileHeader 
          onCreateJobFromServiceRequest={(data) => {
            setJobModalPrefillData(data);
            setIsJobModalOpen(true);
          }}
        />

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

            {/* ✅ Customer Portal routes (inside main app too, in case staff ever uses it) */}
            <Route path="/portal/login" component={PortalLogin} />
            <Route path="/portal/equipment" component={PortalEquipmentList} />
            <Route path="/portal/equipment/:id" component={PortalEquipmentDetail} />

            <Route path="/quotes">{() => <ProtectedRoute component={Quotes} allowedRoles={["admin", "manager"]} />}</Route>
            <Route path="/quotes/new">{() => <ProtectedRoute component={QuoteEdit} allowedRoles={["admin", "manager"]} />}</Route>
            <Route path="/quotes/:id">{() => <ProtectedRoute component={QuoteView} allowedRoles={["admin", "manager"]} />}</Route>
            <Route path="/quotes/:id/edit">{() => <ProtectedRoute component={QuoteEdit} allowedRoles={["admin", "manager"]} />}</Route>

            <Route path="/invoices">{() => <ProtectedRoute component={Invoices} allowedRoles={["admin", "manager"]} />}</Route>
            <Route path="/invoices/new">{() => <ProtectedRoute component={InvoiceEdit} allowedRoles={["admin", "manager"]} />}</Route>
            <Route path="/invoices/:id">{() => <ProtectedRoute component={InvoiceView} allowedRoles={["admin", "manager"]} />}</Route>
            <Route path="/invoices/:id/edit">{() => <ProtectedRoute component={InvoiceEdit} allowedRoles={["admin", "manager"]} />}</Route>

            <Route path="/settings">
              {() => (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  }
                >
                  <ProtectedRoute component={SettingsPage} allowedRoles={["admin", "manager"]} />
                </Suspense>
              )}
            </Route>

            <Route path="/members">
              {() => (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  }
                >
                  <ProtectedRoute component={MembersPage} allowedRoles={["admin", "manager"]} />
                </Suspense>
              )}
            </Route>

            <Route path="/jobs/:id">{() => <JobView />}</Route>
            <Route path="/jobs/:id/edit">{() => <JobEdit />}</Route>
            <Route path="/jobs/:id/notes">{() => <JobNotesCharges />}</Route>
            <Route path="/customers/:id">{() => <CustomerView />}</Route>
            <Route path="/equipment/:id">{() => <EquipmentView />}</Route>

            <Route path="/support">
              {() => (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  }
                >
                  <CustomerSupportDashboard />
                </Suspense>
              )}
            </Route>

            <Route path="/support/new">
              {() => (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  }
                >
                  <CreateSupportTicket />
                </Suspense>
              )}
            </Route>

            <Route path="/support/tickets">
              {() => (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  }
                >
                  <SupportTicketsList />
                </Suspense>
              )}
            </Route>

            <Route path="/support/ticket/:id">
              {() => (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  }
                >
                  <SupportTicketDetail />
                </Suspense>
              )}
            </Route>

            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/trial-expired" component={TrialExpired} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>

      {/* 🆕 Pass prefill data to JobModal */}
      <JobModal 
        open={isJobModalOpen} 
        onOpenChange={(open) => {
          setIsJobModalOpen(open);
          if (!open) setJobModalPrefillData(null);
        }}
        prefillData={jobModalPrefillData}
      />
      <CustomerModal open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen} />
      <UpgradeModal open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen} />

      <AIChatWidget />
    </div>
  );
}

// ✅ NEW: Customer Portal App (separate from Taska staff auth)
function PortalApp() {
  return (
    <Switch>
      <Route path="/portal/:org/login" component={PortalLogin} />
      <Route path="/portal/:org/equipment" component={PortalEquipmentList} />
      <Route path="/portal/:org/equipment/:id" component={PortalEquipmentDetail} />

      {/* Backwards compatible / default */}
      <Route path="/portal/login" component={PortalLogin} />
      <Route component={PortalLogin} />
    </Switch>
  );
}

// Customer App Content - uses customer auth context
function CustomerAppContent() {
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
        <Route path="/" component={Landing} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/auth/register" component={Register} />
        <Route path="/auth/login" component={Login} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="*" component={Login} />
      </Switch>
    );
  }

  return <AuthenticatedApp />;
}

// Customer App wrapper with customer auth provider
function CustomerApp() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <SubscriptionErrorModalProvider>
          <CustomerAppContent />
        </SubscriptionErrorModalProvider>
      </TooltipProvider>
    </AuthProvider>
  );
}

// Top-level App Content with route branching BEFORE any hook calls
function AppContent() {
  const [location] = useLocation();

  // ✅ Customer portal routes - separate app (no Taska login required)
  if (location.startsWith("/portal")) {
    return <PortalApp />;
  }

  // Business admin portal routes - completely separate app with own auth
  if (location.startsWith("/admin")) {
    return <AdminApp />;
  }

  // Support admin portal routes - completely separate app with own auth
  if (location.startsWith("/support-admin")) {
    return <SupportApp />;
  }

  // Customer app routes (including customer support at /support/*)
  return <CustomerApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <FacebookPixel />
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
