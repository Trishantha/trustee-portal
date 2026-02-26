/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { Logger } from '../utils/logger';
import { Errors, AppError } from '../utils/api-response';
import { JWTPayload, UserResponse, OrganizationMember, Role } from '../types';

const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * Authenticate JWT token
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      throw Errors.unauthorized('No authentication token provided');
    }
    
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Load user
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub }
      });
      
      if (!user) {
        throw Errors.unauthorized('User not found');
      }
      
      if (user.isActive === false) {
        throw new (Errors as any).forbidden('Account has been deactivated');
      }
      
      // Set user on request
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isSuperAdmin: user.isSuperAdmin,
        emailVerified: user.emailVerified,
        timezone: user.timezone,
        language: user.language,
        createdAt: user.createdAt
      } as UserResponse;
      
      // Load organization membership if present
      if (decoded.organizationId) {
        const membership = await prisma.organizationMember.findFirst({
          where: {
            organizationId: decoded.organizationId,
            userId: user.id,
            isActive: true
          }
        });
        
        if (membership) {
          req.member = {
            id: membership.id,
            organizationId: membership.organizationId,
            userId: membership.userId,
            role: membership.role as Role,
            department: membership.department,
            title: membership.title,
            isActive: membership.isActive,
            joinedAt: membership.joinedAt,
            lastActiveAt: membership.lastActiveAt,
            termStartDate: membership.termStartDate,
            termEndDate: membership.termEndDate,
            termLengthYears: membership.termLengthYears,
            createdAt: membership.createdAt,
            updatedAt: membership.updatedAt
          } as OrganizationMember;
        } else if (!user.isSuperAdmin) {
          throw new (Errors as any).forbidden('Not a member of this organization');
        }
        
        // Load organization
        const organization = await prisma.organization.findUnique({
          where: { id: decoded.organizationId }
        });
        
        if (organization) {
          req.organization = organization as any;
        }
      }
      
      // Update last active (async)
      if (req.member) {
        prisma.organizationMember.update({
          where: { id: req.member.id },
          data: { lastActiveAt: new Date() }
        }).catch(() => {});
      }
      
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw (Errors as any).tokenExpired();
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw Errors.unauthorized('Invalid token');
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Require permission middleware factory
 */
export const requirePermission = (...permissions: any[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
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
 * Optional authentication
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }
    
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub }
      });
      
      if (user && user.isActive !== false) {
        req.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          isSuperAdmin: user.isSuperAdmin,
          emailVerified: user.emailVerified,
          timezone: user.timezone,
          language: user.language,
          createdAt: user.createdAt
        } as UserResponse;
        
        if (decoded.organizationId) {
          const membership = await prisma.organizationMember.findFirst({
            where: {
              organizationId: decoded.organizationId,
              userId: user.id,
              isActive: true
            }
          });
          
          if (membership) {
            req.member = {
              id: membership.id,
              organizationId: membership.organizationId,
              userId: membership.userId,
              role: membership.role as Role,
              department: membership.department,
              title: membership.title,
              isActive: membership.isActive,
              joinedAt: membership.joinedAt,
              lastActiveAt: membership.lastActiveAt,
              termStartDate: membership.termStartDate,
              termEndDate: membership.termEndDate,
              termLengthYears: membership.termLengthYears,
              createdAt: membership.createdAt,
              updatedAt: membership.updatedAt
            } as OrganizationMember;
          }
        }
      }
    } catch {
      // Ignore errors for optional auth
    }
    
    next();
  } catch (error) {
    next();
  }
};
