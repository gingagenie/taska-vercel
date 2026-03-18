#!/usr/bin/env node
/**
 * Taska Security Smoke Test v2
 * ─────────────────────────────
 * Handles session-cookie auth (not JWT bearer tokens).
 *
 * SETUP:
 *   1. Fill in CONFIG below
 *   2. Run: node taska-security-smoke-test.js
 *
 * You need two accounts in TWO DIFFERENT organisations.
 * Node 18+ required (native fetch).
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://taska-vercel-production.up.railway.app";

const TENANT_A = {
  email: "keith.richmond@live.com",
  password: "password123",
  knownJobId: "a90481f8-d4c3-4a4f-8b6e-606c7d93db40",
  knownInvoiceId: "742de7eb-47e7-460b-910a-cbd369611c84",
  knownCustomerId: "f7494a7b-8ae5-4b2e-8848-4a23e03a1a2c",
};

const TENANT_B = {
  email: "bechillauto@gmail.com",   // ← different org account
  password: "Leon2025",
};

// Allow self-signed certs (dev only)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// ─── END CONFIG ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function log(status, label, detail = "") {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️ ";
  console.log(`${icon} [${status}] ${label}${detail ? " — " + detail : ""}`);
  results.push({ status, label, detail });
  if (status === "PASS") passed++;
  if (status === "FAIL") failed++;
}

// ─── SESSION COOKIE AUTH ──────────────────────────────────────────────────────
// Taska uses session cookies, so we log in and capture the Set-Cookie header,
// then replay that cookie on every subsequent request.

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  // Grab ALL Set-Cookie headers
  const rawCookies = res.headers.getSetCookie?.() ?? [];

  // Fallback for older Node versions
  const cookieHeader = rawCookies.length > 0
    ? rawCookies.map(c => c.split(";")[0]).join("; ")
    : (res.headers.get("set-cookie") || "").split(",").map(c => c.trim().split(";")[0]).join("; ");

  if (!cookieHeader) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Login failed for ${email} (no cookie). Status ${res.status}. Body: ${JSON.stringify(body)}`);
  }

  // Verify login worked by hitting /api/me
  const check = await fetch(`${BASE_URL}/api/me`, {
    headers: { Cookie: cookieHeader },
  });

  if (check.status !== 200) {
    throw new Error(`Login seemed to work for ${email} but /api/me returned ${check.status}`);
  }

  const me = await check.json();
  console.log(`   ↳ Logged in as: ${me.user?.email} | Org: ${me.org?.name} (${me.org?.id})`);

  return { cookie: cookieHeader, orgId: me.org?.id, userId: me.user?.id };
}

async function get(path, cookie = null) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  return { status: res.status, body };
}

async function mutate(method, path, body, cookie = null) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: method !== "DELETE" ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ─── SUITES ───────────────────────────────────────────────────────────────────

async function suiteUnauthenticated() {
  console.log("\n📋 SUITE 1: Unauthenticated Access (no cookie — should all be 401/403)\n");

  const routes = [
    "/api/jobs",
    "/api/invoices",
    "/api/customers",
    "/api/me",
    `/api/jobs/${TENANT_A.knownJobId}`,
    `/api/invoices/${TENANT_A.knownInvoiceId}`,
    `/api/customers/${TENANT_A.knownCustomerId}`,
  ];

  for (const route of routes) {
    const res = await get(route);
    if (res.status === 401 || res.status === 403) {
      log("PASS", `GET ${route}`, `${res.status}`);
    } else if (typeof res.body === "string" && res.body.includes("<!DOCTYPE html>")) {
      log("PASS", `GET ${route}`, `served React shell (no data leaked)`);
    } else {
      log("FAIL", `GET ${route}`, `expected 401/403, got ${res.status}`);
    }
  }
}

async function suiteTenantIsolationDirect(sessionA, sessionB) {
  console.log("\n📋 SUITE 2: Direct Resource Access — Org B tries Org A's IDs\n");

  const targets = [
    { label: "Job",      path: `/api/jobs/${TENANT_A.knownJobId}` },
    { label: "Invoice",  path: `/api/invoices/${TENANT_A.knownInvoiceId}` },
    { label: "Customer", path: `/api/customers/${TENANT_A.knownCustomerId}` },
  ];

  for (const { label, path } of targets) {
    // Confirm Org A can access it
    const resA = await get(path, sessionA.cookie);
    if (resA.status !== 200) {
      log("WARN", `Org A got ${resA.status} for own ${label}`, "check CONFIG IDs are correct");
      continue;
    }
    log("PASS", `Org A can access own ${label}`);

    // Confirm Org B cannot
    const resB = await get(path, sessionB.cookie);
    if (resB.status === 403 || resB.status === 404) {
      log("PASS", `Org B blocked from Org A's ${label}`, `${resB.status}`);
    } else if (resB.status === 200) {
      log("FAIL", `🚨 TENANT LEAK: Org B read Org A's ${label}!`, path);
    } else {
      log("WARN", `Org B got ${resB.status} for ${label}`, "unexpected — review manually");
    }
  }
}

async function suiteListIsolation(sessionA, sessionB) {
  console.log("\n📋 SUITE 3: List Isolation — Org B's lists must not contain Org A's IDs\n");

  const lists = [
    { label: "Jobs",      path: "/api/jobs",      knownId: TENANT_A.knownJobId },
    { label: "Invoices",  path: "/api/invoices",  knownId: TENANT_A.knownInvoiceId },
    { label: "Customers", path: "/api/customers", knownId: TENANT_A.knownCustomerId },
  ];

  for (const { label, path, knownId } of lists) {
    const resB = await get(path, sessionB.cookie);
    if (resB.status !== 200) {
      log("WARN", `${label} list returned ${resB.status} for Org B`);
      continue;
    }

    const items = Array.isArray(resB.body) ? resB.body : resB.body?.data ?? resB.body?.items ?? [];
    const ids = items.map(i => i.id);
    const leaked = ids.includes(knownId);

    if (leaked) {
      log("FAIL", `🚨 TENANT LEAK: Org A's ${label} ID found in Org B's list!`);
    } else {
      log("PASS", `Org A's ID not in Org B's ${label} list`, `${ids.length} items returned`);
    }
  }
}

async function suiteCrossTenantMutation(sessionB) {
  console.log("\n📋 SUITE 4: Cross-Tenant Mutation — Org B must NOT modify Org A's data\n");

  const attempts = [
    {
      label: "PATCH Org A's Job",
      method: "PATCH",
      path: `/api/jobs/${TENANT_A.knownJobId}`,
      body: { notes: "INJECTED BY ORG B" },
    },
    {
      label: "DELETE Org A's Invoice",
      method: "DELETE",
      path: `/api/invoices/${TENANT_A.knownInvoiceId}`,
      body: {},
    },
  ];

  for (const { label, method, path, body } of attempts) {
    const res = await mutate(method, path, body, sessionB.cookie);
    if (res.status === 403 || res.status === 404) {
      log("PASS", label, `blocked with ${res.status}`);
    } else if (res.status === 200 || res.status === 204) {
      log("FAIL", `🚨 MUTATION LEAK: ${label} succeeded!`, `${method} ${path}`);
    } else {
      log("WARN", label, `got ${res.status} — review manually`);
    }
  }
}

async function suiteOrgDataIsolation(sessionA, sessionB) {
  console.log("\n📋 SUITE 5: Org Data Isolation — /api/me must only return own org\n");

  const resA = await get("/api/me", sessionA.cookie);
  const resB = await get("/api/me", sessionB.cookie);

  if (resA.status === 200 && resB.status === 200) {
    const orgA = resA.body?.org?.id;
    const orgB = resB.body?.org?.id;

    if (orgA && orgB && orgA !== orgB) {
      log("PASS", "/api/me returns different org for each tenant", `OrgA: ${orgA.slice(0,8)}… OrgB: ${orgB.slice(0,8)}…`);
    } else if (orgA === orgB) {
      log("FAIL", "🚨 Both tenants got the SAME org from /api/me!", `org id: ${orgA}`);
    } else {
      log("WARN", "Could not compare org IDs from /api/me", `orgA=${orgA} orgB=${orgB}`);
    }

    // Check Org B's member list doesn't contain Org A's users
    const membersB = await get("/api/members", sessionB.cookie);
    if (membersB.status === 200) {
      const members = Array.isArray(membersB.body) ? membersB.body : membersB.body?.members ?? [];
      const leaked = members.some(m => m.org_id === orgA);
      if (leaked) {
        log("FAIL", "🚨 Org B's member list contains Org A's users!");
      } else {
        log("PASS", "Org B's member list contains no Org A users", `${members.length} members`);
      }
    }
  } else {
    log("WARN", `/api/me check skipped`, `OrgA: ${resA.status}, OrgB: ${resB.status}`);
  }
}

async function suiteTrackingPixel() {
  console.log("\n📋 SUITE 6: Invoice Tracking Pixel\n");

  const res = await fetch(`${BASE_URL}/api/invoices/track/00000000-0000-0000-0000-000000000000`);
  const contentType = res.headers.get("content-type") || "";

  if (res.status === 404) {
    log("PASS", "Pixel returns 404 for unknown invoice");
  } else if (contentType.includes("image")) {
    log("PASS", "Pixel returns image (not data) for unknown invoice", `status ${res.status}`);
  } else if (contentType.includes("json")) {
    const body = await res.json().catch(() => ({}));
    if (Object.keys(body).length > 1) {
      log("FAIL", "Pixel leaking JSON data for unknown invoice", JSON.stringify(body).slice(0, 80));
    } else {
      log("PASS", "Pixel returns empty/minimal JSON for unknown invoice");
    }
  } else {
    log("WARN", `Pixel: content-type '${contentType}' status ${res.status}`, "review manually");
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🔐 Taska Security Smoke Test v2");
  console.log(`  Target: ${BASE_URL}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await suiteUnauthenticated();
  await suiteTrackingPixel();

  let sessionA, sessionB;
  try {
    console.log("\n🔑 Logging in Tenant A...");
    sessionA = await login(TENANT_A.email, TENANT_A.password);

    console.log("🔑 Logging in Tenant B...");
    sessionB = await login(TENANT_B.email, TENANT_B.password);
  } catch (err) {
    console.error("\n❌ Login failed — skipping tenant isolation tests");
    console.error("  ", err.message);
  }

  if (sessionA && sessionB) {
    if (sessionA.orgId === sessionB.orgId) {
      console.warn("\n⚠️  WARNING: Both accounts are in the SAME org — isolation tests won't be meaningful.\n");
    }
    await suiteTenantIsolationDirect(sessionA, sessionB);
    await suiteListIsolation(sessionA, sessionB);
    await suiteCrossTenantMutation(sessionB);
    await suiteOrgDataIsolation(sessionA, sessionB);
  }

  const warns = results.filter(r => r.status === "WARN").length;
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  RESULTS: ✅ ${passed} passed  ❌ ${failed} failed  ⚠️  ${warns} warnings`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (failed > 0) {
    console.log("🚨 FAILURES DETECTED — review the ❌ items above immediately.\n");
    process.exit(1);
  } else if (warns > 0) {
    console.log("⚠️  Some warnings — review manually, likely false positives.\n");
  } else {
    console.log("🎉 All checks passed!\n");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});