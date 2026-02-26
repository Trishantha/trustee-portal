/**
 * Rate Limiting Middleware
 * Phase 4: API Security - Rate Limiting per Organization
 */

const rateLimit = require('express-rate-limit');
const db = require('../config/database');

// Store for organization-specific rate limiters
const limiters = new Map();

/**
 * Create a rate limiter for an organization
 */
function createOrganizationLimiter(organizationId, options = {}) {
    const key = `org_${organizationId}`;
    
    if (!limiters.has(key)) {
        const limiter = rateLimit({
            windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
            max: options.max || 100, // Limit each organization to 100 requests per windowMs
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => {
                // Use organization ID + user ID + IP for granular limiting
                return `${organizationId}_${req.user?.id || 'anonymous'}_${req.ip}`;
            },
            handler: (req, res) => {
                res.status(429).json({
                    error: 'Too Many Requests',
                    message: 'Your organization has exceeded the rate limit. Please try again later.',
                    retryAfter: Math.ceil(options.windowMs / 1000)
                });
            },
            skip: (req) => {
                // Skip rate limiting for super admins
                return req.user?.is_super_admin === true;
            }
        });
        
        limiters.set(key, limiter);
    }
    
    return limiters.get(key);
}

/**
 * Rate limiter middleware factory
 * Applies different limits based on plan tier
 */
const organizationRateLimit = (options = {}) => {
    return async (req, res, next) => {
        try {
            const organization = req.organization;
            
            if (!organization) {
                // No organization context - apply default global limit
                return globalRateLimiter(req, res, next);
            }

            // Get plan details to determine rate limits
            const plan = await db.get(
                'SELECT slug FROM subscription_plans WHERE id = ?',
                [organization.plan_id]
            );

            // Set limits based on plan
            let maxRequests = 100; // Default
            let windowMs = 15 * 60 * 1000; // 15 minutes

            switch (plan?.slug) {
                case 'starter':
                    maxRequests = 100;
                    break;
                case 'professional':
                    maxRequests = 500;
                    break;
                case 'enterprise':
                    maxRequests = 2000;
                    break;
                default:
                    maxRequests = options.max || 100;
            }

            // Apply custom options if provided
            if (options.max) maxRequests = options.max;
            if (options.windowMs) windowMs = options.windowMs;

            const limiter = createOrganizationLimiter(organization.id, {
                max: maxRequests,
                windowMs: windowMs
            });

            limiter(req, res, next);
        } catch (error) {
            console.error('Rate limit error:', error);
            next();
        }
    };
};

/**
 * Global rate limiter for non-organization routes
 */
const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per 15 minutes for non-authenticated routes
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Please slow down and try again later.',
            retryAfter: 900
        });
    }
});

/**
 * Strict rate limiter for sensitive operations
 */
const strictRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'This operation is rate limited. Please try again later.',
            retryAfter: 3600
        });
    }
});

/**
 * Authentication rate limiter
 */
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too Many Login Attempts',
            message: 'Too many login attempts. Please try again after 15 minutes.',
            retryAfter: 900
        });
    }
});

module.exports = {
    organizationRateLimit,
    globalRateLimiter,
    strictRateLimit,
    authRateLimit
};
