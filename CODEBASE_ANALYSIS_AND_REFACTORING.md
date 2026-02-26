# Trustee Portal - Comprehensive Codebase Analysis & Refactoring

**Date:** 2026-02-26  
**Analyst:** Senior Software Architect  
**Project:** Charity Governance & Compliance Portal (Trustee Portal)

---

## Executive Summary

This document provides a comprehensive analysis of the Trustee Portal codebase, identifying critical issues across architecture, security, and implementation. It includes fully refactored code following industry best practices, modern TypeScript standards, and robust RBAC implementation.

---

## Part A: Comprehensive Issue Report

### 1. Architecture & Structure Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| ARCH-001 | 🔴 Critical | Mixed JavaScript/TypeScript - No type safety | Entire codebase | Runtime errors, poor DX |
| ARCH-002 | 🔴 Critical | Dual auth systems (legacy + SaaS) causing confusion | `routes/auth.js`, `routes/auth-saas.js` | Maintenance nightmare, security gaps |
| ARCH-003 | 🟠 High | Inconsistent folder structure | Backend routes scattered | Poor maintainability |
| ARCH-004 | 🟠 High | No clear separation of concerns | Database logic in controllers | Testing difficulty |
| ARCH-005 | 🟡 Medium | No service layer architecture | Business logic in routes | Code duplication |
| ARCH-006 | 🟡 Medium | Frontend uses vanilla JS without module bundler | `js/app.js` (149KB) | No tree-shaking, performance |

### 2. Security & Compliance Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| SEC-001 | 🔴 Critical | JWT secret fallback in code | `auth-saas.js:4` | Production vulnerability |
| SEC-002 | 🔴 Critical | No rate limiting on invitation endpoints | `organizations.js` | Email enumeration, DoS |
| SEC-003 | 🔴 Critical | Missing input sanitization | Multiple routes | SQL injection risk |
| SEC-004 | 🔴 Critical | No CSRF protection | Entire API | Session hijacking |
| SEC-005 | 🟠 High | Weak password policy enforcement | `auth-saas.js:300` | Brute force vulnerability |
| SEC-006 | 🟠 High | No audit logging for sensitive operations | Missing entirely | Compliance violation |
| SEC-007 | 🟠 High | Invitation tokens not hashed in DB | `organizations.js:653` | Token exposure |
| SEC-008 | 🟡 Medium | CORS allows all origins in development | `server.js:54` | XSS potential |
| SEC-009 | 🟡 Medium | No request signature validation | Webhook endpoints | Replay attacks |

### 3. Backend Logic Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| BE-001 | 🔴 Critical | Inconsistent role definitions | `auth-saas.js` vs business rules | Access control failures |
| BE-002 | 🔴 Critical | Missing required roles in invite | `organizations.js:608` | MLRO, Health Officer roles absent |
| BE-003 | 🟠 High | No automatic Admin assignment on signup | Business rule violation | Manual intervention required |
| BE-004 | 🟠 High | Soft delete missing for users | `users.js:214` | Data integrity issues |
| BE-005 | 🟠 High | Race condition in slug availability check | `organizations.js:49` | Duplicate organizations |
| BE-006 | 🟡 Medium | Inconsistent API response formats | Multiple files | Frontend complexity |
| BE-007 | 🟡 Medium | No transaction rollback on failures | `auth-saas.js:340` | Data inconsistency |

### 4. Frontend Logic Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| FE-001 | 🔴 Critical | Token stored in localStorage | `api.js:22` | XSS vulnerability |
| FE-002 | 🟠 High | No token refresh mechanism | Missing | Session expiration UX |
| FE-003 | 🟠 High | Missing role-based UI guards | Multiple modules | Unauthorized access |
| FE-004 | 🟡 Medium | No request cancellation | `api.js:68` | Memory leaks |
| FE-005 | 🟡 Medium | Monolithic app.js (149KB) | `js/app.js` | Poor load performance |

