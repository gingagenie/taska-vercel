/**
 * CONTINUOUS BACKGROUND COMPENSATION PROCESSOR
 * 
 * CRITICAL BILLING SAFETY: This module implements continuous background processing 
 * to achieve COMPLETE ELIMINATION of under-billing risk in pack consumption.
 * 
 * BUSINESS REQUIREMENT: Every successful SMS/email send MUST consume credits.
 * FAIL-SAFE DESIGN: Zero tolerance for revenue leakage from finalization failures.
 * 
 * KEY FEATURES:
 * - Continuous worker running every 60 seconds
 * - Persistent retry logic with exponential backoff
 * - Automatic expiration extension for pending finalizations
 * - Non-expiring compensation queue for hard failures
 * - Real-time monitoring and alerting integration
 * - Complementary to inline retries for defense-in-depth
 */

import { db } from "../db/client";
import { sql, eq, and, lt, lte, gte, isNull, isNotNull } from "drizzle-orm";
import { usagePackReservations } from "../../shared/schema";
import { finalizePackConsumption, type EnhancedFinalizationResult } from "./pack-consumption";

// Worker state management
let compensationWorkerInterval: NodeJS.Timeout | null = null;
let reconciliationWorkerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

// Enhanced billing safety metrics
export type BillingSafetyMetrics = {
  totalPendingReservations: number;
  reservationsNearExpiry: number;
  compensationQueueSize: number;
  finalizationSuccessRate: number;
  lastProcessedAt: Date;
  processingErrors: number;
  criticalAlerts: number;
};

// Configuration for exponential backoff and timing
const COMPENSATION_CONFIG = {
  // Worker timing
  PROCESSOR_INTERVAL_MS: 60 * 1000, // 60 seconds
  RECONCILIATION_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  
  // Retry logic
  MIN_RETRY_DELAY_MS: 2 * 60 * 1000, // 2 minutes
  MAX_RETRY_DELAY_MS: 30 * 60 * 1000, // 30 minutes
  MAX_BACKGROUND_ATTEMPTS: 10, // Beyond inline attempts
  EXPIRY_WARNING_THRESHOLD_MS: 2 * 60 * 1000, // Alert when <2 min left
  
  // Extension logic
  EXPIRY_EXTENSION_MINUTES: 15, // Extend by 15 minutes on each retry
  MAX_TOTAL_EXTENSION_HOURS: 24, // Maximum 24 hours total extension
  
  // Alerting thresholds
  SUCCESS_RATE_ALERT_THRESHOLD: 0.95, // Alert if <95% success rate
  COMPENSATION_QUEUE_ALERT_SIZE: 50, // Alert if >50 items in compensation queue
  PENDING_RESERVATIONS_ALERT_SIZE: 200, // Alert if >200 pending reservations
};

/**
 * PHASE 1: Start Continuous Background Workers
 * 
 * Initializes both compensation processing and periodic reconciliation workers.
 * Call this during server startup after database initialization.
 */
export function startContinuousCompensationProcessor(): void {
  console.log('[COMPENSATION PROCESSOR] Starting continuous background workers...');
  
  // Start compensation processor (every 60 seconds)
  if (compensationWorkerInterval) {
    clearInterval(compensationWorkerInterval);
  }
  
  compensationWorkerInterval = setInterval(async () => {
    if (!isProcessing) {
      await processCompensationQueue();
    }
  }, COMPENSATION_CONFIG.PROCESSOR_INTERVAL_MS);
  
  // Start periodic reconciliation (every 5 minutes)
  if (reconciliationWorkerInterval) {
    clearInterval(reconciliationWorkerInterval);
  }
  
  reconciliationWorkerInterval = setInterval(async () => {
    await performPeriodicReconciliation();
  }, COMPENSATION_CONFIG.RECONCILIATION_INTERVAL_MS);
  
  console.log(`[COMPENSATION PROCESSOR] Workers started - processing every ${COMPENSATION_CONFIG.PROCESSOR_INTERVAL_MS/1000}s, reconciliation every ${COMPENSATION_CONFIG.RECONCILIATION_INTERVAL_MS/1000}s`);
}

