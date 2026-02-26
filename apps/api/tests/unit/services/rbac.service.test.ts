import { RBACService, ROLE_DISPLAY_NAMES } from '../../../src/services/rbac.service';
import { Role, Permission } from '../../../src/types';

describe('RBACService', () => {
  describe('ROLE_DISPLAY_NAMES', () => {
    it('should have display names for all roles', () => {
      expect(ROLE_DISPLAY_NAMES[Role.OWNER]).toBe('Organization Owner');
      expect(ROLE_DISPLAY_NAMES[Role.TRUSTEE]).toBe('Trustee');
      expect(ROLE_DISPLAY_NAMES[Role.VIEWER]).toBe('Viewer');
    });
  });

  describe('hasPermission', () => {
    it('should return true for super admin with any permission', () => {
      expect(RBACService.hasPermission(Role.SUPER_ADMIN, Permission.ORG_DELETE)).toBe(true);
      expect(RBACService.hasPermission(Role.SUPER_ADMIN, Permission.PLATFORM_ADMIN)).toBe(true);
    });

    it('should return true for owner with org manage permission', () => {
      expect(RBACService.hasPermission(Role.OWNER, Permission.ORG_MANAGE)).toBe(true);
      expect(RBACService.hasPermission(Role.OWNER, Permission.USER_INVITE)).toBe(true);
    });

    it('should return false for viewer with manage permissions', () => {
      expect(RBACService.hasPermission(Role.VIEWER, Permission.ORG_MANAGE)).toBe(false);
      expect(RBACService.hasPermission(Role.VIEWER, Permission.USER_CREATE)).toBe(false);
    });

    it('should return true for viewer with view permissions', () => {
      expect(RBACService.hasPermission(Role.VIEWER, Permission.ORG_VIEW)).toBe(true);
      expect(RBACService.hasPermission(Role.VIEWER, Permission.DOC_VIEW)).toBe(true);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if user has any of the permissions', () => {
      expect(RBACService.hasAnyPermission(Role.ADMIN, [
        Permission.ORG_VIEW,
        Permission.PLATFORM_ADMIN,
      ])).toBe(true);
    });

    it('should return false if user has none of the permissions', () => {
      expect(RBACService.hasAnyPermission(Role.VIEWER, [
        Permission.ORG_MANAGE,
        Permission.USER_CREATE,
      ])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if user has all permissions', () => {
      expect(RBACService.hasAllPermissions(Role.OWNER, [
        Permission.ORG_VIEW,
        Permission.ORG_MANAGE,
      ])).toBe(true);
    });

    it('should return false if user is missing any permission', () => {
      expect(RBACService.hasAllPermissions(Role.ADMIN, [
        Permission.ORG_VIEW,
        Permission.ORG_DELETE,
      ])).toBe(false);
    });
  });

  describe('hasMinimumRole', () => {
    it('should return true for higher role', () => {
      expect(RBACService.hasMinimumRole(Role.OWNER, Role.ADMIN)).toBe(true);
      expect(RBACService.hasMinimumRole(Role.ADMIN, Role.TRUSTEE)).toBe(true);
    });

    it('should return true for same role', () => {
      expect(RBACService.hasMinimumRole(Role.ADMIN, Role.ADMIN)).toBe(true);
    });

    it('should return false for lower role', () => {
      expect(RBACService.hasMinimumRole(Role.VIEWER, Role.ADMIN)).toBe(false);
    });
  });

  describe('getAssignableRoles', () => {
    it('should return empty array for viewer', () => {
      expect(RBACService.getAssignableRoles(Role.VIEWER)).toEqual([]);
    });

    it('should return roles for admin excluding owner and super_admin', () => {
      const roles = RBACService.getAssignableRoles(Role.ADMIN);
      expect(roles).not.toContain(Role.OWNER);
      expect(roles).not.toContain(Role.SUPER_ADMIN);
      expect(roles).toContain(Role.TRUSTEE);
      expect(roles).toContain(Role.VIEWER);
    });

    it('should return all roles for super admin excluding super_admin', () => {
      const roles = RBACService.getAssignableRoles(Role.SUPER_ADMIN);
      expect(roles).toContain(Role.OWNER);
      expect(roles).not.toContain(Role.SUPER_ADMIN);
    });
  });

  describe('canManageRole', () => {
    it('should allow admin to manage viewer', () => {
      expect(RBACService.canManageRole(Role.ADMIN, Role.VIEWER)).toBe(true);
    });

    it('should allow owner to manage admin', () => {
      expect(RBACService.canManageRole(Role.OWNER, Role.ADMIN)).toBe(true);
    });

    it('should not allow admin to manage owner', () => {
      expect(RBACService.canManageRole(Role.ADMIN, Role.OWNER)).toBe(false);
    });

    it('should not allow managing same role', () => {
      expect(RBACService.canManageRole(Role.ADMIN, Role.ADMIN)).toBe(false);
    });
  });

  describe('canTransitionRole', () => {
    it('should allow valid transitions', () => {
      const result = RBACService.canTransitionRole(Role.TRUSTEE, Role.ADMIN, Role.OWNER);
      expect(result.valid).toBe(true);
    });

    it('should reject transition to super_admin', () => {
      const result = RBACService.canTransitionRole(Role.ADMIN, Role.SUPER_ADMIN, Role.OWNER);
      expect(result.valid).toBe(false);
    });

    it('should reject if changer cannot manage target role', () => {
      const result = RBACService.canTransitionRole(Role.TRUSTEE, Role.OWNER, Role.ADMIN);
      expect(result.valid).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for super admin', () => {
      const permissions = RBACService.getRolePermissions(Role.SUPER_ADMIN);
      expect(permissions.length).toBe(Object.values(Permission).length);
    });

    it('should return view permissions for viewer', () => {
      const permissions = RBACService.getRolePermissions(Role.VIEWER);
      expect(permissions).toContain(Permission.ORG_VIEW);
      expect(permissions).toContain(Permission.DOC_VIEW);
      expect(permissions).not.toContain(Permission.ORG_MANAGE);
    });
  });

  describe('getRoleLevel', () => {
    it('should return correct hierarchy level', () => {
      expect(RBACService.getRoleLevel(Role.SUPER_ADMIN)).toBe(100);
      expect(RBACService.getRoleLevel(Role.OWNER)).toBe(90);
      expect(RBACService.getRoleLevel(Role.VIEWER)).toBe(10);
    });

    it('should return 0 for invalid role', () => {
      expect(RBACService.getRoleLevel('invalid' as Role)).toBe(0);
    });
  });

  describe('compareRoles', () => {
    it('should return positive when role1 is higher', () => {
      expect(RBACService.compareRoles(Role.OWNER, Role.ADMIN)).toBeGreaterThan(0);
    });

    it('should return negative when role1 is lower', () => {
      expect(RBACService.compareRoles(Role.VIEWER, Role.ADMIN)).toBeLessThan(0);
    });

    it('should return 0 when roles are equal', () => {
      expect(RBACService.compareRoles(Role.ADMIN, Role.ADMIN)).toBe(0);
    });
  });

  describe('getInvitableRoles', () => {
    it('should exclude super_admin and owner from invitable roles', () => {
      const roles = RBACService.getInvitableRoles(Role.SUPER_ADMIN);
      expect(roles).not.toContain(Role.SUPER_ADMIN);
      expect(roles).not.toContain(Role.OWNER);
    });
  });
});
