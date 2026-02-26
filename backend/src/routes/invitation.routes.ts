/**
 * Invitation Routes
 */

import { Router } from 'express';
import { prisma } from '../config/database';
import { asyncHandler, sendSuccess, Errors } from '../utils/api-response';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { RBACService } from '../services/rbac.service';
import { AuditService } from '../services/audit.service';
import { Permission, AuditAction } from '../types';
import crypto from 'crypto';

const router = Router();

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// All routes require authentication
router.use(authenticate);

// GET /api/invitations/validate - Validate invitation token (public)
router.get('/validate', asyncHandler(async (req, res) => {
  const token = req.query.token as string;
  
  if (!token) {
    throw Errors.badRequest('INVALID_TOKEN', 'Token is required');
  }
  
  const tokenHash = hashToken(token);
  const invitation = await prisma.organizationInvitation.findFirst({
    where: {
      tokenHash,
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: { gt: new Date() }
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });
  
  if (!invitation) {
    throw Errors.badRequest('INVALID_INVITATION', 'Invalid or expired invitation');
  }
  
  sendSuccess(res, {
    valid: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      department: invitation.department,
      organization: invitation.organization
    }
  });
}));

// DELETE /api/invitations/:id - Cancel invitation
router.delete('/:id', requirePermission(Permission.USER_INVITE), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { id }
  });
  
  if (!invitation) {
    throw Errors.notFound('Invitation');
  }
  
  if (invitation.acceptedAt) {
    throw Errors.badRequest('ALREADY_ACCEPTED', 'Invitation has already been accepted');
  }
  
  // Check permissions
  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId: invitation.organizationId,
      userId: req.user!.id,
      isActive: true
    }
  });
  
  if (!membership) {
    throw Errors.forbidden('Not a member of this organization');
  }
  
  // Only inviter or admin can cancel
  if (invitation.invitedBy !== req.user!.id && 
      !RBACService.hasMinimumRole(membership.role as any, Permission.USER_INVITE)) {
    throw Errors.forbidden('Cannot cancel this invitation');
  }
  
  await prisma.organizationInvitation.update({
    where: { id },
    data: { cancelledAt: new Date() }
  });
  
  await AuditService.log({
    organizationId: invitation.organizationId,
    userId: req.user!.id,
    action: AuditAction.CANCEL_INVITE,
    resourceType: 'invitation',
    resourceId: id,
    details: { email: invitation.email },
    ipAddress: req.ip
  });
  
  sendSuccess(res, { message: 'Invitation cancelled successfully' });
}));

// POST /api/invitations/:id/resend - Resend invitation
router.post('/:id/resend', requirePermission(Permission.USER_INVITE), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { id }
  });
  
  if (!invitation) {
    throw Errors.notFound('Invitation');
  }
  
  if (invitation.acceptedAt) {
    throw Errors.badRequest('ALREADY_ACCEPTED', 'Invitation has already been accepted');
  }
  
  // Check permissions
  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId: invitation.organizationId,
      userId: req.user!.id,
      isActive: true
    }
  });
  
  if (!membership) {
    throw Errors.forbidden('Not a member of this organization');
  }
  
  if (invitation.invitedBy !== req.user!.id && 
      !RBACService.hasMinimumRole(membership.role as any, Permission.USER_INVITE)) {
    throw Errors.forbidden('Cannot resend this invitation');
  }
  
  // Generate new token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  await prisma.organizationInvitation.update({
    where: { id },
    data: {
      tokenHash,
      expiresAt
    }
  });
  
  // Get organization for email
  const organization = await prisma.organization.findUnique({
    where: { id: invitation.organizationId }
  });
  
  const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
  
  // Send email
  const { EmailService } = await import('../services/email.service');
  EmailService.sendInvitationEmail({
    to: invitation.email,
    organizationName: organization?.name || 'Organization',
    inviterName: `${req.user!.firstName} ${req.user!.lastName}`,
    role: invitation.role,
    department: invitation.department,
    acceptUrl
  }).catch(() => {});
  
  await AuditService.log({
    organizationId: invitation.organizationId,
    userId: req.user!.id,
    action: AuditAction.UPDATE,
    resourceType: 'invitation',
    resourceId: id,
    details: { action: 'resend' },
    ipAddress: req.ip
  });
  
  sendSuccess(res, {
    message: 'Invitation resent successfully',
    acceptUrl
  });
}));

export default router;
