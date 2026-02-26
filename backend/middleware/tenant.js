const db = require('../config/database');

/**
 * Tenant Middleware
 * 
 * Extracts the organization (tenant) from the request based on:
 * 1. Custom domain (portal.company.com)
 * 2. Subdomain (company.trusteeportal.com)
 * 3. X-Organization-ID header (for API/mobile apps)
 * 4. Organization slug in request params/body
 * 
 * Sets req.organization and req.organizationId for use in controllers
 */

const extractTenant = async (req, res, next) => {
    try {
        let organization = null;
        let organizationId = null;

        // 1. Check for X-Organization-ID header (API/Mobile apps)
        const orgIdHeader = req.headers['x-organization-id'];
        if (orgIdHeader) {
            organization = await db.get(
                'SELECT * FROM organizations WHERE id = ? AND is_active = 1',
                [orgIdHeader]
            );
        }

        // 2. Check for custom domain
        if (!organization && req.headers.host) {
            const host = req.headers.host.split(':')[0]; // Remove port if present
            
            // Skip localhost and main domain
            if (!['localhost', '127.0.0.1', 'trusteeportal.com', 'www.trusteeportal.com'].includes(host)) {
                organization = await db.get(
                    'SELECT * FROM organizations WHERE custom_domain = ? AND is_active = 1',
                    [host]
                );
            }
        }

        // 3. Check for subdomain (slug.trusteeportal.com)
        if (!organization && req.headers.host) {
            const host = req.headers.host.split(':')[0];
            const parts = host.split('.');
            
            // Check if it's a subdomain format: slug.trusteeportal.com
            if (parts.length >= 3 && parts.slice(-2).join('.') === 'trusteeportal.com') {
                const slug = parts[0];
                organization = await db.get(
                    'SELECT * FROM organizations WHERE slug = ? AND is_active = 1',
                    [slug]
                );
            }
        }

        // 4. Check for organization slug in query params
        if (!organization && req.query.org) {
            organization = await db.get(
                'SELECT * FROM organizations WHERE slug = ? AND is_active = 1',
                [req.query.org]
            );
        }

        // Validate organization subscription status
        if (organization) {
            const now = new Date().toISOString();
            
            // Skip subscription checks for super admins (platform admins)
            const isSuperAdmin = req.user?.is_super_admin === true;
            
            // Check if subscription is valid (skip for super admins)
            if (organization.subscription_status === 'suspended' && !isSuperAdmin) {
                return res.status(403).json({
                    error: 'Organization Suspended',
                    message: 'This organization has been suspended. Please contact support.'
                });
            }

            if (organization.subscription_status === 'cancelled' && !isSuperAdmin) {
                return res.status(403).json({
                    error: 'Subscription Cancelled',
                    message: 'This subscription has been cancelled.'
                });
            }

            // Check trial expiration
            if (organization.subscription_status === 'trial' && organization.trial_ends_at) {
                if (new Date(organization.trial_ends_at) < new Date()) {
                    return res.status(403).json({
                        error: 'Trial Expired',
                        message: 'Your trial period has expired. Please upgrade your subscription.',
                        action: 'upgrade'
                    });
                }
            }

            // Check subscription expiration
            if (organization.subscription_ends_at && new Date(organization.subscription_ends_at) < new Date()) {
                return res.status(403).json({
                    error: 'Subscription Expired',
                    message: 'Your subscription has expired. Please renew to continue.',
                    action: 'renew'
                });
            }

            organizationId = organization.id;
        }

        // Attach organization to request
        req.organization = organization;
        req.organizationId = organizationId;

        next();
    } catch (error) {
        console.error('Tenant extraction error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to identify organization'
        });
    }
};

/**
 * Require Tenant Middleware
 * 
 * Ensures an organization is identified for the request.
 * Use this for routes that require an organization context.
 */
