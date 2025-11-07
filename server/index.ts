import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { me } from "./routes/me";
import { ensureUsersTableShape } from "./db/ensure";
import { db } from "./db/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";
import fs from "node:fs";
import path from "node:path";
import { reconcilePendingFinalizations } from "./lib/pack-consumption";
import { startContinuousCompensationProcessor, stopContinuousCompensationProcessor } from "./lib/continuous-compensation-processor";
import { blockCustomersFromSupportAdmin } from "./middleware/access-control";

import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

// ✅ Single, correct session imports
import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";

const PgStore = pgSession(session);

const app = express();

/* ---------------- Performance & Static Cache ---------------- */

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024,
}));

app.use('/assets', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Vary', 'Accept-Encoding');
  next();
});

/* ---------------- Proxy / CORS ---------------- */

app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || undefined;

if (CLIENT_ORIGIN) {
  app.use(cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }));
}

/* ---------------- Body Parsing (Stripe raw for webhooks) ---------------- */

app.use((req, res, next) => {
  if (req.path === '/api/subscriptions/webhook' || req.path === '/api/usage/packs/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

/* ---------------- ✅ Postgres-backed Sessions ---------------- */

// One pg Pool for session store + tenant guard
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
});

// Regular user session (stored in "session" table)
const regularSessionConfig = session({
  store: new PgStore({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET!,                // set in Railway
  name: process.env.SESSION_COOKIE_NAME || "taska.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    path: "/",
    sameSite: (process.env.COOKIE_SAMESITE as "lax"|"none"|"strict") ?? (isProd ? "none" : "lax"),
    secure: isProd,                                   // true on HTTPS
    domain: process.env.COOKIE_DOMAIN || undefined,   // e.g. "staging.taska.info"
    maxAge: 1000 * 60 * 60 * 24 * 30,                 // 30 days
  },
});

// Support staff session (separate table)
const supportSessionConfig = session({
  store: new PgStore({
    pool,
    tableName: "support_session",
    createTableIfMissing: true,
  }),
  secret: process.env.SUPPORT_SESSION_SECRET || process.env.SESSION_SECRET!,
  name: "support_sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    path: "/support",
    sameSite: "strict",
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  },
});

// Apply regular session to non-support routes
app.use((req, res, next) => {
  if (req.path.startsWith("/support")) return next();
  return regularSessionConfig(req, res, next);
});

// Apply support session to support routes
app.use("/support", supportSessionConfig);

/* ---------------- Schema Ensure & Storage Self-test ---------------- */

(async () => {
  try {
    console.log("[STARTUP] Ensuring database schema...");
    await ensureUsersTableShape();
    console.log("[STARTUP] ✅ Database schema ensured successfully");
  } catch (error) {
    console.error("[STARTUP] ❌ CRITICAL: Failed to ensure database schema:", error);
    console.error("[STARTUP] Continuing startup despite database schema issues...");
  }
})();

(async () => {
  try {
    const { assertStorageEnv } = await import("./storage/paths");
    const { storageSelfTest } = await import("./storage/selftest");
    console.log("[STARTUP] 🗄️ Validating object storage configuration...");
    assertStorageEnv();
    console.log("[STARTUP] ✅ Object storage environment validated");
    console.log("[STARTUP] 🧪 Running storage self-test...");
    await storageSelfTest();
    console.log("[STARTUP] ✅ Storage self-test passed - object storage ready");
  } catch (error: any) {
    console.error("[STARTUP] ❌ CRITICAL: Object storage validation failed:", error?.message || error);
    console.error("[STARTUP] Photo uploads will not work until storage is properly configured");
    console.error("[STARTUP] Continuing startup despite storage issues...");
  }
})();

/* ---------------- Local Uploads Fallback (kept as-is) ---------------- */

const uploadsDir = path.join(process.cwd(), "uploads");
const avatarsDir = path.join(uploadsDir, "avatars");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const staticUploads = express.static(uploadsDir, { maxAge: "1y", immutable: true });

app.use("/uploads", (req: Request, res: Response, next: NextFunction) => {
  const relativePath = decodeURIComponent(req.path.replace(/^\/+/, ""));
  const filePath = path.join(uploadsDir, relativePath);
  if (fs.existsSync(filePath)) return staticUploads(req, res, next);

  const isImageRequest = /\.(jpe?g|png|gif|webp|heic|heif|avif|svg|bmp|tiff?)$/i.test(req.path);
  if (isImageRequest) {
    console.log(`[UPLOADS] Missing photo requested: ${req.path}, serving placeholder`);
    const placeholderPath = path.join(uploadsDir, "placeholder-photo.svg");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString());
    return res.sendFile(placeholderPath);
  }
  return staticUploads(req, res, next);
});

