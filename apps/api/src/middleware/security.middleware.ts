/**
 * Security Middleware
 * Input sanitization and security headers
 */

import { Request, Response, NextFunction } from 'express';
import { Errors } from '../utils/api-response';

// Common SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
  /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
  /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
  /((\%27)|(\'))union/i,
  /exec(\s|\+)+(s|x)p\w+/i,
  /UNION\s+SELECT/i,
  /INSERT\s+INTO/i,
  /DELETE\s+FROM/i,
  /DROP\s+TABLE/i
];

// XSS patterns
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi
];

// NoSQL injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /\$where/i,
  /\$regex/i,
  /\$ne/i,
  /\$gt/i,
  /\$lt/i,
  /\$gte/i,
  /\$lte/i,
  /\$in/i,
  /\$nin/i
];

/**
 * Sanitize string input
 */
function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
}

/**
 * Check for SQL injection attempts
 */
function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for XSS attempts
 */
function containsXss(input: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for NoSQL injection attempts
 */
function containsNoSqlInjection(input: string): boolean {
  return NOSQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Deep sanitize object
 */
function deepSanitize(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize keys too
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = deepSanitize(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Deep check for injection attempts
 */
function deepCheckInjection(obj: any, checkFn: (input: string) => boolean): boolean {
  if (typeof obj === 'string') {
    return checkFn(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.some(item => deepCheckInjection(item, checkFn));
  }
  
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).some(([key, value]) => 
      checkFn(key) || deepCheckInjection(value, checkFn)
    );
  }
  
  return false;
}

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  // Sanitize query parameters
  if (req.query) {
    req.query = deepSanitize(req.query);
  }
  
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  
  // Sanitize params
  if (req.params) {
    req.params = deepSanitize(req.params);
  }
  
  next();
};

/**
 * SQL injection detection middleware
 */
export const detectSqlInjection = (req: Request, _res: Response, next: NextFunction): void => {
  const checkLocations = [req.query, req.body, req.params];
  
  for (const location of checkLocations) {
    if (deepCheckInjection(location, containsSqlInjection)) {
      next(Errors.badRequest('SECURITY_VIOLATION', 'Potential SQL injection detected'));
      return;
    }
  }
  
  next();
};

/**
 * XSS detection middleware
 */
export const detectXss = (req: Request, _res: Response, next: NextFunction): void => {
  const checkLocations = [req.query, req.body, req.params];
  
  for (const location of checkLocations) {
    if (deepCheckInjection(location, containsXss)) {
      next(Errors.badRequest('SECURITY_VIOLATION', 'Potential XSS attack detected'));
      return;
    }
  }
  
  next();
};

/**
 * NoSQL injection detection middleware
 */
export const detectNoSqlInjection = (req: Request, _res: Response, next: NextFunction): void => {
  const checkLocations = [req.query, req.body, req.params];
  
  for (const location of checkLocations) {
    if (deepCheckInjection(location, containsNoSqlInjection)) {
      next(Errors.badRequest('SECURITY_VIOLATION', 'Potential NoSQL injection detected'));
      return;
    }
  }
  
  next();
};

/**
 * Combined security middleware
 * Applies all security checks
 */
export const securityMiddleware = [
  sanitizeInput,
  detectSqlInjection,
  detectXss,
  detectNoSqlInjection
];

/**
 * Security headers middleware
 * Additional headers beyond Helmet
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS protection in browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  
  // Cache control for sensitive routes
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  next();
};

/**
 * Request size limiter
 * Prevents large payload attacks
 */
export const requestSizeLimiter = (maxSize: string = '10mb') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxBytes = parseInt(maxSize) * 1024 * 1024;
    
    if (contentLength > maxBytes) {
      next(Errors.badRequest('PAYLOAD_TOO_LARGE', `Request body too large. Max size: ${maxSize}`));
      return;
    }
    
    next();
  };
};

/**
 * Secure response handler
 * Removes sensitive fields from responses
 */
export const sanitizeResponse = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json;
  
  res.json = function(body: any) {
    // Remove sensitive fields from response
    if (body && typeof body === 'object') {
      const sanitized = sanitizeResponseBody(body);
      return originalJson.call(this, sanitized);
    }
    return originalJson.call(this, body);
  };
  
  next();
};

/**
 * Recursively sanitize response body
 */
function sanitizeResponseBody(obj: any): any {
  const sensitiveFields = [
    'password', 'password_hash', 'passwordHash',
    'refresh_token', 'refreshToken', 'refresh_token_hash',
    'verification_token', 'reset_token', 'token_hash',
    'mfa_secret', 'cookie_secret', 'jwt_secret',
    'api_key', 'apiKey', 'secret_key', 'secretKey',
    'private_key', 'privateKey', 'credit_card', 'ssn'
  ];
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeResponseBody(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if field is sensitive (case-insensitive)
      const isSensitive = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (key === 'data' && value && typeof value === 'object') {
        // Recursively sanitize nested data
        sanitized[key] = sanitizeResponseBody(value);
      } else {
        sanitized[key] = sanitizeResponseBody(value);
      }
    }
    return sanitized;
  }
  
  return obj;
}

export default {
  sanitizeInput,
  detectSqlInjection,
  detectXss,
  detectNoSqlInjection,
  securityMiddleware,
  securityHeaders,
  requestSizeLimiter,
  sanitizeResponse
};
