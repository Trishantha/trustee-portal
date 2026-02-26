const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database
        const user = await db.get(
            'SELECT id, email, first_name, last_name, role, avatar, is_active FROM users WHERE id = ?',
            [decoded.id]
        );

        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated.' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please login again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token.' });
        }
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication error.' });
    }
};

// Role-based authorization middleware
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions.',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
};

// Admin only middleware
const requireAdmin = requireRole('admin');

// Admin or Chair middleware (also allows 'owner' role from SaaS)
const requireAdminOrChair = requireRole('admin', 'chair', 'owner');

module.exports = {
    generateToken,
    authenticate,
    requireRole,
    requireAdmin,
    requireAdminOrChair
};
