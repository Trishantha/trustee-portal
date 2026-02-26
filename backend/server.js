const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

// Multer upload configuration
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// ==========================================
// MIDDLEWARE
// ==========================================

// CORS configuration
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID']
}));

// ==========================================
// STRIPE WEBHOOK - Must be before express.json()
// ==========================================
const billingRoutes = require('./routes/billing');
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingRoutes);

// Rate limiting for auth routes
const { authRateLimit } = require('./middleware/rate-limiter');
app.use('/api/auth', authRateLimit);

// Regular body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// ==========================================
// AUTH ROUTES (No tenant required)
// ==========================================

// SaaS Auth Routes (New)
const saasAuthRoutes = require('./routes/auth-saas');
app.use('/api/auth/saas', saasAuthRoutes);

// Legacy Auth Routes (Backward compatibility)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// ==========================================
// SAAS MIDDLEWARE (Applied after auth routes)
// ==========================================
const { extractTenant, loadOrganizationSettings } = require('./middleware/tenant');

// Extract tenant for all routes (optional - sets req.organization if found)
app.use(extractTenant);
app.use(loadOrganizationSettings);

// ==========================================
// PROTECTED ROUTES (Require tenant context)
// ==========================================

// Organization Routes
const organizationRoutes = require('./routes/organizations');
app.use('/api/organizations', organizationRoutes);

// Billing Routes (Stripe Integration)
app.use('/api/billing', billingRoutes);

// Usage Routes
const usageRoutes = require('./routes/usage');
app.use('/api/usage', usageRoutes);

// Data Export Routes (GDPR)
const dataExportRoutes = require('./routes/data-export');
app.use('/api/export', dataExportRoutes);

// White-Label Routes
const whiteLabelRoutes = require('./routes/white-label');
app.use('/api/white-label', whiteLabelRoutes);

// Platform Admin Routes (Super Admin only)
const platformAdminRoutes = require('./routes/platform-admin');
app.use('/api/platform', platformAdminRoutes);

// Trustees Routes
const trusteeRoutes = require('./routes/trustees');
app.use('/api/trustees', trusteeRoutes);

// Legacy routes (will be migrated to be organization-aware)
const userRoutes = require('./routes/users');
const committeeRoutes = require('./routes/committees');
const meetingRoutes = require('./routes/meetings');
const taskRoutes = require('./routes/tasks');
const recruitmentRoutes = require('./routes/recruitment');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/users', userRoutes);
app.use('/api/committees', committeeRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Debug routes (remove in production)
const debugRoutes = require('./routes/debug');
app.use('/api/debug', debugRoutes);

// Cache Management Routes
const cacheRoutes = require('./routes/cache');
app.use('/api/cache', cacheRoutes);

// ==========================================
// API ENDPOINTS
// ==========================================

// Import database info
// Supabase database

// Health check
app.get('/api/health', async (req, res) => {
    const emailService = require('./services/email');
    const emailStatus = await emailService.verifyConfiguration();
    
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '2.0.0-saas',
        mode: 'saas',
        database: 'supabase',
        email: emailStatus,
        organization: req.organization ? {
            id: req.organization.id,
            name: req.organization.name,
            slug: req.organization.slug
        } : null
    });
});

// SaaS Status & Info
app.get('/api/saas/info', async (req, res) => {
    const db = require('./config/database');
    
    try {
        // Try to get plans with all columns
        let plans;
        try {
            plans = await db.all(
                'SELECT * FROM subscription_plans WHERE is_active = 1 OR is_active IS NULL ORDER BY price_monthly'
            );
        } catch (queryError) {
            // Fallback: get all plans without is_active filter
            console.log('Plan query failed, using fallback:', queryError.message);
            plans = await db.all('SELECT * FROM subscription_plans ORDER BY price_monthly');
        }
        
        res.json({
            version: '2.0.0',
            mode: 'saas',
            plans: plans.map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug || p.code || '',
                description: p.description || '',
                price: {
                    monthly: p.price_monthly,
                    yearly: p.price_yearly || p.price_monthly * 10
                },
                price_monthly: p.price_monthly,
                price_yearly: p.price_yearly || p.price_monthly * 10,
                limits: {
                    users: p.max_users || 5,
                    storage_mb: p.max_storage_mb || 5120,
                    committees: p.max_committees || 3
                },
                max_users: p.max_users || 5,
                max_storage_mb: p.max_storage_mb || 5120,
                max_committees: p.max_committees || 3,
                features: typeof p.features === 'string' ? JSON.parse(p.features || '[]') : (p.features || []),
                is_popular: p.is_popular === 1 || p.is_popular === true,
                is_active: p.is_active !== 0 && p.is_active !== false,
                stripe_price_id_monthly: p.stripe_price_id_monthly || '',
                stripe_price_id_yearly: p.stripe_price_id_yearly || ''
            }))
        });
    } catch (error) {
        console.error('SaaS info error:', error);
        res.status(500).json({ error: 'Failed to fetch SaaS info' });
    }
});

// ==========================================
// STATIC FILES & SPA FALLBACK
// ==========================================

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '..')));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    const dbType = 'Supabase (PostgreSQL)';
    
    // Start notification scheduler
    const notificationScheduler = require('./services/notification-scheduler');
    notificationScheduler.start();
    
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🏛️  Trustee Portal API Server - SaaS Edition                  ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║   Server running on http://localhost:${PORT}                      ║
║   Database: ${dbType.padEnd(51)} ║
║                                                                  ║
║   SaaS Features:                                                 ║
║   • Multi-tenant architecture                                    ║
║   • Organization management                                      ║
║   • Subscription plans & trials                                  ║
║   • Role-based access control                                    ║
║   • Stripe billing integration                                   ║
║   • Usage tracking & limits                                      ║
║                                                                  ║
║   API Endpoints:                                                 ║
║   • POST /api/auth/saas/login          - SaaS Login              ║
║   • POST /api/auth/saas/register       - SaaS Register           ║
║   • GET  /api/organizations/my         - My Organizations        ║
║   • POST /api/organizations            - Create Organization     ║
║   • GET  /api/saas/info                - Plans & Pricing         ║
║   • GET  /api/billing/subscription     - Subscription Details    ║
║   • POST /api/billing/subscribe        - Subscribe to Plan       ║
║   • GET  /api/billing/usage            - Current Usage           ║
║   • GET  /api/usage                    - Organization Usage      ║
║   • GET  /api/platform/stats           - Platform Stats          ║
║   • GET  /api/export/organization      - Export Organization     ║
║   • GET  /api/export/user              - Export User Data        ║
║   • GET  /api/export/organization      - Export Organization     ║
║   • GET  /api/export/user              - Export User Data        ║
║   • Rate limiting per organization                               ║
║   • Email notifications & scheduled tasks                        ║
║   • White-label branding & custom domains                        ║
║                                                                  ║
║   Legacy endpoints still available at /api/auth/*                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    console.log('Press Ctrl+C to stop the server\n');
});
