/**
 * Invitation Routes
 */

import { Router } from 'express';
import { supabase } from '../config/database';
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
import type { Request, Response } from 'express';

router.get('/validate', asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token as string;
  
  if (!token) {
    throw Errors.badRequest('INVALID_TOKEN', 'Token is required');
  }
  
  const tokenHash = hashToken(token);
  const { data: invitation, error } = await supabase
    .from('organization_invitations')
    .select('*, organizations(id, name, slug)')
    .eq('token_hash', tokenHash)
    .is('accepted_at', null)
    .is('cancelled_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error || !invitation) {
    throw Errors.badRequest('INVALID_INVITATION', 'Invalid or expired invitation');
  }
  
  sendSuccess(res, {
    valid: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      department: invitation.department,
      organization: invitation.organizations
    }
  });
}));

// DELETE /api/invitations/:id - Cancel invitation
router.delete('/:id', requirePermission(Permission.USER_INVITE), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { data: invitation, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !invitation) {
    throw Errors.notFound('Invitation');
  }
  
  if (invitation.accepted_at) {
    throw Errors.badRequest('ALREADY_ACCEPTED', 'Invitation has already been accepted');
  }
  
  // Check permissions
  const { data: membership } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', invitation.organization_id)
    .eq('user_id', req.user!.id)
    .eq('is_active', true)
    .single();
  
  if (!membership) {
    throw Errors.forbidden('Not a member of this organization');
  }
  
  // Only inviter or admin can cancel
  if (invitation.invited_by !== req.user!.id && 
      !RBACService.hasPermission(membership.role as any, Permission.USER_INVITE)) {
    throw Errors.forbidden('Cannot cancel this invitation');
  }
  
  await supabase
    .from('organization_invitations')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id);
  
  await AuditService.log({
    organizationId: invitation.organization_id,
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
router.post('/:id/resend', requirePermission(Permission.USER_INVITE), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { data: invitation, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !invitation) {
    throw Errors.notFound('Invitation');
  }
  
  if (invitation.accepted_at) {
    throw Errors.badRequest('ALREADY_ACCEPTED', 'Invitation has already been accepted');
  }
  
  // Check permissions
  const { data: membership } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', invitation.organization_id)
    .eq('user_id', req.user!.id)
    .eq('is_active', true)
    .single();
  
  if (!membership) {
    throw Errors.forbidden('Not a member of this organization');
  }
  
  if (invitation.invited_by !== req.user!.id && 
      !RBACService.hasPermission(membership.role as any, Permission.USER_INVITE)) {
    throw Errors.forbidden('Cannot resend this invitation');
  }
  
  // Generate new token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  await supabase
    .from('organization_invitations')
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString()
    })
    .eq('id', id);
  
  // Get organization for email
  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', invitation.organization_id)
    .single();
  
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
    organizationId: invitation.organization_id,
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
