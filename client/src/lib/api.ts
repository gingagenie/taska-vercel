import { API_BASE_URL } from "../config";

export async function api(path:string, init:RequestInit = {}) {
  const headers = new Headers(init.headers||{});
  headers.set("content-type","application/json");
  // TEMP: replace these with real IDs after login is wired
  headers.set("x-user-id", "315e3119-1b17-4dee-807f-bbc1e4d5c5b6");
  headers.set("x-org-id", "4500ba4e-e575-4f82-b196-27dd4c7d0eaf");
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Customers API
export const customersApi = {
  getAll: () => api("/api/customers"),
  create: (data: any) => api("/api/customers", { 
    method: "POST", 
    body: JSON.stringify(data) 
  })
};

// Jobs API
export const jobsApi = {
  getAll: () => api("/api/jobs"),
  getCustomers: () => api("/api/jobs/customers"),
  getEquipment: () => api("/api/jobs/equipment"),
  create: (data: any) => api("/api/jobs/create", {
    method: "POST",
    body: JSON.stringify(data)
  }),
  assignTech: (jobId: string, userId: string) => api(`/api/jobs/${jobId}/assign/tech`, {
    method: "POST",
    body: JSON.stringify({ userId })
  }),
  assignEquipment: (jobId: string, equipmentId: string) => api(`/api/jobs/${jobId}/assign/equipment`, {
    method: "POST",
    body: JSON.stringify({ equipmentId })
  })
};

// Equipment API
export const equipmentApi = {
  getAll: () => api("/api/equipment"),
  create: (data: any) => api("/api/equipment", { 
    method: "POST", 
    body: JSON.stringify(data) 
  })
};

// Teams API
export const teamsApi = {
  getAll: () => api("/api/teams"),
  addMember: (data: any) => api("/api/teams/add-member", {
    method: "POST",
    body: JSON.stringify(data)
  })
};

// Quotes API (stub)
export const quotesApi = {
  getAll: () => api("/api/quotes"),
  create: (data: any) => api("/api/quotes", { 
    method: "POST", 
    body: JSON.stringify(data) 
  })
};

// Invoices API (stub)
export const invoicesApi = {
  getAll: () => api("/api/invoices"),
  create: (data: any) => api("/api/invoices", { 
    method: "POST", 
    body: JSON.stringify(data) 
  })
};