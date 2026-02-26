/**
 * Authentication Routes
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/database';
import { Logger } from '../utils/logger';
import { asyncHandler, sendSuccess, Errors } from '../utils/api-response';
import { AuditService } from '../services/audit.service';
import { EmailService } from '../services/email.service';
import { RBACService, ROLE_DISPLAY_NAMES } from '../services/rbac.service';
import { Role, AuditAction, JWTPayload } from '../types';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  organizationId: z.string().uuid().optional()
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

const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required')
});

// Helper functions
const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const generateRefreshToken = () => {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  return { token, expiresAt };
};

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// POST /api/auth/register - Create organization with owner
router.post('/register', asyncHandler(async (req, res) => {
  // Validate input
  const validated = registerSchema.parse(req.body);
  
  // Check if email exists
  const existingUser = await prisma.user.findUnique({
    where: { email: validated.email.toLowerCase() }
  });
  
  if (existingUser) {
    throw Errors.conflict('EMAIL_EXISTS', 'An account with this email already exists');
  }
  
  // Check slug availability
  const existingOrg = await prisma.organization.findUnique({
    where: { slug: validated.organizationSlug }
  });
  
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
  
  // Create user and organization in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create user as OWNER
    const user = await tx.user.create({
      data: {
        email: validated.email.toLowerCase(),
        passwordHash,
        firstName: validated.firstName,
        lastName: validated.lastName,
        timezone: validated.timezone,
        language: validated.language,
        verificationToken,
        emailVerified: false
      }
    });
    
    // Create organization
    const organization = await tx.organization.create({
      data: {
        clientId: `TRUSTEE-${Date.now()}`,
        name: validated.organizationName,
        slug: validated.organizationSlug,
        billingEmail: validated.email,
        createdBy: user.id,
        subscriptionStatus: 'trial',
        trialEndsAt,
        maxMembers: 5,
        settings: {
          timezone: validated.timezone,
          language: validated.language
        }
      }
    });
    
    // Create membership as OWNER
    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: Role.OWNER,
        isActive: true,
        joinedAt: new Date()
      }
    });
    
    return { user, organization };
  });
  
  // Generate tokens
  const accessToken = generateToken({
    sub: result.user.id,
    email: result.user.email,
    isSuperAdmin: result.user.isSuperAdmin,
    organizationId: result.organization.id,
    role: Role.OWNER
  });
  
  const refreshToken = generateRefreshToken();
  
  // Store refresh token
  await prisma.user.update({
    where: { id: result.user.id },
    data: {
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt
    }
  });
  
  // Audit log
  await AuditService.log({
    organizationId: result.organization.id,
    userId: result.user.id,
    action: AuditAction.CREATE,
    resourceType: 'organization',
    resourceId: result.organization.id,
    details: {
      orgName: result.organization.name,
      role: Role.OWNER
    },
    ipAddress: req.ip
  });
  
  // Send emails (async)
  EmailService.sendWelcomeEmail(result.user, result.organization).catch(() => {});
  EmailService.sendVerificationEmail(result.user.email, verificationToken).catch(() => {});
  
  sendSuccess(res, {
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: Role.OWNER,
      emailVerified: false
    },
    organization: {
      id: result.organization.id,
      name: result.organization.name,
      slug: result.organization.slug,
      subscriptionStatus: result.organization.subscriptionStatus,
      trialEndsAt: result.organization.trialEndsAt,
      role: Role.OWNER
    },
    accessToken,
    refreshToken: refreshToken.token,
    requiresEmailVerification: true
  }, 201);
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const validated = loginSchema.parse(req.body);
  
  // Find user
  const user = await prisma.user.findUnique({
    where: { email: validated.email.toLowerCase() }
  });
  
  if (!user) {
    throw Errors.unauthorized('Invalid email or password');
  }
  
  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new (Errors as any).badRequest('ACCOUNT_LOCKED', `Account is locked. Try again in ${minutesLeft} minutes`);
  }
  
  // Verify password
  const isValidPassword = await bcrypt.compare(validated.password, user.passwordHash);
  
  if (!isValidPassword) {
    // Increment failed attempts
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } }
    });
    
    // Lock account if max attempts reached
    if (updatedUser.failedLoginAttempts >= 5) {
      const lockedUntil = new Date(Date.now() + 30 * 60000);
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil }
      });
      
      EmailService.sendSecurityAlert(user.email, 'account_locked', { ipAddress: req.ip }).catch(() => {});
      
      throw new (Errors as any).badRequest('ACCOUNT_LOCKED', 'Too many failed attempts. Account locked for 30 minutes');
    }
    
    throw Errors.unauthorized('Invalid email or password');
  }
  
  // Check if account is active
  if (!user.isActive) {
    throw new (Errors as any).forbidden('Account has been deactivated');
  }
  
  // Clear failed attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lastLoginAt: new Date(),
      lastLoginIp: req.ip
    }
  });
  
  // Determine organization context
  let organizationId: string | undefined;
  let memberRole: Role | undefined;
  let organization: any;
  
  if (validated.organizationId) {
    // Validate membership
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: validated.organizationId,
        userId: user.id,
        isActive: true
      }
    });
    
    if (!membership) {
      throw new (Errors as any).forbidden('You are not a member of this organization');
    }
    
    organizationId = validated.organizationId;
    memberRole = membership.role as Role;
    organization = await prisma.organization.findUnique({
      where: { id: organizationId }
    });
  } else {
    // Get user's organizations
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, isActive: true },
      include: { organization: true }
    });
    
    if (memberships.length === 1) {
      organizationId = memberships[0].organizationId;
      memberRole = memberships[0].role as Role;
      organization = memberships[0].organization;
    }
  }
  
  // Check trial expiration
  if (organization?.subscriptionStatus === 'trial' && organization?.trialEndsAt) {
    if (new Date(organization.trialEndsAt) < new Date()) {
      throw new (Errors as any).forbidden('Trial period has expired');
    }
  }
  
  // Generate tokens
  const accessToken = generateToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    organizationId,
    role: memberRole
  });
  
  const refreshToken = generateRefreshToken();
  
  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt
    }
  });
  
  // Audit log
  await AuditService.log({
    organizationId,
    userId: user.id,
    action: AuditAction.LOGIN,
    resourceType: 'session',
    details: { ipAddress: req.ip },
    ipAddress: req.ip
  });
  
  sendSuccess(res, {
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
  });
}));

// POST /api/auth/accept-invitation
router.post('/accept-invitation', asyncHandler(async (req, res) => {
  const validated = acceptInvitationSchema.parse(req.body);
  
  // Find invitation
  const tokenHash = hashToken(validated.token);
  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      tokenHash,
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: { gt: new Date() }
    }
  });
  
  if (!invitation) {
    throw Errors.badRequest('INVALID_INVITATION', 'Invalid or expired invitation');
  }
  
  // Check organization
  const organization = await prisma.organization.findUnique({
    where: { id: invitation.organizationId }
  });
  
  if (!organization || !organization.isActive) {
    throw Errors.badRequest('INVALID_INVITATION', 'Organization is no longer active');
  }
  
  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: invitation.email }
  });
  
  if (user) {
    // Check if already a member
    const existingMember = await prisma.organizationMember.findFirst({
      where: {
        organizationId: invitation.organizationId,
        userId: user.id
      }
    });
    
    if (existingMember) {
      throw Errors.conflict('ALREADY_MEMBER', 'You are already a member of this organization');
    }
  } else {
    // Create new user
    const passwordHash = await bcrypt.hash(validated.password, 12);
    
    user = await prisma.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        firstName: validated.firstName,
        lastName: validated.lastName,
        emailVerified: true
      }
    });
  }
  
  // Calculate term end date
  let termEndDate: Date | null = null;
  if (invitation.termStartDate && invitation.termLengthYears) {
    termEndDate = new Date(invitation.termStartDate);
    termEndDate.setFullYear(termEndDate.getFullYear() + invitation.termLengthYears);
  }
  
  // Create membership
  const member = await prisma.organizationMember.create({
    data: {
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role as Role,
      department: invitation.department,
      title: invitation.title,
      isActive: true,
      joinedAt: new Date(),
      termStartDate: invitation.termStartDate,
      termEndDate,
      termLengthYears: invitation.termLengthYears
    }
  });
  
  // Mark invitation as accepted
  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: {
      acceptedAt: new Date(),
      acceptedBy: user.id
    }
  });
  
  // Generate tokens
  const accessToken = generateToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    organizationId: invitation.organizationId,
    role: invitation.role as Role
  });
  
  const refreshToken = generateRefreshToken();
  
  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt
    }
  });
  
  // Audit log
  await AuditService.log({
    organizationId: invitation.organizationId,
    userId: user.id,
    action: AuditAction.ACCEPT_INVITE,
    resourceType: 'invitation',
    resourceId: invitation.id,
    details: {
      role: invitation.role,
      invitedBy: invitation.invitedBy
    },
    ipAddress: req.ip
  });
  
  // Send emails
  EmailService.sendAddedToOrganizationEmail(
    user.email,
    organization.name,
    ROLE_DISPLAY_NAMES[invitation.role as Role]
  ).catch(() => {});
  
  const inviter = await prisma.user.findUnique({
    where: { id: invitation.invitedBy }
  });
  
  if (inviter) {
    EmailService.sendInvitationAcceptedNotification(
      inviter.email,
      user.email,
      organization.name
    ).catch(() => {});
  }
  
  sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerified
    },
    member: {
      id: member.id,
      role: member.role,
      department: member.department,
      title: member.title
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: invitation.role
    },
    accessToken,
    refreshToken: refreshToken.token
  });
}));

// GET /api/auth/me
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw Errors.unauthorized();
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub }
    });
    
    if (!user) {
      throw Errors.unauthorized('User not found');
    }
    
    const response: any = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        jobTitle: user.jobTitle,
        bio: user.bio,
        phone: user.phone,
        locationCity: user.locationCity,
        locationCountry: user.locationCountry,
        timezone: user.timezone,
        language: user.language,
        website: user.website,
        linkedinUrl: user.linkedinUrl,
        twitterUrl: user.twitterUrl,
        githubUrl: user.githubUrl,
        isSuperAdmin: user.isSuperAdmin,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }
    };
    
    // Include organization context if present
    if (decoded.organizationId) {
      const member = await prisma.organizationMember.findFirst({
        where: {
          organizationId: decoded.organizationId,
          userId: user.id
        }
      });
      
      const organization = await prisma.organization.findUnique({
        where: { id: decoded.organizationId }
      });
      
      if (member && organization) {
        response.organization = {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logoUrl: organization.logoUrl,
          subscriptionStatus: organization.subscriptionStatus,
          trialEndsAt: organization.trialEndsAt,
          role: member.role
        };
        
        response.membership = {
          role: member.role,
          department: member.department,
          title: member.title,
          joinedAt: member.joinedAt,
          termStartDate: member.termStartDate,
          termEndDate: member.termEndDate
        };
      }
    }
    
    sendSuccess(res, response);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw (Errors as any).tokenExpired();
    }
    throw Errors.unauthorized('Invalid token');
  }
}));

export default router;
