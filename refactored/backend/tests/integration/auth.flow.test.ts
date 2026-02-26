/**
 * Authentication Flow Integration Tests
 * Tests for complete signup and invitation flows
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { Role } from '../../src/types';

describe('Authentication Flow', () => {
  beforeAll(async () => {
    // Setup test database
  });
  
  afterAll(async () => {
    await prisma.$disconnect();
  });
  
  beforeEach(async () => {
    // Clean up test data
    await prisma.invitation.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });
  
  describe('Organization Signup Flow', () => {
    it('should create organization with admin user on signup', async () => {
      const signupData = {
        email: 'admin@charity.org',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
        organizationName: 'Test Charity',
        organizationSlug: 'test-charity'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(signupData)
        .expect(201);
      
      // Verify response structure
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(signupData.email);
      expect(response.body.data.user.role).toBe(Role.OWNER);
      expect(response.body.data.organization.name).toBe(signupData.organizationName);
      expect(response.body.data.accessToken).toBeDefined();
      
      // Verify database state
      const user = await prisma.user.findUnique({
        where: { email: signupData.email }
      });
      expect(user).toBeDefined();
      expect(user?.role).toBe(Role.OWNER);
      
      const org = await prisma.organization.findUnique({
        where: { slug: signupData.organizationSlug }
      });
      expect(org).toBeDefined();
      
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user?.id, organizationId: org?.id }
      });
      expect(membership?.role).toBe(Role.OWNER);
    });
    
    it('should reject weak passwords', async () => {
      const signupData = {
        email: 'admin@charity.org',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
        organizationName: 'Test Charity',
        organizationSlug: 'test-charity'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(signupData)
        .expect(400);
      
      expect(response.body.error.code).toBe('WEAK_PASSWORD');
    });
    
    it('should reject duplicate email', async () => {
      // First signup
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@charity.org',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Charity 1',
          organizationSlug: 'test-charity-1'
        });
      
      // Second signup with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@charity.org',
          password: 'SecurePass123!',
          firstName: 'Jane',
          lastName: 'Doe',
          organizationName: 'Test Charity 2',
          organizationSlug: 'test-charity-2'
        })
        .expect(409);
      
      expect(response.body.error.code).toBe('EMAIL_EXISTS');
    });
    
    it('should reject duplicate organization slug', async () => {
      // First signup
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin1@charity.org',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Charity',
          organizationSlug: 'test-charity'
        });
      
      // Second signup with same slug
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin2@charity.org',
          password: 'SecurePass123!',
          firstName: 'Jane',
          lastName: 'Doe',
          organizationName: 'Another Charity',
          organizationSlug: 'test-charity'
        })
        .expect(409);
      
      expect(response.body.error.code).toBe('SLUG_EXISTS');
    });
  });
  
  describe('Login Flow', () => {
    let authToken: string;
    let organizationId: string;
    
    beforeEach(async () => {
      // Create test user and org
      const signup = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@charity.org',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Charity',
          organizationSlug: 'test-charity'
        });
      
      authToken = signup.body.data.accessToken;
      organizationId = signup.body.data.organization.id;
    });
    
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@charity.org',
          password: 'SecurePass123!'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('admin@charity.org');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.organization).toBeDefined();
    });
    
    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@charity.org',
          password: 'WrongPassword123!'
        })
        .expect(401);
      
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
    
    it('should lock account after max failed attempts', async () => {
      // Attempt login with wrong password 5 times
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@charity.org',
            password: 'WrongPassword123!'
          });
      }
      
      // 6th attempt should be locked
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@charity.org',
          password: 'WrongPassword123!'
        })
        .expect(423);
      
      expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    });
  });
  
  describe('Invitation Flow', () => {
    let adminToken: string;
    let organizationId: string;
    
    beforeEach(async () => {
      // Create admin user
      const signup = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@charity.org',
          password: 'SecurePass123!',
          firstName: 'Admin',
          lastName: 'User',
          organizationName: 'Test Charity',
          organizationSlug: 'test-charity'
        });
      
      adminToken = signup.body.data.accessToken;
      organizationId = signup.body.data.organization.id;
    });
    
    it('should allow admin to invite user with role', async () => {
      const invitationData = {
        email: 'trustee@charity.org',
        role: Role.TRUSTEE,
        department: 'Governance'
      };
      
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invitationData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.invitation.email).toBe(invitationData.email);
      expect(response.body.data.invitation.role).toBe(invitationData.role);
      expect(response.body.data.acceptUrl).toBeDefined();
    });
    
    it('should not allow inviting with higher role', async () => {
      const invitationData = {
        email: 'hacker@charity.org',
        role: Role.ADMIN // Admin cannot invite admins
      };
      
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invitationData)
        .expect(403);
      
      expect(response.body.error.code).toBe('INVALID_ROLE');
    });
    
    it('should allow invited user to accept with role', async () => {
      // Create invitation
      const inviteResponse = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'trustee@charity.org',
          role: Role.TRUSTEE
        });
      
      const token = new URL(inviteResponse.body.data.acceptUrl).searchParams.get('token');
      
      // Accept invitation
      const acceptResponse = await request(app)
        .post('/api/auth/accept-invitation')
        .send({
          token,
          password: 'NewUserPass123!',
          firstName: 'New',
          lastName: 'Trustee'
        })
        .expect(200);
      
      expect(acceptResponse.body.success).toBe(true);
      expect(acceptResponse.body.data.user.email).toBe('trustee@charity.org');
      expect(acceptResponse.body.data.member.role).toBe(Role.TRUSTEE);
      expect(acceptResponse.body.data.accessToken).toBeDefined();
    });
    
    it('should not allow accepting expired invitation', async () => {
      // Create invitation and manually expire it
      const inviteResponse = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'expired@charity.org',
          role: Role.TRUSTEE
        });
      
      const token = new URL(inviteResponse.body.data.acceptUrl).searchParams.get('token');
      
      // Expire the invitation
      await prisma.invitation.updateMany({
        where: { email: 'expired@charity.org' },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      
      // Try to accept
      const response = await request(app)
        .post('/api/auth/accept-invitation')
        .send({
          token,
          password: 'NewUserPass123!',
          firstName: 'Expired',
          lastName: 'User'
        })
        .expect(400);
      
      expect(response.body.error.code).toBe('INVALID_INVITATION');
    });
    
    it('should not allow duplicate invitations', async () => {
      // First invitation
      await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'duplicate@charity.org',
          role: Role.TRUSTEE
        })
        .expect(201);
      
      // Second invitation to same email
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'duplicate@charity.org',
          role: Role.VOLUNTEER
        });
      
      // Should resend, not error
      expect(response.status).toBe(201);
    });
    
    it('should handle existing user accepting invitation', async () => {
      // Create existing user in another org
      const existingSignup = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@charity.org',
          password: 'SecurePass123!',
          firstName: 'Existing',
          lastName: 'User',
          organizationName: 'Other Charity',
          organizationSlug: 'other-charity'
        });
      
      // Invite to first organization
      const inviteResponse = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'existing@charity.org',
          role: Role.TRUSTEE
        });
      
      const token = new URL(inviteResponse.body.data.acceptUrl).searchParams.get('token');
      
      // Accept with existing user (no password needed)
      const acceptResponse = await request(app)
        .post('/api/auth/accept-invitation')
        .send({ token })
        .expect(200);
      
      expect(acceptResponse.body.data.user.email).toBe('existing@charity.org');
      expect(acceptResponse.body.data.member.role).toBe(Role.TRUSTEE);
    });
  });
  
  describe('RBAC Protection', () => {
    let adminToken: string;
    let trusteeToken: string;
    let organizationId: string;
    
    beforeEach(async () => {
      // Create admin
      const adminSignup = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'admin@charity.org',
          password: 'SecurePass123!',
          firstName: 'Admin',
          lastName: 'User',
          organizationName: 'Test Charity',
          organizationSlug: 'test-charity'
        });
      
      adminToken = adminSignup.body.data.accessToken;
      organizationId = adminSignup.body.data.organization.id;
      
      // Invite and accept as trustee
      const inviteResponse = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'trustee@charity.org',
          role: Role.TRUSTEE
        });
      
      const token = new URL(inviteResponse.body.data.acceptUrl).searchParams.get('token');
      
      const acceptResponse = await request(app)
        .post('/api/auth/accept-invitation')
        .send({
          token,
          password: 'TrusteePass123!',
          firstName: 'Trustee',
          lastName: 'User'
        });
      
      trusteeToken = acceptResponse.body.data.accessToken;
    });
    
    it('should allow admin to invite users', async () => {
      await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@charity.org',
          role: Role.VOLUNTEER
        })
        .expect(201);
    });
    
    it('should not allow trustee to invite users', async () => {
      const response = await request(app)
        .post(`/api/organizations/${organizationId}/invitations`)
        .set('Authorization', `Bearer ${trusteeToken}`)
        .send({
          email: 'newuser@charity.org',
          role: Role.VOLUNTEER
        })
        .expect(403);
      
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
    
    it('should not allow trustee to access admin endpoints', async () => {
      const response = await request(app)
        .get(`/api/organizations/${organizationId}/billing`)
        .set('Authorization', `Bearer ${trusteeToken}`)
        .expect(403);
      
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
    
    it('should allow trustee to view organization', async () => {
      await request(app)
        .get(`/api/organizations/${organizationId}`)
        .set('Authorization', `Bearer ${trusteeToken}`)
        .expect(200);
    });
  });
});
