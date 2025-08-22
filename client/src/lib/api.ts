// client/src/lib/api.ts
const BASE = import.meta.env.VITE_API_BASE_URL || "";

/** Demo/dev auth headers (overridable via setAuth) */
function getAuthHeaders() {
  const uid = localStorage.getItem("x-user-id") || "315e3119-1b17-4dee-807f-bbc1e4d5c5b6";
  const oid = localStorage.getItem("x-org-id") || "4500ba4e-e575-4f82-b196-27dd4c7d0eaf";
  return { "x-user-id": uid, "x-org-id": oid };
}

/** Low-level fetcher with timeout + good errors */
export async function api(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(init.headers as Record<string, string> || {}),
  };
  
  // Only set Content-Type for non-FormData requests
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // ⏱️ 15s timeout so the UI never spins forever
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 15000);
  
  const url = `${BASE}${path}`;
  console.log("[api] ->", url, init.method || "GET");

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e: any) {
    clearTimeout(to);
    if (e?.name === "AbortError") throw new Error("Request timed out");
    throw new Error(e?.message || "Network error");
  }
  clearTimeout(to);

  const text = await res.text();

  if (!res.ok) {
    // Try to surface JSON error shape {error|message}
    try {
      const err = JSON.parse(text || "{}");
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  return text ? JSON.parse(text) : null;
}

/** Allow UI to set real auth later (e.g., after login) */
export function setAuth(uid: string, oid: string) {
  localStorage.setItem("x-user-id", uid);
  localStorage.setItem("x-org-id", oid);
}

/* ------------------------------------------------------------------ */
/* Convenience API wrappers so existing imports don't break            */
/* ------------------------------------------------------------------ */

export const jobsApi = {
  getAll: () => api("/api/jobs"),
  get: (id: string) => api(`/api/jobs/${id}`),
  create: (body: any) =>
    api("/api/jobs/create", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: any) =>
    api(`/api/jobs/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  customers: () => api("/api/jobs/customers"),
  equipment: () => api("/api/jobs/equipment"),
  delete: (id: string) => api(`/api/jobs/${id}`, { method: "DELETE" }),
  byRange: (startISO: string, endISO: string, techId?: string) =>
    api(`/api/jobs/range?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}${techId ? `&techId=${encodeURIComponent(techId)}` : ""}`),
  technicians: () => api("/api/jobs/technicians"),
  reschedule: (id: string, scheduledAtISO: string) =>
    api(`/api/jobs/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ scheduledAt: scheduledAtISO }) }),
};

export const customersApi = {
  getAll: () => api("/api/customers"),
  get: (id: string) => api(`/api/customers/${id}`),
  create: (body: any) => api("/api/customers", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: any) => api(`/api/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (id: string) => api(`/api/customers/${id}`, { method: "DELETE" }),
};

export const notesApi = {
  list: (jobId: string) => api(`/api/jobs/${jobId}/notes`),
  add: (jobId: string, text: string) => api(`/api/jobs/${jobId}/notes`, { method: "POST", body: JSON.stringify({ text }) }),
};

export const chargesApi = {
  list: (jobId: string) => api(`/api/jobs/${jobId}/charges`),
  add: (jobId: string, body: any) => api(`/api/jobs/${jobId}/charges`, { method: "POST", body: JSON.stringify(body) }),
};

export const photosApi = {
  list: (jobId: string) => api(`/api/jobs/${jobId}/photos`),
  upload: (jobId: string, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return api(`/api/jobs/${jobId}/photos`, { method: "POST", body: form as any });
  },
  remove: (jobId: string, photoId: string) => api(`/api/jobs/${jobId}/photos/${photoId}`, { method: "DELETE" }),
};

export const teamsApi = {
  getAll: () => api("/api/teams"),
  addMember: (body: any) =>
    api("/api/teams/add-member", { method: "POST", body: JSON.stringify(body) }),
};

export const equipmentApi = {
  getAll: () => api("/api/equipment"),
  get: (id: string) => api(`/api/equipment/${id}`),
  create: (body: any) =>
    api("/api/equipment", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: any) =>
    api(`/api/equipment/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (id: string) => api(`/api/equipment/${id}`, { method: "DELETE" }),
};

/** PRO features (routes assumed as /api/quotes and /api/invoices) */
export const quotesApi = {
  getAll: () => api("/api/quotes"),
  get: (id: string) => api(`/api/quotes/${id}`),
  create: (body: any) =>
    api("/api/quotes", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: any) =>
    api(`/api/quotes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  // Optional helpers
  convertToJob: (id: string) => api(`/api/quotes/${id}/convert`, { method: "POST" }),
};

export const invoicesApi = {
  getAll: () => api("/api/invoices"),
  get: (id: string) => api(`/api/invoices/${id}`),
  create: (body: any) =>
    api("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: any) =>
    api(`/api/invoices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  // Optional helpers
  markPaid: (id: string) => api(`/api/invoices/${id}/pay`, { method: "POST" }),
};

// Photos API helper functions already defined above in photosApi
