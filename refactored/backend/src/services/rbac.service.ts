/**
 * Role-Based Access Control Service
 * Trustee Portal - Core RBAC Implementation
 * 
 * Supports charity governance roles:
 * - Admin, Trustee, Chair, Treasurer, Vice Chair, Secretary
 * - Volunteer, MLRO, Health Officer, Compliance Officer
 */

import { Role, Permission } from '../types';
import { AppError } from '../utils/api-response';
import { Request, Response, NextFunction } from 'express';

// Role hierarchy levels (higher = more permissions)
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

/**
 * Permission Matrix
 * Defines what each role can do in the system
 * Aligned with charity governance best practices
 */
const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  
  [Role.OWNER]: [
    // Full organization control
    Permission.ORG_MANAGE, Permission.ORG_VIEW, Permission.ORG_DELETE,
    // User management
    Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_DELETE, 
    Permission.USER_VIEW, Permission.USER_INVITE,
    // Role management
    Permission.ROLE_ASSIGN, Permission.ROLE_MANAGE,
    // Document management
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_DELETE, 
    Permission.DOC_VIEW, Permission.DOC_APPROVE,
    // Task management
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_DELETE, 
    Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    // Meeting management
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_DELETE, 
    Permission.MEETING_VIEW, Permission.MEETING_SCHEDULE,
    // Committee management
    Permission.COMMITTEE_CREATE, Permission.COMMITTEE_UPDATE, Permission.COMMITTEE_DELETE, 
    Permission.COMMITTEE_VIEW,
    // Compliance
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE, Permission.AUDIT_VIEW,
    // Billing
    Permission.BILLING_VIEW, Permission.BILLING_MANAGE
  ],
  
  [Role.ADMIN]: [
    // Organization
    Permission.ORG_VIEW,
    // User management (cannot delete owners)
    Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_VIEW, Permission.USER_INVITE,
    // Role assignment
    Permission.ROLE_ASSIGN,
    // Documents
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW, Permission.DOC_APPROVE,
    // Tasks
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    // Meetings
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_VIEW, 
    Permission.MEETING_SCHEDULE,
    // Committees
    Permission.COMMITTEE_CREATE, Permission.COMMITTEE_UPDATE, Permission.COMMITTEE_VIEW,
    // Compliance
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE,
    // Billing view only
    Permission.BILLING_VIEW
  ],
  
  [Role.CHAIR]: [
    // Organization view
    Permission.ORG_VIEW,
    // User view and invite
    Permission.USER_VIEW, Permission.USER_INVITE,
    // Documents (with approval authority)
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW, Permission.DOC_APPROVE,
    // Tasks
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    // Meetings (full control for board meetings)
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_DELETE, 
    Permission.MEETING_VIEW, Permission.MEETING_SCHEDULE,
    // Committees
    Permission.COMMITTEE_CREATE, Permission.COMMITTEE_UPDATE, Permission.COMMITTEE_DELETE, 
    Permission.COMMITTEE_VIEW,
    // Compliance
    Permission.COMPLIANCE_VIEW, Permission.AUDIT_VIEW
  ],
  
  [Role.VICE_CHAIR]: [
    // Organization view
    Permission.ORG_VIEW,
    // User view
    Permission.USER_VIEW,
    // Documents
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW,
    // Tasks
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    // Meetings
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_VIEW, 
    Permission.MEETING_SCHEDULE,
    // Committees
    Permission.COMMITTEE_VIEW,
    // Compliance
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.TREASURER]: [
    // Organization view
    Permission.ORG_VIEW,
    // User view
    Permission.USER_VIEW,
    // Documents (financial approval)
    Permission.DOC_VIEW, Permission.DOC_APPROVE,
    // Tasks
    Permission.TASK_VIEW,
    // Meetings
    Permission.MEETING_VIEW,
    // Committees
    Permission.COMMITTEE_VIEW,
    // Compliance
    Permission.COMPLIANCE_VIEW,
    // Billing (full management for treasurer)
    Permission.BILLING_VIEW, Permission.BILLING_MANAGE
  ],
  
  [Role.SECRETARY]: [
    // Organization view
    Permission.ORG_VIEW,
    // User view and invite
    Permission.USER_VIEW, Permission.USER_INVITE,
    // Documents (minutes, records)
    Permission.DOC_CREATE, Permission.DOC_UPDATE, Permission.DOC_VIEW,
    // Tasks
    Permission.TASK_CREATE, Permission.TASK_UPDATE, Permission.TASK_VIEW, Permission.TASK_ASSIGN,
    // Meetings (scheduling and management)
    Permission.MEETING_CREATE, Permission.MEETING_UPDATE, Permission.MEETING_VIEW, 
    Permission.MEETING_SCHEDULE,
    // Committees
    Permission.COMMITTEE_VIEW,
    // Compliance
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.MLRO]: [
    // Money Laundering Reporting Officer
    // Organization view
    Permission.ORG_VIEW,
    // User view
    Permission.USER_VIEW,
    // Documents (suspicious activity reports)
    Permission.DOC_VIEW,
    // Compliance (full access for MLRO duties)
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE,
    // Audit
    Permission.AUDIT_VIEW
  ],
  
  [Role.COMPLIANCE_OFFICER]: [
    // Organization view
    Permission.ORG_VIEW,
    // User view
    Permission.USER_VIEW,
    // Documents
    Permission.DOC_VIEW,
    // Compliance (full access)
    Permission.COMPLIANCE_VIEW, Permission.COMPLIANCE_MANAGE,
    // Audit
    Permission.AUDIT_VIEW
  ],
  
  [Role.HEALTH_OFFICER]: [
    // Organization view
    Permission.ORG_VIEW,
    // User view
    Permission.USER_VIEW,
    // Documents (health and safety)
    Permission.DOC_VIEW,
    // Compliance (view for health regulations)
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.TRUSTEE]: [
    // Basic trustee access
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.DOC_VIEW,
    Permission.TASK_VIEW,
    Permission.MEETING_VIEW,
    Permission.COMMITTEE_VIEW,
    Permission.COMPLIANCE_VIEW
  ],
  
  [Role.VOLUNTEER]: [
    // Limited access for volunteers
    Permission.ORG_VIEW,
    Permission.DOC_VIEW,
    Permission.TASK_VIEW,
    Permission.MEETING_VIEW
  ],
  
  [Role.VIEWER]: [
    // Read-only access
    Permission.ORG_VIEW,
    Permission.DOC_VIEW,
    Permission.MEETING_VIEW
  ]
};