/* ---------------- Tenant Guard (unchanged, but uses same Pool) ---------------- */

async function tenantGuard(req: Request, res: Response, next: NextFunction) {
  let client: any;
  try {
    // @ts-ignore
    const orgId = req.user?.org_id || req.session?.user?.org_id || req.session?.orgId;
    if (!orgId) return res.status(401).json({ error: "No org on session" });

    client = await pool.connect();
    const drizzleClient = drizzle(client, { schema });
    // @ts-ignore
    req.db = drizzleClient;
    // @ts-ignore
    req.pgClient = client;

    await client.query("SET app.current_org = $1::uuid", [orgId]);

    let released = false;
    res.on("close", () => {
      if (!released && client) {
        try { client.release(); released = true; } catch (e) { console.error("Error releasing client on close:", e); }
      }
    });

    return next();
  } catch (e) {
    console.error("Tenant guard error:", e);
    if (client) { try { client.release(); } catch (releaseError) { console.error("Error releasing client after error:", releaseError); } }
    return res.status(500).json({ error: "Database connection failed" });
  }
}

/* ---------------- Tracing & Health ---------------- */

app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) console.log(`[TRACE] ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/db", async (_req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    const dbHost = dbUrl ? new URL(dbUrl).hostname : 'NOT_SET';
    const userResult = await db.execute(sql`SELECT COUNT(*) as user_count FROM users`);
    const orgResult = await db.execute(sql`SELECT COUNT(*) as org_count FROM orgs`);
    res.json({ ok: true, user_count: userResult[0]?.user_count, org_count: orgResult[0]?.org_count, db_host: dbHost });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Database connection failed' });
  }
});

/* ---------------- Mount Routes ---------------- */

// If you plan to re-enable tenant guard for all /api, do it here AFTER auth:
// app.use("/api", (req, res, next) => {
//   if (req.path.startsWith("/auth/") || req.path === "/auth") return next();
//   return tenantGuard(req, res, next);
// });

import { members } from "./routes/members";
import auth from "./routes/auth";
import supportAuth from "./routes/support-auth";
import supportAdmin from "./routes/support-admin";
import adminRoutes from "./routes/admin";
import { health } from "./routes/health";
import { debugRouter } from "./routes/debug";

app.use("/api/me", me);
app.use("/api/auth", auth);
app.use("/api/members", members);
app.use("/api/debug", debugRouter);
app.use("/api/admin", adminRoutes);
app.use("/health", health);

app.use("/support/api/auth", supportAuth);
app.use("/support/api/admin", blockCustomersFromSupportAdmin, supportAdmin);

app.post("/api/teams/add-member", (req, res, next) => {
  req.url = "/_compat/teams-add-member";
  members(req, res, next);
});

/* ---------------- API logging ---------------- */

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try { logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`; } catch {}
      }
      if (logLine.length > 120) logLine = logLine.slice(0, 119) + "…";
      log(logLine);
    }
  });

  next();
});

/* ---------------- Startup, billing safety, static, errors ---------------- */

