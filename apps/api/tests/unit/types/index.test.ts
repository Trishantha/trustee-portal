import { Role, Permission, AuditAction, SubscriptionStatus } from '../../../src/types';

describe('Type Enums', () => {
  describe('Role', () => {
    it('should have expected roles', () => {
      expect(Role.SUPER_ADMIN).toBe('super_admin');
      expect(Role.OWNER).toBe('owner');
      expect(Role.ADMIN).toBe('admin');
      expect(Role.VIEWER).toBe('viewer');
    });
  });

  describe('Permission', () => {
    it('should have organization permissions', () => {
      expect(Permission.ORG_MANAGE).toBe('org:manage');
      expect(Permission.ORG_VIEW).toBe('org:view');
    });

    it('should have user permissions', () => {
      expect(Permission.USER_CREATE).toBe('user:create');
      expect(Permission.USER_INVITE).toBe('user:invite');
    });
  });

  describe('AuditAction', () => {
    it('should have expected actions', () => {
      expect(AuditAction.CREATE).toBe('create');
      expect(AuditAction.LOGIN).toBe('login');
      expect(AuditAction.ROLE_CHANGE).toBe('role_change');
    });
  });

  describe('SubscriptionStatus', () => {
    it('should have expected statuses', () => {
      expect(SubscriptionStatus.TRIAL).toBe('trial');
      expect(SubscriptionStatus.ACTIVE).toBe('active');
      expect(SubscriptionStatus.CANCELLED).toBe('cancelled');
    });
  });
});
