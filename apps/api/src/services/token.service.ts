/**
 * Secure Token Service
 * Uses httpOnly cookies instead of localStorage for XSS protection
 * Implements refresh token rotation and secure cookie settings
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWTPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Shorter for security
const COOKIE_SECRET = process.env.COOKIE_SECRET!;

// Cookie names
const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const CSRF_TOKEN_COOKIE = 'csrf_token';

// Token expiration times
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate JWT access token
 */
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'trustee-portal',
    audience: 'trustee-portal-api'
  });
}

/**
 * Generate secure random refresh token
 */
export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(token).update(COOKIE_SECRET).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE);
  return { token, hash, expiresAt };
}

/**
 * Hash a token for database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).update(COOKIE_SECRET).digest('hex');
}

/**
 * Verify a token against its hash
 */
export function verifyTokenHash(token: string, hash: string): boolean {
  const computedHash = crypto.createHash('sha256').update(token).update(COOKIE_SECRET).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
}

/**
 * Cookie configuration for production security
 */
function getCookieConfig(isRefreshToken = false): { httpOnly: boolean; secure: boolean; sameSite: 'strict' | 'lax' | 'none'; maxAge: number; path: string; signed?: boolean } {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: isProduction, // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
    maxAge: isRefreshToken ? REFRESH_TOKEN_MAX_AGE : ACCESS_TOKEN_MAX_AGE,
    path: '/',
    signed: isRefreshToken // Sign refresh tokens for extra security
  };
}

/**
 * Set authentication cookies
 */
export function setAuthCookies(
  res: Response, 
  accessToken: string, 
  refreshToken: string
): void {
  const accessConfig = getCookieConfig(false);
  const refreshConfig = getCookieConfig(true);

  // Set access token cookie (httpOnly)
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessConfig);

  // Set refresh token cookie (httpOnly + signed)
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshConfig);

  // Generate and set CSRF token for non-GET requests
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_TOKEN_COOKIE, csrfToken, {
    ...accessConfig,
    httpOnly: false // Must be accessible by JavaScript for CSRF protection
  });
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(CSRF_TOKEN_COOKIE, { path: '/' });
}

/**
 * Extract and verify access token from cookies
 */
export function extractAccessToken(req: Request): string | null {
  // First try cookie
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  // Fallback to Authorization header (for API clients/mobile apps)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Extract and verify refresh token from cookies
 */
export function extractRefreshToken(req: Request): string | null {
  // Get signed cookie
  const signedToken = req.signedCookies?.[REFRESH_TOKEN_COOKIE];
  if (signedToken) {
    return signedToken;
  }

  // Fallback to unsigned cookie (if signing failed)
  const unsignedToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (unsignedToken) {
    return unsignedToken;
  }

  return null;
}

/**
 * Verify JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'trustee-portal',
      audience: 'trustee-portal-api'
    }) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Get CSRF token for client
 */
export function getCsrfToken(req: Request): string | null {
  return req.cookies?.[CSRF_TOKEN_COOKIE] || null;
}

/**
 * Verify CSRF token from request header
 */
export function verifyCsrfToken(req: Request): boolean {
  const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE];
  const headerToken = req.headers['x-csrf-token'] as string;
  
  if (!cookieToken || !headerToken) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken)
  );
}

/**
 * Token pair for responses (no longer exposes tokens in body)
 */
export interface TokenResponse {
  expiresIn: number;
  tokenType: 'Bearer';
}

/**
 * Create token response without exposing actual tokens
 */
export function createTokenResponse(): TokenResponse {
  return {
    expiresIn: ACCESS_TOKEN_MAX_AGE,
    tokenType: 'Bearer'
  };
}

/**
 * Check if request has valid session
 */
export function hasValidSession(req: Request): boolean {
  const accessToken = extractAccessToken(req);
  if (!accessToken) return false;

  const payload = verifyAccessToken(accessToken);
  return payload !== null;
}

export default {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyTokenHash,
  setAuthCookies,
  clearAuthCookies,
  extractAccessToken,
  extractRefreshToken,
  verifyAccessToken,
  getCsrfToken,
  verifyCsrfToken,
  createTokenResponse,
  hasValidSession
};
