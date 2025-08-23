import { useRoute, useLocation } from "wouter";

/**
 * Figures out a friendly title from the current path.
 * Add more patterns as you add pages.
 */
export function usePageTitle(): string {
  const [loc] = useLocation();

  // Call all hooks at the top level - no early returns
  const [mProfileEdit] = useRoute("/profile/edit");
  const [mProfile] = useRoute("/profile");
  const [mCustomerEdit] = useRoute("/customers/:id/edit");
  const [mCustomerView] = useRoute("/customers/:id");
  const [mCustomers] = useRoute("/customers");
  const [mEquipEdit] = useRoute("/equipment/:id/edit");
  const [mEquipView] = useRoute("/equipment/:id");
  const [mEquip] = useRoute("/equipment");
  const [mJobEdit] = useRoute("/jobs/:id/edit");
  const [mJobView] = useRoute("/jobs/:id");
  const [mJobs] = useRoute("/jobs");
  const [mQuotesEdit] = useRoute("/quotes/:id/edit");
  const [mQuotesView] = useRoute("/quotes/:id");
  const [mQuotes] = useRoute("/quotes");
  const [mInvoicesEdit] = useRoute("/invoices/:id/edit");
  const [mInvoicesView] = useRoute("/invoices/:id");
  const [mInvoices] = useRoute("/invoices");
  const [mSchedule] = useRoute("/schedule");
  const [mMembers] = useRoute("/members");
  const [mSettings] = useRoute("/settings");
  const [mJobNotesCharges] = useRoute("/jobs/:id/notes");
  const [mDashboard] = useRoute("/");

  // Now check matches - specific to general (order matters)
  if (mProfileEdit) return "Edit Profile";
  if (mProfile) return "Profile";
  if (mCustomerEdit) return "Edit Customer";
  if (mCustomerView) return "Customer";
  if (mCustomers) return "Customers";
  if (mEquipEdit) return "Edit Equipment";
  if (mEquipView) return "Equipment";
  if (mEquip) return "Equipment";
  if (mJobEdit) return "Edit Job";
  if (mJobView) return "Job";
  if (mJobs) return "Jobs";
  if (mQuotesEdit) return "Edit Quote";
  if (mQuotesView) return "Quote";
  if (mQuotes) return "Quotes";
  if (mInvoicesEdit) return "Edit Invoice";
  if (mInvoicesView) return "Invoice";
  if (mInvoices) return "Invoices";
  if (mSchedule) return "Schedule";
  if (mMembers) return "Team Members";
  if (mSettings) return "Settings";
  if (mJobNotesCharges) return "Notes & Charges";
  if (mDashboard) return "Dashboard";

  // Last resort: don't scream "Page Not Found"—show app name
  return "Taska";
}

/** Lightweight header text for the mobile top bar (or anywhere you need it) */
export function RouteHeader() {
  const title = usePageTitle();
  return <span className="text-base font-semibold truncate">{title}</span>;
}