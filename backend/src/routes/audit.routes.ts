/**
 * Audit Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { asyncHandler, sendSuccess, sendPaginated, Errors } from '../utils/api-response';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { Permission, AuditAction } from '../types';

const router = Router();

router.use(authenticate);

// GET /api/audit/organizations/:id/logs - Get audit logs for organization
router.get('/organizations/:id/logs',
  requirePermission(Permission.AUDIT_VIEW),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const action = req.query.action as AuditAction;
    const resourceType = req.query.resourceType as string;
    const userId = req.query.userId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    
    const { logs, total } = await AuditService.getOrganizationLogs(id, {
      action,
      resourceType,
      userId,
      startDate,
      endDate,
      page,
      limit
    });
    
    sendPaginated(res, logs, total, page, limit);
  })
);

// GET /api/audit/users/me/activity - Get current user activity
router.get('/users/me/activity', asyncHandler(async (req, res) => {
  const logs = await AuditService.getUserActivity(req.user!.id, 50);
  
  sendSuccess(res, { logs });
}));

// GET /api/audit/resources/:type/:id/history - Get resource history
router.get('/resources/:type/:id/history',
  requirePermission(Permission.AUDIT_VIEW),
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;
    
    const logs = await AuditService.getResourceHistory(type, id);
    
    sendSuccess(res, { logs });
  })
);

export default router;