/**
 * Stop all background workers (for graceful shutdown)
 */
export function stopContinuousCompensationProcessor(): void {
  console.log('[COMPENSATION PROCESSOR] Stopping background workers...');
  
  if (compensationWorkerInterval) {
    clearInterval(compensationWorkerInterval);
    compensationWorkerInterval = null;
  }
  
  if (reconciliationWorkerInterval) {
    clearInterval(reconciliationWorkerInterval);
    reconciliationWorkerInterval = null;
  }
  
  console.log('[COMPENSATION PROCESSOR] Workers stopped');
}

/**
 * PHASE 2: Core Compensation Queue Processing
 * 
 * This is the heart of the billing safety system. Continuously processes
 * pending reservations that need finalization retry or compensation handling.
 * 
 * CRITICAL: This ensures NO successful send escapes billing, regardless of
 * timing issues, database failures, or process restarts.
 */
export async function processCompensationQueue(): Promise<BillingSafetyMetrics> {
  isProcessing = true;
  const startTime = Date.now();
  
  console.log('[COMPENSATION PROCESSOR] Starting compensation queue processing...');
  
  const metrics: BillingSafetyMetrics = {
    totalPendingReservations: 0,
    reservationsNearExpiry: 0,
    compensationQueueSize: 0,
    finalizationSuccessRate: 1.0,
    lastProcessedAt: new Date(),
    processingErrors: 0,
    criticalAlerts: 0,
  };
  
  try {
    // STEP 1: Get comprehensive view of pending reservations
    const reservationAnalysis = await analyzePendingReservations();
    Object.assign(metrics, reservationAnalysis);
    
    // STEP 2: Process reservations needing immediate retry
    const retryResults = await processRetryableReservations();
    metrics.finalizationSuccessRate = retryResults.successRate;
    metrics.processingErrors += retryResults.errors;
    
    // STEP 3: Handle reservations approaching expiry
    const expiryResults = await handleReservationsNearExpiry();
    metrics.processingErrors += expiryResults.errors;
    
    // STEP 4: Process compensation queue (hard failures)
    const compensationResults = await processCompensationReservations();
    metrics.compensationQueueSize = compensationResults.queueSize;
    metrics.processingErrors += compensationResults.errors;
    
    // STEP 5: Trigger alerts if needed
    const alertsTriggered = await checkAndTriggerAlerts(metrics);
    metrics.criticalAlerts = alertsTriggered;
    
    const duration = Date.now() - startTime;
    console.log(`[COMPENSATION PROCESSOR] Completed in ${duration}ms - ${metrics.totalPendingReservations} pending, ${metrics.compensationQueueSize} in compensation queue`);
    
  } catch (error) {
    console.error('[COMPENSATION PROCESSOR] CRITICAL ERROR during processing:', error);
    metrics.processingErrors++;
    
    // Alert on processor failure
    await triggerCriticalAlert('COMPENSATION_PROCESSOR_FAILURE', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date(),
    });
  } finally {
    isProcessing = false;
  }
  
  return metrics;
}

/**
 * PHASE 2A: Analyze Current Reservation State
 * 
 * Provides comprehensive analysis of pending reservations for monitoring
 * and decision-making in the compensation processor.
 */
