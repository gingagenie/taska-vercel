import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { me } from "./routes/me";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Log every API request reaching Express
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`[TRACE] ${req.method} ${req.path}`);
  }
  next();
});

// Always-on auth shim for API (inject demo ids if missing)
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    if (!req.headers["x-user-id"]) {
      req.headers["x-user-id"] = process.env.DEMO_USER_ID || "315e3119-1b17-4dee-807f-bbc1e4d5c5b6";
    }
    if (!req.headers["x-org-id"]) {
      req.headers["x-org-id"] = process.env.DEMO_ORG_ID || "4500ba4e-e575-4f82-b196-27dd4c7d0eaf";
    }
  }
  next();
});

/** Quick health checks (sanity) */
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/db", (_req, res) => res.json({ ok: true })); // replace with real db check later

/** Mount API routes that aren't part of registerRoutes */
app.use("/api/me", me);

/** API request logging (compact) */
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
        try {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        } catch { /* ignore stringify issues */ }
      }
      if (logLine.length > 120) logLine = logLine.slice(0, 119) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  let server: any;

  try {
    // registerRoutes should mount all /api/* routers (jobs, customers, etc.)
    server = await registerRoutes(app);
  } catch (e: any) {
    console.error("registerRoutes failed:", e?.stack || e);
    // If registerRoutes throws, don't crash — create a basic HTTP server so we can see logs/health.
    const http = await import("http");
    server = http.createServer(app);
  }

  /** Centralized error handler — DO NOT rethrow (it kills the process) */
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Request error:", message, err?.stack || err);
    res.status(status).json({ message });
    // DON'T: throw err;
  });

  // Vite in dev, static in prod
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Always bind to PORT (Replit requirement)
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true, // harmless on Node; ignored if unsupported
    },
    () => {
      log(`serving on port ${port} (NODE_ENV=${app.get("env")})`);
      log("Health: /health  |  API health: /health/db  |  Jobs: /api/jobs");
    }
  );
})();

/** Bonus: catch unhandled promise rejections so one bad SQL cast doesn't kill the server silently */
process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
});