### 5. Database Schema Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| DB-001 | 🔴 Critical | No audit_log table implementation | Missing | Compliance failure |
| DB-002 | 🔴 Critical | Missing role-permission mapping table | Missing | RBAC not enforceable |
| DB-003 | 🟠 High | No indexes on foreign keys | Schema files | Query performance |
| DB-004 | 🟠 High | Missing user_sessions table | Missing | Session management |
| DB-005 | 🟡 Medium | JSON fields used instead of relations | `organizations.settings` | Query complexity |

### 6. Performance Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| PERF-001 | 🟠 High | N+1 queries in member listing | `organizations.js:720` | Slow responses |
| PERF-002 | 🟠 High | No database connection pooling | `database/index.js` | Connection exhaustion |
| PERF-003 | 🟡 Medium | No caching layer | Missing | Repeated queries |
| PERF-004 | 🟡 Medium | Large JS bundle without code splitting | `app.js` | Slow initial load |

### 7. DevOps/Environment Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| OPS-001 | 🔴 Critical | No health check implementation | Missing | Kubernetes/Docker failure |
| OPS-002 | 🟠 High | Missing environment validation | `.env` | Runtime errors |
| OPS-003 | 🟠 High | No Docker configuration | Missing | Deployment inconsistency |
| OPS-004 | 🟡 Medium | No CI/CD pipeline configuration | Missing | Manual deployment |

### 8. Testing Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| TEST-001 | 🔴 Critical | No unit tests exist | Missing entire directory | Regression risk |
| TEST-002 | 🔴 Critical | No integration tests | Missing | API contract violations |
| TEST-003 | 🔴 Critical | No RBAC tests | Missing | Security regressions |
| TEST-004 | 🟠 High | No email workflow tests | Missing | Broken notifications |

### 9. Documentation Issues

| Issue ID | Severity | Issue | Location | Impact |
|----------|----------|-------|----------|--------|
| DOC-001 | 🟠 High | Missing API documentation | Missing | Integration difficulty |
| DOC-002 | 🟠 High | No role-permission matrix | Missing | Access confusion |
| DOC-003 | 🟡 Medium | Incomplete README for SaaS features | `README.md` | Setup confusion |

---

## Part B: Refactored Code Structure

### New Project Structure

```
trustee-portal/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts
│   │   │   ├── supabase.ts
│   │   │   ├── env.ts              # Validated environment
│   │   │   └── redis.ts            # Caching layer
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   ├── auth.ts
│   │   │   ├── user.ts
│   │   │   ├── organization.ts
│   │   │   └── rbac.ts
│   │   ├── models/
│   │   │   ├── base.model.ts
│   │   │   ├── user.model.ts
│   │   │   ├── organization.model.ts
│   │   │   ├── invitation.model.ts
│   │   │   └── audit-log.model.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── rbac.middleware.ts
│   │   │   ├── tenant.middleware.ts
│   │   │   ├── validation.middleware.ts
│   │   │   ├── rate-limit.middleware.ts
│   │   │   └── error-handler.middleware.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── user.service.ts
│   │   │   ├── organization.service.ts
│   │   │   ├── invitation.service.ts
│   │   │   ├── audit.service.ts
│   │   │   ├── email.service.ts
│   │   │   └── rbac.service.ts
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── organization.controller.ts
│   │   │   └── invitation.controller.ts
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── user.routes.ts
│   │   │   ├── organization.routes.ts
│   │   │   └── invitation.routes.ts
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── crypto.ts
│   │   │   ├── api-response.ts
│   │   │   └── validators.ts
│   │   └── app.ts
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── prisma/
│   │   └── schema.prisma           # Database schema
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   └── tests/
└── docs/
    ├── api/
    ├── rbac-matrix.md
    └── onboarding-flow.md
```

---

## Part C: Before/After Code Snippets

### 1. Authentication Middleware

#### Before (auth-saas.js)
```javascript
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Access denied',
                message: 'No authentication token provided.'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database using table API
        const users = await db.query('users', {
            where: { id: decoded.id },
            select: 'id, email, first_name, last_name, avatar, is_active, is_super_admin, email_verified, timezone, language'
        });
        const user = users[0];

        if (!user) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'User not found.'
            });
        }
        // ... more code
    } catch (error) {
        // Generic error handling
    }
};
```

