/**
 * Organization Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/database';
import { asyncHandler, sendSuccess, Errors } from '../utils/api-response';
import type { Request, Response } from 'express';
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
router.get('/my', asyncHandler(async (req: Request, res: Response) => {
  const { data: memberships, error } = await supabase
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('user_id', req.user!.id)
    .eq('is_active', true)
    .order('joined_at', { ascending: false });
  
  if (error) {
    throw Errors.internal('Failed to fetch organizations');
  }
  
  const organizations = memberships?.map(m => ({
    id: m.organizations.id,
    name: m.organizations.name,
    slug: m.organizations.slug,
    logoUrl: m.organizations.logo_url,
    customDomain: m.organizations.custom_domain,
    primaryColor: m.organizations.primary_color,
    subscriptionStatus: m.organizations.subscription_status,
    trialEndsAt: m.organizations.trial_ends_at,
    userRole: m.role,
    joinedAt: m.joined_at,
    plan: null // Simplified for now
  })) || [];
  
  sendSuccess(res, { organizations });
}));

// GET /api/organizations/:id - Get organization details
router.get('/:id', requirePermission(Permission.ORG_VIEW), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { data: organization, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !organization) {
    throw Errors.notFound('Organization');
  }
  
  // Get member counts by role
  const { data: memberCounts } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', id)
    .eq('is_active', true);
  
  const counts = (memberCounts || []).reduce((acc: Record<string, number>, curr) => {
    acc[curr.role] = (acc[curr.role] || 0) + 1;
    return acc;
  }, {});
  
  sendSuccess(res, {
    organization: {
      id: organization.id,
      clientId: organization.client_id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      websiteUrl: organization.website_url,
      customDomain: organization.custom_domain,
      logoUrl: organization.logo_url,
      faviconUrl: organization.favicon_url,
      primaryColor: organization.primary_color,
      secondaryColor: organization.secondary_color,
      contactEmail: organization.contact_email,
      contactPhone: organization.contact_phone,
      address: organization.address,
      subscriptionStatus: organization.subscription_status,
      trialEndsAt: organization.trial_ends_at,
      subscriptionEndsAt: organization.subscription_ends_at,
      settings: organization.settings,
      termSettings: {
        defaultTermLengthYears: organization.default_term_length_years,
        maxConsecutiveTerms: organization.max_consecutive_terms,
        renewalNotificationDays: organization.renewal_notification_days,
        autoRenewalPolicy: organization.auto_renewal_policy,
        enableTermTracking: organization.enable_term_tracking
      },
      createdAt: organization.created_at,
      updatedAt: organization.updated_at
    },
    usage: {
      totalMembers: Object.values(counts).reduce((a: number, b: number) => a + b, 0),
      roleCounts: counts,
      storageUsedMb: organization.storage_used_mb,
      maxStorageMb: organization.max_storage_mb
    }
  });
}));

// GET /api/organizations/:id/members - List members
router.get('/:id/members', requirePermission(Permission.USER_VIEW), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string || 'active';
  
  // Build query
  let memberQuery = supabase
    .from('organization_members')
    .select('*, users(id, email, first_name, last_name, avatar)', { count: 'exact' })
    .eq('organization_id', id);
  
  if (status !== 'all') {
    memberQuery = memberQuery.eq('is_active', status === 'active');
  }
  
  const { data: members, count, error: memberError } = await memberQuery
    .order('joined_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  
  if (memberError) {
    throw Errors.internal('Failed to fetch members');
  }
  
  // Get pending invitations
  const { data: invitations } = await supabase
    .from('organization_invitations')
    .select('*, inviter:invited_by(first_name, last_name)')
    .eq('organization_id', id)
    .is('accepted_at', null)
    .is('cancelled_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false });
  
  const memberData = members?.map(m => ({
    id: m.id,
    userId: m.users.id,
    email: m.users.email,
    firstName: m.users.first_name,
    lastName: m.users.last_name,
    avatar: m.users.avatar,
    role: m.role,
    department: m.department,
    title: m.title,
    isActive: m.is_active,
    joinedAt: m.joined_at,
    lastActiveAt: m.last_active_at,
    termStartDate: m.term_start_date,
    termEndDate: m.term_end_date,
    termLengthYears: m.term_length_years
  })) || [];
  
  sendSuccess(res, {
    members: memberData,
    pendingInvitations: invitations?.map(i => ({
      id: i.id,
      email: i.email,
      role: i.role,
      department: i.department,
      invitedAt: i.invited_at,
      expiresAt: i.expires_at,
      invitedBy: i.inviter ? `${i.inviter.first_name} ${i.inviter.last_name}` : 'Unknown'
    })) || [],
    meta: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      hasNext: page < Math.ceil((count || 0) / limit),
      hasPrev: page > 1
    }
  });
}));

// POST /api/organizations/:id/invitations - Invite member
router.post('/:id/invitations', 
  requirePermission(Permission.USER_INVITE),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const validated = createInvitationSchema.parse(req.body);
    
    // Check inviter's permissions
    const { data: inviterMembership } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', id)
      .eq('user_id', req.user!.id)
      .eq('is_active', true)
      .single();
    
    if (!inviterMembership) {
      throw Errors.forbidden('Not a member of this organization');
    }
    
    // Validate role can be assigned
    if (!RBACService.canManageRole(inviterMembership.role as Role, validated.role)) {
      throw Errors.forbidden(`Cannot invite users with role '${validated.role}'`);
    }
    
    // Check organization limits
    const { data: organization } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!organization) {
      throw Errors.notFound('Organization');
    }
    
    const { count: memberCount } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('is_active', true);
    
    if ((memberCount || 0) >= organization.max_members) {
      throw new (Errors as any).forbidden('Organization has reached the maximum member limit');
    }
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', validated.email.toLowerCase())
      .single();
    
    if (existingUser) {
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', id)
        .eq('user_id', existingUser.id)
        .single();
      
      if (existingMember?.is_active) {
        throw Errors.conflict('ALREADY_MEMBER', 'This user is already a member of the organization');
      }
    }
    
    // Check for existing pending invitation
    const { data: existingInvitation } = await supabase
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', id)
      .eq('email', validated.email.toLowerCase())
      .is('accepted_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (existingInvitation) {
      throw Errors.conflict('INVITATION_PENDING', 'An invitation is already pending for this email');
    }
    
    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: id,
        email: validated.email.toLowerCase(),
        role: validated.role,
        department: validated.department,
        title: validated.title,
        token_hash: tokenHash,
        invited_by: req.user!.id,
        expires_at: expiresAt.toISOString(),
        term_length_years: validated.termLengthYears,
        term_start_date: validated.termStartDate
      })
      .select()
      .single();
    
    if (inviteError || !invitation) {
      throw Errors.internal('Failed to create invitation');
    }
    
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
        invitedAt: invitation.invited_at,
        expiresAt: invitation.expires_at
      },
      acceptUrl
    }, 201);
  })
);

// PUT /api/organizations/:id/members/:memberId - Update member
router.put('/:id/members/:memberId',
  requirePermission(Permission.USER_UPDATE),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, memberId } = req.params;
    const validated = updateMemberSchema.parse(req.body);
    
    // Get target member
    const { data: targetMember, error: memberError } = await supabase
      .from('organization_members')
      .select('*, users(*)')
      .eq('id', memberId)
      .eq('organization_id', id)
      .single();
    
    if (memberError || !targetMember) {
      throw Errors.notFound('Member');
    }
    
    // Cannot modify own role
    if (targetMember.user_id === req.user!.id && validated.role) {
      throw Errors.badRequest('CANNOT_MODIFY_SELF', 'Cannot change your own role. Transfer ownership first.');
    }
    
    // Check permissions for role change
    if (validated.role) {
      const { data: changerMembership } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', id)
        .eq('user_id', req.user!.id)
        .eq('is_active', true)
        .single();
      
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
    const updateData: any = {};
    if (validated.role !== undefined) updateData.role = validated.role;
    if (validated.department !== undefined) updateData.department = validated.department;
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.isActive !== undefined) updateData.is_active = validated.isActive;
    
    const { data: updatedMember, error: updateError } = await supabase
      .from('organization_members')
      .update(updateData)
      .eq('id', memberId)
      .select()
      .single();
    
    if (updateError || !updatedMember) {
      throw Errors.internal('Failed to update member');
    }
    
    // Audit log
    await AuditService.log({
      organizationId: id,
      userId: req.user!.id,
      action: AuditAction.ROLE_CHANGE,
      resourceType: 'organization_member',
      resourceId: memberId,
      details: {
        targetUserId: targetMember.user_id,
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
  asyncHandler(async (req: Request, res: Response) => {
    const { id, memberId } = req.params;
    
    const { data: targetMember, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('id', memberId)
      .eq('organization_id', id)
      .single();
    
    if (error || !targetMember) {
      throw Errors.notFound('Member');
    }
    
    // Cannot remove yourself
    if (targetMember.user_id === req.user!.id) {
      throw Errors.badRequest('CANNOT_REMOVE_SELF', 'Cannot remove yourself. Transfer ownership first.');
    }
    
    // Soft delete
    await supabase
      .from('organization_members')
      .update({ is_active: false })
      .eq('id', memberId);
    
    // Audit log
    await AuditService.log({
      organizationId: id,
      userId: req.user!.id,
      action: AuditAction.DELETE,
      resourceType: 'organization_member',
      resourceId: memberId,
      details: { targetUserId: targetMember.user_id },
      ipAddress: req.ip
    });
    
    sendSuccess(res, { message: 'Member removed successfully' });
  })
);

export default router;
