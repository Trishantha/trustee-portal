/**
 * Authentication Routes
 * Secure cookie-based authentication with httpOnly cookies
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '../config/database';
import { asyncHandler, sendSuccess, Errors } from '../utils/api-response';
import { AuditService } from '../services/audit.service';
import { EmailService } from '../services/email.service';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  setAuthCookies, 
  clearAuthCookies,
  hashToken,
  extractAccessToken,
  verifyAccessToken
} from '../services/token.service';

import { Role, AuditAction } from '../types';
import type { Request, Response } from 'express';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  organizationId: z.string().uuid().optional().nullable()
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  organizationName: z.string().min(1, 'Organization name is required'),
  organizationSlug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only'),
  timezone: z.string().default('UTC'),
  language: z.string().default('en')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
});

// POST /api/auth/register - Create organization with owner
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const validated = registerSchema.parse(req.body);
  
  const rollbackOperations: (() => Promise<void>)[] = [];
  
  try {
    // Check if email exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', validated.email.toLowerCase())
      .single();
    
    if (existingUser) {
      throw Errors.conflict('EMAIL_EXISTS', 'An account with this email already exists');
    }
    
    // Check slug availability
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', validated.organizationSlug)
      .single();
    
    if (existingOrg) {
      throw Errors.conflict('SLUG_EXISTS', 'This organization URL is already taken');
    }
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, 12);
    
    // Calculate trial end
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    
    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: validated.email.toLowerCase(),
        password_hash: passwordHash,
        first_name: validated.firstName,
        last_name: validated.lastName,
        timezone: validated.timezone,
        language: validated.language,
        verification_token: verificationToken,
        email_verified: false,
        is_active: true,
        is_super_admin: false
      })
      .select()
      .single();
    
    if (userError || !user) {
      throw Errors.internal('Failed to create user');
    }
    
    // Add rollback operation
    rollbackOperations.push(async () => {
      await supabase.from('users').delete().eq('id', user.id);
    });
    
    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        client_id: `TRUSTEE-${Date.now()}`,
        name: validated.organizationName,
        slug: validated.organizationSlug,
        billing_email: validated.email,
        created_by: user.id,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        max_members: 5,
        settings: {
          timezone: validated.timezone,
          language: validated.language
        }
      })
      .select()
      .single();
    
    if (orgError || !organization) {
      // Rollback user creation
      await Promise.all(rollbackOperations.map(op => op().catch(() => {})));
      throw Errors.internal('Failed to create organization');
    }
    
    // Add rollback operation
    rollbackOperations.push(async () => {
      await supabase.from('organizations').delete().eq('id', organization.id);
    });
    
    // Create membership as OWNER
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: Role.OWNER,
        is_active: true,
        joined_at: new Date().toISOString()
      });
    
    if (memberError) {
      // Rollback all operations
      await Promise.all(rollbackOperations.map(op => op().catch(() => {})));
      throw Errors.internal('Failed to create organization membership');
    }
    
    // Generate tokens
    const accessToken = generateAccessToken({
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.is_super_admin,
      organizationId: organization.id,
      role: Role.OWNER
    });
    
    const refreshTokenData = generateRefreshToken();
    
    // Store refresh token hash
    await supabase
      .from('users')
      .update({
        refresh_token_hash: refreshTokenData.hash,
        refresh_token_expires_at: refreshTokenData.expiresAt.toISOString()
      })
      .eq('id', user.id);
    
    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshTokenData.token);
    
    // Audit log
    await AuditService.log({
      organizationId: organization.id,
      userId: user.id,
      action: AuditAction.CREATE,
      resourceType: 'organization',
      resourceId: organization.id,
      details: {
        orgName: organization.name,
        role: Role.OWNER
      },
      ipAddress: req.ip
    });
    
    // Send emails (async - don't block response)
    EmailService.sendWelcomeEmail(user, organization).catch(() => {});
    EmailService.sendVerificationEmail(user.email, verificationToken).catch(() => {});
    
    // Response without tokens (they're in cookies)
    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: Role.OWNER,
        emailVerified: false
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        subscriptionStatus: organization.subscription_status,
        trialEndsAt: organization.trial_ends_at,
        role: Role.OWNER
      },
      requiresEmailVerification: true
    }, 201);
    
  } catch (error) {
    // Execute rollback on any error
    await Promise.all(rollbackOperations.map(op => op().catch(() => {})));
    throw error;
  }
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const validated = loginSchema.parse(req.body);
  
  // Find user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', validated.email.toLowerCase())
    .single();
  
  if (userError || !user) {
    // Audit failed login attempt
    await AuditService.log({
      action: AuditAction.LOGIN_FAILED,
      resourceType: 'session',
      details: { 
        reason: 'user_not_found',
        email: validated.email.toLowerCase()
      },
      ipAddress: req.ip
    });
    throw Errors.unauthorized('Invalid email or password');
  }
  
  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    throw Errors.badRequest('ACCOUNT_LOCKED', `Account is locked. Try again in ${minutesLeft} minutes`);
  }
  
  // Verify password
  const isValidPassword = await bcrypt.compare(validated.password, user.password_hash);
  
  if (!isValidPassword) {
    // Increment failed attempts
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    let updates: any = { failed_login_attempts: failedAttempts };
    
    // Lock account after 5 failed attempts
    if (failedAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      updates.locked_until = lockUntil.toISOString();
      
      // Audit lockout
      await AuditService.log({
        userId: user.id,
        action: AuditAction.ACCOUNT_LOCKED,
        resourceType: 'user',
        resourceId: user.id,
        details: { reason: 'too_many_failed_attempts', failedAttempts },
        ipAddress: req.ip
      });
    }
    
    await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id);
    
    // Audit failed login
    await AuditService.log({
      userId: user.id,
      action: AuditAction.LOGIN_FAILED,
      resourceType: 'session',
      details: { reason: 'invalid_password', failedAttempts },
      ipAddress: req.ip
    });
    
    throw Errors.unauthorized('Invalid email or password');
  }
  
  // Check if account is active
  if (!user.is_active) {
    throw Errors.forbidden('Account has been deactivated');
  }
  
  // Clear failed attempts and update last login
  await supabase
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      last_login_ip: req.ip
    })
    .eq('id', user.id);
  
  // Determine organization context
  let organizationId: string | undefined;
  let memberRole: Role | undefined;
  let organization: any;
  
  if (validated.organizationId) {
    // Validate membership
    const { data: membership } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', validated.organizationId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (!membership) {
      throw Errors.forbidden('You are not a member of this organization');
    }
    
    organizationId = validated.organizationId;
    memberRole = membership.role as Role;
    
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();
    organization = org;
  } else {
    // Get user's organizations
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    if (memberships && memberships.length === 1) {
      organizationId = memberships[0].organization_id;
      memberRole = memberships[0].role as Role;
      organization = memberships[0].organizations;
    }
  }
  
  // Check trial expiration
  if (organization?.subscription_status === 'trial' && organization?.trial_ends_at) {
    if (new Date(organization.trial_ends_at) < new Date()) {
      throw Errors.forbidden('Trial period has expired');
    }
  }
  
  // Generate tokens
  const accessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.is_super_admin,
    organizationId,
    role: memberRole
  });
  
  const refreshTokenData = generateRefreshToken();
  
  // Store refresh token hash
  await supabase
    .from('users')
    .update({
      refresh_token_hash: refreshTokenData.hash,
      refresh_token_expires_at: refreshTokenData.expiresAt.toISOString()
    })
    .eq('id', user.id);
  
  // Set httpOnly cookies
  setAuthCookies(res, accessToken, refreshTokenData.token);
  
  // Audit log
  await AuditService.log({
    organizationId,
    userId: user.id,
    action: AuditAction.LOGIN,
    resourceType: 'session',
    details: { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    ipAddress: req.ip
  });
  
  // Response without tokens (they're in cookies)
  sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isSuperAdmin: user.is_super_admin,
      emailVerified: user.email_verified
    },
    ...(organization && {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        subscriptionStatus: organization.subscription_status,
        trialEndsAt: organization.trial_ends_at,
        role: memberRole
      }
    })
  });
}));

// POST /api/auth/logout
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const token = extractAccessToken(req);
  let userId: string | undefined;
  
  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      userId = decoded.sub;
      
      // Clear refresh token in database
      await supabase
        .from('users')
        .update({
          refresh_token_hash: null,
          refresh_token_expires_at: null
        })
        .eq('id', decoded.sub);
    }
  }
  
  // Clear cookies
  clearAuthCookies(res);
  
  // Audit log
  if (userId) {
    await AuditService.log({
      userId,
      action: AuditAction.LOGOUT,
      resourceType: 'session',
      ipAddress: req.ip
    });
  }
  
  sendSuccess(res, { message: 'Logged out successfully' });
}));

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.signedCookies?.refresh_token || req.cookies?.refresh_token;
  
  if (!refreshToken) {
    throw Errors.unauthorized('No refresh token provided');
  }
  
  const tokenHash = hashToken(refreshToken);
  
  // Find user by refresh token hash
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
  
  // Check account status
  if (!user.is_active) {
    throw Errors.forbidden('Account has been deactivated');
  }
  
  // Get organization context from request body or use previous
  let organizationId: string | undefined = req.body?.organizationId;
  let memberRole: Role | undefined;
  
  if (!organizationId) {
    // Get user's primary organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)
      .single();
    
    if (membership) {
      organizationId = membership.organization_id;
      memberRole = membership.role as Role;
    }
  } else {
    // Validate membership
    const { data: membership } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (membership) {
      memberRole = membership.role as Role;
    }
  }
  
  // Generate new tokens
  const newAccessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.is_super_admin,
    organizationId,
    role: memberRole
  });
  
  const newRefreshToken = generateRefreshToken();
  
  // Update refresh token in database (token rotation)
  await supabase
    .from('users')
    .update({
      refresh_token_hash: newRefreshToken.hash,
      refresh_token_expires_at: newRefreshToken.expiresAt.toISOString()
    })
    .eq('id', user.id);
  
  // Set new cookies
  setAuthCookies(res, newAccessToken, newRefreshToken.token);
  
  // Audit log
  await AuditService.log({
    userId: user.id,
    organizationId,
    action: AuditAction.TOKEN_REFRESH,
    resourceType: 'session',
    ipAddress: req.ip
  });
  
  sendSuccess(res, { message: 'Token refreshed successfully' });
}));

// GET /api/auth/me
router.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const token = extractAccessToken(req);
  
  if (!token) {
    throw Errors.unauthorized();
  }
  
  const decoded = verifyAccessToken(token);
  
  if (!decoded) {
    throw Errors.unauthorized('Invalid or expired token');
  }
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', decoded.sub)
    .single();
  
  if (error || !user) {
    throw Errors.unauthorized('User not found');
  }
  
  const response: any = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatar: user.avatar,
      jobTitle: user.job_title,
      bio: user.bio,
      phone: user.phone,
      locationCity: user.location_city,
      locationCountry: user.location_country,
      timezone: user.timezone,
      language: user.language,
      website: user.website,
      linkedinUrl: user.linkedin_url,
      twitterUrl: user.twitter_url,
      githubUrl: user.github_url,
      isSuperAdmin: user.is_super_admin,
      emailVerified: user.email_verified,
      createdAt: user.created_at
    }
  };
  
  // Include organization context if present
  if (decoded.organizationId) {
    const { data: member } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', decoded.organizationId)
      .eq('user_id', user.id)
      .single();
    
    const { data: organization } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', decoded.organizationId)
      .single();
    
    if (member && organization) {
      response.organization = {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logo_url,
        subscriptionStatus: organization.subscription_status,
        trialEndsAt: organization.trial_ends_at,
        role: member.role
      };
      
      response.membership = {
        role: member.role,
        department: member.department,
        title: member.title,
        joinedAt: member.joined_at,
        termStartDate: member.term_start_date,
        termEndDate: member.term_end_date
      };
    }
  }
  
  sendSuccess(res, response);
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const validated = forgotPasswordSchema.parse(req.body);
  
  // Find user
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', validated.email.toLowerCase())
    .single();
  
  // Always return success to prevent user enumeration
  if (!user) {
    sendSuccess(res, { message: 'If an account exists, a password reset email has been sent' });
    return;
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
  // Store reset token hash
  await supabase
    .from('users')
    .update({
      password_reset_token: crypto.createHash('sha256').update(resetToken).digest('hex'),
      password_reset_expires: resetExpires.toISOString()
    })
    .eq('id', user.id);
  
  // Send reset email
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  EmailService.sendPasswordResetEmail({
    to: user.email,
    resetUrl
  }).catch(() => {});
  
  // Audit log
  await AuditService.log({
    userId: user.id,
    action: AuditAction.PASSWORD_RESET_REQUEST,
    resourceType: 'user',
    resourceId: user.id,
    ipAddress: req.ip
  });
  
  sendSuccess(res, { message: 'If an account exists, a password reset email has been sent' });
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const validated = resetPasswordSchema.parse(req.body);
  
  const tokenHash = crypto.createHash('sha256').update(validated.token).digest('hex');
  
  // Find user by reset token
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('password_reset_token', tokenHash)
    .single();
  
  if (error || !user) {
    throw Errors.badRequest('INVALID_TOKEN', 'Invalid or expired reset token');
  }
  
  // Check if token is expired
  if (!user.password_reset_expires || new Date(user.password_reset_expires) < new Date()) {
    throw Errors.badRequest('TOKEN_EXPIRED', 'Reset token has expired');
  }
  
  // Hash new password
  const passwordHash = await bcrypt.hash(validated.password, 12);
  
  // Update password and clear reset token
  await supabase
    .from('users')
    .update({
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
      password_changed_at: new Date().toISOString()
    })
    .eq('id', user.id);
  
  // Invalidate all refresh tokens
  await supabase
    .from('users')
    .update({
      refresh_token_hash: null,
      refresh_token_expires_at: null
    })
    .eq('id', user.id);
  
  // Audit log
  await AuditService.log({
    userId: user.id,
    action: AuditAction.PASSWORD_RESET,
    resourceType: 'user',
    resourceId: user.id,
    ipAddress: req.ip
  });
  
  sendSuccess(res, { message: 'Password has been reset successfully. Please login again.' });
}));

// POST /api/auth/change-password (for authenticated users)
router.post('/change-password', asyncHandler(async (req: Request, res: Response) => {
  const validated = resetPasswordSchema.omit({ token: true }).extend({
    currentPassword: z.string().min(1, 'Current password is required')
  }).parse(req.body);
  
  // Get current user from token
  const token = extractAccessToken(req);
  if (!token) {
    throw Errors.unauthorized();
  }
  
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    throw Errors.unauthorized();
  }
  
  // Get user
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', decoded.sub)
    .single();
  
  if (error || !user) {
    throw Errors.notFound('User');
  }
  
  // Verify current password
  const isValid = await bcrypt.compare(validated.currentPassword, user.password_hash);
  if (!isValid) {
    throw new (Errors as any).unauthorized('Current password is incorrect');
  }
  
  // Hash new password
  const passwordHash = await bcrypt.hash(validated.password, 12);
  
  // Update password
  await supabase
    .from('users')
    .update({
      password_hash: passwordHash,
      password_changed_at: new Date().toISOString()
    })
    .eq('id', user.id);
  
  // Invalidate all refresh tokens (force re-login)
  await supabase
    .from('users')
    .update({
      refresh_token_hash: null,
      refresh_token_expires_at: null
    })
    .eq('id', user.id);
  
  // Clear cookies
  clearAuthCookies(res);
  
  // Audit log
  await AuditService.log({
    userId: user.id,
    action: AuditAction.PASSWORD_CHANGE,
    resourceType: 'user',
    resourceId: user.id,
    ipAddress: req.ip
  });
  
  sendSuccess(res, { 
    message: 'Password changed successfully. Please login again with your new password.' 
  });
}));

export default router;
