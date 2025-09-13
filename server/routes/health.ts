import { Router } from "express";
import { generateBillingHealthReport, getFinalizationMetrics } from "../lib/pack-consumption";

export const health = Router();

health.get("/whoami", (req, res) => {
  res.json({
    env: process.env.NODE_ENV,
    sessionUserId: (req.session as any)?.userId || null,
    sessionOrgId: (req.session as any)?.orgId || null,
    headerUserId: req.headers["x-user-id"] || null,
    headerOrgId: req.headers["x-org-id"] || null,
    effectiveOrgId: (req as any).orgId || null, // after requireOrg
  });
});

/**
 * CRITICAL BILLING PROTECTION: Monitoring Dashboard Endpoints
 * 
 * These endpoints provide real-time visibility into billing protection system health.
 * Essential for operational monitoring and revenue protection auditing.
 */

// Billing health comprehensive report
health.get("/billing", async (_req, res) => {
  try {
    const report = await generateBillingHealthReport();
    res.json(report);
  } catch (error) {
    console.error('[HEALTH] Error generating billing health report:', error);
    res.status(500).json({
      status: 'critical',
      error: 'Failed to generate billing health report',
      timestamp: new Date()
    });
  }
});

// Quick billing metrics for dashboards
health.get("/billing/metrics", async (_req, res) => {
  try {
    const metrics = await getFinalizationMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('[HEALTH] Error getting finalization metrics:', error);
    res.status(500).json({
      error: 'Failed to get finalization metrics',
      timestamp: new Date()
    });
  }
});

// Billing system status check (for alerts)
health.get("/billing/status", async (_req, res) => {
  try {
    const report = await generateBillingHealthReport();
    
    // Return simple status for monitoring systems
    res.json({
      status: report.status,
      successRate: report.metrics.successRate,
      criticalFailures: report.metrics.criticalFailures,
      pendingReservations: report.metrics.pendingReservations,
      compensationQueueSize: report.metrics.compensationQueueSize,
      timestamp: report.timestamp,
      healthy: report.status === 'healthy',
      alerts: report.issues
    });
  } catch (error) {
    console.error('[HEALTH] Error checking billing status:', error);
    res.status(500).json({
      status: 'critical',
      healthy: false,
      error: 'Failed to check billing status',
      timestamp: new Date()
    });
  }
});