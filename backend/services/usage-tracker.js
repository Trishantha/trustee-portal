/**
 * Usage Tracker Service
 * Phase 3: Usage Tracking & Plan Limits
 */

const db = require('../config/database');

class UsageTracker {
    /**
     * Track storage usage for an organization
     */
    async trackStorage(organizationId, bytesAdded = 0, bytesRemoved = 0) {
        try {
            const mbAdded = bytesAdded / (1024 * 1024);
            const mbRemoved = bytesRemoved / (1024 * 1024);

            await db.run(
                `UPDATE organizations 
                 SET storage_used_mb = storage_used_mb + ? - ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [mbAdded, mbRemoved, organizationId]
            );

            // Log significant changes
            if (mbAdded > 10 || mbRemoved > 10) {
                await this.logUsage(organizationId, 'storage', {
                    added_mb: mbAdded,
                    removed_mb: mbRemoved,
                    net_change_mb: mbAdded - mbRemoved
                });
            }
        } catch (error) {
            console.error('Track storage error:', error);
        }
    }

    /**
     * Get current usage for an organization
     */
    async getUsage(organizationId) {
        try {
            const organization = await db.get(
                `SELECT o.*, p.max_users, p.max_storage_mb, p.max_committees
                 FROM organizations o
                 LEFT JOIN subscription_plans p ON o.plan_id = p.id
                 WHERE o.id = ?`,
                [organizationId]
            );

            if (!organization) {
                return null;
            }

            // Get current counts
            const [userCount, committeeCount, documentCount, taskCount] = await Promise.all([
                db.get(
                    'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND is_active = 1',
                    [organizationId]
                ),
                db.get(
                    'SELECT COUNT(*) as count FROM committees WHERE organization_id = ? AND is_active = 1',
                    [organizationId]
                ),
                db.get(
                    'SELECT COUNT(*) as count FROM documents WHERE organization_id = ?',
                    [organizationId]
                ),
                db.get(
                    'SELECT COUNT(*) as count FROM tasks WHERE organization_id = ?',
                    [organizationId]
                )
            ]);

            return {
                organization_id: organizationId,
                users: {
                    current: userCount.count,
                    limit: organization.max_users || 5,
                    available: (organization.max_users || 5) - userCount.count,
                    percentage: Math.round((userCount.count / (organization.max_users || 5)) * 100)
                },
                storage: {
                    current_mb: Math.round(organization.storage_used_mb || 0),
                    limit_mb: organization.max_storage_mb || 5120,
                    available_mb: (organization.max_storage_mb || 5120) - (organization.storage_used_mb || 0),
                    percentage: Math.round(((organization.storage_used_mb || 0) / (organization.max_storage_mb || 5120)) * 100)
                },
                committees: {
                    current: committeeCount.count,
                    limit: organization.max_committees || 3,
                    available: (organization.max_committees || 3) - committeeCount.count,
                    percentage: Math.round((committeeCount.count / (organization.max_committees || 3)) * 100)
                },
                documents: {
                    current: documentCount.count
                },
                tasks: {
                    current: taskCount.count
                }
            };
        } catch (error) {
            console.error('Get usage error:', error);
            return null;
        }
    }

    /**
     * Check if organization has reached a limit
     */
    async checkLimit(organizationId, resourceType) {
        try {
            const usage = await this.getUsage(organizationId);
            
            if (!usage) {
                return { allowed: false, reason: 'Organization not found' };
            }

            const resource = usage[resourceType];
            if (!resource) {
                return { allowed: true };
            }

            const hasAvailable = resource.available > 0;
            const isNearLimit = resource.percentage >= 80;

            return {
                allowed: hasAvailable,
                current: resource.current,
                limit: resource.limit,
                available: resource.available,
                percentage: resource.percentage,
                isNearLimit,
                reason: hasAvailable ? null : `${resourceType} limit reached (${resource.limit})`
            };
        } catch (error) {
            console.error('Check limit error:', error);
            return { allowed: false, reason: 'Error checking limits' };
        }
    }

    /**
     * Log usage event
     */
    async logUsage(organizationId, resourceType, details) {
        try {
            await db.run(
                `INSERT INTO audit_log (organization_id, user_id, action, entity_type, new_values, created_at)
                 VALUES (?, NULL, ?, 'usage', ?, CURRENT_TIMESTAMP)`,
                [organizationId, `usage_${resourceType}`, JSON.stringify(details)]
            );
        } catch (error) {
            console.error('Log usage error:', error);
        }
    }

    /**
     * Get usage history for an organization
     */
    async getUsageHistory(organizationId, days = 30) {
        try {
            const history = await db.all(
                `SELECT * FROM audit_log 
                 WHERE organization_id = ? 
                 AND entity_type = 'usage'
                 AND created_at >= datetime('now', '-${days} days')
                 ORDER BY created_at DESC`,
                [organizationId]
            );

            return history.map(h => ({
                id: h.id,
                action: h.action,
                details: h.new_values ? JSON.parse(h.new_values) : null,
                created_at: h.created_at
            }));
        } catch (error) {
            console.error('Get usage history error:', error);
            return [];
        }
    }

    /**
     * Get platform-wide usage statistics (for super admin)
     */
    async getPlatformStats() {
        try {
            const [totalOrgs, totalUsers, totalStorage, activeOrgs] = await Promise.all([
                db.get('SELECT COUNT(*) as count FROM organizations'),
                db.get('SELECT COUNT(*) as count FROM organization_members WHERE is_active = 1'),
                db.get('SELECT SUM(storage_used_mb) as total FROM organizations'),
                db.get("SELECT COUNT(*) as count FROM organizations WHERE subscription_status IN ('trial', 'active')")
            ]);

            // Usage distribution by plan
            const planDistribution = await db.all(
                `SELECT p.name, COUNT(o.id) as organization_count,
                        SUM(o.storage_used_mb) as total_storage
                 FROM subscription_plans p
                 LEFT JOIN organizations o ON p.id = o.plan_id
                 GROUP BY p.id`
            );

            return {
                total_organizations: totalOrgs.count,
                total_active_users: totalUsers.count,
                total_storage_mb: Math.round(totalStorage.total || 0),
                active_organizations: activeOrgs.count,
                plan_distribution: planDistribution
            };
        } catch (error) {
            console.error('Get platform stats error:', error);
            return null;
        }
    }

    /**
     * Send warnings for organizations near limits
     */
    async sendLimitWarnings() {
        try {
            const organizations = await db.all(
                `SELECT o.id, o.name, o.storage_used_mb, p.max_users, p.max_storage_mb, p.max_committees
                 FROM organizations o
                 JOIN subscription_plans p ON o.plan_id = p.id
                 WHERE o.subscription_status IN ('trial', 'active')`
            );

            const warnings = [];

            for (const org of organizations) {
                const usage = await this.getUsage(org.id);
                
                if (usage.users.percentage >= 90) {
                    warnings.push({
                        organization_id: org.id,
                        organization_name: org.name,
                        resource: 'users',
                        current: usage.users.current,
                        limit: usage.users.limit,
                        percentage: usage.users.percentage
                    });
                }

                if (usage.storage.percentage >= 90) {
                    warnings.push({
                        organization_id: org.id,
                        organization_name: org.name,
                        resource: 'storage',
                        current: usage.storage.current_mb,
                        limit: usage.storage.limit_mb,
                        percentage: usage.storage.percentage
                    });
                }

                if (usage.committees.percentage >= 90) {
                    warnings.push({
                        organization_id: org.id,
                        organization_name: org.name,
                        resource: 'committees',
                        current: usage.committees.current,
                        limit: usage.committees.limit,
                        percentage: usage.committees.percentage
                    });
                }
            }

            return warnings;
        } catch (error) {
            console.error('Send limit warnings error:', error);
            return [];
        }
    }
}

module.exports = new UsageTracker();
