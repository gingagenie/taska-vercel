import type { Request, Response, NextFunction } from "express";
import { verifySupportToken } from "../lib/secure-support-token";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

/**
 * Access Control Middleware - Enforces strict isolation between support staff and customer data
 * 
 * This middleware provides complete separation:
 * - Support staff can only access tickets cross-org and support admin endpoints
 * - Customer users can only access their org-scoped data and cannot access support admin endpoints
 */

/**
 * Block support staff from accessing customer data endpoints
 * Use this middleware on all customer data routes (jobs, customers, quotes, invoices, etc.)
 */
export async function blockSupportStaffFromCustomerData(req: Request, res: Response, next: NextFunction) {
  try {
    // SECURITY FIX: Verify secure support token instead of forgeable boolean marker
    let isVerifiedSupportStaff = false;
    let supportUserId: string | null = null;
    let detectionMethod = 'none';

    // Step 1: Check for secure support token (cryptographically signed)
    const supportToken = req.cookies?.support_token;
    if (supportToken) {
      const tokenPayload = verifySupportToken(supportToken);
      if (tokenPayload) {
        isVerifiedSupportStaff = true;
        supportUserId = tokenPayload.supportUserId;
        detectionMethod = 'secure_token';
        console.log(`[ACCESS_CONTROL] Verified support staff via secure token: ${supportUserId} (${tokenPayload.role})`);
      } else {
        // Token exists but invalid - possible forgery attempt
        console.warn(`[ACCESS_CONTROL] Invalid support token detected - possible forgery attempt from IP ${req.ip}`);
      }
    }

    // Step 2: SECURE fallback to session-based verification only
    // SECURITY FIX: Do not trust req.isSupportStaff or user roles without verification
    if (!isVerifiedSupportStaff) {
      const sessionSupportUserId = req.session?.supportUserId;
      
      if (sessionSupportUserId) {
        // Verify session support user exists and is active in support_users table
        try {
          const sessionVerifyResult: any = await db.execute(sql`
            SELECT id, role, is_active FROM support_users 
            WHERE id = ${sessionSupportUserId}::uuid AND is_active = true
          `);
          
          if (sessionVerifyResult[0]) {
            isVerifiedSupportStaff = true;
            supportUserId = sessionSupportUserId;
            detectionMethod = 'verified_session';
            console.log(`[ACCESS_CONTROL] Verified support staff via active session: ${supportUserId}`);
          } else {
            console.warn(`[ACCESS_CONTROL] Invalid session support user: ${sessionSupportUserId}`);
          }
        } catch (dbError) {
          console.error(`[ACCESS_CONTROL] Session verification error: ${dbError}`);
        }
      }
    }

    // Block verified support staff from customer data endpoints
    if (isVerifiedSupportStaff) {
      console.log(`[ACCESS_CONTROL] Blocked support staff ${supportUserId} from accessing customer endpoint ${req.path} (detected via ${detectionMethod})`);
      return res.status(403).json({
        error: "Access denied",
        message: "Support staff cannot access customer data. You can only access support tickets and admin functions.",
        endpoint: req.path,
        userType: "support_staff",
        detectionMethod
      });
    }

    // Allow regular customer users to proceed
    next();
  } catch (error) {
    console.error("[ACCESS_CONTROL] Error in blockSupportStaffFromCustomerData:", error);
    res.status(500).json({ error: "Access control check failed" });
  }
}

/**
 * Block customer users from accessing support admin endpoints
 * Use this middleware on all support admin routes (/support/api/*)
 */
export async function blockCustomersFromSupportAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    // SECURITY FIX: Verify secure support token for admin access
    let isVerifiedSupportStaff = false;
    let supportUserId: string | null = null;
    let detectionMethod = 'none';

    // Step 1: Check for secure support token (cryptographically signed)
    const supportToken = req.cookies?.support_token;
    if (supportToken) {
      const tokenPayload = verifySupportToken(supportToken);
      if (tokenPayload) {
        isVerifiedSupportStaff = true;
        supportUserId = tokenPayload.supportUserId;
        detectionMethod = 'secure_token';
        console.log(`[ACCESS_CONTROL] Verified support staff via secure token: ${supportUserId} (${tokenPayload.role})`);
      } else {
        // Token exists but invalid - possible forgery attempt
        console.warn(`[ACCESS_CONTROL] Invalid support token detected for admin access - possible forgery attempt from IP ${req.ip}`);
      }
    }

    // Step 2: SECURE fallback to session-based verification only
    // SECURITY FIX: Do not trust req.isSupportStaff or user roles without verification
    if (!isVerifiedSupportStaff) {
      const sessionSupportUserId = req.session?.supportUserId;
      
      if (sessionSupportUserId) {
        // Verify session support user exists and is active in support_users table
        try {
          const sessionVerifyResult: any = await db.execute(sql`
            SELECT id, role, is_active FROM support_users 
            WHERE id = ${sessionSupportUserId}::uuid AND is_active = true
          `);
          
          if (sessionVerifyResult[0]) {
            isVerifiedSupportStaff = true;
            supportUserId = sessionSupportUserId;
            detectionMethod = 'verified_session';
            console.log(`[ACCESS_CONTROL] Verified support staff via active session: ${supportUserId}`);
          } else {
            console.warn(`[ACCESS_CONTROL] Invalid session support user: ${sessionSupportUserId}`);
          }
        } catch (dbError) {
          console.error(`[ACCESS_CONTROL] Session verification error: ${dbError}`);
        }
      }
    }

    // SECURITY FIX: Verify admin role for support staff before allowing access
    if (isVerifiedSupportStaff) {
      // Get the user's role to verify admin access
      try {
        const roleVerifyResult: any = await db.execute(sql`
          SELECT role FROM support_users 
          WHERE id = ${supportUserId}::uuid AND is_active = true
        `);
        
        const userRole = roleVerifyResult[0]?.role;
        
        // Only support_admin role can access admin endpoints
        if (userRole === 'support_admin') {
          console.log(`[ACCESS_CONTROL] Support admin ${supportUserId} granted access to support admin endpoint ${req.path} (via ${detectionMethod})`);
          return next();
        } else {
          console.log(`[ACCESS_CONTROL] Support agent ${supportUserId} denied admin access to ${req.path} - requires admin role`);
          return res.status(403).json({
            error: "Access denied",
            message: "Administrative privileges required. Only support administrators can access this endpoint.",
            endpoint: req.path,
            userType: "support_agent",
            requiredRole: "support_admin"
          });
        }
      } catch (dbError) {
        console.error(`[ACCESS_CONTROL] Role verification error for support user ${supportUserId}:`, dbError);
        return res.status(500).json({ error: "Access verification failed" });
      }
    }

    // SECURITY FIX: Require authentication for ALL support admin endpoints
    // No unauthenticated access is allowed - this prevents security bypasses
    const userId = req.user?.id || req.session?.userId || (req.session as any)?.user?.id;
    
    if (!userId) {
      console.log(`[ACCESS_CONTROL] Unauthenticated request blocked from support admin endpoint ${req.path}`);
      return res.status(401).json({
        error: "Authentication required",
        message: "You must be authenticated to access support administration functions.",
        endpoint: req.path
      });
    }

    // Block authenticated customer users (non-support staff)
    console.log(`[ACCESS_CONTROL] Authenticated customer user ${userId} blocked from support admin endpoint ${req.path}`);
    return res.status(403).json({
      error: "Access denied",
      message: "Customer users cannot access support administration functions. Contact support if you need assistance.",
      endpoint: req.path,
      userType: "customer"
    });
  } catch (error) {
    console.error("[ACCESS_CONTROL] Error in blockCustomersFromSupportAdmin:", error);
    res.status(500).json({ error: "Access control check failed" });
  }
}

