/**
 * Authentication Service
 * Trustee Portal - Core Authentication Logic
 * 
 * Business Rules:
 * - New client signup automatically becomes Admin
 * - Secure JWT token generation with organization context
 * - Password strength enforcement
 * - Account lockout protection
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model';
import { OrganizationModel } from '../models/organization.model';
import { OrganizationMemberModel } from '../models/organization-member.model';
import { AuditService } from './audit.service';
import { EmailService } from './email.service';
import { RBACService } from './rbac.service';
import { 
  User, 
  CreateUserInput, 
  CreateOrganizationInput,
  Role,
  Permission,
  JWTPayload,
  AuditAction,
  LoginInput,
  RegisterInput,
  AuthResult
} from '../types';
import { AppError } from '../utils/api-response';
import { Logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const SALT_ROUNDS = 12;

// Password strength requirements
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

export class AuthService {
  /**
   * Validate password strength
   */
  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
      errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
    }
    
    if (password.length > PASSWORD_REQUIREMENTS.maxLength) {
      errors.push(`Password must not exceed ${PASSWORD_REQUIREMENTS.maxLength} characters`);
    }
    
    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (PASSWORD_REQUIREMENTS.requireSpecialChars && 
        !new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`).test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Generate secure JWT token
   */
  static generateToken(
    user: Pick<User, 'id' | 'email' | 'isSuperAdmin'>,
    organizationId?: string,
    memberRole?: Role
  ): string {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      ...(organizationId && { organizationId, role: memberRole })
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }
  
  /**
   * Generate refresh token
   */
  static generateRefreshToken(): { token: string; expiresAt: Date } {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN);
    
    return { token, expiresAt };
  }
  
  /**
   * Hash password securely
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }
  
  /**
   * Verify password
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  
  /**
   * Register new organization with admin user
   * Business Rule: Signup user automatically becomes Admin
   */
  static async register(input: RegisterInput, ipAddress?: string): Promise<AuthResult> {
    // Validate password
    const passwordValidation = this.validatePassword(input.password);
    if (!passwordValidation.valid) {
      throw new AppError(400, 'WEAK_PASSWORD', passwordValidation.errors[0]);
    }
    
    // Check if email exists
    const existingUser = await UserModel.findByEmail(input.email);
    if (existingUser) {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }
    
    // Check slug availability
    const existingOrg = await OrganizationModel.findBySlug(input.organizationSlug);
    if (existingOrg) {
      throw new AppError(409, 'SLUG_EXISTS', 'This organization URL is already taken');
    }
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Hash password
    const passwordHash = await this.hashPassword(input.password);
    
    // Calculate trial end (14 days)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    
    try {
      // Create user as organization owner (admin)
      const user = await UserModel.create({
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: Role.OWNER, // User is automatically owner/admin
        timezone: input.timezone || 'UTC',
        language: input.language || 'en',
        verificationToken,
        emailVerified: false
      });
      
      // Create organization
      const organization = await OrganizationModel.create({
        name: input.organizationName,
        slug: input.organizationSlug,
        billingEmail: input.email,
        createdBy: user.id,
        subscriptionStatus: 'trial',
        trialEndsAt,
        settings: {
          timezone: input.timezone || 'UTC',
          language: input.language || 'en'
        }
      });
      
      // Create organization membership as owner
      await OrganizationMemberModel.create({
        organizationId: organization.id,
        userId: user.id,
        role: Role.OWNER, // Business rule: signup user is owner
        isActive: true,
        joinedAt: new Date()
      });
      
      // Generate tokens
      const accessToken = this.generateToken(user, organization.id, Role.OWNER);
      const refreshToken = this.generateRefreshToken();
      
      // Store refresh token
      await UserModel.setRefreshToken(user.id, refreshToken.token, refreshToken.expiresAt);
      
      // Audit log
      await AuditService.log({
        organizationId: organization.id,
        userId: user.id,
        action: AuditAction.CREATE,
        resourceType: 'organization',
        resourceId: organization.id,
        details: {
          userEmail: user.email,
          orgName: organization.name,
          role: Role.OWNER
        },
        ipAddress
      });
      
      // Send welcome email (async)
      EmailService.sendWelcomeEmail(user, organization).catch(err => {
        Logger.warn('Failed to send welcome email', { error: err.message, userId: user.id });
      });
      
      // Send verification email (async)
      EmailService.sendVerificationEmail(user.email, verificationToken).catch(err => {
        Logger.warn('Failed to send verification email', { error: err.message, userId: user.id });
      });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: Role.OWNER,
          emailVerified: false
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          subscriptionStatus: organization.subscriptionStatus,
          trialEndsAt: organization.trialEndsAt
        },
        accessToken,
        refreshToken: refreshToken.token,
        requiresEmailVerification: true
      };
      
    } catch (error) {
      Logger.error('Registration failed', { error, email: input.email });
      throw new AppError(500, 'REGISTRATION_FAILED', 'Failed to create account. Please try again.');
    }
  }
  
  /**
   * Login user
   */
  static async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
    // Find user
    const user = await UserModel.findByEmail(input.email);
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    
    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError(423, 'ACCOUNT_LOCKED', 
        `Account is locked. Try again in ${minutesLeft} minutes`);
    }
    
    // Verify password
    const isValidPassword = await this.verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      // Increment failed attempts
      const attempts = await UserModel.incrementLoginAttempts(user.id);
      
      // Lock account if max attempts reached
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60000);
        await UserModel.lockAccount(user.id, lockedUntil);
        
        // Send security alert
        EmailService.sendSecurityAlert(user, 'account_locked', { ipAddress }).catch(() => {});
        
        throw new AppError(423, 'ACCOUNT_LOCKED', 
          `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes`);
      }
      
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    
    // Check if account is active
    if (!user.isActive) {
      throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'Account has been deactivated');
    }
    
    // Clear failed attempts
    await UserModel.clearLoginAttempts(user.id);
    
    // Update last login
    await UserModel.updateLastLogin(user.id, ipAddress);
    
    // Determine organization context
    let organizationId: string | undefined;
    let memberRole: Role | undefined;
    let organization: any;
    
    if (input.organizationId) {
      // Validate membership
      const membership = await OrganizationMemberModel.findByUserAndOrg(user.id, input.organizationId);
      if (!membership || !membership.isActive) {
        throw new AppError(403, 'NOT_ORG_MEMBER', 'You are not a member of this organization');
      }
      
      organizationId = input.organizationId;
      memberRole = membership.role;
      organization = await OrganizationModel.findById(organizationId);
    } else {
      // Get user's organizations
      const memberships = await OrganizationMemberModel.findActiveByUser(user.id);
      
      if (memberships.length === 1) {
        // Auto-select if only one organization
        organizationId = memberships[0].organizationId;
        memberRole = memberships[0].role;
        organization = await OrganizationModel.findById(organizationId);
      }
    }
    
    // Check trial expiration
    if (organization?.subscriptionStatus === 'trial' && organization?.trialEndsAt) {
      if (new Date(organization.trialEndsAt) < new Date()) {
        throw new AppError(403, 'TRIAL_EXPIRED', 'Trial period has expired');
      }
    }
    
    // Generate tokens
    const accessToken = this.generateToken(user, organizationId, memberRole);
    const refreshToken = this.generateRefreshToken();
    
    await UserModel.setRefreshToken(user.id, refreshToken.token, refreshToken.expiresAt);
    
    // Audit log
    await AuditService.log({
      organizationId,
      userId: user.id,
      action: AuditAction.LOGIN,
      resourceType: 'session',
      details: { ipAddress, userAgent },
      ipAddress
    });
    
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: user.isSuperAdmin,
        emailVerified: user.emailVerified
      },
      ...(organization && {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          subscriptionStatus: organization.subscriptionStatus,
          trialEndsAt: organization.trialEndsAt,
          role: memberRole
        }
      }),
      accessToken,
      refreshToken: refreshToken.token
    };
  }
  
  /**
   * Select organization (for users with multiple orgs)
   */
  static async selectOrganization(
    userId: string, 
    organizationId: string,
    ipAddress?: string
  ): Promise<AuthResult> {
    // Validate membership
    const membership = await OrganizationMemberModel.findByUserAndOrg(userId, organizationId);
    if (!membership || !membership.isActive) {
      throw new AppError(403, 'NOT_ORG_MEMBER', 'You are not a member of this organization');
    }
    
    // Get user and organization
    const [user, organization] = await Promise.all([
      UserModel.findById(userId),
      OrganizationModel.findById(organizationId)
    ]);
    
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    
    if (!organization) {
      throw new AppError(404, 'ORG_NOT_FOUND', 'Organization not found');
    }
    
    // Check organization status
    if (!organization.isActive) {
      throw new AppError(403, 'ORG_SUSPENDED', 'Organization has been suspended');
    }
    
    // Check subscription
    if (organization.subscriptionStatus === 'suspended') {
      throw new AppError(403, 'SUBSCRIPTION_SUSPENDED', 'Subscription has been suspended');
    }
    
    // Update last active
    await OrganizationMemberModel.updateLastActive(membership.id);
    
    // Generate tokens
    const accessToken = this.generateToken(user, organizationId, membership.role);
    const refreshToken = this.generateRefreshToken();
    
    await UserModel.setRefreshToken(user.id, refreshToken.token, refreshToken.expiresAt);
    
    // Audit log
    await AuditService.log({
      organizationId,
      userId: user.id,
      action: AuditAction.LOGIN,
      resourceType: 'session',
      details: { action: 'select_organization' },
      ipAddress
    });
    
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: user.isSuperAdmin,
        emailVerified: user.emailVerified
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        subscriptionStatus: organization.subscriptionStatus,
        trialEndsAt: organization.trialEndsAt,
        role: membership.role
      },
      accessToken,
      refreshToken: refreshToken.token
    };
  }
  
  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    const user = await UserModel.findByRefreshToken(refreshToken);
    
    if (!user) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }
    
    // Generate new access token
    const accessToken = this.generateToken(user);
    
    return { accessToken };
  }
  
  /**
   * Logout user
   */
  static async logout(userId: string, organizationId?: string): Promise<void> {
    await UserModel.clearRefreshToken(userId);
    
    // Audit log
    await AuditService.log({
      organizationId,
      userId,
      action: AuditAction.LOGOUT,
      resourceType: 'session'
    });
  }
  
  /**
   * Verify email address
   */
  static async verifyEmail(token: string): Promise<void> {
    const user = await UserModel.findByVerificationToken(token);
    
    if (!user) {
      throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired verification token');
    }
    
    await UserModel.markEmailVerified(user.id);
    
    // Audit log
    await AuditService.log({
      userId: user.id,
      action: AuditAction.EMAIL_VERIFIED,
      resourceType: 'user',
      resourceId: user.id
    });
  }
  
  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string): Promise<void> {
    const user = await UserModel.findByEmail(email);
    
    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    await UserModel.setResetToken(user.id, token, expiresAt);
    
    // Send email (async)
    EmailService.sendPasswordResetEmail(user.email, token).catch(() => {});
  }
  
  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validate password
    const validation = this.validatePassword(newPassword);
    if (!validation.valid) {
      throw new AppError(400, 'WEAK_PASSWORD', validation.errors[0]);
    }
    
    const user = await UserModel.findByResetToken(token);
    
    if (!user) {
      throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired reset token');
    }
    
    const passwordHash = await this.hashPassword(newPassword);
    await UserModel.updatePassword(user.id, passwordHash);
    
    // Clear all sessions
    await UserModel.clearRefreshToken(user.id);
    
    // Audit log
    await AuditService.log({
      userId: user.id,
      action: AuditAction.PASSWORD_CHANGE,
      resourceType: 'user',
      resourceId: user.id,
      details: { method: 'reset' }
    });
    
    // Send confirmation email
    EmailService.sendPasswordChangedConfirmation(user.email).catch(() => {});
  }
  
  /**
   * Change password (authenticated)
   */
  static async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    
    // Verify current password
    const isValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AppError(401, 'INVALID_PASSWORD', 'Current password is incorrect');
    }
    
    // Validate new password
    const validation = this.validatePassword(newPassword);
    if (!validation.valid) {
      throw new AppError(400, 'WEAK_PASSWORD', validation.errors[0]);
    }
    
    // Hash and update
    const passwordHash = await this.hashPassword(newPassword);
    await UserModel.updatePassword(userId, passwordHash);
    
    // Audit log
    await AuditService.log({
      userId,
      action: AuditAction.PASSWORD_CHANGE,
      resourceType: 'user',
      resourceId: userId,
      details: { method: 'change' }
    });
  }
}
