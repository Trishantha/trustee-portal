/**
 * Organization Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { asyncHandler, sendSuccess, sendPaginated, Errors } from '../utils/api-response';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { RBACService, ROLE_DISPLAY_NAMES } from '../services/rbac.service';
import { AuditService } from '../services/audit.service';
import { EmailService } from '../services/email.service';
import { Role, Permission, AuditAction } from '../types';
import crypto from 'crypto';

const router = Router();

// Validation schemas
const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(Role).refine(
    (role) => role !== Role.SUPER_ADMIN && role !== Role.OWNER,
    'Cannot invite with this role'
  ),
  department: z.string().optional(),
  title: z.string().optional(),
  termLengthYears: z.number().min(1).max(10).optional(),
  termStartDate: z.string().datetime().optional()
});

const updateMemberSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  isActive: z.boolean().optional()
});

// Hash token helper
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// All routes require authentication
router.use(authenticate);

// GET /api/organizations/my - Get user's organizations
router.get('/my', asyncHandler(async (req, res) => {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: req.user!.id, isActive: true },
    include: {
      organization: {
        include: {
          subscriptionPlan: true
        }
      }
    },
    orderBy: { joinedAt: 'desc' }
  });
  
  const organizations = memberships.map(m => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    logoUrl: m.organization.logoUrl,
    customDomain: m.organization.customDomain,
    primaryColor: m.organization.primaryColor,
    subscriptionStatus: m.organization.subscriptionStatus,
    trialEndsAt: m.organization.trialEndsAt,
    userRole: m.role,
    joinedAt: m.joinedAt,
    plan: m.organization.subscriptionPlan ? {
      name: m.organization.subscriptionPlan.name,
      maxUsers: m.organization.subscriptionPlan.maxUsers,
      maxStorageMb: m.organization.subscriptionPlan.maxStorageMb
    } : null
  }));
  
  sendSuccess(res, { organizations });
}));

// GET /api/organizations/:id - Get organization details
router.get('/:id', requirePermission(Permission.ORG_VIEW), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const organization = await prisma.organization.findUnique({
    where: { id }
  });
  
  if (!organization) {
    throw Errors.notFound('Organization');
  }
  
  // Get member counts
  const memberCounts = await prisma.organizationMember.groupBy({
    by: ['role'],
    where: { organizationId: id, isActive: true },
    _count: { role: true }
  });
  
  const counts = memberCounts.reduce((acc, curr) => {
    acc[curr.role] = curr._count.role;
    return acc;
  }, {} as Record<string, number>);
  
  sendSuccess(res, {
    organization: {
      id: organization.id,
      clientId: organization.clientId,
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      websiteUrl: organization.websiteUrl,
      customDomain: organization.customDomain,
      logoUrl: organization.logoUrl,
      faviconUrl: organization.faviconUrl,
      primaryColor: organization.primaryColor,
      secondaryColor: organization.secondaryColor,
      contactEmail: organization.contactEmail,
      contactPhone: organization.contactPhone,
      address: organization.address,
      subscriptionStatus: organization.subscriptionStatus,
      trialEndsAt: organization.trialEndsAt,
      subscriptionEndsAt: organization.subscriptionEndsAt,
      settings: organization.settings,
      termSettings: {
        defaultTermLengthYears: organization.defaultTermLengthYears,
        maxConsecutiveTerms: organization.maxConsecutiveTerms,
        renewalNotificationDays: organization.renewalNotificationDays,
        autoRenewalPolicy: organization.autoRenewalPolicy,
        enableTermTracking: organization.enableTermTracking
      },
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt
    },
    usage: {
      totalMembers: Object.values(counts).reduce((a, b) => a + b, 0),
      roleCounts: counts,
      storageUsedMb: organization.storageUsedMb,
      maxStorageMb: organization.maxStorageMb
    }
  });
}));

// GET /api/organizations/:id/members - List members
router.get('/:id/members', requirePermission(Permission.USER_VIEW), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string || 'active';
  
  const where: any = { organizationId: id };
  if (status !== 'all') {
    where.isActive = status === 'active';
  }
  
  const [members, total] = await Promise.all([
    prisma.organizationMember.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      },
      orderBy: { joinedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.organizationMember.count({ where })
  ]);
  
  // Get pending invitations
  const invitations = await prisma.organizationInvitation.findMany({
    where: {
      organizationId: id,
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: { gt: new Date() }
    },
    include: {
      inviter: {
        select: {
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: { invitedAt: 'desc' }
  });
  
  const memberData = members.map(m => ({
    id: m.id,
    userId: m.user.id,
    email: m.user.email,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    avatar: m.user.avatar,
    role: m.role,
    department: m.department,
    title: m.title,
    isActive: m.isActive,
    joinedAt: m.joinedAt,
    lastActiveAt: m.lastActiveAt,
    termStartDate: m.termStartDate,
    termEndDate: m.termEndDate,
    termLengthYears: m.termLengthYears
  }));
  
  sendSuccess(res, {
    members: memberData,
    pendingInvitations: invitations.map(i => ({
      id: i.id,
      email: i.email,
      role: i.role,
      department: i.department,
      invitedAt: i.invitedAt,
      expiresAt: i.expiresAt,
      invitedBy: i.inviter ? `${i.inviter.firstName} ${i.inviter.lastName}` : 'Unknown'
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  });
}));

// POST /api/organizations/:id/invitations - Invite member
router.post('/:id/invitations', 
  requirePermission(Permission.USER_INVITE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const validated = createInvitationSchema.parse(req.body);
    
    // Check inviter's permissions
    const inviterMembership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: id,
        userId: req.user!.id,
        isActive: true
      }
    });
    
    if (!inviterMembership) {
      throw Errors.forbidden('Not a member of this organization');
    }
    
    // Validate role can be assigned
    if (!RBACService.canManageRole(inviterMembership.role as Role, validated.role)) {
      throw Errors.forbidden(`Cannot invite users with role '${validated.role}'`);
    }
    
    // Check organization limits
    const organization = await prisma.organization.findUnique({
      where: { id }
    });
    
    if (!organization) {
      throw Errors.notFound('Organization');
    }
    
    const memberCount = await prisma.organizationMember.count({
      where: { organizationId: id, isActive: true }
    });
    
    if (memberCount >= organization.maxMembers) {
      throw new (Errors as any).forbidden('Organization has reached the maximum member limit');
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() }
    });
    
    if (existingUser) {
      const existingMember = await prisma.organizationMember.findFirst({
        where: {
          organizationId: id,
          userId: existingUser.id
        }
      });
      
      if (existingMember?.isActive) {
        throw Errors.conflict('ALREADY_MEMBER', 'This user is already a member of the organization');
      }
    }
    
    // Check for existing pending invitation
    const existingInvitation = await prisma.organizationInvitation.findFirst({
      where: {
        organizationId: id,
        email: validated.email.toLowerCase(),
        acceptedAt: null,
        cancelledAt: null,
        expiresAt: { gt: new Date() }
      }
    });
    
    if (existingInvitation) {
      throw Errors.conflict('INVITATION_PENDING', 'An invitation is already pending for this email');
    }
    
    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Create invitation
    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: id,
        email: validated.email.toLowerCase(),
        role: validated.role,
        department: validated.department,
        title: validated.title,
        tokenHash,
        invitedBy: req.user!.id,
        expiresAt,
        termLengthYears: validated.termLengthYears,
        termStartDate: validated.termStartDate ? new Date(validated.termStartDate) : null
      }
    });
    
    // Send invitation email
    const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
    
    EmailService.sendInvitationEmail({
      to: validated.email,
      organizationName: organization.name,
      inviterName: `${req.user!.firstName} ${req.user!.lastName}`,
      role: ROLE_DISPLAY_NAMES[validated.role],
      department: validated.department,
      acceptUrl
    }).catch(() => {});
    
    // Audit log
    await AuditService.log({
      organizationId: id,
      userId: req.user!.id,
      action: AuditAction.INVITE,
      resourceType: 'invitation',
      resourceId: invitation.id,
      details: {
        email: validated.email,
        role: validated.role,
        department: validated.department
      },
      ipAddress: req.ip
    });
    
    sendSuccess(res, {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        department: invitation.department,
        invitedAt: invitation.invitedAt,
        expiresAt: invitation.expiresAt
      },
      acceptUrl
    }, 201);
  })
);

// PUT /api/organizations/:id/members/:memberId - Update member
router.put('/:id/members/:memberId',
  requirePermission(Permission.USER_UPDATE),
  asyncHandler(async (req, res) => {
    const { id, memberId } = req.params;
    const validated = updateMemberSchema.parse(req.body);
    
    // Get target member
    const targetMember = await prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId: id
      },
      include: { user: true }
    });
    
    if (!targetMember) {
      throw Errors.notFound('Member');
    }
    
    // Cannot modify own role
    if (targetMember.userId === req.user!.id && validated.role) {
      throw Errors.badRequest('CANNOT_MODIFY_SELF', 'Cannot change your own role. Transfer ownership first.');
    }
    
    // Check permissions for role change
    if (validated.role) {
      const changerMembership = await prisma.organizationMember.findFirst({
        where: {
          organizationId: id,
          userId: req.user!.id,
          isActive: true
        }
      });
      
      if (!changerMembership) {
        throw Errors.forbidden();
      }
      
      const transitionCheck = RBACService.canTransitionRole(
        targetMember.role as Role,
        validated.role,
        changerMembership.role as Role
      );
      
      if (!transitionCheck.valid) {
        throw Errors.forbidden(transitionCheck.reason);
      }
    }
    
    // Update member
    const updatedMember = await prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        role: validated.role,
        department: validated.department,
        title: validated.title,
        isActive: validated.isActive
      }
    });
    
    // Audit log
    await AuditService.log({
      organizationId: id,
      userId: req.user!.id,
      action: AuditAction.ROLE_CHANGE,
      resourceType: 'organization_member',
      resourceId: memberId,
      details: {
        targetUserId: targetMember.userId,
        previousRole: targetMember.role,
        newRole: validated.role,
        department: validated.department,
        title: validated.title,
        isActive: validated.isActive
      },
      ipAddress: req.ip
    });
    
    sendSuccess(res, {
      message: 'Member updated successfully',
      member: updatedMember
    });
  })
);

// DELETE /api/organizations/:id/members/:memberId - Remove member
router.delete('/:id/members/:memberId',
  requirePermission(Permission.USER_DELETE),
  asyncHandler(async (req, res) => {
    const { id, memberId } = req.params;
    
    const targetMember = await prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId: id
      }
    });
    
    if (!targetMember) {
      throw Errors.notFound('Member');
    }
    
    // Cannot remove yourself
    if (targetMember.userId === req.user!.id) {
      throw Errors.badRequest('CANNOT_REMOVE_SELF', 'Cannot remove yourself. Transfer ownership first.');
    }
    
    // Soft delete
    await prisma.organizationMember.update({
      where: { id: memberId },
      data: { isActive: false }
    });
    
    // Audit log
    await AuditService.log({
      organizationId: id,
      userId: req.user!.id,
      action: AuditAction.DELETE,
      resourceType: 'organization_member',
      resourceId: memberId,
      details: { targetUserId: targetMember.userId },
      ipAddress: req.ip
    });
    
    sendSuccess(res, { message: 'Member removed successfully' });
  })
);

export default router;
