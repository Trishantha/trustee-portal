const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for SaaS
 * Includes user info and active organization membership
 */
const generateToken = (user, organizationId = null, memberRole = null) => {
    const payload = { 
        id: user.id, 
        email: user.email,
        is_super_admin: user.is_super_admin || false
    };

    // Include organization context if provided
    if (organizationId) {
        payload.organization_id = organizationId;
        payload.role = memberRole;
    }

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Generate a token for organization invitation
 */
const generateInvitationToken = (invitationData) => {
    return jwt.sign(invitationData, JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Verify invitation token
 */
const verifyInvitationToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

/**
 * Main Authentication Middleware
 * 
 * Verifies JWT and loads user + organization membership
 * Sets: req.user, req.member, req.organizationId, req.userRole
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Access denied',
                message: 'No authentication token provided.'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database using table API
        const users = await db.query('users', {
            where: { id: decoded.id },
            select: 'id, email, first_name, last_name, avatar, is_active, is_super_admin, email_verified, timezone, language'
        });
        const user = users[0];

        if (!user) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'User not found.'
            });
        }

        // Check if user is active (handle both is_active and missing field)
        if (user.is_active === false) {
            return res.status(403).json({ 
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Set basic user info
        req.user = {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            avatar: user.avatar,
            is_super_admin: user.is_super_admin,
            email_verified: user.email_verified,
            timezone: user.timezone,
            language: user.language
        };

        // If token includes organization context, verify membership
        if (decoded.organization_id) {
            // If tenant middleware hasn't run, try to get organization
            if (!req.organization) {
                const orgs = await db.query('organizations', {
                    where: { id: decoded.organization_id }
                });
                req.organization = orgs[0];
            }

            // Get organization membership using table API (not JOIN)
            const memberships = await db.query('organization_members', {
                where: { 
                    organization_id: decoded.organization_id, 
                    user_id: user.id, 
                    is_active: true 
                },
                select: '*'
            });
            
            const member = memberships[0];

            if (!member && !user.is_super_admin) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You are not a member of this organization.'
                });
            }

            if (member) {
                req.member = {
                    id: member.id,
                    role: member.role,
                    department: member.department,
                    title: member.title,
                    joined_at: member.joined_at
                };
                req.organizationId = decoded.organization_id;
                req.userRole = member.role;
            }
        }

        // Update last active timestamp (async, don't wait)
        if (req.member) {
            db.update('organization_members', 
                { last_active_at: new Date().toISOString() },
                { id: req.member.id }
            ).catch(err => console.error('Failed to update last_active:', err));
        }

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Session expired',
                message: 'Your session has expired. Please login again.',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'Your authentication token is invalid.',
                code: 'TOKEN_INVALID'
            });
        }
        console.error('Auth middleware error:', error);
        return res.status(500).json({ 
            error: 'Authentication error',
            message: 'An error occurred during authentication.'
        });
    }
};

/**
 * Optional Authentication
 * Same as authenticate but doesn't require a token
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        const users = await db.query('users', {
            where: { id: decoded.id },
            select: 'id, email, first_name, last_name, avatar, is_active, is_super_admin'
        });
        const user = users[0];

        if (user && user.is_active !== false) {
            req.user = user;
            
            if (decoded.organization_id) {
                const memberships = await db.query('organization_members', {
                    where: { 
                        organization_id: decoded.organization_id, 
                        user_id: user.id, 
                        is_active: true 
                    },
                    select: '*'
                });
                const member = memberships[0];
                
                if (member) {
                    req.member = member;
                    req.organizationId = decoded.organization_id;
                    req.userRole = member.role;
                }
            }
        }

        next();
    } catch (error) {
        // Silently ignore auth errors for optional auth
        next();
    }
};

/**
 * Role-based authorization middleware factory
 * Checks organization member role
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'You must be logged in to access this resource.'
            });
        }

        // Super admins bypass role checks
        if (req.user.is_super_admin) {
            return next();
        }

        if (!req.member) {
            return res.status(403).json({ 
                error: 'Organization membership required',
                message: 'You must be a member of an organization to access this resource.'
            });
        }

        if (!roles.includes(req.member.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                message: `This action requires one of the following roles: ${roles.join(', ')}`,
                required: roles,
                current: req.member.role
            });
        }

        next();
    };
};

/**
 * Require specific permission level (hierarchical)
 * owner > admin > chair > secretary > trustee > viewer
 */
const requirePermissionLevel = (minRole) => {
    const hierarchy = {
        'owner': 6,
        'admin': 5,
        'chair': 4,
        'secretary': 3,
        'trustee': 2,
        'viewer': 1
    };

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'You must be logged in to access this resource.'
            });
        }

        // Super admins bypass
        if (req.user.is_super_admin) {
            return next();
        }

        if (!req.member) {
            return res.status(403).json({ 
                error: 'Organization membership required',
                message: 'You must be a member of an organization to access this resource.'
            });
        }

        const userLevel = hierarchy[req.member.role] || 0;
        const requiredLevel = hierarchy[minRole] || 0;

        if (userLevel < requiredLevel) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                message: `This action requires ${minRole} level permissions or higher.`,
                required: minRole,
                current: req.member.role
            });
        }

        next();
    };
};

/**
 * Require organization context
 * Ensures the request has an organizationId
 */
const requireOrganization = (req, res, next) => {
    if (!req.organizationId) {
        return res.status(400).json({
            error: 'Organization required',
            message: 'This action requires an organization context. Please specify an organization.'
        });
    }
    next();
};

/**
 * Require Super Admin (platform admin)
 */
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            error: 'Authentication required',
            message: 'You must be logged in to access this resource.'
        });
    }

    if (!req.user.is_super_admin) {
        return res.status(403).json({ 
            error: 'Super admin required',
            message: 'This action requires platform administrator permissions.'
        });
    }

    next();
};

// Common role combinations
const requireAdmin = requireRole('owner', 'admin');
const requireAdminOrChair = requireRole('owner', 'admin', 'chair');
const requireAdminChairOrSecretary = requireRole('owner', 'admin', 'chair', 'secretary');
const requireTrustee = requireRole('owner', 'admin', 'chair', 'secretary', 'trustee');

module.exports = {
    generateToken,
    generateInvitationToken,
    verifyInvitationToken,
    authenticate,
    optionalAuth,
    requireRole,
    requirePermissionLevel,
    requireOrganization,
    requireSuperAdmin,
    requireAdmin,
    requireAdminOrChair,
    requireAdminChairOrSecretary,
    requireTrustee
};
