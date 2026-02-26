/**
 * RBAC Service Unit Tests
 * Tests for role-based access control logic
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RBACService, Role, Permission } from '../../src/services/rbac.service';

describe('RBACService', () => {
  describe('hasPermission', () => {
    it('should return true for super admin for any permission', () => {
      const result = RBACService.hasPermission(Role.SUPER_ADMIN, Permission.USER_DELETE);
      expect(result).toBe(true);
    });
    
    it('should return true for owner to manage organization', () => {
      expect(RBACService.hasPermission(Role.OWNER, Permission.ORG_MANAGE)).toBe(true);
      expect(RBACService.hasPermission(Role.OWNER, Permission.USER_DELETE)).toBe(true);
    });
    
    it('should return false for viewer to create users', () => {
      expect(RBACService.hasPermission(Role.VIEWER, Permission.USER_CREATE)).toBe(false);
    });
    
    it('should return true for trustee to view documents', () => {
      expect(RBACService.hasPermission(Role.TRUSTEE, Permission.DOC_VIEW)).toBe(true);
    });
    
    it('should return true for treasurer to manage billing', () => {
      expect(RBACService.hasPermission(Role.TREASURER, Permission.BILLING_MANAGE)).toBe(true);
    });
    
    it('should return false for treasurer to delete users', () => {
      expect(RBACService.hasPermission(Role.TREASURER, Permission.USER_DELETE)).toBe(false);
    });
    
    it('should return true for MLRO to view audit logs', () => {
      expect(RBACService.hasPermission(Role.MLRO, Permission.AUDIT_VIEW)).toBe(true);
    });
    
    it('should return true for compliance officer to manage compliance', () => {
      expect(RBACService.hasPermission(Role.COMPLIANCE_OFFICER, Permission.COMPLIANCE_MANAGE)).toBe(true);
    });
  });
  
  describe('hasAllPermissions', () => {
    it('should return true when all permissions are granted', () => {
      const result = RBACService.hasAllPermissions(Role.ADMIN, [
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        Permission.USER_VIEW
      ]);
      expect(result).toBe(true);
    });
    
    it('should return false when any permission is missing', () => {
      const result = RBACService.hasAllPermissions(Role.TRUSTEE, [
        Permission.DOC_VIEW,
        Permission.USER_CREATE // Trustees cannot create users
      ]);
      expect(result).toBe(false);
    });
  });
  
  describe('hasMinimumRole', () => {
    it('should return true for admin having minimum admin level', () => {
      expect(RBACService.hasMinimumRole(Role.ADMIN, Role.ADMIN)).toBe(true);
    });
    
    it('should return true for owner having minimum admin level', () => {
      expect(RBACService.hasMinimumRole(Role.OWNER, Role.ADMIN)).toBe(true);
    });
    
    it('should return false for trustee having minimum admin level', () => {
      expect(RBACService.hasMinimumRole(Role.TRUSTEE, Role.ADMIN)).toBe(false);
    });
    
    it('should return true for chair having minimum trustee level', () => {
      expect(RBACService.hasMinimumRole(Role.CHAIR, Role.TRUSTEE)).toBe(true);
    });
    
    it('should return true for super admin having any minimum role', () => {
      expect(RBACService.hasMinimumRole(Role.SUPER_ADMIN, Role.OWNER)).toBe(true);
    });
  });
  
  describe('canManageRole', () => {
    it('should allow owner to manage admin', () => {
      expect(RBACService.canManageRole(Role.OWNER, Role.ADMIN)).toBe(true);
    });
    
    it('should allow admin to manage trustee', () => {
      expect(RBACService.canManageRole(Role.ADMIN, Role.TRUSTEE)).toBe(true);
    });
    
    it('should not allow trustee to manage admin', () => {
      expect(RBACService.canManageRole(Role.TRUSTEE, Role.ADMIN)).toBe(false);
    });
    
    it('should not allow user to manage same level role', () => {
      expect(RBACService.canManageRole(Role.ADMIN, Role.ADMIN)).toBe(false);
    });
    
    it('should not allow anyone to manage super admin', () => {
      expect(RBACService.canManageRole(Role.OWNER, Role.SUPER_ADMIN)).toBe(false);
      expect(RBACService.canManageRole(Role.SUPER_ADMIN, Role.SUPER_ADMIN)).toBe(false);
    });
    
    it('should allow super admin to manage any role except super admin', () => {
      expect(RBACService.canManageRole(Role.SUPER_ADMIN, Role.OWNER)).toBe(true);
      expect(RBACService.canManageRole(Role.SUPER_ADMIN, Role.VIEWER)).toBe(true);
    });
  });
  
  describe('getInvitableRoles', () => {
    it('should return all roles except super_admin and owner for admin', () => {
      const roles = RBACService.getInvitableRoles(Role.ADMIN);
      expect(roles).toContain(Role.TRUSTEE);
      expect(roles).toContain(Role.VIEWER);
      expect(roles).not.toContain(Role.SUPER_ADMIN);
      expect(roles).not.toContain(Role.OWNER);
      expect(roles).not.toContain(Role.ADMIN);
    });
    
    it('should return lower roles for trustee', () => {
      const roles = RBACService.getInvitableRoles(Role.TRUSTEE);
      expect(roles).toContain(Role.VIEWER);
      expect(roles).toContain(Role.VOLUNTEER);
      expect(roles).not.toContain(Role.TRUSTEE);
      expect(roles).not.toContain(Role.ADMIN);
    });
    
    it('should return roles for chair', () => {
      const roles = RBACService.getInvitableRoles(Role.CHAIR);
      expect(roles).toContain(Role.TRUSTEE);
      expect(roles).toContain(Role.SECRETARY);
      expect(roles).not.toContain(Role.ADMIN);
      expect(roles).not.toContain(Role.CHAIR);
    });
  });
  
  describe('getAssignableRoles', () => {
    it('should be same as invitable for non-super-admin', () => {
      expect(RBACService.getAssignableRoles(Role.ADMIN))
        .toEqual(RBACService.getInvitableRoles(Role.ADMIN));
    });
    
    it('should allow super admin to assign any role except super_admin', () => {
      const roles = RBACService.getAssignableRoles(Role.SUPER_ADMIN);
      expect(roles).toContain(Role.OWNER);
      expect(roles).toContain(Role.ADMIN);
      expect(roles).not.toContain(Role.SUPER_ADMIN);
    });
  });
  
  describe('canTransitionRole', () => {
    it('should allow admin to change trustee to volunteer', () => {
      const result = RBACService.canTransitionRole(Role.TRUSTEE, Role.VOLUNTEER, Role.ADMIN);
      expect(result.valid).toBe(true);
    });
    
    it('should not allow trustee to change role to admin', () => {
      const result = RBACService.canTransitionRole(Role.VOLUNTEER, Role.ADMIN, Role.TRUSTEE);
      expect(result.valid).toBe(false);
    });
    
    it('should not allow same role transition', () => {
      const result = RBACService.canTransitionRole(Role.TRUSTEE, Role.TRUSTEE, Role.ADMIN);
      expect(result.valid).toBe(false);
    });
    
    it('should not allow transition to super admin', () => {
      const result = RBACService.canTransitionRole(Role.ADMIN, Role.SUPER_ADMIN, Role.OWNER);
      expect(result.valid).toBe(false);
    });
    
    it('should not allow modification of super admin', () => {
      const result = RBACService.canTransitionRole(Role.SUPER_ADMIN, Role.ADMIN, Role.OWNER);
      expect(result.valid).toBe(false);
    });
  });
  
  describe('Role Hierarchy', () => {
    it('should have correct hierarchy levels', () => {
      expect(RBACService.getRoleLevel(Role.SUPER_ADMIN)).toBeGreaterThan(RBACService.getRoleLevel(Role.OWNER));
      expect(RBACService.getRoleLevel(Role.OWNER)).toBeGreaterThan(RBACService.getRoleLevel(Role.ADMIN));
      expect(RBACService.getRoleLevel(Role.ADMIN)).toBeGreaterThan(RBACService.getRoleLevel(Role.CHAIR));
      expect(RBACService.getRoleLevel(Role.CHAIR)).toBeGreaterThan(RBACService.getRoleLevel(Role.TRUSTEE));
      expect(RBACService.getRoleLevel(Role.TRUSTEE)).toBeGreaterThan(RBACService.getRoleLevel(Role.VIEWER));
    });
  });
  
  describe('compareRoles', () => {
    it('should return 1 when first role is higher', () => {
      expect(RBACService.compareRoles(Role.ADMIN, Role.TRUSTEE)).toBe(1);
    });
    
    it('should return -1 when first role is lower', () => {
      expect(RBACService.compareRoles(Role.VIEWER, Role.ADMIN)).toBe(-1);
    });
    
    it('should return 0 when roles are equal', () => {
      expect(RBACService.compareRoles(Role.TRUSTEE, Role.TRUSTEE)).toBe(0);
    });
  });
});
