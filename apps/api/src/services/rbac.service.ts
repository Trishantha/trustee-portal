/**
 * Role-Based Access Control Service
 * Trustee Portal - Core RBAC Implementation
 */

import { Role, Permission } from '../types';
import { AppError } from '../utils/api-response';

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
 * Defines what each role can do
 */
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

/**
 * Role display names
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
 * Role descriptions
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
  static hasPermission(role: Role, permission: Permission): boolean {
    if (role === Role.SUPER_ADMIN) return true;
    const permissions = PERMISSION_MATRIX[role] || [];
    return permissions.includes(permission);
  }
  
  static hasAllPermissions(role: Role, permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(role, p));
  }
  
  static hasAnyPermission(role: Role, permissions: Permission[]): boolean {
    return permissions.some(p => this.hasPermission(role, p));
  }
  
  static hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
    if (userRole === Role.SUPER_ADMIN) return true;
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }
  
  static getRolePermissions(role: Role): Permission[] {
    return [...(PERMISSION_MATRIX[role] || [])];
  }
  
  static canManageRole(managerRole: Role, targetRole: Role): boolean {
    if (targetRole === Role.SUPER_ADMIN) return false;
    if (managerRole === Role.SUPER_ADMIN) return true;
    
    const managerLevel = ROLE_HIERARCHY[managerRole] || 0;
    const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
    
    return managerLevel > targetLevel;
  }
  
  static getInvitableRoles(inviterRole: Role): Role[] {
    const allRoles = Object.values(Role).filter(r => 
      r !== Role.SUPER_ADMIN && r !== Role.OWNER
    );
    
    return allRoles.filter(role => this.canManageRole(inviterRole, role));
  }
  
  static getAssignableRoles(assignerRole: Role): Role[] {
    if (assignerRole === Role.SUPER_ADMIN) {
      return Object.values(Role).filter(r => r !== Role.SUPER_ADMIN);
    }
    
    return this.getInvitableRoles(assignerRole);
  }
  
  static canTransitionRole(
    currentRole: Role, 
    newRole: Role, 
    changedBy: Role
  ): { valid: boolean; reason?: string } {
    if (currentRole === newRole) {
      return { valid: false, reason: 'New role must be different from current role' };
    }
    
    if (currentRole === Role.SUPER_ADMIN) {
      return { valid: false, reason: 'Cannot modify super administrator roles' };
    }
    
    if (newRole === Role.SUPER_ADMIN) {
      return { valid: false, reason: 'Cannot assign super administrator role' };
    }
    
    if (!this.canManageRole(changedBy, newRole)) {
      return { valid: false, reason: 'Insufficient permissions to assign this role' };
    }
    
    if (!this.canManageRole(changedBy, currentRole)) {
      return { valid: false, reason: 'Insufficient permissions to modify this role' };
    }
    
    return { valid: true };
  }
  
  static getRoleLevel(role: Role): number {
    return ROLE_HIERARCHY[role] || 0;
  }
  
  static compareRoles(role1: Role, role2: Role): number {
    const level1 = this.getRoleLevel(role1);
    const level2 = this.getRoleLevel(role2);
    
    if (level1 < level2) return -1;
    if (level1 > level2) return 1;
    return 0;
  }
}

// Express middleware factory functions
export const requirePermission = (...permissions: Permission[]) => {
  return (req: any, _res: any, next: any): void => {
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
  return (req: any, _res: any, next: any): void => {
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
        `Required roles: ${roles.map((r: Role) => ROLE_DISPLAY_NAMES[r]).join(', ')}`));
      return;
    }
    
    next();
  };
};

export const requireMinimumRole = (minRole: Role) => {
  return (req: any, _res: any, next: any): void => {
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

export const requireOwner = (req: any, _res: any, next: any): void => {
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

export const requireSuperAdmin = (req: any, _res: any, next: any): void => {
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

export const requireAdmin = requireRole(Role.OWNER, Role.ADMIN);
export const requireAdminOrChair = requireRole(Role.OWNER, Role.ADMIN, Role.CHAIR);
export const requireBoardMember = requireRole(
  Role.OWNER, Role.ADMIN, Role.CHAIR, Role.VICE_CHAIR, 
  Role.TREASURER, Role.SECRETARY, Role.TRUSTEE
);
export const requireCompliance = requireRole(
  Role.OWNER, Role.ADMIN, Role.MLRO, Role.COMPLIANCE_OFFICER
);
