/**
 * CRITICAL BILLING SAFETY: Helper Functions for Continuous Background Processing
 * 
 * These functions support the enhanced durableFinalize and continuous compensation processor
 * to achieve complete elimination of under-billing risk.
 */

import { db } from "../db/client";
import { sql, eq, and } from "drizzle-orm";
import { usagePackReservations } from "../../shared/schema";

// Reservation statuses for enhanced processing
type ReservationStatus = 'pending' | 'finalized' | 'released' | 'compensation_required';

/**
 * ENHANCED: Update Retry State in Database
 * 
 * Persists retry attempt information to enable continuous background processing.
 * This allows the background compensation processor to resume retry efforts.
 */
export async function updateRetryStateInDatabase(
  reservationId: string,
  attemptCount: number,
  errorMessage: string | null
): Promise<void> {
  try {
    const now = new Date();
    
    // Calculate next retry time with exponential backoff
    const baseDelay = 2 * 60 * 1000; // 2 minutes
    const backoffDelayMs = Math.min(baseDelay * Math.pow(2, attemptCount - 1), 30 * 60 * 1000); // Max 30 minutes
    const nextRetryAt = new Date(now.getTime() + backoffDelayMs);
    
    // Update all reservation records for this reservation ID
    await db
      .update(usagePackReservations)
      .set({
        attemptCount,
        lastError: errorMessage,
        nextRetryAt,
        updatedAt: now,
      })
      .where(sql`${usagePackReservations.id} LIKE ${reservationId + '%'}`);
    
    console.log(`[RETRY STATE] Updated retry state for ${reservationId}: attempt ${attemptCount}, next retry at ${nextRetryAt.toISOString()}`);
    
  } catch (error) {
    console.error(`[RETRY STATE] Error updating retry state for ${reservationId}:`, error);
  }
}

/**
 * ENHANCED: Queue for Background Retry
 * 
 * Sets up a reservation for continuous background retry processing.
 * Extends expiration and schedules next retry attempt.
 */
export async function queueForBackgroundRetry(
  reservationId: string,
  attemptCount: number,
  lastError: any
): Promise<void> {
  try {
    const now = new Date();
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    
    // Calculate next retry time (start with 2 minutes, exponential backoff)
    const baseDelay = 2 * 60 * 1000; // 2 minutes
    const backoffDelayMs = Math.min(baseDelay * Math.pow(2, attemptCount - 1), 30 * 60 * 1000); // Max 30 minutes
    const nextRetryAt = new Date(now.getTime() + backoffDelayMs);
    
    // Extend expiration to accommodate background retries (add 1 hour)
    const extendedExpiry = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Update all reservation records for this reservation ID
    await db
      .update(usagePackReservations)
      .set({
        attemptCount,
        lastError: errorMessage,
        nextRetryAt,
        expiresAt: extendedExpiry,
        updatedAt: now,
      })
      .where(and(
        sql`${usagePackReservations.id} LIKE ${reservationId + '%'}`,
        eq(usagePackReservations.status, 'pending')
      ));
    
    console.log(`[BACKGROUND RETRY] Queued ${reservationId} for background retry at ${nextRetryAt.toISOString()}, extended expiry to ${extendedExpiry.toISOString()}`);
    
  } catch (error) {
    console.error(`[BACKGROUND RETRY] Error queuing ${reservationId} for background retry:`, error);
  }
}

/**
 * ENHANCED: Queue Compensation Finalization
 * 
 * Marks a reservation as requiring manual compensation or automated handling.
 * This ensures no successful send escapes billing even in worst-case scenarios.
 */
export async function queueCompensationFinalization(reservationId: string): Promise<void> {
  try {
    const now = new Date();
    
    // Mark all reservation records as requiring compensation
    const result = await db
      .update(usagePackReservations)
      .set({
        status: 'compensation_required' as ReservationStatus,
        compensationRequiredAt: now,
        nextRetryAt: null, // Clear retry scheduling
        updatedAt: now,
      })
      .where(and(
        sql`${usagePackReservations.id} LIKE ${reservationId + '%'}`,
        eq(usagePackReservations.status, 'pending')
      ))
      .returning({ id: usagePackReservations.id });
    
    console.log(`[COMPENSATION QUEUE] Moved ${result.length} reservations to compensation queue for ${reservationId}`);
    
    // TODO: Trigger alert or notification for manual review
    // await triggerCompensationAlert(reservationId, result.length);
    
  } catch (error) {
    console.error(`[COMPENSATION QUEUE] Error queueing ${reservationId} for compensation:`, error);
  }
}