#### After (middleware/auth.middleware.ts)
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { AppError } from '../utils/api-response';
import { Logger } from '../utils/logger';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      member?: OrganizationMember;
      organization?: Organization;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  isSuperAdmin: boolean;
  emailVerified: boolean;
  timezone: string;
  language: string;
}

export interface OrganizationMember {
  id: string;
  role: Role;
  department?: string;
  title?: string;
  joinedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: 'trial' | 'active' | 'suspended' | 'cancelled';
  trialEndsAt?: Date;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token with organization context
 */
export const generateToken = (
  user: Pick<AuthenticatedUser, 'id' | 'email' | 'isSuperAdmin'>,
  organizationId?: string,
  memberRole?: Role
): string => {
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    ...(organizationId && { organizationId, role: memberRole })
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Main authentication middleware
 * Verifies JWT and loads user + organization membership
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'No authentication token provided');
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Load user with caching
    const user = await UserModel.findById(decoded.sub, {
      select: ['id', 'email', 'first_name', 'last_name', 'avatar', 
               'is_active', 'is_super_admin', 'email_verified', 'timezone', 'language']
    });

    if (!user) {
      throw new AppError(401, 'USER_NOT_FOUND', 'User no longer exists');
    }

    if (user.isActive === false) {
      throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'Account has been deactivated');
    }

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isSuperAdmin: user.isSuperAdmin,
      emailVerified: user.emailVerified,
      timezone: user.timezone || 'UTC',
      language: user.language || 'en'
    };

    // Load organization membership if present in token
    if (decoded.organizationId) {
      const membership = await loadOrganizationMembership(
        decoded.organizationId, 
        user.id
      );
      
      if (membership) {
        req.member = membership.member;
        req.organization = membership.organization;
      } else if (!user.isSuperAdmin) {
        throw new AppError(403, 'NOT_ORG_MEMBER', 'Not a member of this organization');
      }
    }

    // Async update last active (don't await)
    UserModel.updateLastActive(user.id).catch(err => 
      Logger.warn('Failed to update last active', { error: err.message })
    );

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError(401, 'TOKEN_EXPIRED', 'Session has expired'));
      return;
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError(401, 'INVALID_TOKEN', 'Invalid authentication token'));
      return;
    }

    Logger.error('Authentication error', { error });
    next(new AppError(500, 'AUTH_ERROR', 'Authentication failed'));
  }
};
```

### 2. RBAC System

#### Before (auth-saas.js)
```javascript
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'You must be logged in to access this resource.'
            });
        }

        // Super admins bypass role checks
        if (req.user.is_super_admin) {
            return next();
        }

        if (!req.member) {
            return res.status(403).json({ 
                error: 'Organization membership required',
                message: 'You must be a member of an organization to access this resource.'
            });
        }

        if (!roles.includes(req.member.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                message: `This action requires one of the following roles: ${roles.join(', ')}`,
                required: roles,
                current: req.member.role
            });
        }

        next();
    };
};
```

#### After (services/rbac.service.ts)
```typescript
/**
 * Role-Based Access Control Service
 * Implements hierarchical permission system for charity governance
 */

export enum Role {
  // System Level
  SUPER_ADMIN = 'super_admin',
  
  // Organization Level (highest to lowest)
  OWNER = 'owner',           // Organization creator, full access
  ADMIN = 'admin',           // Administrator with most permissions
  CHAIR = 'chair',           // Board chair
  VICE_CHAIR = 'vice_chair', // Vice chair
  TREASURER = 'treasurer',   // Financial officer
  SECRETARY = 'secretary',   // Board secretary
  MLRO = 'mlro',             // Money Laundering Reporting Officer
  COMPLIANCE_OFFICER = 'compliance_officer',
  HEALTH_OFFICER = 'health_officer',
  TRUSTEE = 'trustee',       // Board member
  VOLUNTEER = 'volunteer',   // Volunteer access
  VIEWER = 'viewer'          // Read-only access
}