/**
 * Role display names for UI
 */
export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Super Administrator',
  [Role.OWNER]: 'Organization Owner',
  [Role.ADMIN]: 'Administrator',
  [Role.CHAIR]: 'Chair',
  [Role.VICE_CHAIR]: 'Vice Chair',
  [Role.TREASURER]: 'Treasurer',
  [Role.SECRETARY]: 'Secretary',
  [Role.MLRO]: 'MLRO',
  [Role.COMPLIANCE_OFFICER]: 'Compliance Officer',
  [Role.HEALTH_OFFICER]: 'Health Officer',
  [Role.TRUSTEE]: 'Trustee',
  [Role.VOLUNTEER]: 'Volunteer',
  [Role.VIEWER]: 'Viewer'
};

/**
 * Role descriptions for UI tooltips
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Platform administrator with access to all organizations',
  [Role.OWNER]: 'Full control over the organization and its settings',
  [Role.ADMIN]: 'Manage users, documents, and most organization settings',
  [Role.CHAIR]: 'Lead the board, approve documents, manage meetings',
  [Role.VICE_CHAIR]: 'Assist the chair and stand in when needed',
  [Role.TREASURER]: 'Manage financial matters and billing',
  [Role.SECRETARY]: 'Manage meetings, minutes, and records',
  [Role.MLRO]: 'Money Laundering Reporting Officer - compliance duties',
  [Role.COMPLIANCE_OFFICER]: 'Ensure regulatory compliance',
  [Role.HEALTH_OFFICER]: 'Health and safety compliance',
  [Role.TRUSTEE]: 'Board member with standard access',
  [Role.VOLUNTEER]: 'Limited access for volunteers',
  [Role.VIEWER]: 'Read-only access to organization content'
};

export class RBACService {
  /**
   * Check if a role has a specific permission
   */
  static hasPermission(role: Role, permission: Permission): boolean {
    if (role === Role.SUPER_ADMIN) return true;
    const permissions = PERMISSION_MATRIX[role] || [];
    return permissions.includes(permission);
  }
  
  /**
   * Check if role has all specified permissions
   */
  static hasAllPermissions(role: Role, permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(role, p));
  }
  
  /**
   * Check if role has any of the specified permissions
   */
  static hasAnyPermission(role: Role, permissions: Permission[]): boolean {
    return permissions.some(p => this.hasPermission(role, p));
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
    return [...(PERMISSION_MATRIX[role] || [])];
  }
  
  /**
   * Check if user can manage another user's role
   * Users can only manage roles at or below their level
   */
  static canManageRole(managerRole: Role, targetRole: Role): boolean {
    if (targetRole === Role.SUPER_ADMIN) return false;
    if (managerRole === Role.SUPER_ADMIN) return true;
    
    const managerLevel = ROLE_HIERARCHY[managerRole] || 0;
    const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
    
    return managerLevel > targetLevel;
  }
  
  /**
   * Get valid roles for invitation based on inviter's role
   */
  static getInvitableRoles(inviterRole: Role): Role[] {
    const allRoles = Object.values(Role).filter(r => 
      r !== Role.SUPER_ADMIN && r !== Role.OWNER
    );
    
    return allRoles.filter(role => this.canManageRole(inviterRole, role));
  }
  
  /**
   * Get roles that can be assigned by a given role
   */
  static getAssignableRoles(assignerRole: Role): Role[] {
    if (assignerRole === Role.SUPER_ADMIN) {
      return Object.values(Role).filter(r => r !== Role.SUPER_ADMIN);
    }
    
    return this.getInvitableRoles(assignerRole);
  }
  
  /**
   * Validate role transition
   */
  static canTransitionRole(
    currentRole: Role, 
    newRole: Role, 
    changedBy: Role
  ): { valid: boolean; reason?: string } {
    // Can't change own role
    if (currentRole === newRole) {
      return { valid: false, reason: 'New role must be different from current role' };
    }
    
    // Can't modify super admin
    if (currentRole === Role.SUPER_ADMIN) {
      return { valid: false, reason: 'Cannot modify super administrator roles' };
    }
    
    // Can't assign super admin
    if (newRole === Role.SUPER_ADMIN) {
      return { valid: false, reason: 'Cannot assign super administrator role' };
    }
    
    // Check if changer has permission to assign the new role
    if (!this.canManageRole(changedBy, newRole)) {
      return { valid: false, reason: 'Insufficient permissions to assign this role' };
    }
    
    // Check if changer has permission to remove current role
    if (!this.canManageRole(changedBy, currentRole)) {
      return { valid: false, reason: 'Insufficient permissions to modify this role' };
    }
    
    return { valid: true };
  }
  
  /**
   * Get role hierarchy level
   */
  static getRoleLevel(role: Role): number {
    return ROLE_HIERARCHY[role] || 0;
  }
  
  /**
   * Compare two roles
   * Returns: -1 if role1 < role2, 0 if equal, 1 if role1 > role2
   */
  static compareRoles(role1: Role, role2: Role): number {
    const level1 = this.getRoleLevel(role1);
    const level2 = this.getRoleLevel(role2);
    
    if (level1 < level2) return -1;
    if (level1 > level2) return 1;
    return 0;
  }
}

