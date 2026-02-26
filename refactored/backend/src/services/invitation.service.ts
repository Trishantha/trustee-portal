/**
 * Invitation Service
 * Trustee Portal - User Invitation Flow
 * 
 * Business Rules:
 * - Admin can invite users by email
 * - Generate secure invitation tokens
 * - Send email invitations
 * - User completes registration
 * - User must be assigned a role before activation
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { InvitationModel } from '../models/invitation.model';
import { UserModel } from '../models/user.model';
import { OrganizationModel } from '../models/organization.model';
import { OrganizationMemberModel } from '../models/organization-member.model';
import { AuditService } from './audit.service';
import { EmailService } from './email.service';
import { RBACService } from './rbac.service';
import { AuthService } from './auth.service';
import { 
  CreateInvitationInput, 
  AcceptInvitationInput,
  OrganizationInvitation,
  Role,
  AuditAction,
  User,
  OrganizationMember
} from '../types';
import { AppError } from '../utils/api-response';
import { Logger } from '../utils/logger';

const INVITATION_EXPIRES_DAYS = 7;
const TOKEN_SALT_ROUNDS = 10;

export interface InvitationResult {
  invitation: OrganizationInvitation;
  acceptUrl: string;
}

export interface AcceptInvitationResult {
  user: User;
  member: OrganizationMember;
  accessToken: string;
  refreshToken: string;
}

export class InvitationService {
  /**
   * Create invitation hash (for secure storage)
   */
  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  
  /**
   * Generate secure invitation token
   */
  private static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Validate role can be assigned
   */
  private static validateRole(role: Role, inviterRole: Role): void {
    const validRoles = RBACService.getInvitableRoles(inviterRole);
    
    if (!validRoles.includes(role)) {
      throw new AppError(403, 'INVALID_ROLE', 
        `Cannot invite users with role '${role}' with your current role`);
    }
  }
  
  /**
   * Create invitation
   * Business Rule: Admin adds user by email with role assignment
   */
  static async createInvitation(
    input: CreateInvitationInput,
    ipAddress?: string
  ): Promise<InvitationResult> {
    // Validate inviter has permission to invite
    const inviter = await OrganizationMemberModel.findByUserAndOrg(
      input.invitedBy, 
      input.organizationId
    );
    
    if (!inviter) {
      throw new AppError(403, 'NOT_ORG_MEMBER', 'You are not a member of this organization');
    }
    
    // Check if role can be assigned
    this.validateRole(input.role, inviter.role);
    
    // Check if organization exists
    const organization = await OrganizationModel.findById(input.organizationId);
    if (!organization) {
      throw new AppError(404, 'ORG_NOT_FOUND', 'Organization not found');
    }
    
    // Check if user limit reached
    const memberCount = await OrganizationMemberModel.countActiveByOrg(input.organizationId);
    if (memberCount >= organization.maxMembers) {
      throw new AppError(403, 'MEMBER_LIMIT_REACHED', 
        'Organization has reached the maximum member limit');
    }
    
    // Check if user already exists
    const existingUser = await UserModel.findByEmail(input.email);
    if (existingUser) {
      // Check if already a member
      const existingMember = await OrganizationMemberModel.findByUserAndOrg(
        existingUser.id,
        input.organizationId
      );
      
      if (existingMember) {
        if (existingMember.isActive) {
          throw new AppError(409, 'ALREADY_MEMBER', 
            'This user is already a member of the organization');
        } else {
          // Reactivate instead of new invitation
          await OrganizationMemberModel.reactivate(existingMember.id, input.role);
          
          // Audit log
          await AuditService.log({
            organizationId: input.organizationId,
            userId: input.invitedBy,
            action: AuditAction.ROLE_CHANGE,
            resourceType: 'organization_member',
            resourceId: existingMember.id,
            details: { 
              targetUserId: existingUser.id,
              action: 'reactivate',
              newRole: input.role
            },
            ipAddress
          });
          
          // Send notification
          EmailService.sendReactivationEmail(existingUser.email, organization.name).catch(() => {});
          
          throw new AppError(200, 'MEMBER_REACTIVATED', 
            'Existing member has been reactivated');
        }
      }
    }
    
    // Check for existing pending invitation
    const existingInvitation = await InvitationModel.findPendingByEmail(
      input.organizationId,
      input.email
    );
    
    if (existingInvitation) {
      // Resend existing invitation
      const token = this.generateToken();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRES_DAYS);
      
      await InvitationModel.updateToken(existingInvitation.id, tokenHash, expiresAt);
      
      // Send email
      const inviterUser = await UserModel.findById(input.invitedBy);
      const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
      
      EmailService.sendInvitationEmail({
        to: input.email,
        organizationName: organization.name,
        inviterName: inviterUser ? `${inviterUser.firstName} ${inviterUser.lastName}` : 'Admin',
        role: input.role,
        department: input.department,
        acceptUrl
      }).catch(() => {});
      
      // Audit log
      await AuditService.log({
        organizationId: input.organizationId,
        userId: input.invitedBy,
        action: AuditAction.INVITE,
        resourceType: 'invitation',
        resourceId: existingInvitation.id,
        details: { 
          email: input.email,
          role: input.role,
          action: 'resend'
        },
        ipAddress
      });
      
      return {
        invitation: existingInvitation,
        acceptUrl
      };
    }
    
    // Calculate term dates
    const termLengthYears = input.termLengthYears || organization.termSettings?.defaultTermLengthYears || 3;
    const termStartDate = input.termStartDate || new Date();
    const termEndDate = new Date(termStartDate);
    termEndDate.setFullYear(termEndDate.getFullYear() + termLengthYears);
    
    // Create invitation
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRES_DAYS);
    
    const invitation = await InvitationModel.create({
      organizationId: input.organizationId,
      email: input.email.toLowerCase(),
      role: input.role,
      department: input.department,
      title: input.title,
      tokenHash,
      invitedBy: input.invitedBy,
      expiresAt,
      termLengthYears,
      termStartDate
    });
    
    // Send invitation email
    const inviterUser = await UserModel.findById(input.invitedBy);
    const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
    
    EmailService.sendInvitationEmail({
      to: input.email,
      organizationName: organization.name,
      inviterName: inviterUser ? `${inviterUser.firstName} ${inviterUser.lastName}` : 'Admin',
      role: input.role,
      department: input.department,
      acceptUrl
    }).catch(err => {
      Logger.warn('Failed to send invitation email', { 
        error: err.message, 
        invitationId: invitation.id 
      });
    });
    
    // Audit log
    await AuditService.log({
      organizationId: input.organizationId,
      userId: input.invitedBy,
      action: AuditAction.INVITE,
      resourceType: 'invitation',
      resourceId: invitation.id,
      details: { 
        email: input.email,
        role: input.role,
        department: input.department,
        termLengthYears,
        termStartDate
      },
      ipAddress
    });
    
    return {
      invitation,
      acceptUrl
    };
  }
  
  /**
   * Validate invitation token
   */
  static async validateInvitation(token: string): Promise<{
    valid: boolean;
    invitation?: OrganizationInvitation;
    organization?: any;
    message?: string;
  }> {
    const tokenHash = this.hashToken(token);
    const invitation = await InvitationModel.findByTokenHash(tokenHash);
    
    if (!invitation) {
      return { valid: false, message: 'Invalid invitation token' };
    }
    
    if (invitation.acceptedAt) {
      return { valid: false, message: 'Invitation has already been accepted' };
    }
    
    if (invitation.expiresAt < new Date()) {
      return { valid: false, message: 'Invitation has expired' };
    }
    
    const organization = await OrganizationModel.findById(invitation.organizationId);
    if (!organization || !organization.isActive) {
      return { valid: false, message: 'Organization is no longer active' };
    }
    
    // Check if user already exists
    const existingUser = await UserModel.findByEmail(invitation.email);
    
    return {
      valid: true,
      invitation,
      organization,
      requiresRegistration: !existingUser
    };
  }
  
  /**
   * Accept invitation
   * Business Rule: User completes registration and is assigned role
   */
  static async acceptInvitation(
    input: AcceptInvitationInput,
    ipAddress?: string
  ): Promise<AcceptInvitationResult> {
    // Validate invitation
    const validation = await this.validateInvitation(input.token);
    if (!validation.valid || !validation.invitation) {
      throw new AppError(400, 'INVALID_INVITATION', validation.message || 'Invalid invitation');
    }
    
    const { invitation, organization } = validation;
    
    // Validate password if new user
    const passwordValidation = AuthService.validatePassword(input.password);
    if (!passwordValidation.valid) {
      throw new AppError(400, 'WEAK_PASSWORD', passwordValidation.errors[0]);
    }
    
    // Start transaction
    let user: User;
    let isNewUser = false;
    
    try {
      // Check if user exists
      const existingUser = await UserModel.findByEmail(invitation.email);
      
      if (existingUser) {
        // Existing user - add to organization
        user = existingUser;
        
        // Check if already member
        const existingMember = await OrganizationMemberModel.findByUserAndOrg(
          user.id,
          invitation.organizationId
        );
        
        if (existingMember) {
          throw new AppError(409, 'ALREADY_MEMBER', 'You are already a member of this organization');
        }
      } else {
        // Create new user
        const passwordHash = await AuthService.hashPassword(input.password);
        
        user = await UserModel.create({
          email: invitation.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: invitation.role, // Assign the role from invitation
          emailVerified: true // Email verified through invitation
        });
        
        isNewUser = true;
      }
      
      // Calculate term end date
      const termEndDate = invitation.termLengthYears && invitation.termStartDate
        ? new Date(invitation.termStartDate)
        : null;
      
      if (termEndDate && invitation.termLengthYears) {
        termEndDate.setFullYear(termEndDate.getFullYear() + invitation.termLengthYears);
      }
      
      // Create organization membership with assigned role
      const member = await OrganizationMemberModel.create({
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role, // Business rule: Role assigned before activation
        department: invitation.department,
        title: invitation.title,
        isActive: true,
        joinedAt: new Date(),
        termStartDate: invitation.termStartDate,
        termEndDate,
        termLengthYears: invitation.termLengthYears
      });
      
      // Mark invitation as accepted
      await InvitationModel.markAccepted(invitation.id, user.id);
      
      // Generate tokens
      const accessToken = AuthService.generateToken(user, organization.id, invitation.role);
      const refreshToken = AuthService.generateRefreshToken();
      
      await UserModel.setRefreshToken(user.id, refreshToken.token, refreshToken.expiresAt);
      
      // Audit log
      await AuditService.log({
        organizationId: invitation.organizationId,
        userId: user.id,
        action: AuditAction.ACCEPT_INVITE,
        resourceType: 'invitation',
        resourceId: invitation.id,
        details: { 
          isNewUser,
          role: invitation.role,
          invitedBy: invitation.invitedBy
        },
        ipAddress
      });
      
      // Send welcome email
      if (isNewUser) {
        EmailService.sendWelcomeEmailToInvitedUser(user, organization).catch(() => {});
      } else {
        EmailService.sendAddedToOrganizationEmail(user.email, organization.name, invitation.role).catch(() => {});
      }
      
      // Notify inviter
      const inviter = await UserModel.findById(invitation.invitedBy);
      if (inviter) {
        EmailService.sendInvitationAcceptedNotification(
          inviter.email,
          user.email,
          organization.name
        ).catch(() => {});
      }
      
      return {
        user,
        member,
        accessToken: accessToken as string,
        refreshToken: refreshToken.token
      };
      
    } catch (error) {
      Logger.error('Accept invitation failed', { 
        error, 
        invitationId: invitation.id,
        email: invitation.email 
      });
      throw error;
    }
  }
  
  /**
   * Cancel invitation
   */
  static async cancelInvitation(
    invitationId: string,
    cancelledBy: string,
    ipAddress?: string
  ): Promise<void> {
    const invitation = await InvitationModel.findById(invitationId);
    
    if (!invitation) {
      throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
    }
    
    if (invitation.acceptedAt) {
      throw new AppError(400, 'ALREADY_ACCEPTED', 'Invitation has already been accepted');
    }
    
    // Check permissions
    const member = await OrganizationMemberModel.findByUserAndOrg(
      cancelledBy,
      invitation.organizationId
    );
    
    if (!member) {
      throw new AppError(403, 'NOT_ORG_MEMBER', 'You are not a member of this organization');
    }
    
    // Only inviter or admin can cancel
    if (invitation.invitedBy !== cancelledBy && !RBACService.hasMinimumRole(member.role, Role.ADMIN)) {
      throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'Cannot cancel this invitation');
    }
    
    await InvitationModel.cancel(invitationId);
    
    // Audit log
    await AuditService.log({
      organizationId: invitation.organizationId,
      userId: cancelledBy,
      action: AuditAction.DELETE,
      resourceType: 'invitation',
      resourceId: invitationId,
      details: { email: invitation.email },
      ipAddress
    });
  }
  
  /**
   * Get pending invitations for organization
   */
  static async getPendingInvitations(
    organizationId: string,
    userId: string
  ): Promise<OrganizationInvitation[]> {
    // Check permissions
    const member = await OrganizationMemberModel.findByUserAndOrg(userId, organizationId);
    if (!member) {
      throw new AppError(403, 'NOT_ORG_MEMBER', 'You are not a member of this organization');
    }
    
    if (!RBACService.hasPermission(member.role, Permission.USER_VIEW)) {
      throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'Cannot view invitations');
    }
    
    return InvitationModel.findPendingByOrganization(organizationId);
  }
  
  /**
   * Resend invitation
   */
  static async resendInvitation(
    invitationId: string,
    resentBy: string,
    ipAddress?: string
  ): Promise<InvitationResult> {
    const invitation = await InvitationModel.findById(invitationId);
    
    if (!invitation) {
      throw new AppError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
    }
    
    if (invitation.acceptedAt) {
      throw new AppError(400, 'ALREADY_ACCEPTED', 'Invitation has already been accepted');
    }
    
    // Check permissions
    const member = await OrganizationMemberModel.findByUserAndOrg(
      resentBy,
      invitation.organizationId
    );
    
    if (!member) {
      throw new AppError(403, 'NOT_ORG_MEMBER', 'You are not a member of this organization');
    }
    
    // Only inviter or admin can resend
    if (invitation.invitedBy !== resentBy && !RBACService.hasMinimumRole(member.role, Role.ADMIN)) {
      throw new AppError(403, 'INSUFFICIENT_PERMISSIONS', 'Cannot resend this invitation');
    }
    
    // Generate new token
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRES_DAYS);
    
    await InvitationModel.updateToken(invitationId, tokenHash, expiresAt);
    
    // Send email
    const organization = await OrganizationModel.findById(invitation.organizationId);
    const inviterUser = await UserModel.findById(invitation.invitedBy);
    const acceptUrl = `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`;
    
    EmailService.sendInvitationEmail({
      to: invitation.email,
      organizationName: organization?.name || 'Organization',
      inviterName: inviterUser ? `${inviterUser.firstName} ${inviterUser.lastName}` : 'Admin',
      role: invitation.role,
      department: invitation.department,
      acceptUrl
    }).catch(() => {});
    
    // Audit log
    await AuditService.log({
      organizationId: invitation.organizationId,
      userId: resentBy,
      action: AuditAction.UPDATE,
      resourceType: 'invitation',
      resourceId: invitationId,
      details: { action: 'resend' },
      ipAddress
    });
    
    return {
      invitation: await InvitationModel.findById(invitationId) as OrganizationInvitation,
      acceptUrl
    };
  }
}