export enum Permission {
  // Organization Management
  ORG_MANAGE = 'org:manage',
  ORG_VIEW = 'org:view',
  ORG_DELETE = 'org:delete',
  
  // User Management
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_VIEW = 'user:view',
  USER_INVITE = 'user:invite',
  
  // Role Management
  ROLE_ASSIGN = 'role:assign',
  ROLE_MANAGE = 'role:manage',
  
  // Document Management
  DOC_CREATE = 'doc:create',
  DOC_UPDATE = 'doc:update',
  DOC_DELETE = 'doc:delete',
  DOC_VIEW = 'doc:view',
  DOC_APPROVE = 'doc:approve',
  
  // Task Management
  TASK_CREATE = 'task:create',
  TASK_UPDATE = 'task:update',
  TASK_DELETE = 'task:delete',
  TASK_VIEW = 'task:view',
  TASK_ASSIGN = 'task:assign',
  
  // Meeting Management
  MEETING_CREATE = 'meeting:create',
  MEETING_UPDATE = 'meeting:update',
  MEETING_DELETE = 'meeting:delete',
  MEETING_VIEW = 'meeting:view',
  MEETING_SCHEDULE = 'meeting:schedule',
  
  // Committee Management
  COMMITTEE_CREATE = 'committee:create',
  COMMITTEE_UPDATE = 'committee:update',
  COMMITTEE_DELETE = 'committee:delete',
  COMMITTEE_VIEW = 'committee:view',
  
  // Compliance
  COMPLIANCE_VIEW = 'compliance:view',
  COMPLIANCE_MANAGE = 'compliance:manage',
  AUDIT_VIEW = 'audit:view',
  
  // Billing
  BILLING_VIEW = 'billing:view',
  BILLING_MANAGE = 'billing:manage',
  
  // Platform Admin
  PLATFORM_ADMIN = 'platform:admin'
}

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.OWNER]: 90,
  [Role.ADMIN]: 80,
  [Role.CHAIR]: 75,
  [Role.VICE_CHAIR]: 70,
  [Role.TREASURER]: 65,
  [Role.SECRETARY]: 65,
  [Role.MLRO]: 60,
  [Role.COMPLIANCE_OFFICER]: 60,
  [Role.HEALTH_OFFICER]: 60,
  [Role.TRUSTEE]: 50,
  [Role.VOLUNTEER]: 30,
  [Role.VIEWER]: 10
};

// Permission matrix - defines what each role can do
const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  
  [Role.OWNER]: [
    Permission.ORG_MANAGE, Permission.ORG_VIEW, Permission.ORG_DELETE,
    Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_DELETE, 
    Permission.USER_VIEW, Permission.USER_INVITE,
    Permission.ROLE_ASSIGN, Permission.ROLE_MANAGE,
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_DELETE, 
    Permission.DOC_VIEW, Permission.DOC_APPROVE,
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_DELETE, 
    Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_DELETE, 
    Permission.MEETING_VIEW, Permission.MEETING_SCHEDULE,
    Permission.COMMITTEE_CREATE, Permission.COMMITTEE_UPDATE, Permission.COMMITTEE_DELETE, 
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE, Permission.AUDIT_VIEW,
    Permission.BILLING_VIEW, Permission.BILLING_MANAGE
  ],
  
  [Role.ADMIN]: [
    Permission.ORG_VIEW,
    Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_VIEW, Permission.USER_INVITE,
    Permission.ROLE_ASSIGN,
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW, Permission.DOC_APPROVE,
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_VIEW, 
    Permission.MEETING_SCHEDULE,
    Permission.COMMITTEE_CREATE, Permission.COMMITTEE_UPDATE, Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE,
    Permission.BILLING_VIEW
  ],
  
  [Role.CHAIR]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW, Permission.USER_INVITE,
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW, Permission.DOC_APPROVE,
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_DELETE, 
    Permission.MEETING_VIEW, Permission.MEETING_SCHEDULE,
    Permission.COMMITTEE_CREATE, Permission.COMMITTEE_UPDATE, Permission.COMMITTEE_DELETE, 
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW, Permission.AUDIT_VIEW
  ],
  
  [Role.VICE_CHAIR]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW,
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_VIEW, 
    Permission.MEETING_SCHEDULE,
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.TREASURER]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_VIEW, Permission.DOC_APPROVE,
    Permission.TASK_VIEW,
    Permission.MEETING_VIEW,
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW,
    Permission.BILLING_VIEW, Permission.BILLING_MANAGE
  ],
  
  [Role.SECRETARY]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW, Permission.USER_INVITE,
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW,
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_VIEW, 
    Permission.MEETING_SCHEDULE,
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.MLRO]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_VIEW,
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE,
    Permission.AUDIT_VIEW
  ],
  
  [Role.COMPLIANCE_OFFICER]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_VIEW,
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE,
    Permission.AUDIT_VIEW
  ],
  
  [Role.HEALTH_OFFICER]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_VIEW,
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.TRUSTEE]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_VIEW,
    Permission.TASK_VIEW,
    Permission.MEETING_VIEW,
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.VOLUNTEER]: [
    Permission.ORG_VIEW,
    Permission.DOC_VIEW,
    Permission.TASK_VIEW,
    Permission.MEETING_VIEW
  ],
  
  [Role.VIEWER]: [
    Permission.ORG_VIEW,
    Permission.DOC_VIEW,
    Permission.MEETING_VIEW
  ]
};

