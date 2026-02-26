/**
 * User Routes
 * With proper RBAC enforcement
 */

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/database';
import { asyncHandler, sendSuccess, Errors } from '../utils/api-response';
import type { Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { AuditAction, Permission, Role } from '../types';
import bcrypt from 'bcryptjs';

const router = Router();

// Validation schemas
const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  jobTitle: z.string().optional(),
  bio: z.string().optional(),
  phone: z.string().optional(),
  locationCity: z.string().optional(),
  locationCountry: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  twitterUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal(''))
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
});

const listUsersSchema = z.object({
  page: z.string().optional().transform(v => parseInt(v || '1')),
  limit: z.string().optional().transform(v => Math.min(parseInt(v || '20'), 100)),
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.string().optional().transform(v => v === 'true')
});

// All routes require authentication
router.use(authenticate);

// GET /api/users - List users with pagination (requires USER_VIEW permission)
router.get('/', 
  requirePermission(Permission.USER_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, search, role, isActive } = listUsersSchema.parse(req.query);
    
    // Build query
    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });
    
    // Apply filters
    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }
    
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }
    
    // Apply pagination
    const { data: users, count, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    
    if (error) {
      throw Errors.internal('Failed to fetch users');
    }
    
    // Audit log
    await AuditService.log({
      userId: req.user!.id,
      action: AuditAction.VIEW,
      resourceType: 'user_list',
      details: { page, limit, search, role, isActive },
      ipAddress: req.ip
    });
    
    const totalPages = Math.ceil((count || 0) / limit);
    
    sendSuccess(res, {
      users: users?.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: user.avatar,
        isActive: user.is_active,
        isSuperAdmin: user.is_super_admin,
        emailVerified: user.email_verified,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at
      })) || [],
      meta: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  })
);

// GET /api/users/me - Get current user profile
router.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user!.id)
    .single();
  
  if (error || !user) {
    throw Errors.notFound('User');
  }
  
  sendSuccess(res, {
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
  });
}));

// GET /api/users/:id - Get user by ID (requires USER_VIEW permission)
router.get('/:id', 
  requirePermission(Permission.USER_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !user) {
      throw Errors.notFound('User');
    }
    
    // Audit log for viewing specific user
    await AuditService.log({
      userId: req.user!.id,
      action: AuditAction.VIEW,
      resourceType: 'user',
      resourceId: id,
      ipAddress: req.ip
    });
    
    sendSuccess(res, {
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
      isActive: user.is_active,
      isSuperAdmin: user.is_super_admin,
      emailVerified: user.email_verified,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    });
  })
);

// PUT /api/users/profile - Update own profile
router.put('/profile', asyncHandler(async (req: Request, res: Response) => {
  const validated = updateProfileSchema.parse(req.body);
  
  // Map camelCase to snake_case for database
  const updateData: any = {};
  if (validated.firstName !== undefined) updateData.first_name = validated.firstName;
  if (validated.lastName !== undefined) updateData.last_name = validated.lastName;
  if (validated.jobTitle !== undefined) updateData.job_title = validated.jobTitle;
  if (validated.bio !== undefined) updateData.bio = validated.bio;
  if (validated.phone !== undefined) updateData.phone = validated.phone;
  if (validated.locationCity !== undefined) updateData.location_city = validated.locationCity;
  if (validated.locationCountry !== undefined) updateData.location_country = validated.locationCountry;
  if (validated.timezone !== undefined) updateData.timezone = validated.timezone;
  if (validated.language !== undefined) updateData.language = validated.language;
  if (validated.website !== undefined) updateData.website = validated.website || null;
  if (validated.linkedinUrl !== undefined) updateData.linkedin_url = validated.linkedinUrl || null;
  if (validated.twitterUrl !== undefined) updateData.twitter_url = validated.twitterUrl || null;
  if (validated.githubUrl !== undefined) updateData.github_url = validated.githubUrl || null;
  
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', req.user!.id)
    .select()
    .single();
  
  if (error || !updatedUser) {
    throw Errors.internal('Failed to update profile');
  }
  
  await AuditService.log({
    userId: req.user!.id,
    action: AuditAction.UPDATE,
    resourceType: 'user',
    resourceId: req.user!.id,
    details: { fields: Object.keys(validated) },
    ipAddress: req.ip
  });
  
  sendSuccess(res, {
    message: 'Profile updated successfully',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.first_name,
      lastName: updatedUser.last_name,
      avatar: updatedUser.avatar,
      jobTitle: updatedUser.job_title,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      locationCity: updatedUser.location_city,
      locationCountry: updatedUser.location_country,
      timezone: updatedUser.timezone,
      language: updatedUser.language,
      website: updatedUser.website,
      linkedinUrl: updatedUser.linkedin_url,
      twitterUrl: updatedUser.twitter_url,
      githubUrl: updatedUser.github_url
    }
  });
}));