// ==========================================
// Express Middleware Factory Functions
// ==========================================

/**
 * Middleware to require specific permissions
 */
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

/**
 * Middleware to require any of the specified permissions
 */
export const requireAnyPermission = (...permissions: Permission[]) => {
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
    
    const hasAny = permissions.some(p => 
      RBACService.hasPermission(req.member!.role, p)
    );
    
    if (!hasAny) {
      next(new AppError(403, 'INSUFFICIENT_PERMISSIONS', 
        `Requires one of: ${permissions.join(', ')}`));
      return;
    }
    
    next();
  };
};

/**
 * Middleware to require specific roles
 */
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
        `Required roles: ${roles.map(r => ROLE_DISPLAY_NAMES[r]).join(', ')}`));
      return;
    }
    
    next();
  };
};

/**
 * Middleware to require minimum role level
 */
export const requireMinimumRole = (minRole: Role) => {
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
    
    if (!RBACService.hasMinimumRole(req.member.role, minRole)) {
      next(new AppError(403, 'INSUFFICIENT_ROLE', 
        `Requires ${ROLE_DISPLAY_NAMES[minRole]} or higher`));
      return;
    }
    
    next();
  };
};

/**
 * Middleware to require organization ownership
 */
export const requireOwner = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }
  
  if (req.user.isSuperAdmin) {
    next();
    return;
  }
  
  if (!req.member || req.member.role !== Role.OWNER) {
    next(new AppError(403, 'OWNER_REQUIRED', 'Organization owner access required'));
    return;
  }
  
  next();
};

/**
 * Middleware to require super admin
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }
  
  if (!req.user.isSuperAdmin) {
    next(new AppError(403, 'SUPER_ADMIN_REQUIRED', 'Super administrator access required'));
    return;
  }
  
  next();
};

// ==========================================
// Common Role Combinations
// ==========================================

export const requireAdmin = requireRole(Role.OWNER, Role.ADMIN);
export const requireAdminOrChair = requireRole(Role.OWNER, Role.ADMIN, Role.CHAIR);
export const requireBoardMember = requireRole(
  Role.OWNER, Role.ADMIN, Role.CHAIR, Role.VICE_CHAIR, 
  Role.TREASURER, Role.SECRETARY, Role.TRUSTEE
);
export const requireCompliance = requireRole(
  Role.OWNER, Role.ADMIN, Role.MLRO, Role.COMPLIANCE_OFFICER
);
