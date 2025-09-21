import { Request, Response, NextFunction } from 'express'
import { db } from '../db/client'
import { users } from '../../shared/schema'
import { eq } from 'drizzle-orm'

declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean;
      adminUser?: {
        id: string;
        email: string;
        name?: string;
      };
    }
  }
}

/**
 * ADMIN AUTHENTICATION MIDDLEWARE
 * 
 * Provides God Mode access to Keith Richmond for business operations.
 * This middleware checks if the authenticated user is the business owner
 * and grants administrative privileges.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    // Must be authenticated first
    if (!req.user?.id) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to access admin features'
      });
    }

    const userId = req.user.id;
    
    // Fetch user from database to verify admin status
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      return res.status(401).json({ 
        error: 'User not found',
        message: 'Invalid user credentials'
      });
    }

    // Check if user is the business owner (Keith Richmond)
    const isBusinessOwner = user.email === 'keith.richmond@live.com';
    
    if (!isBusinessOwner) {
      console.log(`[ADMIN] Access denied for user ${user.email} - not business owner`);
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Administrative privileges required'
      });
    }

    // Grant admin access
    req.isAdmin = true;
    req.adminUser = {
      id: user.id,
      email: user.email,
      name: user.name || undefined
    };

    console.log(`[ADMIN] God Mode access granted to ${user.email}`);
    next();

  } catch (error) {
    console.error('[ADMIN] Error in admin authentication:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Authentication check failed'
    });
  }
}

/**
 * OPTIONAL ADMIN CHECK MIDDLEWARE
 * 
 * Checks if user has admin privileges without blocking access.
 * Sets req.isAdmin flag for conditional admin features.
 */
export async function checkAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    // Default to non-admin
    req.isAdmin = false;

    if (!req.user?.id) {
      return next();
    }

    const userId = req.user.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (user && user.email === 'keith.richmond@live.com') {
      req.isAdmin = true;
      req.adminUser = {
        id: user.id,
        email: user.email,
        name: user.name || undefined
      };
      console.log(`[ADMIN] Admin privileges detected for ${user.email}`);
    }

    next();

  } catch (error) {
    console.error('[ADMIN] Error in admin check:', error);
    // Don't block request on admin check failure
    req.isAdmin = false;
    next();
  }
}