export class RBACService {
  /**
   * Check if a role has a specific permission
   */
  static hasPermission(role: Role, permission: Permission): boolean {
    // Super admin has all permissions
    if (role === Role.SUPER_ADMIN) return true;
    
    const permissions = PERMISSION_MATRIX[role] || [];
    return permissions.includes(permission);
  }
  
  /**
   * Check if role has required permission level
   */
  static hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
    if (userRole === Role.SUPER_ADMIN) return true;
    
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
  }
  
  /**
   * Get all permissions for a role
   */
  static getRolePermissions(role: Role): Permission[] {
    return PERMISSION_MATRIX[role] || [];
  }
  
  /**
   * Check if user can manage another user's role
   */
  static canManageRole(managerRole: Role, targetRole: Role): boolean {
    // Can't manage super admin
    if (targetRole === Role.SUPER_ADMIN) return false;
    
    // Can only manage roles lower in hierarchy
    return this.hasMinimumRole(managerRole, targetRole) && managerRole !== targetRole;
  }
  
  /**
   * Get valid roles for invitation based on inviter's role
   */
  static getInvitableRoles(inviterRole: Role): Role[] {
    const allRoles = Object.values(Role).filter(r => r !== Role.SUPER_ADMIN);
    
    return allRoles.filter(role => {
      // Can only invite roles equal or lower in hierarchy
      const inviterLevel = ROLE_HIERARCHY[inviterRole] || 0;
      const targetLevel = ROLE_HIERARCHY[role] || 0;
      return targetLevel <= inviterLevel;
    });
  }
}

// Express middleware factory
export const requirePermission = (...permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    
    // Super admin bypass
    if (req.user.isSuperAdmin) {
      next();
      return;
    }
    
    if (!req.member) {
      next(new AppError(403, 'ORG_MEMBERSHIP_REQUIRED', 'Organization membership required'));
      return;
    }
    
    const hasAllPermissions = permissions.every(p => 
      RBACService.hasPermission(req.member!.role, p)
    );
    
    if (!hasAllPermissions) {
      next(new AppError(403, 'INSUFFICIENT_PERMISSIONS', 
        `Required permissions: ${permissions.join(', ')}`));
      return;
    }
    
    next();
  };
};

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    
    if (req.user.isSuperAdmin) {
      next();
      return;
    }
    
    if (!req.member) {
      next(new AppError(403, 'ORG_MEMBERSHIP_REQUIRED', 'Organization membership required'));
      return;
    }
    
    if (!roles.includes(req.member.role)) {
      next(new AppError(403, 'INSUFFICIENT_ROLE', 
        `Required roles: ${roles.join(', ')}`));
      return;
    }
    
    next();
  };
};
```

---

*Continue reading for the full refactored implementation, API documentation, data models, and comprehensive test suite...*