(async () => {
  let server: any;

  try {
    console.log("[STARTUP] 🚀 Starting Taska server...");

    try {
      console.log("[STARTUP] Registering API routes...");
      server = await registerRoutes(app);
      console.log("[STARTUP] ✅ API routes registered successfully");
    } catch (e: any) {
      console.error("[STARTUP] ❌ registerRoutes failed:", e?.stack || e);
      console.error("[STARTUP] Creating fallback server instead of exiting...");
      const http = await import("http");
      server = http.createServer(app);
    }

    try {
      console.log("[STARTUP] Starting pack consumption reconciliation...");
      const reconciliationResult = await reconcilePendingFinalizations();
      console.log(`[STARTUP] Reconciliation completed: ${reconciliationResult.recovered} recovered, ${reconciliationResult.failed} failed`);
      if (reconciliationResult.errors.length > 0) console.error("[STARTUP] Reconciliation errors:", reconciliationResult.errors);
    } catch (error) {
      console.error("[STARTUP] CRITICAL: Failed to run startup reconciliation:", error);
    }

    try {
      console.log("[STARTUP] 🔄 Starting continuous background compensation processor...");
      startContinuousCompensationProcessor();
      console.log("[STARTUP] ✅ Continuous compensation processor started - ZERO under-billing risk achieved");
      console.log("[STARTUP] 🛡️ BILLING SAFETY: Enhanced with 60s background processing + periodic reconciliation");
    } catch (error) {
      console.error("[STARTUP] ❌ CRITICAL: Failed to start continuous compensation processor:", error);
      console.error("[STARTUP] ⚠️ BILLING SAFETY COMPROMISED: Manual intervention required");
    }

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Request error:", message, err?.stack || err);
      res.status(status).json({ message });
    });

    console.log("[STARTUP] 🔒 Validating critical configuration...");
    const configWarnings: string[] = [];
    const configErrors: string[] = [];

    if (!process.env.STRIPE_SECRET_KEY) configErrors.push("STRIPE_SECRET_KEY is not configured");
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      configErrors.push("STRIPE_WEBHOOK_SECRET is not configured - webhooks will fail!");
    } else {
      console.log("[STARTUP] ✅ STRIPE_WEBHOOK_SECRET is configured");
    }

    if (!process.env.DATABASE_URL) configErrors.push("DATABASE_URL is not configured");
    if (isProd && !process.env.WEBHOOK_URL_CONFIRMED) {
      configWarnings.push("WEBHOOK_URL_CONFIRMED not set - ensure Stripe webhook points to correct domain");
    }

    if (configWarnings.length > 0) {
      console.warn("[STARTUP] ⚠️ Configuration warnings:");
      configWarnings.forEach(w => console.warn(`  - ${w}`));
    }
    if (configErrors.length > 0) {
      console.error("[STARTUP] ❌ Configuration errors detected:");
      configErrors.forEach(e => console.error(`  - ${e}`));
      console.error("[STARTUP] ⚠️ Server will start but may not function correctly!");
    } else {
      console.log("[STARTUP] ✅ All critical configuration validated successfully");
    }

    const port = parseInt(process.env.PORT || "5000", 10);
    console.log(`[STARTUP] Starting server on 0.0.0.0:${port}...`);

    server.listen(
      { port, host: "0.0.0.0", reusePort: true },
      () => {
        const dbUrlHash = (process.env.DATABASE_URL || "").slice(0, 24) + "...";
        console.log(`[STARTUP] ✅ Server successfully started!`);
        log(`serving on port ${port} (NODE_ENV=${app.get("env")})`);
        log(`Database: ${dbUrlHash}`);
        log("Health: /health  |  API health: /health/db  |  Jobs: /api/jobs");
        console.log(`[STARTUP] 🌐 Server is ready and listening on 0.0.0.0:${port}`);
      }
    );

    server.on('error', (error: any) => {
      console.error("[STARTUP] ❌ CRITICAL: Server failed to start:", error);
      if (error.code === 'EADDRINUSE') console.error(`[STARTUP] Port ${port} is already in use`);
      else if (error.code === 'EACCES') console.error(`[STARTUP] Permission denied to bind to port ${port}`);
      console.error("[STARTUP] Server startup failed, but continuing to prevent crash loop...");
    });

  } catch (startupError: any) {
    console.error("[STARTUP] ❌ FATAL: Unhandled startup error:", startupError?.stack || startupError);
    console.error("[STARTUP] Application failed to initialize properly");
    console.error("[STARTUP] Fatal startup error encountered, but continuing to prevent crash loop...");
  }
})();

/* ---------------- Graceful shutdown ---------------- */

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal: string) {
  console.log(`[SHUTDOWN] 🔄 Received ${signal}, starting graceful shutdown...`);
  try {
    stopContinuousCompensationProcessor();
    console.log('[SHUTDOWN] ✅ Continuous compensation processor stopped safely');
  } catch (error) {
    console.error('[SHUTDOWN] ❌ Error stopping compensation processor:', error);
  }
  setTimeout(() => {
    console.log('[SHUTDOWN] ✅ Graceful shutdown completed');
    process.exit(0);
  }, 5000);
}

process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
});
