/**
 * Rate Limiting Middleware
 * Per-user and per-IP rate limiting for enhanced security
 */

import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Simple in-memory store for user-based rate limiting
// In production, use Redis for distributed rate limiting
const userRequestCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * Get rate limit key for a request
 * Uses user ID if authenticated, otherwise IP address
 */
function getRateLimitKey(req: Request): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${req.ip}`;
}

/**
 * General API rate limiter
 * 100 requests per 15 minutes per user/IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(15 * 60) // seconds
      }
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  }
});

/**
 * Stricter rate limiting for authentication endpoints
 * 5 failed attempts per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Always use IP for auth endpoints to prevent brute force
    return `auth:${req.ip}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
        retryAfter: Math.ceil(15 * 60)
      }
    });
  }
});

/**
 * Per-user authenticated rate limiter
 * Different limits based on user role
 */
export const userRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    // Fall back to IP-based limiting
    return generalLimiter(req, res, next);
  }

  const key = `user:${req.user.id}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = req.user.isSuperAdmin ? 500 : 100; // Higher limit for admins

  const record = userRequestCounts.get(key);
  
  if (!record || now > record.resetTime) {
    // New window
    userRequestCounts.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return next();
  }

  if (record.count >= maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded for your account',
        retryAfter
      }
    });
    return;
  }

  // Increment count
  record.count++;
  next();
};

/**
 * Organization-specific rate limiter
 * Prevents abuse of organization-level endpoints
 */
export const organizationLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const orgId = req.member?.organizationId || req.params.id;
  
  if (!orgId) {
    return next();
  }

  // Use organization-specific key
  const key = `org:${orgId}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 200; // Per organization

  const record = userRequestCounts.get(key);
  
  if (!record || now > record.resetTime) {
    userRequestCounts.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return next();
  }

  if (record.count >= maxRequests) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    res.status(429).json({
      success: false,
      error: {
        code: 'ORG_RATE_LIMITED',
        message: 'Organization rate limit exceeded',
        retryAfter
      }
    });
    return;
  }

  record.count++;
  next();
};

/**
 * Strict rate limiter for sensitive operations
 * Used for password changes, API key generation, etc.
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'STRICT_RATE_LIMITED',
        message: 'Too many sensitive operations. Please try again in 1 hour.'
      }
    });
  }
});

/**
 * Export rate limiter for bulk operations
 * Prevents abuse of export endpoints
 */
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'EXPORT_RATE_LIMITED',
        message: 'Export limit reached. Please try again in 1 hour.'
      }
    });
  }
});

/**
 * Cleanup old rate limit entries periodically
 * Run every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of userRequestCounts.entries()) {
    if (now > record.resetTime) {
      userRequestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

export default {
  generalLimiter,
  authLimiter,
  userRateLimiter,
  organizationLimiter,
  strictLimiter,
  exportLimiter
};
