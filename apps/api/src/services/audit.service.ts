/**
 * Audit Service
 * Comprehensive audit logging for compliance
 */

import { supabase } from '../config/database';
import { AuditLog, CreateAuditLogInput, AuditAction } from '../types';
import { Logger } from '../utils/logger';

export class AuditService {
  /**
   * Log an audit event
   */
  static async log(input: CreateAuditLogInput): Promise<AuditLog> {
    try {
      const { data: auditLog, error } = await supabase
        .from('audit_logs')
        .insert({
          organization_id: input.organizationId,
          user_id: input.userId,
          action: input.action,
          resource_type: input.resourceType,
          resource_id: input.resourceId,
          details: input.details || {},
          ip_address: input.ipAddress,
          user_agent: input.userAgent
        })
        .select()
        .single();
      
      if (error) throw error;
      
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
    
    let query = supabase
      .from('audit_logs')
      .select('*, users(id, email, first_name, last_name)', { count: 'exact' })
      .eq('organization_id', organizationId);
    
    if (action) query = query.eq('action', action);
    if (resourceType) query = query.eq('resource_type', resourceType);
    if (userId) query = query.eq('user_id', userId);
    if (startDate) query = query.gte('created_at', startDate.toISOString());
    if (endDate) query = query.lte('created_at', endDate.toISOString());
    
    const { data: logs, count, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    
    if (error) {
      Logger.error('Failed to get organization logs', error);
      return { logs: [], total: 0 };
    }
    
    return { logs: logs as AuditLog[], total: count || 0 };
  }
  
  /**
   * Get recent activity for user
   */
  static async getUserActivity(
    userId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      Logger.error('Failed to get user activity', error);
      return [];
    }
    
    return logs as AuditLog[];
  }
  
  /**
   * Get resource history
   */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string
  ): Promise<AuditLog[]> {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false });
    
    if (error) {
      Logger.error('Failed to get resource history', error);
      return [];
    }
    
    return logs as AuditLog[];
  }
  
  /**
   * Clean up old audit logs
   */
  static async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const { error, count } = await supabase
      .from('audit_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());
    
    if (error) {
      Logger.error('Failed to cleanup old logs', error);
      return 0;
    }
    
    Logger.info(`Cleaned up ${count} old audit logs`);
    return count || 0;
  }
}
