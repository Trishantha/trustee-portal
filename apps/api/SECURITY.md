# Security Implementation Guide

## Critical Security Issues - ACTION REQUIRED

### 1. JWT_SECRET - CHANGE IMMEDIATELY
**Status:** ⚠️ MUST CHANGE BEFORE PRODUCTION

The JWT_SECRET in `.env` uses a default/weak value. Generate a strong secret:

```bash
# Generate a strong 64-character random string
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add to `.env`:
```bash
JWT_SECRET=your-generated-64-char-random-string
```

### 2. localStorage → HttpOnly Cookies (Token Storage)
**Status:** 🔴 HIGH PRIORITY

**Current Issue:** Auth tokens stored in localStorage are vulnerable to XSS attacks.

**Solution:** Move to HttpOnly, Secure, SameSite cookies.

**Backend Changes Required:**
- Install csurf package: `npm install csurf`
- Configure cookie-parser for auth cookies
- Set JWT in HttpOnly cookie on login

**Frontend Changes Required:**
- Remove: `localStorage.setItem('auth_token', ...)`
- Remove: `localStorage.getItem('auth_token')`
- With credentials: `fetch(url, { credentials: 'include' })`

### 3. CSRF Protection
**Status:** 🔴 HIGH PRIORITY

**Implementation:**
```typescript
import csurf from 'csurf';

// After cookie-parser
const csrfProtection = csurf({ 
  cookie: { 
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Apply to state-changing routes
app.use('/api/', csrfProtection);

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

### 4. Security Headers
**Status:** ✅ PARTIALLY IMPLEMENTED (Helmet added)

Additional recommended headers in `app.ts`:
```typescript
app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false // Adjust based on needs
}));
```

## Security Checklist

- [ ] Change JWT_SECRET to strong random value (64+ chars)
- [ ] Move from localStorage to HttpOnly cookies
- [ ] Add CSRF protection for state-changing operations
- [ ] Enable CORS credentials but restrict origin
- [ ] Add rate limiting per user (not just IP)
- [ ] Implement account lockout after failed attempts
- [ ] Add security headers (CSP, HSTS, etc.)
- [ ] Enable request validation on all inputs
- [ ] Add audit logging for security events
- [ ] Implement session timeout/refresh mechanism

## Environment Variables

Required in `.env`:
```bash
# Security
JWT_SECRET=change-me-to-strong-random-string-min-64-chars
JWT_EXPIRES_IN=24h
COOKIE_SECRET=another-strong-random-string

# CORS
FRONTEND_URL=https://yourdomain.com

# In production
NODE_ENV=production
```

## Production Deployment Security

1. **Use HTTPS only** - redirect HTTP to HTTPS
2. **Secure database** - use SSL connections
3. **Environment isolation** - separate DB/credentials per environment
4. **Secret management** - use AWS Secrets Manager, Azure Key Vault, or similar
5. **Logging** - log security events but never log passwords/tokens
6. **Monitoring** - set up alerts for suspicious activity

## Security Contacts

Report security issues to: security@yourdomain.com
