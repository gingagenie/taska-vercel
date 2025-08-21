import { apiRequest } from "./queryClient";

// Add auth headers to requests
function addAuthHeaders(headers: HeadersInit = {}) {
  const userId = localStorage.getItem("user-id") || "user-1";
  const orgId = localStorage.getItem("selected-org-id") || "org-1";
  
  return {
    ...headers,
    "x-user-id": userId,
    "x-org-id": orgId,
  };
}

export async function apiGet(url: string) {
  const response = await fetch(url, {
    headers: addAuthHeaders(),
    credentials: "include",
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

export async function apiPost(url: string, data?: unknown) {
  return apiRequest("POST", url, data);
}

export async function apiPut(url: string, data?: unknown) {
  return apiRequest("PUT", url, data);
}

export async function apiDelete(url: string) {
  return apiRequest("DELETE", url);
}

// Specific API functions for different entities
export const jobsApi = {
  getAll: () => apiGet("/api/jobs"),
  create: (data: any) => apiPost("/api/jobs/create", data),
  assignTechnician: (jobId: string, userId: string) => 
    apiPost(`/api/jobs/${jobId}/assign/tech`, { userId }),
  assignEquipment: (jobId: string, equipmentId: string) => 
    apiPost(`/api/jobs/${jobId}/assign/equipment`, { equipmentId }),
  getCustomers: () => apiGet("/api/jobs/customers"),
  getEquipment: () => apiGet("/api/jobs/equipment"),
};

export const customersApi = {
  getAll: () => apiGet("/api/customers"),
  create: (data: any) => apiPost("/api/customers", data),
};

export const equipmentApi = {
  getAll: () => apiGet("/api/equipment"),
  create: (data: any) => apiPost("/api/equipment", data),
};

export const teamsApi = {
  getAll: () => apiGet("/api/teams"),
  addMember: (data: any) => apiPost("/api/teams/add-member", data),
};

export const quotesApi = {
  getAll: () => apiGet("/api/quotes"),
  create: (data: any) => apiPost("/api/quotes", data),
  convert: (quoteId: string) => apiPost(`/api/quotes/${quoteId}/convert`, {}),
};

export const invoicesApi = {
  getAll: () => apiGet("/api/invoices"),
  create: (data: any) => apiPost("/api/invoices", data),
};
