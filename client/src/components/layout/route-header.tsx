import { useRoute, useLocation } from "wouter";

/**
 * Figures out a friendly title from the current path.
 * Add more patterns as you add pages.
 */
export function usePageTitle(): string {
  const [loc] = useLocation();

  // Specific -> general (order matters)
  const [mProfileEdit] = useRoute("/profile/edit");
  if (mProfileEdit) return "Edit Profile";

  const [mProfile] = useRoute("/profile");
  if (mProfile) return "Profile";

  const [mCustomerEdit] = useRoute("/customers/:id/edit");
  if (mCustomerEdit) return "Edit Customer";

  const [mCustomerView] = useRoute("/customers/:id");
  if (mCustomerView) return "Customer";

  const [mCustomers] = useRoute("/customers");
  if (mCustomers) return "Customers";

  const [mEquipEdit] = useRoute("/equipment/:id/edit");
  if (mEquipEdit) return "Edit Equipment";

  const [mEquipView] = useRoute("/equipment/:id");
  if (mEquipView) return "Equipment";

  const [mEquip] = useRoute("/equipment");
  if (mEquip) return "Equipment";

  const [mJobEdit] = useRoute("/jobs/:id/edit");
  if (mJobEdit) return "Edit Job";

  const [mJobView] = useRoute("/jobs/:id");
  if (mJobView) return "Job";

  const [mJobs] = useRoute("/jobs");
  if (mJobs) return "Jobs";

  const [mQuotesEdit] = useRoute("/quotes/:id/edit");
  if (mQuotesEdit) return "Edit Quote";
  const [mQuotesView] = useRoute("/quotes/:id");
  if (mQuotesView) return "Quote";
  const [mQuotes] = useRoute("/quotes");
  if (mQuotes) return "Quotes";

  const [mInvoicesEdit] = useRoute("/invoices/:id/edit");
  if (mInvoicesEdit) return "Edit Invoice";
  const [mInvoicesView] = useRoute("/invoices/:id");
  if (mInvoicesView) return "Invoice";
  const [mInvoices] = useRoute("/invoices");
  if (mInvoices) return "Invoices";

  const [mSchedule] = useRoute("/schedule");
  if (mSchedule) return "Schedule";

  const [mMembers] = useRoute("/members");
  if (mMembers) return "Team Members";

  const [mSettings] = useRoute("/settings");
  if (mSettings) return "Settings";

  const [mJobNotesCharges] = useRoute("/jobs/:id/notes");
  if (mJobNotesCharges) return "Notes & Charges";

  const [mDashboard] = useRoute("/");
  if (mDashboard) return "Dashboard";

  // Last resort: don't scream "Page Not Found"—show app name
  return "Taska";
}

/** Lightweight header text for the mobile top bar (or anywhere you need it) */
export function RouteHeader() {
  const title = usePageTitle();
  return <span className="text-base font-semibold truncate">{title}</span>;
}