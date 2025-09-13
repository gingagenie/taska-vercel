import { db } from "../db/client";
import { sql, eq, and, asc, lt, lte, gte } from "drizzle-orm";
import { usagePacks, usagePackReservations } from "../../shared/schema";
import { updateRetryStateInDatabase, queueForBackgroundRetry, queueCompensationFinalization } from "./pack-consumption-helpers";

// Pack consumption result types
export type PackReservationResult = {
  success: boolean;
  reservationId?: string;
  packId?: string;
  error?: 'no_packs' | 'db_error';
  errorMessage?: string;
};

export type PackFinalizationResult = {
  success: boolean;
  error?: 'reservation_expired' | 'db_error';
  errorMessage?: string;
};

// Detailed consumption status for quota checks
export type ConsumptionStatus = {
  canConsume: boolean;
  availablePacks: number;
  error?: 'no_packs' | 'db_error';
  errorMessage?: string;
};

// Reservation statuses for durable tracking
type ReservationStatus = 'pending' | 'finalized' | 'released' | 'compensation_required';

// Enhanced metrics for billing safety monitoring
type FinalizationMetrics = {
  attempts: number;
  successes: number;
  failures: number;
  compensationRequired: number;
  lastUpdate: Date;
};

// Global metrics for monitoring (consider Redis in production)
let finalizationMetrics: FinalizationMetrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  compensationRequired: 0,
  lastUpdate: new Date(),
};

/**
 * CRITICAL BILLING SAFETY IMPROVEMENTS:
 * 
 * This replaces the vulnerable in-memory reservation system with durable database-backed reservations.
 * 
 * OLD VULNERABLE APPROACH:
 * - Reserved packs by immediately incrementing usedQuantity in database
 * - Stored reservation details in in-memory Map  
 * - Process crashes between reserve/finalize = lost user credits forever
 * - Multi-instance deployments couldn't share reservation state
 * 
 * NEW DURABLE APPROACH:
 * - Reserve: Create pending reservation record (usedQuantity unchanged)
 * - Finalize: Update reservation to 'finalized' + atomically increment usedQuantity
 * - Release: Update reservation to 'released' (usedQuantity remains unchanged)
 * 
 * SAFETY GUARANTEES:
 * - Process crashes cannot lose user credits
 * - Works correctly across multiple server instances
 * - Expired reservations can be properly cleaned up
 * - Full atomic consistency with proper transaction handling
 */

/**
 * PHASE 1: Atomic Pack Reservation
 * 
 * Creates a durable reservation record without consuming pack units yet.
 * Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions.
 * 
 * CRITICAL: Does NOT increment usedQuantity in this phase for billing safety.
 */
