/**
 * User Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { asyncHandler, sendSuccess, Errors } from '../utils/api-response';
import { authenticate } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { AuditAction } from '../types';
import bcrypt from 'bcryptjs';

const router = Router();

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
  website: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  twitterUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional()
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

router.use(authenticate);

// GET /api/users/me - Get current user profile
router.get('/me', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id }
  });
  
  if (!user) {
    throw Errors.notFound('User');
  }
  
  sendSuccess(res, {
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
  });
}));

// PUT /api/users/profile - Update profile
router.put('/profile', asyncHandler(async (req, res) => {
  const validated = updateProfileSchema.parse(req.body);
  
  const updatedUser = await prisma.user.update({
    where: { id: req.user!.id },
    data: validated
  });
  
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
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      avatar: updatedUser.avatar,
      jobTitle: updatedUser.jobTitle,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      locationCity: updatedUser.locationCity,
      locationCountry: updatedUser.locationCountry,
      timezone: updatedUser.timezone,
      language: updatedUser.language,
      website: updatedUser.website,
      linkedinUrl: updatedUser.linkedinUrl,
      twitterUrl: updatedUser.twitterUrl,
      githubUrl: updatedUser.githubUrl
    }
  });
}));

// POST /api/users/change-password - Change password
router.post('/change-password', asyncHandler(async (req, res) => {
  const validated = changePasswordSchema.parse(req.body);
  
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id }
  });
  
  if (!user) {
    throw Errors.notFound('User');
  }
  
  // Verify current password
  const isValid = await bcrypt.compare(validated.currentPassword, user.passwordHash);
  
  if (!isValid) {
    throw new (Errors as any).unauthorized('Current password is incorrect');
  }
  
  // Hash new password
  const passwordHash = await bcrypt.hash(validated.newPassword, 12);
  
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      passwordHash,
      passwordChangedAt: new Date()
    }
  });
  
  await AuditService.log({
    userId: req.user!.id,
    action: AuditAction.PASSWORD_CHANGE,
    resourceType: 'user',
    resourceId: req.user!.id,
    ipAddress: req.ip
  });
  
  sendSuccess(res, { message: 'Password changed successfully' });
}));

export default router;
