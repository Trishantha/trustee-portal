/**
 * Trustee Portal API Server
 * Main Express application with enhanced security
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate environment variables BEFORE importing other modules
import { validateEnv } from './config/env';
validateEnv();

import { checkDatabaseHealth } from './config/database';
import { Logger } from './utils/logger';
import { AppError, sendError } from './utils/api-response';
import { 
  generalLimiter, 
  authLimiter, 
  strictLimiter,
  exportLimiter 
} from './middleware/rate-limit.middleware';
import { requireCsrf } from './middleware/auth.middleware';
import { 
  securityMiddleware, 
  securityHeaders,
  sanitizeResponse 
} from './middleware/security.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import userRoutes from './routes/user.routes';
import invitationRoutes from './routes/invitation.routes';
import auditRoutes from './routes/audit.routes';

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// Security Middleware
// ==========================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS - configured for credentials (cookies)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID', 'X-CSRF-Token']
}));

// General rate limiting
app.use(generalLimiter);

// ==========================================
// General Middleware
// ==========================================

// Security headers
app.use(securityHeaders);

// Input sanitization and security checks
app.use(...securityMiddleware);

// Response sanitization
app.use(sanitizeResponse);

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => Logger.info(message.trim())
  }
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// Trust proxy in production (required for secure cookies behind load balancer)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// CSRF Protection (after cookie-parser)
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Session timeout configuration
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || '900000'); // 15 minutes default

// CSRF Token endpoint
app.get('/api/csrf-token', csrfProtection, (_req: Request, res: Response) => {
  res.json({ csrfToken: _req.csrfToken() });
});

// Session check endpoint
app.get('/api/session', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      timeout: SESSION_TIMEOUT,
      warningAt: SESSION_TIMEOUT - 60000 // Warn 1 minute before timeout
    }
  });
});

// ==========================================
// Routes
// ==========================================

// Health check
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  
  res.status(dbHealthy ? 200 : 503).json({
    success: dbHealthy,
    data: {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: dbHealthy ? 'connected' : 'disconnected'
    }
  });
});

// Apply strict rate limiting to sensitive auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', strictLimiter);
app.use('/api/auth/change-password', strictLimiter);

// Apply CSRF protection to state-changing routes
app.use('/api/auth/logout', csrfProtection, requireCsrf);
app.use('/api/users/change-password', csrfProtection, requireCsrf);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/audit', exportLimiter, auditRoutes);

// ==========================================
// Error Handling
// ==========================================

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Global error handler
app.use((err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => {
  Logger.error('Unhandled error', err);
  
  // Handle CSRF token errors
  if ((err as any).code === 'EBADCSRFTOKEN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token'
      }
    });
    return;
  }
  
  if (err instanceof AppError) {
    sendError(res, err);
  } else {
    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message;
    sendError(res, new Error(message), 500);
  }
});

// ==========================================
// Server Startup
// ==========================================

async function startServer() {
  try {
    // Check database connection
    const dbHealthy = await checkDatabaseHealth();
    if (dbHealthy) {
      Logger.info('✅ Database connected successfully');
    } else {
      Logger.warn('⚠️ Database health check failed - continuing anyway');
    }
    
    // Start server
    app.listen(PORT, () => {
      Logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🏛️  Trustee Portal API Server - SaaS Edition v2.0.0           ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║   Server running on http://localhost:${PORT}                      ║
║   Database: Supabase (PostgreSQL)                                ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(45)} ║
║                                                                  ║
║   Security Features:                                             ║
║   • httpOnly cookie authentication                               ║
║   • CSRF protection                                              ║
║   • Per-user rate limiting                                       ║
║   • RBAC enforcement                                             ║
║   • Audit logging                                                ║
║   • Input validation                                             ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    Logger.error('Failed to start server', error as Error);
    // Start anyway - don't block on DB errors
    app.listen(PORT, () => {
      Logger.info(`Server started on port ${PORT} (with warnings)`);
    });
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled rejection', reason as Error);
  process.exit(1);
});

// Start the server
startServer();

export default app;
