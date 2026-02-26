/**
 * Audit Service
 * Comprehensive audit logging for compliance
 */

import { prisma } from '../config/database';
import { AuditLog, CreateAuditLogInput, AuditAction } from '../types';
import { Logger } from '../utils/logger';

export class AuditService {
  /**
   * Log an audit event
   */
  static async log(input: CreateAuditLogInput): Promise<AuditLog> {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          details: input.details || {},
          ipAddress: input.ipAddress,
          userAgent: input.userAgent
        }
      });
      
      return auditLog as AuditLog;
    } catch (error) {
      Logger.error('Failed to create audit log', error as Error, { input });
      throw error;
    }
  }
  
  /**
   * Get audit logs for organization
   */
  static async getOrganizationLogs(
    organizationId: string,
    options: {
      action?: AuditAction;
      resourceType?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const {
      action,
      resourceType,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = options;
    
    const where: any = { organizationId };
    
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (userId) where.userId = userId;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);
    
    return { logs: logs as AuditLog[], total };
  }
  
  /**
   * Get recent activity for user
   */
  static async getUserActivity(
    userId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    
    return logs as AuditLog[];
  }
  
  /**
   * Get resource history
   */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string
  ): Promise<AuditLog[]> {
    const logs = await prisma.auditLog.findMany({
      where: {
        resourceType,
        resourceId
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return logs as AuditLog[];
  }
  
  /**
   * Clean up old audit logs
   */
  static async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });
    
    Logger.info(`Cleaned up ${result.count} old audit logs`);
    return result.count;
  }
}