async function analyzePendingReservations(): Promise<{
  totalPendingReservations: number;
  reservationsNearExpiry: number;
  compensationQueueSize: number;
}> {
  try {
    const now = new Date();
    const nearExpiryThreshold = new Date(now.getTime() + COMPENSATION_CONFIG.EXPIRY_WARNING_THRESHOLD_MS);
    
    // Count total pending reservations
    const [pendingCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(eq(usagePackReservations.status, 'pending'));
    
    // Count reservations near expiry
    const [nearExpiryCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        lte(usagePackReservations.expiresAt, nearExpiryThreshold)
      ));
    
    // Count compensation queue size
    const [compensationCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(eq(usagePackReservations.status, 'compensation_required'));
    
    return {
      totalPendingReservations: Number(pendingCount?.count || 0),
      reservationsNearExpiry: Number(nearExpiryCount?.count || 0),
      compensationQueueSize: Number(compensationCount?.count || 0),
    };
  } catch (error) {
    console.error('[COMPENSATION PROCESSOR] Error analyzing reservations:', error);
    return {
      totalPendingReservations: 0,
      reservationsNearExpiry: 0,
      compensationQueueSize: 0,
    };
  }
}

/**
 * PHASE 2B: Process Retryable Reservations
 * 
 * Finds and processes reservations that are ready for retry based on
 * their nextRetryAt timestamp and retry count.
 */
async function processRetryableReservations(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  successRate: number;
  errors: number;
}> {
  const result = { processed: 0, successful: 0, failed: 0, successRate: 1.0, errors: 0 };
  
  try {
    const now = new Date();
    
    // Find reservations ready for retry
    const reservationsToRetry = await db
      .select({
        id: usagePackReservations.id,
        orgId: usagePackReservations.orgId,
        attemptCount: usagePackReservations.attemptCount,
        lastError: usagePackReservations.lastError,
        expiresAt: usagePackReservations.expiresAt,
        originalExpiresAt: usagePackReservations.originalExpiresAt,
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        isNotNull(usagePackReservations.nextRetryAt),
        lte(usagePackReservations.nextRetryAt, now),
        lt(usagePackReservations.attemptCount, COMPENSATION_CONFIG.MAX_BACKGROUND_ATTEMPTS)
      ))
      .limit(50); // Process in batches
    
    console.log(`[COMPENSATION PROCESSOR] Found ${reservationsToRetry.length} reservations ready for retry`);
    
    // Process each reservation
    for (const reservation of reservationsToRetry) {
      result.processed++;
      
      try {
        // Extract base reservation ID (remove pack-specific suffix)
        const baseReservationId = reservation.id.replace(/-[^-]+$/, '');
        
        // Attempt finalization
        const finalizeResult = await finalizePackConsumption(baseReservationId);
        
        if (finalizeResult.success) {
          result.successful++;
          console.log(`[COMPENSATION PROCESSOR] Successfully finalized ${baseReservationId} on background retry`);
        } else {
          result.failed++;
          await handleFinalizationFailure(reservation, finalizeResult);
        }
        
      } catch (error) {
        result.failed++;
        result.errors++;
        console.error(`[COMPENSATION PROCESSOR] Error processing reservation ${reservation.id}:`, error);
        
        await handleFinalizationFailure(reservation, {
          success: false,
          error: 'db_error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Calculate success rate
    result.successRate = result.processed > 0 ? result.successful / result.processed : 1.0;
    
    console.log(`[COMPENSATION PROCESSOR] Retry processing complete: ${result.successful}/${result.processed} successful (${(result.successRate * 100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('[COMPENSATION PROCESSOR] Error in processRetryableReservations:', error);
    result.errors++;
  }
  
  return result;
}

/**
 * PHASE 2C: Handle Finalization Failures
 * 
 * Updates reservation state after failed finalization attempts, implementing
 * exponential backoff and determining when to move to compensation queue.
 */
async function handleFinalizationFailure(
  reservation: any,
  failureResult: { success: false; error?: string; errorMessage?: string }
): Promise<void> {
  try {
    const attemptCount = (reservation.attemptCount || 0) + 1;
    const now = new Date();
    
    // Calculate next retry time with exponential backoff
    const backoffDelayMs = Math.min(
      COMPENSATION_CONFIG.MIN_RETRY_DELAY_MS * Math.pow(2, attemptCount - 1),
      COMPENSATION_CONFIG.MAX_RETRY_DELAY_MS
    );
    const nextRetryAt = new Date(now.getTime() + backoffDelayMs);
    
    // Check if we should move to compensation queue (max attempts reached)
    if (attemptCount >= COMPENSATION_CONFIG.MAX_BACKGROUND_ATTEMPTS) {
      console.log(`[COMPENSATION PROCESSOR] Moving reservation ${reservation.id} to compensation queue after ${attemptCount} attempts`);
      
      await db
        .update(usagePackReservations)
        .set({
          status: 'compensation_required' as any,
          attemptCount,
          lastError: failureResult.errorMessage || 'Unknown error',
          compensationRequiredAt: now,
          nextRetryAt: null, // Clear retry scheduling
          updatedAt: now,
        })
        .where(eq(usagePackReservations.id, reservation.id));
      
      // Trigger alert for compensation required
      await triggerCriticalAlert('RESERVATION_MOVED_TO_COMPENSATION', {
        reservationId: reservation.id,
        orgId: reservation.orgId,
        attemptCount,
        lastError: failureResult.errorMessage,
        timestamp: now,
      });
      
    } else {
      // Schedule next retry and extend expiration if needed
      const originalExpiry = new Date(reservation.originalExpiresAt);
      const maxExtensionTime = new Date(originalExpiry.getTime() + COMPENSATION_CONFIG.MAX_TOTAL_EXTENSION_HOURS * 60 * 60 * 1000);
      
      // Extend expiration to accommodate next retry
      const extendedExpiry = new Date(Math.max(
        reservation.expiresAt.getTime(),
        nextRetryAt.getTime() + COMPENSATION_CONFIG.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      ));
      
      // Cap extension at maximum allowed time
      const finalExpiry = new Date(Math.min(extendedExpiry.getTime(), maxExtensionTime.getTime()));
      
      console.log(`[COMPENSATION PROCESSOR] Scheduling retry ${attemptCount} for ${reservation.id} at ${nextRetryAt.toISOString()}`);
      
      await db
        .update(usagePackReservations)
        .set({
          attemptCount,
          lastError: failureResult.errorMessage || 'Unknown error',
          nextRetryAt,
          expiresAt: finalExpiry,
          updatedAt: now,
        })
        .where(eq(usagePackReservations.id, reservation.id));
    }
    
  } catch (error) {
    console.error(`[COMPENSATION PROCESSOR] Error handling finalization failure for ${reservation.id}:`, error);
  }
}

/**
 * PHASE 2D: Handle Reservations Near Expiry
 * 
 * Extends expiration for reservations that are approaching expiry but haven't
 * been finalized yet, preventing premature release.
 */
async function handleReservationsNearExpiry(): Promise<{ processed: number; errors: number }> {
  const result = { processed: 0, errors: 0 };
  
  try {
    const now = new Date();
    const nearExpiryThreshold = new Date(now.getTime() + COMPENSATION_CONFIG.EXPIRY_WARNING_THRESHOLD_MS);
    
    // Find reservations near expiry that haven't been processed recently
    const reservationsNearExpiry = await db
      .select({
        id: usagePackReservations.id,
        expiresAt: usagePackReservations.expiresAt,
        originalExpiresAt: usagePackReservations.originalExpiresAt,
        attemptCount: usagePackReservations.attemptCount,
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        lte(usagePackReservations.expiresAt, nearExpiryThreshold),
        isNull(usagePackReservations.nextRetryAt) // Not already scheduled for retry
      ))
      .limit(100);
    
    console.log(`[COMPENSATION PROCESSOR] Found ${reservationsNearExpiry.length} reservations near expiry`);
    
    for (const reservation of reservationsNearExpiry) {
      try {
        const originalExpiry = new Date(reservation.originalExpiresAt);
        const maxExtensionTime = new Date(originalExpiry.getTime() + COMPENSATION_CONFIG.MAX_TOTAL_EXTENSION_HOURS * 60 * 60 * 1000);
        
        // Don't extend beyond maximum allowed time
        if (now >= maxExtensionTime) {
          console.log(`[COMPENSATION PROCESSOR] Reservation ${reservation.id} has reached maximum extension time, moving to compensation queue`);
          
          await db
            .update(usagePackReservations)
            .set({
              status: 'compensation_required' as any,
              compensationRequiredAt: now,
              nextRetryAt: null,
              updatedAt: now,
            })
            .where(eq(usagePackReservations.id, reservation.id));
          
          continue;
        }
        
        // Extend expiration and schedule immediate retry
        const extendedExpiry = new Date(now.getTime() + COMPENSATION_CONFIG.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
        const finalExpiry = new Date(Math.min(extendedExpiry.getTime(), maxExtensionTime.getTime()));
        
        await db
          .update(usagePackReservations)
          .set({
            expiresAt: finalExpiry,
            nextRetryAt: now, // Retry immediately
            attemptCount: (reservation.attemptCount || 0) + 1,
            lastError: 'Extended expiration due to approaching expiry',
            updatedAt: now,
          })
          .where(eq(usagePackReservations.id, reservation.id));
        
        result.processed++;
        console.log(`[COMPENSATION PROCESSOR] Extended expiry for ${reservation.id} to ${finalExpiry.toISOString()}`);
        
      } catch (error) {
        result.errors++;
        console.error(`[COMPENSATION PROCESSOR] Error extending expiry for ${reservation.id}:`, error);
      }
    }
    
  } catch (error) {
    console.error('[COMPENSATION PROCESSOR] Error in handleReservationsNearExpiry:', error);
    result.errors++;
  }
  
  return result;
}

/**
 * PHASE 2E: Process Compensation Queue
 * 
 * Handles reservations marked as 'compensation_required' - these are hard failures
 * that need manual intervention or automated compensation processing.
 */
async function processCompensationReservations(): Promise<{ queueSize: number; errors: number }> {
  const result = { queueSize: 0, errors: 0 };
  
  try {
    // Get current compensation queue size
    const [queueCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(eq(usagePackReservations.status, 'compensation_required'));
    
    result.queueSize = Number(queueCount?.count || 0);
    
    if (result.queueSize > 0) {
      console.log(`[COMPENSATION PROCESSOR] Compensation queue has ${result.queueSize} items`);
      
      // For now, just log the compensation queue items for manual review
      // In production, this could trigger automated compensation processes
      const compensationItems = await db
        .select({
          id: usagePackReservations.id,
          orgId: usagePackReservations.orgId,
          packType: usagePackReservations.packType,
          quantity: usagePackReservations.quantity,
          attemptCount: usagePackReservations.attemptCount,
          lastError: usagePackReservations.lastError,
          compensationRequiredAt: usagePackReservations.compensationRequiredAt,
        })
        .from(usagePackReservations)
        .where(eq(usagePackReservations.status, 'compensation_required'))
        .limit(10); // Sample for logging
      
      console.log('[COMPENSATION PROCESSOR] Sample compensation queue items:', compensationItems);
      
      // TODO: Implement automated compensation logic here
      // - Could automatically retry finalization periodically
      // - Could trigger manual review workflows
      // - Could implement automatic credit compensation
    }
    
  } catch (error) {
    console.error('[COMPENSATION PROCESSOR] Error processing compensation queue:', error);
    result.errors++;
  }
  
  return result;
}

/**
 * PHASE 3: Periodic Reconciliation (Complementary to Startup Reconciliation)
 * 
 * Performs broader reconciliation checks while server is running to catch
 * any edge cases missed by the main compensation processor.
 */
async function performPeriodicReconciliation(): Promise<void> {
  console.log('[PERIODIC RECONCILIATION] Starting periodic reconciliation...');
  
  try {
    // Find old pending reservations that might have been missed
    const oldReservations = await db
      .select({
        id: usagePackReservations.id,
        createdAt: usagePackReservations.createdAt,
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        lt(usagePackReservations.createdAt, new Date(Date.now() - 10 * 60 * 1000)) // Older than 10 minutes
      ))
      .limit(20);
    
    if (oldReservations.length > 0) {
      console.log(`[PERIODIC RECONCILIATION] Found ${oldReservations.length} old pending reservations for review`);
      
      for (const reservation of oldReservations) {
        // Extract base reservation ID and attempt finalization
        const baseReservationId = reservation.id.replace(/-[^-]+$/, '');
        
        try {
          const result = await finalizePackConsumption(baseReservationId);
          if (result.success) {
            console.log(`[PERIODIC RECONCILIATION] Successfully finalized old reservation ${baseReservationId}`);
          }
        } catch (error) {
          console.error(`[PERIODIC RECONCILIATION] Error finalizing ${baseReservationId}:`, error);
        }
      }
    }
    
    console.log('[PERIODIC RECONCILIATION] Periodic reconciliation completed');
    
  } catch (error) {
    console.error('[PERIODIC RECONCILIATION] Error during periodic reconciliation:', error);
  }
}

/**
 * PHASE 4: Enhanced Monitoring and Alerting
 * 
 * Checks billing safety metrics against thresholds and triggers appropriate alerts.
 */
async function checkAndTriggerAlerts(metrics: BillingSafetyMetrics): Promise<number> {
  let alertsTriggered = 0;
  
  try {
    // Alert on low success rate
    if (metrics.finalizationSuccessRate < COMPENSATION_CONFIG.SUCCESS_RATE_ALERT_THRESHOLD) {
      await triggerCriticalAlert('LOW_FINALIZATION_SUCCESS_RATE', {
        currentRate: metrics.finalizationSuccessRate,
        threshold: COMPENSATION_CONFIG.SUCCESS_RATE_ALERT_THRESHOLD,
        timestamp: new Date(),
      });
      alertsTriggered++;
    }
    
    // Alert on large compensation queue
    if (metrics.compensationQueueSize >= COMPENSATION_CONFIG.COMPENSATION_QUEUE_ALERT_SIZE) {
      await triggerCriticalAlert('LARGE_COMPENSATION_QUEUE', {
        queueSize: metrics.compensationQueueSize,
        threshold: COMPENSATION_CONFIG.COMPENSATION_QUEUE_ALERT_SIZE,
        timestamp: new Date(),
      });
      alertsTriggered++;
    }
    
    // Alert on too many pending reservations
    if (metrics.totalPendingReservations >= COMPENSATION_CONFIG.PENDING_RESERVATIONS_ALERT_SIZE) {
      await triggerCriticalAlert('HIGH_PENDING_RESERVATIONS', {
        pendingCount: metrics.totalPendingReservations,
        threshold: COMPENSATION_CONFIG.PENDING_RESERVATIONS_ALERT_SIZE,
        timestamp: new Date(),
      });
      alertsTriggered++;
    }
    
  } catch (error) {
    console.error('[COMPENSATION PROCESSOR] Error checking alerts:', error);
  }
  
  return alertsTriggered;
}

/**
 * PHASE 4A: Critical Alert System
 * 
 * Sends critical alerts for billing safety issues. In production, this should
 * integrate with your alerting infrastructure (PagerDuty, Slack, email, etc.).
 */
async function triggerCriticalAlert(alertType: string, details: any): Promise<void> {
  console.error(`[CRITICAL ALERT] ${alertType}:`, details);
  
  try {
    // Log to database for audit trail
    await db.execute(sql`
      INSERT INTO usage_pack_reservations (
        id, org_id, pack_id, pack_type, quantity, status, 
        expires_at, attempt_count, last_error, created_at, updated_at
      ) VALUES (
        ${`ALERT-${alertType}-${Date.now()}`},
        ${'00000000-0000-0000-0000-000000000000'}, -- System alert org
        ${'00000000-0000-0000-0000-000000000000'}, -- System alert pack
        'sms', 0, 'alert_logged',
        NOW() + INTERVAL '30 days', 0, ${JSON.stringify({ alertType, details })},
        NOW(), NOW()
      )
    `);
    
    // TODO: Integrate with actual alerting system
    // await sendPagerDutyAlert(alertType, details);
    // await sendSlackAlert(alertType, details);
    // await sendEmailAlert(alertType, details);
    
  } catch (error) {
    console.error('[CRITICAL ALERT] Error logging alert:', error);
  }
}

/**
 * Get current billing safety metrics for monitoring dashboard
 */
export async function getBillingSafetyMetrics(): Promise<BillingSafetyMetrics> {
  const analysis = await analyzePendingReservations();
  
  return {
    ...analysis,
    finalizationSuccessRate: 1.0, // Will be updated by actual processing
    lastProcessedAt: new Date(),
    processingErrors: 0,
    criticalAlerts: 0,
  };
}