/**
 * Enforce support staff cross-org ticket access
 * This middleware should be used for ticket routes to allow support staff cross-org access
 * while maintaining org isolation for customer users
 */
export function enforceSupportTicketAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id || req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Support staff get cross-org access to tickets
    if (req.isSupportStaff) {
      console.log(`[ACCESS_CONTROL] Granting cross-org ticket access to support staff ${userId}`);
      // Don't set orgId - this allows support staff to query across all orgs
      return next();
    }

    // Customer users need org context for ticket isolation
    if (!req.orgId) {
      return res.status(400).json({ 
        error: "Organization context required",
        message: "Customer users can only access tickets from their organization"
      });
    }

    console.log(`[ACCESS_CONTROL] Customer ticket access restricted to org ${req.orgId} for user ${userId}`);
    next();
  } catch (error) {
    console.error("[ACCESS_CONTROL] Error in enforceSupportTicketAccess:", error);
    res.status(500).json({ error: "Ticket access control check failed" });
  }
}

/**
 * Support staff detection and role enforcement
 * This middleware detects support staff and sets appropriate context
 */
export function detectAndEnforceSupportStaff(req: Request, res: Response, next: NextFunction) {
  try {
    // Support staff should already be detected by auth middleware
    // This middleware just ensures the context is properly set
    
    if (req.isSupportStaff) {
      console.log(`[ACCESS_CONTROL] Support staff context confirmed for ${req.user?.id}`);
      
      // Ensure support staff don't have customer org context
      // This prevents accidental org-scoped queries
      if (req.orgId && !req.supportStaffOrgId) {
        console.warn(`[ACCESS_CONTROL] Clearing unexpected orgId for support staff ${req.user?.id}`);
        req.orgId = undefined;
      }
    }

    next();
  } catch (error) {
    console.error("[ACCESS_CONTROL] Error in detectAndEnforceSupportStaff:", error);
    res.status(500).json({ error: "Support staff detection failed" });
  }
}

/**
 * Comprehensive access control for mixed endpoints
 * Use this when an endpoint should work for both user types but with different access levels
 */
export function mixedAccessControl(options: {
  allowSupportStaff?: boolean;
  allowCustomers?: boolean;
  requireOrgForCustomers?: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Handle support staff access
      if (req.isSupportStaff) {
        if (!options.allowSupportStaff) {
          console.log(`[ACCESS_CONTROL] Blocked support staff ${userId} from mixed endpoint ${req.path}`);
          return res.status(403).json({
            error: "Access denied",
            message: "Support staff are not allowed to access this endpoint",
            endpoint: req.path,
            userType: "support_staff"
          });
        }
        
        console.log(`[ACCESS_CONTROL] Support staff ${userId} granted access to mixed endpoint ${req.path}`);
        return next();
      }

      // Handle customer access
      if (!options.allowCustomers) {
        console.log(`[ACCESS_CONTROL] Blocked customer ${userId} from mixed endpoint ${req.path}`);
        return res.status(403).json({
          error: "Access denied", 
          message: "Customer users are not allowed to access this endpoint",
          endpoint: req.path,
          userType: "customer"
        });
      }

      // Check org requirement for customers
      if (options.requireOrgForCustomers && !req.orgId) {
        return res.status(400).json({
          error: "Organization context required",
          message: "Customer users must have organization context for this endpoint"
        });
      }

      console.log(`[ACCESS_CONTROL] Customer ${userId} granted access to mixed endpoint ${req.path}`);
      next();
    } catch (error) {
      console.error("[ACCESS_CONTROL] Error in mixedAccessControl:", error);
      res.status(500).json({ error: "Mixed access control check failed" });
    }
  };
}