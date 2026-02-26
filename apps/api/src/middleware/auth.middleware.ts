/**
 * Authentication Middleware
 * Secure cookie-based authentication with httpOnly cookies
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/database';
import { Errors } from '../utils/api-response';
import { UserResponse, OrganizationMember, Role } from '../types';
import { 
  extractAccessToken, 
  verifyAccessToken, 
  verifyCsrfToken,
  generateAccessToken,
  extractRefreshToken,

  setAuthCookies,
  hashToken
} from '../services/token.service';

/**
 * Authenticate JWT token from httpOnly cookie
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from cookie (not localStorage)
    const token = extractAccessToken(req);
    
    if (!token) {
      throw Errors.unauthorized('No authentication token provided');
    }
    
    // Verify token
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      throw Errors.unauthorized('Invalid or expired token');
    }
    
    // Load user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.sub)
      .single();
    
    if (userError || !user) {
      throw Errors.unauthorized('User not found');
    }
    
    if (user.is_active === false) {
      throw new (Errors as any).forbidden('Account has been deactivated');
    }
    
    // Set user on request
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatar: user.avatar,
      isSuperAdmin: user.is_super_admin,
      emailVerified: user.email_verified,
      timezone: user.timezone,
      language: user.language,
      createdAt: user.created_at
    } as UserResponse;
    
    // Load organization membership if present
    if (decoded.organizationId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', decoded.organizationId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      
      if (membership) {
        req.member = {
          id: membership.id,
          organizationId: membership.organization_id,
          userId: membership.user_id,
          role: membership.role as Role,
          department: membership.department,
          title: membership.title,
          isActive: membership.is_active,
          joinedAt: membership.joined_at,
          lastActiveAt: membership.last_active_at,
          termStartDate: membership.term_start_date,
          termEndDate: membership.term_end_date,
          termLengthYears: membership.term_length_years,
          createdAt: membership.created_at,
          updatedAt: membership.updated_at
        } as OrganizationMember;
      } else if (!user.is_super_admin) {
        throw new (Errors as any).forbidden('Not a member of this organization');
      }
      
      // Load organization
      const { data: organization } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', decoded.organizationId)
        .single();
      
      if (organization) {
        req.organization = organization as any;
      }
    }
    
    // Update last active (async) - fire and forget
    if (req.member) {
      void supabase
        .from('organization_members')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', req.member.id);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token using refresh token cookie
 */
export const refreshAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const refreshToken = extractRefreshToken(req);
    
    if (!refreshToken) {
      throw Errors.unauthorized('No refresh token provided');
    }
    
    const tokenHash = hashToken(refreshToken);
    
    // Find refresh token in database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('refresh_token_hash', tokenHash)
      .single();
    
    if (error || !user) {
      throw Errors.unauthorized('Invalid refresh token');
    }
    
    // Check if refresh token is expired
    if (user.refresh_token_expires_at && new Date(user.refresh_token_expires_at) < new Date()) {
      throw Errors.unauthorized('Refresh token has expired');
    }
    
    // Generate new token pair
    const newAccessToken = generateAccessToken({
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.is_super_admin,
      organizationId: req.body?.organizationId || undefined
    });
    
    // Generate new refresh token (token rotation)
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newRefreshHash = hashToken(newRefreshToken);
    const newRefreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // Update user's refresh token in database
    await supabase
      .from('users')
      .update({
        refresh_token_hash: newRefreshHash,
        refresh_token_expires_at: newRefreshExpires.toISOString()
      })
      .eq('id', user.id);
    
    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Require permission middleware factory
 */
export const requirePermission = (...permissions: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(Errors.unauthorized());
      return;
    }
    
    // Super admin bypass
    if (req.user.isSuperAdmin) {
      next();
      return;
    }
    
    if (!req.member) {
      next(new (Errors as any).forbidden('Organization membership required'));
      return;
    }
    
    // Import RBAC service dynamically to avoid circular dependency
    const { RBACService } = require('../services/rbac.service');
    
    const hasAllPermissions = permissions.every(p => 
      RBACService.hasPermission(req.member!.role, p)
    );
    
    if (!hasAllPermissions) {
      next(new (Errors as any).forbidden(`Required permissions: ${permissions.join(', ')}`));
      return;
    }
    
    next();
  };
};

/**
 * Require specific role middleware
 */
export const requireRole = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(Errors.unauthorized());
      return;
    }
    
    // Super admin bypass
    if (req.user.isSuperAdmin) {
      next();
      return;
    }
    
    if (!req.member) {
      next(new (Errors as any).forbidden('Organization membership required'));
      return;
    }
    
    if (!roles.includes(req.member.role)) {
      next(new (Errors as any).forbidden(`Required role: ${roles.join(' or ')}`));
      return;
    }
    
    next();
  };
};

/**
 * Optional authentication
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractAccessToken(req);
    
    if (!token) {
      next();
      return;
    }
    
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      next();
      return;
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.sub)
      .single();
    
    if (user && user.is_active !== false) {
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: user.avatar,
        isSuperAdmin: user.is_super_admin,
        emailVerified: user.email_verified,
        timezone: user.timezone,
        language: user.language,
        createdAt: user.created_at
      } as UserResponse;
      
      if (decoded.organizationId) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('*')
          .eq('organization_id', decoded.organizationId)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single();
        
        if (membership) {
          req.member = {
            id: membership.id,
            organizationId: membership.organization_id,
            userId: membership.user_id,
            role: membership.role as Role,
            department: membership.department,
            title: membership.title,
            isActive: membership.is_active,
            joinedAt: membership.joined_at,
            lastActiveAt: membership.last_active_at,
            termStartDate: membership.term_start_date,
            termEndDate: membership.term_end_date,
            termLengthYears: membership.term_length_years,
            createdAt: membership.created_at,
            updatedAt: membership.updated_at
          } as OrganizationMember;
        }
      }
    }
    
    next();
  } catch {
    next();
  }
};

/**
 * CSRF protection middleware for state-changing operations
 */
export const requireCsrf = (req: Request, _res: Response, next: NextFunction): void => {
  // Skip CSRF check for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  
  // Skip if no authentication (public endpoints)
  const token = extractAccessToken(req);
  if (!token) {
    next();
    return;
  }
  
  // Verify CSRF token
  if (!verifyCsrfToken(req)) {
    next(new (Errors as any).forbidden('Invalid or missing CSRF token'));
    return;
  }
  
  next();
};

export default {
  authenticate,
  refreshAccessToken,
  requirePermission,
  requireRole,
  optionalAuth,
  requireCsrf
};