export async function reservePackUnits(
  orgId: string, 
  packType: 'sms' | 'email', 
  quantity: number = 1
): Promise<PackReservationResult> {
  const reservationId = `${orgId}-${packType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Use transaction with row-level locking for atomic pack selection
    const result = await db.transaction(async (tx) => {
      // Get total existing pending reservations to include in availability calculation
      const [pendingReservations] = await tx
        .select({ 
          totalPending: sql`COALESCE(SUM(${usagePackReservations.quantity}), 0)`.as('totalPending')
        })
        .from(usagePackReservations)
        .where(and(
          eq(usagePackReservations.orgId, orgId),
          eq(usagePackReservations.packType, packType),
          eq(usagePackReservations.status, 'pending'),
          sql`${usagePackReservations.expiresAt} > NOW()`
        ));

      const totalPendingReservations = Number(pendingReservations?.totalPending || 0);

      // Find available packs using SELECT FOR UPDATE SKIP LOCKED
      // This ensures atomic selection and prevents concurrent consumption
      const availablePacks = await tx
        .select({
          id: usagePacks.id,
          quantity: usagePacks.quantity,
          usedQuantity: usagePacks.usedQuantity,
          purchasedAt: usagePacks.purchasedAt,
        })
        .from(usagePacks)
        .where(and(
          eq(usagePacks.orgId, orgId),
          eq(usagePacks.packType, packType),
          eq(usagePacks.status, 'active'),
          sql`${usagePacks.expiresAt} > NOW()`
        ))
        .orderBy(asc(usagePacks.purchasedAt)) // FIFO order
        .for('update', { skipLocked: true });

      if (availablePacks.length === 0) {
        return { success: false, error: 'no_packs' as const };
      }

      // Calculate total available considering existing reservations
      let totalAvailable = 0;
      for (const pack of availablePacks) {
        totalAvailable += Math.max(0, pack.quantity - pack.usedQuantity);
      }

      // Check if we have enough units available (considering pending reservations)
      if (totalAvailable - totalPendingReservations < quantity) {
        return { success: false, error: 'no_packs' as const };
      }

      let remainingToReserve = quantity;
      const reservationPacks: Array<{ packId: string; reserved: number }> = [];

      // Calculate reservations from packs in FIFO order
      for (const pack of availablePacks) {
        if (remainingToReserve <= 0) break;

        const availableInPack = pack.quantity - pack.usedQuantity;
        const toReserveFromPack = Math.min(remainingToReserve, availableInPack);

        if (toReserveFromPack > 0) {
          reservationPacks.push({ packId: pack.id, reserved: toReserveFromPack });
          remainingToReserve -= toReserveFromPack;
        }
      }

      if (remainingToReserve > 0) {
        return { success: false, error: 'no_packs' as const };
      }

      // Create durable reservation records for each pack
      // CRITICAL: This does NOT modify usedQuantity - that happens in finalize phase
      for (const { packId, reserved } of reservationPacks) {
        await tx
          .insert(usagePackReservations)
          .values({
            id: `${reservationId}-${packId}`,
            orgId,
            packId,
            packType,
            quantity: reserved,
            status: 'pending' as ReservationStatus,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minute expiry
            originalExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // Track original expiry
          });
      }

      return {
        success: true,
        reservationId,
        packId: reservationPacks[0].packId,
      };
    });

    return result;
  } catch (error) {
    console.error(`Database error during pack reservation for ${packType}:`, error);
    return {
      success: false,
      error: 'db_error',
      errorMessage: 'Temporary database issue, please retry',
    };
  }
}

/**
 * CRITICAL BILLING PROTECTION: Enhanced Finalization Result Types
 */
export type EnhancedFinalizationResult = PackFinalizationResult & {
  attemptCount?: number;
  retryable?: boolean;
  compensationRequired?: boolean;
};

/**
 * PHASE 2A: Finalize Pack Consumption
 * 
 * Called after successful SMS/email send to permanently commit the consumption.
 * Atomically updates reservation status and increments pack usedQuantity.
 * 
 * CRITICAL: This is where usedQuantity is actually incremented for billing accuracy.
 */
export async function finalizePackConsumption(reservationId: string): Promise<PackFinalizationResult> {
  try {
    const result = await db.transaction(async (tx) => {
      // Find all pending reservations for this reservation ID
      const pendingReservations = await tx
        .select({
          id: usagePackReservations.id,
          packId: usagePackReservations.packId,
          quantity: usagePackReservations.quantity,
          expiresAt: usagePackReservations.expiresAt,
        })
        .from(usagePackReservations)
        .where(and(
          sql`${usagePackReservations.id}::text LIKE ${reservationId + '%'}`,
          eq(usagePackReservations.status, 'pending')
        ))
        .for('update');

      if (pendingReservations.length === 0) {
        return {
          success: false,
          error: 'reservation_expired' as const,
          errorMessage: 'Reservation expired or not found',
        };
      }

      // Check if any reservations expired
      const now = new Date();
      const expiredReservations = pendingReservations.filter(r => now > r.expiresAt);
      if (expiredReservations.length > 0) {
        // Mark expired reservations as released
        for (const expired of expiredReservations) {
          await tx
            .update(usagePackReservations)
            .set({ status: 'released' as ReservationStatus })
            .where(eq(usagePackReservations.id, expired.id));
        }
        
        return {
          success: false,
          error: 'reservation_expired' as const,
          errorMessage: 'Reservation expired',
        };
      }

      // PRODUCTION HARDENING: Get current pack states with locking
      const packIds = Array.from(new Set(pendingReservations.map(r => r.packId)));
      const currentPacks = await tx
        .select({
          id: usagePacks.id,
          quantity: usagePacks.quantity,
          usedQuantity: usagePacks.usedQuantity,
          status: usagePacks.status,
        })
        .from(usagePacks)
        .where(sql`${usagePacks.id} = ANY(${packIds})`)
        .for('update');

      // DEFENSIVE CHECK: Verify pack capacity before finalizing
      for (const reservation of pendingReservations) {
        const pack = currentPacks.find(p => p.id === reservation.packId);
        if (!pack) {
          console.error(`[PACK FINALIZE ERROR] Pack ${reservation.packId} not found during finalize`);
          return {
            success: false,
            error: 'db_error' as const,
            errorMessage: 'Pack not found during finalization',
          };
        }

        if (pack.status !== 'active') {
          console.error(`[PACK FINALIZE ERROR] Pack ${pack.id} is not active (status: ${pack.status})`);
          return {
            success: false,
            error: 'db_error' as const,
            errorMessage: `Pack is ${pack.status}, cannot finalize`,
          };
        }

        // CRITICAL SAFETY CHECK: Ensure we won't exceed pack capacity
        if (pack.usedQuantity + reservation.quantity > pack.quantity) {
          console.error(`[PACK CAPACITY ERROR] Pack ${pack.id} would exceed capacity: ${pack.usedQuantity} + ${reservation.quantity} > ${pack.quantity}`);
          return {
            success: false,
            error: 'db_error' as const,
            errorMessage: 'Pack capacity would be exceeded',
          };
        }
      }

      // Atomically finalize reservations and update pack quantities
      for (const reservation of pendingReservations) {
        // Mark reservation as finalized
        await tx
          .update(usagePackReservations)
          .set({ status: 'finalized' as ReservationStatus })
          .where(eq(usagePackReservations.id, reservation.id));

        // Increment pack's used quantity with additional safety check
        const updateResult = await tx
          .update(usagePacks)
          .set({
            usedQuantity: sql`${usagePacks.usedQuantity} + ${reservation.quantity}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(usagePacks.id, reservation.packId),
            // ADDITIONAL SAFETY: Ensure we don't exceed capacity in the UPDATE itself
            sql`${usagePacks.usedQuantity} + ${reservation.quantity} <= ${usagePacks.quantity}`
          ))
          .returning({ 
            id: usagePacks.id, 
            newUsedQuantity: usagePacks.usedQuantity,
            totalQuantity: usagePacks.quantity 
          });

        // DEFENSIVE CHECK: Ensure update succeeded
        if (updateResult.length === 0) {
          console.error(`[PACK UPDATE ERROR] Failed to update pack ${reservation.packId} - capacity constraint violated`);
          throw new Error(`Pack capacity exceeded during update`);
        }

        // Update pack status if fully consumed
        if (updateResult[0].newUsedQuantity >= updateResult[0].totalQuantity) {
          await tx
            .update(usagePacks)
            .set({ status: 'used_up', updatedAt: new Date() })
            .where(eq(usagePacks.id, reservation.packId));
        }

        console.log(`[PACK FINALIZE] Pack ${reservation.packId}: ${updateResult[0].newUsedQuantity}/${updateResult[0].totalQuantity} used`);
      }

      return { success: true };
    });

    return result;
  } catch (error) {
    console.error(`Error finalizing pack consumption:`, error);
    return {
      success: false,
      error: 'db_error',
      errorMessage: 'Error finalizing consumption',
    };
  }
}

/**
 * PHASE 2B: Release Pack Reservation
 * 
 * Called after failed SMS/email send to release the reservation without consuming packs.
 * Updates reservation status to 'released' but leaves pack usedQuantity unchanged.
 * 
 * CRITICAL: This preserves user credits by not consuming the reserved pack units.
 */