// PUT /api/users/:id - Update user (requires USER_UPDATE permission)
router.put('/:id', 
  requirePermission(Permission.USER_UPDATE),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const validated = updateProfileSchema.parse(req.body);
    
    // Check if user exists
    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!targetUser) {
      throw Errors.notFound('User');
    }
    
    // Cannot modify super admin unless you're super admin
    if (targetUser.is_super_admin && !req.user!.isSuperAdmin) {
      throw Errors.forbidden('Cannot modify super admin users');
    }
    
    // Map camelCase to snake_case
    const updateData: any = {};
    if (validated.firstName !== undefined) updateData.first_name = validated.firstName;
    if (validated.lastName !== undefined) updateData.last_name = validated.lastName;
    if (validated.jobTitle !== undefined) updateData.job_title = validated.jobTitle;
    if (validated.bio !== undefined) updateData.bio = validated.bio;
    if (validated.phone !== undefined) updateData.phone = validated.phone;
    if (validated.locationCity !== undefined) updateData.location_city = validated.locationCity;
    if (validated.locationCountry !== undefined) updateData.location_country = validated.locationCountry;
    if (validated.timezone !== undefined) updateData.timezone = validated.timezone;
    if (validated.language !== undefined) updateData.language = validated.language;
    
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !updatedUser) {
      throw Errors.internal('Failed to update user');
    }
    
    await AuditService.log({
      userId: req.user!.id,
      action: AuditAction.UPDATE,
      resourceType: 'user',
      resourceId: id,
      details: { fields: Object.keys(validated), targetUserId: id },
      ipAddress: req.ip
    });
    
    sendSuccess(res, {
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        avatar: updatedUser.avatar
      }
    });
  })
);

// DELETE /api/users/:id - Delete user (requires USER_DELETE permission)
router.delete('/:id', 
  requirePermission(Permission.USER_DELETE),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    // Cannot delete yourself
    if (id === req.user!.id) {
      throw Errors.badRequest('CANNOT_DELETE_SELF', 'Cannot delete your own account');
    }
    
    // Check if user exists
    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!targetUser) {
      throw Errors.notFound('User');
    }
    
    // Cannot delete super admin unless you're super admin
    if (targetUser.is_super_admin && !req.user!.isSuperAdmin) {
      throw Errors.forbidden('Cannot delete super admin users');
    }
    
    // Soft delete - deactivate user
    const { error } = await supabase
      .from('users')
      .update({ 
        is_active: false,
        email: `${targetUser.email}.inactive.${Date.now()}`, // Prevent email reuse
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) {
      throw Errors.internal('Failed to delete user');
    }
    
    // Deactivate organization memberships
    await supabase
      .from('organization_members')
      .update({ is_active: false })
      .eq('user_id', id);
    
    await AuditService.log({
      userId: req.user!.id,
      action: AuditAction.DELETE,
      resourceType: 'user',
      resourceId: id,
      details: { targetUserEmail: targetUser.email },
      ipAddress: req.ip
    });
    
    sendSuccess(res, { message: 'User deleted successfully' });
  })
);

// POST /api/users/change-password - Change own password
router.post('/change-password', asyncHandler(async (req: Request, res: Response) => {
  const validated = changePasswordSchema.parse(req.body);
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user!.id)
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
  const passwordHash = await bcrypt.hash(validated.newPassword, 12);
  
  await supabase
    .from('users')
    .update({
      password_hash: passwordHash,
      password_changed_at: new Date().toISOString()
    })
    .eq('id', req.user!.id);
  
  await AuditService.log({
    userId: req.user!.id,
    action: AuditAction.PASSWORD_CHANGE,
    resourceType: 'user',
    resourceId: req.user!.id,
    ipAddress: req.ip
  });
  
  sendSuccess(res, { message: 'Password changed successfully' });
}));

// POST /api/users/:id/deactivate - Deactivate user (requires USER_UPDATE permission)
router.post('/:id/deactivate', 
  requirePermission(Permission.USER_UPDATE),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    if (id === req.user!.id) {
      throw Errors.badRequest('CANNOT_DEACTIVATE_SELF', 'Cannot deactivate your own account');
    }
    
    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!targetUser) {
      throw Errors.notFound('User');
    }
    
    if (targetUser.is_super_admin && !req.user!.isSuperAdmin) {
      throw Errors.forbidden('Cannot deactivate super admin users');
    }
    
    await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', id);
    
    // Deactivate memberships
    await supabase
      .from('organization_members')
      .update({ is_active: false })
      .eq('user_id', id);
    
    await AuditService.log({
      userId: req.user!.id,
      action: AuditAction.UPDATE,
      resourceType: 'user',
      resourceId: id,
      details: { action: 'deactivate' },
      ipAddress: req.ip
    });
    
    sendSuccess(res, { message: 'User deactivated successfully' });
  })
);

// POST /api/users/:id/activate - Activate user (requires USER_UPDATE permission)
router.post('/:id/activate', 
  requirePermission(Permission.USER_UPDATE),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!targetUser) {
      throw Errors.notFound('User');
    }
    
    await supabase
      .from('users')
      .update({ is_active: true, failed_login_attempts: 0, locked_until: null })
      .eq('id', id);
    
    await AuditService.log({
      userId: req.user!.id,
      action: AuditAction.UPDATE,
      resourceType: 'user',
      resourceId: id,
      details: { action: 'activate' },
      ipAddress: req.ip
    });
    
    sendSuccess(res, { message: 'User activated successfully' });
  })
);

export default router;