const requireTenant = (req, res, next) => {
    if (!req.organization || !req.organizationId) {
        return res.status(400).json({
            error: 'Organization Required',
            message: 'No organization identified. Please provide an organization ID or use a valid domain.'
        });
    }
    next();
};

/**
 * Require Active Subscription
 * 
 * Ensures the organization has an active subscription (not in trial).
 * Use this for premium features.
 */
const requireActiveSubscription = (req, res, next) => {
    if (!req.organization) {
        return res.status(400).json({
            error: 'Organization Required',
            message: 'No organization identified.'
        });
    }

    const allowedStatuses = ['active', 'trial'];
    if (!allowedStatuses.includes(req.organization.subscription_status)) {
        return res.status(403).json({
            error: 'Subscription Required',
            message: 'An active subscription is required to access this feature.',
            action: 'subscribe'
        });
    }

    next();
};

/**
 * Check Organization Limits
 * 
 * Middleware factory to check if organization has reached a limit
 * @param {string} resourceType - 'users', 'storage', 'committees'
 */
const checkOrganizationLimit = (resourceType) => {
    return async (req, res, next) => {
        try {
            if (!req.organization) {
                return res.status(400).json({
                    error: 'Organization Required',
                    message: 'No organization identified.'
                });
            }

            const org = req.organization;
            const plan = await db.get(
                'SELECT * FROM subscription_plans WHERE id = ?',
                [org.plan_id]
            );

            if (!plan) {
                return res.status(500).json({
                    error: 'Configuration Error',
                    message: 'Organization plan not found.'
                });
            }

            let currentCount = 0;
            let maxAllowed = 0;

            switch (resourceType) {
                case 'users':
                    const userCount = await db.get(
                        'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND is_active = 1',
                        [org.id]
                    );
                    currentCount = userCount.count;
                    maxAllowed = plan.max_users;
                    break;

                case 'storage':
                    currentCount = org.storage_used_mb || 0;
                    maxAllowed = plan.max_storage_mb;
                    break;

                case 'committees':
                    const committeeCount = await db.get(
                        'SELECT COUNT(*) as count FROM committees WHERE organization_id = ? AND is_active = 1',
                        [org.id]
                    );
                    currentCount = committeeCount.count;
                    maxAllowed = plan.max_committees;
                    break;

                default:
                    return next();
            }

            if (currentCount >= maxAllowed) {
                return res.status(403).json({
                    error: 'Limit Reached',
                    message: `Your organization has reached the ${resourceType} limit for your plan (${maxAllowed}). Please upgrade to add more.`,
                    resource: resourceType,
                    current: currentCount,
                    limit: maxAllowed,
                    action: 'upgrade'
                });
            }

            // Attach limit info to request for potential use in controllers
            req.organizationLimits = {
                [resourceType]: {
                    current: currentCount,
                    limit: maxAllowed,
                    remaining: maxAllowed - currentCount
                }
            };

            next();
        } catch (error) {
            console.error('Limit check error:', error);
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to check organization limits'
            });
        }
    };
};

/**
 * Get Organization Settings
 * 
 * Middleware to load and parse organization settings
 */
const loadOrganizationSettings = async (req, res, next) => {
    try {
        if (!req.organization) {
            return next();
        }

        let settings = {};
        if (req.organization.settings) {
            try {
                settings = JSON.parse(req.organization.settings);
            } catch (e) {
                console.error('Failed to parse organization settings:', e);
            }
        }

        // Merge with defaults
        req.organizationSettings = {
            timezone: settings.timezone || 'UTC',
            date_format: settings.date_format || 'YYYY-MM-DD',
            time_format: settings.time_format || '24h',
            language: settings.language || 'en',
            ...settings
        };

        next();
    } catch (error) {
        console.error('Settings load error:', error);
        next();
    }
};

module.exports = {
    extractTenant,
    requireTenant,
    requireActiveSubscription,
    checkOrganizationLimit,
    loadOrganizationSettings
};