export async function releasePackReservation(reservationId: string): Promise<PackFinalizationResult> {
  try {
    await db.transaction(async (tx) => {
      // Mark all pending reservations as released
      await tx
        .update(usagePackReservations)
        .set({ status: 'released' as ReservationStatus })
        .where(and(
          sql`${usagePackReservations.id}::text LIKE ${reservationId + '%'}`,
          eq(usagePackReservations.status, 'pending')
        ));
    });

    return { success: true };
  } catch (error) {
    console.error(`Error releasing pack reservation:`, error);
    return {
      success: false,
      error: 'db_error',
      errorMessage: 'Error releasing reservation',
    };
  }
}

/**
 * Check Pack Consumption Availability
 * 
 * Non-transactional check to see if packs are available for consumption.
 * Considers both used quantities and pending reservations.
 * Used for quota checking without actually consuming packs.
 */
export async function checkPackAvailability(
  orgId: string, 
  packType: 'sms' | 'email', 
  quantity: number = 1
): Promise<ConsumptionStatus> {
  try {
    // Get total available pack units
    const [packResult] = await db
      .select({ 
        totalAvailable: sql`SUM(GREATEST(0, ${usagePacks.quantity} - ${usagePacks.usedQuantity}))`.as('totalAvailable')
      })
      .from(usagePacks)
      .where(and(
        eq(usagePacks.orgId, orgId),
        eq(usagePacks.packType, packType),
        eq(usagePacks.status, 'active'),
        sql`${usagePacks.expiresAt} > NOW()`
      ));

    // Get total pending reservations
    const [reservationResult] = await db
      .select({ 
        totalPending: sql`COALESCE(SUM(${usagePackReservations.quantity}), 0)`.as('totalPending')
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.orgId, orgId),
        eq(usagePackReservations.packType, packType),
        eq(usagePackReservations.status, 'pending'),
        sql`${usagePackReservations.expiresAt} > NOW()`
      ));

    const totalAvailable = Number(packResult?.totalAvailable || 0);
    const totalPending = Number(reservationResult?.totalPending || 0);
    const actuallyAvailable = Math.max(0, totalAvailable - totalPending);

    return {
      canConsume: actuallyAvailable >= quantity,
      availablePacks: actuallyAvailable,
    };
  } catch (error) {
    console.error(`Database error checking pack availability for ${packType}:`, error);
    return {
      canConsume: false,
      availablePacks: 0,
      error: 'db_error',
      errorMessage: 'Temporary database issue, please retry',
    };
  }
}

/**
 * Cleanup Expired Reservations
 * 
 * Background cleanup function to release expired pending reservations.
 * Should be called periodically to prevent leaked reservations.
 * 
 * CRITICAL: This prevents abandoned reservations from blocking pack usage.
 */
export async function cleanupExpiredReservations(): Promise<{ cleaned: number; error?: string }> {
  try {
    const result = await db
      .update(usagePackReservations)
      .set({ status: 'released' as ReservationStatus })
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        lt(usagePackReservations.expiresAt, new Date())
      ))
      .returning({ id: usagePackReservations.id });

    const cleanedCount = result.length;
    
    if (cleanedCount > 0) {
      console.log(`[PACK CLEANUP] Released ${cleanedCount} expired reservations`);
    }
    
    return { cleaned: cleanedCount };
  } catch (error) {
    console.error(`Error cleaning up expired reservations:`, error);
    return { 
      cleaned: 0, 
      error: 'Database error during cleanup' 
    };
  }
}

/**
 * CRITICAL BILLING PROTECTION: Enhanced Durable Finalize with Persistent Retry State
 * 
 * This is the PRIMARY function routes should use for finalization.
 * Now integrates with continuous background compensation processor for complete billing safety.
 * 
 * BUSINESS REQUIREMENT: Successful sends MUST consume credits.
 * FAIL-SAFE PATTERN: Prefer failing request over under-billing.
 * ENHANCED: Persistent retry state enables continuous background processing.
 */
