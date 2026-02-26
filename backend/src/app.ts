/**
 * Trustee Portal API Server
 * Main Express application
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { connectDatabase, checkDatabaseHealth } from './config/database';
import { Logger } from './utils/logger';
import { AppError, sendError } from './utils/api-response';

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
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later'
    }
  }
});
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later'
    }
  }
});

// ==========================================
// General Middleware
// ==========================================

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
app.use(cookieParser());

// ==========================================
// Routes
// ==========================================

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
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

// Apply auth rate limiter to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/audit', auditRoutes);

// ==========================================
// Error Handling
// ==========================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Global error handler
app.use((err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
  Logger.error('Unhandled error', err);
  
  if (err instanceof AppError) {
    sendError(res, err);
  } else {
    sendError(res, err, 500);
  }
});

// ==========================================
// Server Startup
// ==========================================

async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    
    // Start server
    app.listen(PORT, () => {
      Logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🏛️  Trustee Portal API Server - SaaS Edition v2.0.0           ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║   Server running on http://localhost:${PORT}                      ║
║   Database: PostgreSQL (Prisma)                                  ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(45)} ║
║                                                                  ║
║   Features:                                                      ║
║   • Multi-tenant architecture                                    ║
║   • RBAC with 13 governance roles                                ║
║   • Audit logging                                                ║
║   • Invitation system                                            ║
║   • Rate limiting                                                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    Logger.error('Failed to start server', error as Error);
    process.exit(1);
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