export async function durableFinalizePackConsumption(
  reservationId: string,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    failRequestOnPersistentFailure?: boolean;
    persistRetryState?: boolean;
  } = {}
): Promise<EnhancedFinalizationResult> {
  const maxAttempts = options.maxAttempts || 3;
  const baseDelayMs = options.baseDelayMs || 1000;
  const failOnPersistentFailure = options.failRequestOnPersistentFailure ?? true;
  const persistRetryState = options.persistRetryState ?? true;
  
  let lastError: any;
  let attemptCount = 0;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount = attempt;
    
    try {
      console.log(`[DURABLE FINALIZE] Attempt ${attempt}/${maxAttempts} for reservation ${reservationId}`);
      
      // ENHANCED: Update retry state in database before each attempt
      if (persistRetryState && attempt > 1) {
        await updateRetryStateInDatabase(reservationId, attempt, null);
      }
      
      const result = await finalizePackConsumption(reservationId);
      
      if (result.success) {
        console.log(`[DURABLE FINALIZE] SUCCESS on attempt ${attempt} for ${reservationId}`);
        
        // Update metrics for successful finalization
        updateFinalizationMetrics(true, attempt, false);
        
        return {
          ...result,
          attemptCount,
          retryable: false,
        };
      }
      
      // Check if error is retryable
      const isRetryable = result.error === 'db_error';
      lastError = result;
      
      // ENHANCED: Update retry state with error
      if (persistRetryState) {
        await updateRetryStateInDatabase(reservationId, attempt, result.errorMessage || 'Unknown error');
      }
      
      if (!isRetryable) {
        console.error(`[DURABLE FINALIZE] Non-retryable error on attempt ${attempt}: ${result.errorMessage}`);
        return {
          ...result,
          attemptCount,
          retryable: false,
          compensationRequired: false,
        };
      }
      
      // Wait before retry with exponential backoff + jitter
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * baseDelayMs + Math.random() * 500;
        console.log(`[DURABLE FINALIZE] Retrying in ${delay}ms after attempt ${attempt}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      console.error(`[DURABLE FINALIZE] Exception on attempt ${attempt}:`, error);
      lastError = error;
      
      // ENHANCED: Update retry state with exception
      if (persistRetryState) {
        await updateRetryStateInDatabase(reservationId, attempt, error instanceof Error ? error.message : String(error));
      }
      
      // Wait before retry
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * baseDelayMs + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All inline attempts failed - ENHANCED: Queue for background processing
  console.error(`[DURABLE FINALIZE] CRITICAL: All ${maxAttempts} inline attempts failed for ${reservationId}`);
  console.error(`[DURABLE FINALIZE] Last error:`, lastError);
  
  // Update metrics for critical failure
  updateFinalizationMetrics(false, attemptCount, true);
  
  // ENHANCED: Set up background retry with exponential backoff
  if (persistRetryState) {
    await queueForBackgroundRetry(reservationId, attemptCount, lastError);
  } else {
    // Fallback to original behavior
    await logCriticalFinalizationFailure(reservationId, attemptCount, lastError);
  }
  
  if (failOnPersistentFailure) {
    // FAIL-SAFE: Fail the request to prevent under-billing
    throw new Error(`CRITICAL: Failed to finalize pack consumption after ${maxAttempts} attempts. Queued for background processing.`);
  }
  
  // Alternative: Continue with compensation queue processing
  await queueCompensationFinalization(reservationId);
  
  return {
    success: false,
    error: 'db_error',
    errorMessage: `Failed after ${maxAttempts} attempts, queued for background retry`,
    attemptCount,
    retryable: true,
    compensationRequired: true,
  };
}

/**
 * Critical Finalization Failure Logging
 * 
 * Logs persistent finalization failures for manual intervention.
 * This data is critical for revenue protection and audit compliance.
 */
async function logCriticalFinalizationFailure(
  reservationId: string,
  attemptCount: number,
  error: any
): Promise<void> {
  try {
    // Log to database for audit trail
    await db.execute(sql`
      INSERT INTO usage_pack_reservations (
        id, org_id, pack_id, pack_type, quantity, status, 
        expires_at, created_at, updated_at
      ) 
      SELECT 
        ${reservationId + '-FAILED-' + Date.now()},
        org_id, pack_id, pack_type, quantity, 'failed',
        NOW() + INTERVAL '30 days', NOW(), NOW()
      FROM usage_pack_reservations 
      WHERE id::text LIKE ${reservationId + '%'} 
      AND status = 'pending'
      LIMIT 1
      ON CONFLICT (id) DO NOTHING
    `);
    
    console.error(`[CRITICAL BILLING ERROR] FAILED FINALIZATION LOGGED:`, {
      reservationId,
      attemptCount,
      timestamp: new Date().toISOString(),
      error: error?.message || String(error),
      severity: 'CRITICAL',
      impact: 'POTENTIAL_UNDER_BILLING',
      action_required: 'MANUAL_INTERVENTION',
    });
  } catch (logError) {
    console.error(`[CRITICAL] Failed to log finalization failure:`, logError);
  }
}

/**
 * Compensation Queue for Persistent Failures
 * 
 * Queues failed finalizations for background processing.
 * This is a last resort to prevent complete service disruption.
 */
async function queueCompensationFinalization(reservationId: string): Promise<void> {
  try {
    // Mark reservation for compensation processing
    await db.execute(sql`
      UPDATE usage_pack_reservations 
      SET status = 'compensation_queued',
          updated_at = NOW()
      WHERE id::text LIKE ${reservationId + '%'} 
      AND status = 'pending'
    `);
    
    console.error(`[COMPENSATION QUEUE] Queued reservation ${reservationId} for background finalization`);
  } catch (error) {
    console.error(`[COMPENSATION QUEUE] Failed to queue reservation ${reservationId}:`, error);
  }
}

/**
 * STARTUP RECONCILIATION: Recovery from Previous Finalization Failures
 * 
 * Called on server startup to recover any missed finalizations.
 * This handles scenarios where server crashed before finalization.
 */
export async function reconcilePendingFinalizations(): Promise<{
  recovered: number;
  failed: number;
  errors: string[];
}> {
  console.log('[STARTUP RECONCILIATION] Starting recovery of pending finalizations...');
  
  const result = { recovered: 0, failed: 0, errors: [] as string[] };
  
  try {
    // Find non-expired pending reservations that may need finalization
    const pendingReservations = await db
      .select({
        reservationId: sql`REGEXP_REPLACE(${usagePackReservations.id}::text, '-[^-]+$', '')`.as('reservationId'),
        count: sql`COUNT(*)`.as('count'),
        minCreated: sql`MIN(${usagePackReservations.createdAt})`.as('minCreated'),
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        sql`${usagePackReservations.expiresAt} > NOW()`,
        sql`${usagePackReservations.createdAt} < NOW() - INTERVAL '2 minutes'` // Only old reservations
      ))
      .groupBy(sql`REGEXP_REPLACE(${usagePackReservations.id}::text, '-[^-]+$', '')`)
      .limit(100); // Process in batches
    
    if (pendingReservations.length === 0) {
      console.log('[STARTUP RECONCILIATION] No pending reservations found for recovery');
      return result;
    }
    
    console.log(`[STARTUP RECONCILIATION] Found ${pendingReservations.length} reservation groups to recover`);
    
    // Attempt to finalize each reservation group
    for (const reservation of pendingReservations) {
      const reservationId = reservation.reservationId as string;
      
      try {
        console.log(`[STARTUP RECONCILIATION] Attempting to finalize ${reservationId}`);
        
        const finalizeResult = await finalizePackConsumption(reservationId);
        
        if (finalizeResult.success) {
          result.recovered++;
          console.log(`[STARTUP RECONCILIATION] Successfully recovered ${reservationId}`);
        } else {
          result.failed++;
          const errorMsg = `Failed to recover ${reservationId}: ${finalizeResult.errorMessage}`;
          result.errors.push(errorMsg);
          console.error(`[STARTUP RECONCILIATION] ${errorMsg}`);
        }
      } catch (error) {
        result.failed++;
        const errorMsg = `Exception recovering ${reservationId}: ${error}`;
        result.errors.push(errorMsg);
        console.error(`[STARTUP RECONCILIATION] ${errorMsg}`);
      }
    }
    
    console.log(`[STARTUP RECONCILIATION] Completed: ${result.recovered} recovered, ${result.failed} failed`);
    return result;
    
  } catch (error) {
    const errorMsg = `Critical error during startup reconciliation: ${error}`;
    result.errors.push(errorMsg);
    console.error(`[STARTUP RECONCILIATION] ${errorMsg}`);
    return result;
  }
}

/**
 * Compensation Processing Background Job
 * 
 * Processes queued compensation finalizations.
 * Should run periodically to handle persistent failures.
 */
export async function processCompensationQueue(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const result = { processed: 0, failed: 0, errors: [] as string[] };
  
  try {
    // Get compensation queued reservations
    const compensationReservations = await db
      .select({
        reservationId: sql`REGEXP_REPLACE(${usagePackReservations.id}::text, '-[^-]+$', '')`.as('reservationId'),
        createdAt: usagePackReservations.createdAt,
      })
      .from(usagePackReservations)
      .where(eq(usagePackReservations.status, 'compensation_queued'))
      .groupBy(sql`REGEXP_REPLACE(${usagePackReservations.id}::text, '-[^-]+$', '')`, usagePackReservations.createdAt)
      .orderBy(asc(usagePackReservations.createdAt))
      .limit(50); // Process in batches
    
    for (const reservation of compensationReservations) {
      const reservationId = reservation.reservationId as string;
      
      try {
        const finalizeResult = await finalizePackConsumption(reservationId);
        
        if (finalizeResult.success) {
          result.processed++;
          console.log(`[COMPENSATION] Successfully processed ${reservationId}`);
        } else {
          result.failed++;
          result.errors.push(`Failed to process ${reservationId}: ${finalizeResult.errorMessage}`);
        }
      } catch (error) {
        result.failed++;
        result.errors.push(`Exception processing ${reservationId}: ${error}`);
      }
    }
    
    return result;
  } catch (error) {
    console.error('[COMPENSATION] Error processing compensation queue:', error);
    result.errors.push(`Critical error: ${error}`);
    return result;
  }
}

// Start periodic cleanup of expired reservations (every 2 minutes)
setInterval(async () => {
  try {
    await cleanupExpiredReservations();
  } catch (error) {
    console.error('[PACK CLEANUP] Error in periodic cleanup:', error);
  }
}, 2 * 60 * 1000);

/**
 * MONITORING & ALERTING: Critical Billing Protection Metrics
 * 
 * Tracks finalization success/failure rates and alerts on potential revenue loss.
 */
export type FinalizationMetrics = {
  totalAttempts: number;
  successfulFinalizations: number;
  failedFinalizations: number;
  averageRetryCount: number;
  successRate: number;
  pendingReservations: number;
  expiredReservations: number;
  compensationQueueSize: number;
  criticalFailures: number;
  lastUpdated: Date;
};

// Use the existing finalizationMetrics from earlier declaration

/**
 * Update Finalization Metrics
 * 
 * Called after each finalization attempt to track billing protection effectiveness.
 */
export function updateFinalizationMetrics(
  success: boolean,
  attemptCount: number = 1,
  isCritical: boolean = false
): void {
  finalizationMetrics.totalAttempts++;
  
  if (success) {
    finalizationMetrics.successfulFinalizations++;
  } else {
    finalizationMetrics.failedFinalizations++;
    if (isCritical) {
      finalizationMetrics.criticalFailures++;
    }
  }
  
  // Update running average of retry count
  const totalRetries = finalizationMetrics.averageRetryCount * (finalizationMetrics.totalAttempts - 1) + attemptCount;
  finalizationMetrics.averageRetryCount = totalRetries / finalizationMetrics.totalAttempts;
  
  // Update success rate
  finalizationMetrics.successRate = (finalizationMetrics.successfulFinalizations / finalizationMetrics.totalAttempts) * 100;
  
  finalizationMetrics.lastUpdated = new Date();
  
  // Alert on critical thresholds
  checkFinalizationAlerts();
}

/**
 * Get Current Finalization Metrics
 * 
 * Returns current metrics for monitoring dashboards and health checks.
 */
export async function getFinalizationMetrics(): Promise<FinalizationMetrics> {
  try {
    // Update real-time counts from database
    const [pendingCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        sql`${usagePackReservations.expiresAt} > NOW()`
      ));
    
    const [expiredCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.status, 'pending'),
        sql`${usagePackReservations.expiresAt} <= NOW()`
      ));
    
    const [compensationCount] = await db
      .select({ count: sql`COUNT(*)`.as('count') })
      .from(usagePackReservations)
      .where(eq(usagePackReservations.status, 'compensation_queued'));
    
    finalizationMetrics.pendingReservations = Number(pendingCount?.count || 0);
    finalizationMetrics.expiredReservations = Number(expiredCount?.count || 0);
    finalizationMetrics.compensationQueueSize = Number(compensationCount?.count || 0);
    
    return { ...finalizationMetrics };
  } catch (error) {
    console.error('[METRICS] Error updating finalization metrics:', error);
    return { ...finalizationMetrics };
  }
}

/**
 * Check Finalization Alerts
 * 
 * Monitors critical thresholds and triggers alerts for potential revenue loss.
 */
function checkFinalizationAlerts(): void {
  const metrics = finalizationMetrics;
  const alerts: string[] = [];
  
  // Critical: Success rate below 95%
  if (metrics.successRate < 95 && metrics.totalAttempts > 10) {
    alerts.push(`CRITICAL: Finalization success rate is ${(metrics.successRate || 0).toFixed(1)}% (below 95% threshold)`);
  }
  
  // Warning: Success rate below 98%
  if (metrics.successRate < 98 && metrics.totalAttempts > 10) {
    alerts.push(`WARNING: Finalization success rate is ${(metrics.successRate || 0).toFixed(1)}% (below 98% threshold)`);
  }
  
  // Critical: Multiple failures in short period
  if (metrics.criticalFailures > 5) {
    alerts.push(`CRITICAL: ${metrics.criticalFailures} critical finalization failures detected - potential revenue loss`);
  }
  
  // Warning: High average retry count
  if (metrics.averageRetryCount > 2.0) {
    alerts.push(`WARNING: High average retry count (${(metrics.averageRetryCount || 0).toFixed(1)}) indicates system instability`);
  }
  
  // Warning: Growing pending reservations
  if (metrics.pendingReservations > 100) {
    alerts.push(`WARNING: ${metrics.pendingReservations} pending reservations - potential finalization backlog`);
  }
  
  // Critical: Large compensation queue
  if (metrics.compensationQueueSize > 50) {
    alerts.push(`CRITICAL: ${metrics.compensationQueueSize} reservations in compensation queue - manual intervention required`);
  }
  
  // Log alerts
  for (const alert of alerts) {
    console.error(`[BILLING ALERT] ${alert}`);
    
    // In production, you would send these alerts to your monitoring system
    // Example: await sendSlackAlert(alert);
    // Example: await sendPagerDutyAlert(alert);
  }
}

/**
 * Generate Comprehensive Billing Health Report
 * 
 * Provides detailed report for operational monitoring and auditing.
 */
export async function generateBillingHealthReport(): Promise<{
  status: 'healthy' | 'warning' | 'critical';
  metrics: FinalizationMetrics;
  issues: string[];
  recommendations: string[];
  timestamp: Date;
}> {
  const metrics = await getFinalizationMetrics();
  const issues: string[] = [];
  const recommendations: string[] = [];
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  // Analyze metrics for issues
  if (metrics.successRate < 95) {
    status = 'critical';
    issues.push(`Low finalization success rate: ${(metrics.successRate || 0).toFixed(1)}%`);
    recommendations.push('Investigate database connectivity and performance issues');
  } else if (metrics.successRate < 98) {
    status = 'warning';
    issues.push(`Declining finalization success rate: ${(metrics.successRate || 0).toFixed(1)}%`);
    recommendations.push('Monitor database performance and network stability');
  }
  
  if (metrics.criticalFailures > 5) {
    status = 'critical';
    issues.push(`${metrics.criticalFailures} critical finalization failures`);
    recommendations.push('Review logs for billing errors and contact affected customers');
  }
  
  if (metrics.compensationQueueSize > 50) {
    status = 'critical';
    issues.push(`${metrics.compensationQueueSize} items in compensation queue`);
    recommendations.push('Manually process compensation queue and investigate root cause');
  } else if (metrics.compensationQueueSize > 10) {
    status = 'warning';
    issues.push(`${metrics.compensationQueueSize} items in compensation queue`);
    recommendations.push('Monitor compensation queue processing');
  }
  
  if (metrics.pendingReservations > 100) {
    status = status === 'critical' ? 'critical' : 'warning';
    issues.push(`${metrics.pendingReservations} pending reservations`);
    recommendations.push('Check for finalization processing delays');
  }
  
  if (metrics.averageRetryCount > 2.5) {
    status = status === 'critical' ? 'critical' : 'warning';
    issues.push(`High retry rate: ${(metrics.averageRetryCount || 0).toFixed(1)} average retries`);
    recommendations.push('Investigate database performance and connection stability');
  }
  
  // Healthy state recommendations
  if (status === 'healthy') {
    recommendations.push('Billing protection system is operating normally');
    recommendations.push('Continue monitoring metrics for trends');
  }
  
  return {
    status,
    metrics,
    issues,
    recommendations,
    timestamp: new Date(),
  };
}

// Start periodic compensation processing (every 5 minutes)
setInterval(async () => {
  try {
    const result = await processCompensationQueue();
    if (result.processed > 0 || result.failed > 0) {
      console.log(`[COMPENSATION] Processed: ${result.processed}, Failed: ${result.failed}`);
      
      // Update metrics
      updateFinalizationMetrics(result.processed > 0, 1, result.failed > 0);
    }
  } catch (error) {
    console.error('[COMPENSATION] Error in periodic processing:', error);
  }
}, 5 * 60 * 1000);

// Start periodic metrics reporting (every 10 minutes)
setInterval(async () => {
  try {
    const report = await generateBillingHealthReport();
    
    if (report.status !== 'healthy') {
      console.error(`[BILLING HEALTH] Status: ${report.status.toUpperCase()}`);
      console.error(`[BILLING HEALTH] Issues: ${report.issues.join(', ')}`);
      console.error(`[BILLING HEALTH] Recommendations: ${report.recommendations.join(', ')}`);
    } else {
      console.log(`[BILLING HEALTH] System healthy - ${report.metrics?.successRate?.toFixed(1) || 'N/A'}% success rate`);
    }
  } catch (error) {
    console.error('[BILLING HEALTH] Error generating health report:', error);
  }
}, 10 * 60 * 1000);

/**
 * PRODUCTION MONITORING: Comprehensive Pack System Health Diagnostics
 * 
 * Provides real-time visibility into pack system health for production monitoring.
 * Critical for identifying billing issues, capacity problems, and system bottlenecks.
 */
export type PackSystemHealthReport = {
  timestamp: Date;
  orgId: string;
  packs: {
    totalActive: number;
    totalExpired: number;
    totalUsedUp: number;
    smsPacksAvailable: number;
    emailPacksAvailable: number;
    smsCapacityUsed: number;
    emailCapacityUsed: number;
  };
  reservations: {
    totalPending: number;
    totalExpired: number;
    totalFinalized: number;
    totalReleased: number;
    oldestPending?: Date;
    averageReservationAge?: number;
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  };
};

export async function generatePackSystemHealthReport(orgId: string): Promise<PackSystemHealthReport> {
  try {
    const now = new Date();
    const report: PackSystemHealthReport = {
      timestamp: now,
      orgId,
      packs: {
        totalActive: 0,
        totalExpired: 0,
        totalUsedUp: 0,
        smsPacksAvailable: 0,
        emailPacksAvailable: 0,
        smsCapacityUsed: 0,
        emailCapacityUsed: 0,
      },
      reservations: {
        totalPending: 0,
        totalExpired: 0,
        totalFinalized: 0,
        totalReleased: 0,
      },
      health: {
        status: 'healthy',
        issues: [],
        recommendations: [],
      },
    };

    // Analyze pack status
    const [packStats] = await db
      .select({
        status: usagePacks.status,
        packType: usagePacks.packType,
        totalPacks: sql`COUNT(*)`.as('totalPacks'),
        totalCapacity: sql`COALESCE(SUM(${usagePacks.quantity}), 0)`.as('totalCapacity'),
        totalUsed: sql`COALESCE(SUM(${usagePacks.usedQuantity}), 0)`.as('totalUsed'),
        availableCapacity: sql`COALESCE(SUM(GREATEST(0, ${usagePacks.quantity} - ${usagePacks.usedQuantity})), 0)`.as('availableCapacity'),
      })
      .from(usagePacks)
      .where(eq(usagePacks.orgId, orgId))
      .groupBy(usagePacks.status, usagePacks.packType);

    // Process pack statistics
    const packsByStatus = await db
      .select({
        status: usagePacks.status,
        count: sql`COUNT(*)`.as('count'),
      })
      .from(usagePacks)
      .where(eq(usagePacks.orgId, orgId))
      .groupBy(usagePacks.status);

    for (const statusCount of packsByStatus) {
      const count = Number(statusCount.count);
      switch (statusCount.status) {
        case 'active':
          report.packs.totalActive = count;
          break;
        case 'expired':
          report.packs.totalExpired = count;
          break;
        case 'used_up':
          report.packs.totalUsedUp = count;
          break;
      }
    }

    // Get pack type specific stats
    const packTypeStats = await db
      .select({
        packType: usagePacks.packType,
        availableCapacity: sql`COALESCE(SUM(GREATEST(0, ${usagePacks.quantity} - ${usagePacks.usedQuantity})), 0)`.as('availableCapacity'),
        usedPercentage: sql`CASE WHEN SUM(${usagePacks.quantity}) > 0 THEN ROUND((SUM(${usagePacks.usedQuantity})::DECIMAL / SUM(${usagePacks.quantity})::DECIMAL) * 100, 2) ELSE 0 END`.as('usedPercentage'),
      })
      .from(usagePacks)
      .where(and(
        eq(usagePacks.orgId, orgId),
        eq(usagePacks.status, 'active'),
        sql`${usagePacks.expiresAt} > NOW()`
      ))
      .groupBy(usagePacks.packType);

    for (const typeStats of packTypeStats) {
      const available = Number(typeStats.availableCapacity);
      const usedPercentage = Number(typeStats.usedPercentage);

      if (typeStats.packType === 'sms') {
        report.packs.smsPacksAvailable = available;
        report.packs.smsCapacityUsed = usedPercentage;
      } else if (typeStats.packType === 'email') {
        report.packs.emailPacksAvailable = available;
        report.packs.emailCapacityUsed = usedPercentage;
      }
    }

    // Analyze reservation health
    const reservationStats = await db
      .select({
        status: usagePackReservations.status,
        count: sql`COUNT(*)`.as('count'),
        oldestCreated: sql`MIN(${usagePackReservations.createdAt})`.as('oldestCreated'),
        expiredCount: sql`COUNT(*) FILTER (WHERE ${usagePackReservations.expiresAt} < NOW())`.as('expiredCount'),
      })
      .from(usagePackReservations)
      .where(eq(usagePackReservations.orgId, orgId))
      .groupBy(usagePackReservations.status);

    for (const reservationStat of reservationStats) {
      const count = Number(reservationStat.count);
      const expiredCount = Number(reservationStat.expiredCount || 0);

      switch (reservationStat.status) {
        case 'pending':
          report.reservations.totalPending = count;
          report.reservations.totalExpired = expiredCount;
          if (reservationStat.oldestCreated && typeof reservationStat.oldestCreated === 'string') {
            const oldestDate = new Date(reservationStat.oldestCreated);
            if (!isNaN(oldestDate.getTime())) {
              report.reservations.oldestPending = oldestDate;
              report.reservations.averageReservationAge = 
                (now.getTime() - oldestDate.getTime()) / 1000;
            }
          }
          break;
        case 'finalized':
          report.reservations.totalFinalized = count;
          break;
        case 'released':
          report.reservations.totalReleased = count;
          break;
      }
    }

    // Health Analysis
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for capacity issues
    if (report.packs.smsPacksAvailable === 0 && report.packs.emailPacksAvailable === 0) {
      issues.push('No available pack capacity for SMS or Email');
      recommendations.push('Purchase additional usage packs immediately');
      report.health.status = 'critical';
    } else if (report.packs.smsPacksAvailable < 10 || report.packs.emailPacksAvailable < 10) {
      issues.push(`Low pack capacity: SMS=${report.packs.smsPacksAvailable}, Email=${report.packs.emailPacksAvailable}`);
      recommendations.push('Consider purchasing additional usage packs');
      if (report.health.status === 'healthy') report.health.status = 'warning';
    }

    // Check for expired pending reservations
    if (report.reservations.totalExpired > 0) {
      issues.push(`${report.reservations.totalExpired} expired pending reservations found`);
      recommendations.push('Cleanup process may need investigation');
      if (report.health.status === 'healthy') report.health.status = 'warning';
    }

    // Check for stale reservations
    if (report.reservations.averageReservationAge && report.reservations.averageReservationAge > 300) {
      issues.push(`Long-running reservations detected (avg ${Math.round(report.reservations.averageReservationAge)}s)`);
      recommendations.push('Check for stuck reservation processes');
      if (report.health.status === 'healthy') report.health.status = 'warning';
    }

    // Check for excessive expired packs
    if (report.packs.totalExpired > report.packs.totalActive * 2) {
      issues.push(`High ratio of expired packs (${report.packs.totalExpired} expired vs ${report.packs.totalActive} active)`);
      recommendations.push('Review pack purchasing patterns and expiry management');
    }

    report.health.issues = issues;
    report.health.recommendations = recommendations;

    return report;
  } catch (error) {
    console.error('[HEALTH REPORT ERROR]', error);
    return {
      timestamp: new Date(),
      orgId,
      packs: {
        totalActive: 0,
        totalExpired: 0,
        totalUsedUp: 0,
        smsPacksAvailable: 0,
        emailPacksAvailable: 0,
        smsCapacityUsed: 0,
        emailCapacityUsed: 0,
      },
      reservations: {
        totalPending: 0,
        totalExpired: 0,
        totalFinalized: 0,
        totalReleased: 0,
      },
      health: {
        status: 'critical',
        issues: ['Failed to generate health report'],
        recommendations: ['Check database connectivity and pack system health'],
      },
    };
  }
}

/**
 * PRODUCTION DIAGNOSTICS: Detailed Reservation Analysis
 * 
 * Provides deep insights into reservation patterns for debugging and optimization.
 */
export async function analyzeReservationPatterns(orgId: string, hours: number = 24): Promise<{
  totalReservations: number;
  successRate: number;
  averageReservationDuration: number;
  reservationsByHour: { hour: string; reservations: number; success: number; expired: number }[];
  packUtilization: { packId: string; totalReservations: number; successfulFinalizations: number }[];
}> {
  try {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get reservation statistics
    const [stats] = await db
      .select({
        totalReservations: sql`COUNT(*)`.as('totalReservations'),
        finalized: sql`COUNT(*) FILTER (WHERE status = 'finalized')`.as('finalized'),
        released: sql`COUNT(*) FILTER (WHERE status = 'released')`.as('released'),
        avgDuration: sql`AVG(EXTRACT(EPOCH FROM (COALESCE(expires_at, NOW()) - created_at)))`.as('avgDuration'),
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.orgId, orgId),
        sql`${usagePackReservations.createdAt} >= ${cutoffTime}`
      ));

    const totalReservations = Number(stats?.totalReservations || 0);
    const finalized = Number(stats?.finalized || 0);
    const successRate = totalReservations > 0 ? (finalized / totalReservations) * 100 : 0;
    const averageReservationDuration = Number(stats?.avgDuration || 0);

    // Get hourly breakdown
    const hourlyStats = await db
      .select({
        hour: sql`DATE_TRUNC('hour', ${usagePackReservations.createdAt})`.as('hour'),
        reservations: sql`COUNT(*)`.as('reservations'),
        success: sql`COUNT(*) FILTER (WHERE status = 'finalized')`.as('success'),
        expired: sql`COUNT(*) FILTER (WHERE status = 'released' AND expires_at < NOW())`.as('expired'),
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.orgId, orgId),
        sql`${usagePackReservations.createdAt} >= ${cutoffTime}`
      ))
      .groupBy(sql`DATE_TRUNC('hour', ${usagePackReservations.createdAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${usagePackReservations.createdAt})`);

    // Get pack utilization
    const packUtilization = await db
      .select({
        packId: usagePackReservations.packId,
        totalReservations: sql`COUNT(*)`.as('totalReservations'),
        successfulFinalizations: sql`COUNT(*) FILTER (WHERE status = 'finalized')`.as('successfulFinalizations'),
      })
      .from(usagePackReservations)
      .where(and(
        eq(usagePackReservations.orgId, orgId),
        sql`${usagePackReservations.createdAt} >= ${cutoffTime}`
      ))
      .groupBy(usagePackReservations.packId);

    return {
      totalReservations,
      successRate,
      averageReservationDuration,
      reservationsByHour: hourlyStats.map(row => ({
        hour: row.hour as string,
        reservations: Number(row.reservations),
        success: Number(row.success),
        expired: Number(row.expired),
      })),
      packUtilization: packUtilization.map(row => ({
        packId: row.packId,
        totalReservations: Number(row.totalReservations),
        successfulFinalizations: Number(row.successfulFinalizations),
      })),
    };
  } catch (error) {
    console.error('[RESERVATION ANALYSIS ERROR]', error);
    return {
      totalReservations: 0,
      successRate: 0,
      averageReservationDuration: 0,
      reservationsByHour: [],
      packUtilization: [],
    };
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use the two-phase consumption pattern instead
 */
export async function consumePacksForType(
  orgId: string, 
  packType: 'sms' | 'email', 
  quantity: number = 1
): Promise<{ success: boolean; consumedPacks: number; remainingPacks: number }> {
  console.warn('[DEPRECATED] consumePacksForType should be replaced with two-phase consumption');
  
  const reservation = await reservePackUnits(orgId, packType, quantity);
  
  if (!reservation.success) {
    const availability = await checkPackAvailability(orgId, packType);
    return {
      success: false,
      consumedPacks: 0,
      remainingPacks: availability.availablePacks,
    };
  }

  // Immediately finalize for backward compatibility
  const finalization = await finalizePackConsumption(reservation.reservationId!);
  
  if (!finalization.success) {
    // Try to release the reservation
    await releasePackReservation(reservation.reservationId!);
    return {
      success: false,
      consumedPacks: 0,
      remainingPacks: 0,
    };
  }

  const availability = await checkPackAvailability(orgId, packType);
  
  return {
    success: true,
    consumedPacks: quantity,
    remainingPacks: availability.availablePacks,
  };
}