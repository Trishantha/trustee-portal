/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 * Prevents application from running with insecure/missing configuration
 */

import crypto from 'crypto';

interface EnvVar {
  name: string;
  required: boolean;
  validate?: (value: string) => { valid: boolean; message?: string };
}

// List of weak/default secrets that should not be used in production
const WEAK_SECRETS = [
  'change-me-to-64-char-random-string-generated-with-crypto',
  'change-me-to-different-64-char-random-string',
  'test-jwt-secret-for-development-only-do-not-use-in-production',
  'test-cookie-secret-for-development-only',
  'your-secret-key',
  'secret',
  'jwt-secret',
  'jwtsecret',
  'password',
  'admin',
  '123456',
  'default',
];

const envVars: EnvVar[] = [
  {
    name: 'NODE_ENV',
    required: true,
    validate: (value) => ({
      valid: ['development', 'staging', 'production', 'test'].includes(value),
      message: 'Must be one of: development, staging, production, test'
    })
  },
  {
    name: 'PORT',
    required: false,
    validate: (value) => ({
      valid: !isNaN(parseInt(value)) && parseInt(value) > 0 && parseInt(value) < 65536,
      message: 'Must be a valid port number (1-65535)'
    })
  },
  {
    name: 'JWT_SECRET',
    required: true,
    validate: (value) => {
      // Check for weak/default secrets
      const lowerValue = value.toLowerCase();
      for (const weak of WEAK_SECRETS) {
        if (lowerValue.includes(weak.toLowerCase())) {
          return { valid: false, message: 'JWT_SECRET appears to be a default/weak value. Generate a secure random string with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"' };
        }
      }
      // Check minimum length (at least 32 bytes = 64 hex chars)
      if (value.length < 64) {
        return { valid: false, message: 'JWT_SECRET must be at least 64 characters long for security' };
      }
      // Check entropy (should not be simple patterns)
      const uniqueChars = new Set(value).size;
      if (uniqueChars < 20) {
        return { valid: false, message: 'JWT_SECRET has too little variation. Use a cryptographically secure random string.' };
      }
      return { valid: true };
    }
  },
  {
    name: 'JWT_EXPIRES_IN',
    required: false,
    validate: (value) => ({
      valid: /^\d+[hdms]$/.test(value),
      message: 'Must be a valid duration (e.g., 24h, 7d, 3600s)'
    })
  },
  {
    name: 'COOKIE_SECRET',
    required: true,
    validate: (value) => {
      const lowerValue = value.toLowerCase();
      for (const weak of WEAK_SECRETS) {
        if (lowerValue.includes(weak.toLowerCase())) {
          return { valid: false, message: 'COOKIE_SECRET appears to be a default/weak value. Generate a different secure random string from JWT_SECRET' };
        }
      }
      if (value.length < 32) {
        return { valid: false, message: 'COOKIE_SECRET must be at least 32 characters long' };
      }
      return { valid: true };
    }
  },
  {
    name: 'SUPABASE_URL',
    required: true,
    validate: (value) => ({
      valid: value.startsWith('https://') && value.includes('.supabase.co'),
      message: 'Must be a valid Supabase URL (https://*.supabase.co)'
    })
  },
  {
    name: 'SUPABASE_SERVICE_KEY',
    required: true,
    validate: (value) => ({
      valid: value.startsWith('eyJ') || value.startsWith('sb_') || value.length > 50,
      message: 'Must be a valid Supabase service key'
    })
  },
  {
    name: 'FRONTEND_URL',
    required: true,
    validate: (value) => ({
      valid: value.startsWith('http://') || value.startsWith('https://'),
      message: 'Must be a valid URL starting with http:// or https://'
    })
  },
  {
    name: 'CORS_ORIGIN',
    required: false,
    validate: (value) => ({
      valid: value.startsWith('http://') || value.startsWith('https://'),
      message: 'Must be a valid URL starting with http:// or https://'
    })
  }
];

/**
 * Validate all environment variables
 * Throws an error if any required variable is missing or invalid
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🔍 Validating environment variables...\n');

  for (const envVar of envVars) {
    const value = process.env[envVar.name];

    // Check if required
    if (envVar.required && !value) {
      errors.push(`❌ ${envVar.name}: Required environment variable is missing`);
      continue;
    }

    // Skip validation if not required and not provided
    if (!value) {
      warnings.push(`⚠️  ${envVar.name}: Using default value`);
      continue;
    }

    // Run custom validation
    if (envVar.validate) {
      const result = envVar.validate(value);
      if (!result.valid) {
        // In development, warn but don't fail for certain issues
        if (process.env.NODE_ENV === 'development' && 
            (envVar.name === 'JWT_SECRET' || envVar.name === 'COOKIE_SECRET')) {
          warnings.push(`⚠️  ${envVar.name}: ${result.message}`);
          warnings.push(`   Using weak secret in development mode only!`);
        } else {
          errors.push(`❌ ${envVar.name}: ${result.message}`);
        }
      } else {
        console.log(`✅ ${envVar.name}: Valid`);
      }
    } else {
      console.log(`✅ ${envVar.name}: Set`);
    }
  }

  // Security-specific checks for production
  if (process.env.NODE_ENV === 'production') {
    // Ensure JWT_SECRET !== COOKIE_SECRET
    if (process.env.JWT_SECRET === process.env.COOKIE_SECRET) {
      errors.push('❌ SECURITY: JWT_SECRET and COOKIE_SECRET must be different values');
    }

    // Check for development URLs in production
    if (process.env.FRONTEND_URL?.includes('localhost')) {
      errors.push('❌ SECURITY: FRONTEND_URL points to localhost in production');
    }
    if (process.env.SUPABASE_URL?.includes('localhost')) {
      errors.push('❌ SECURITY: SUPABASE_URL points to localhost in production');
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:\n');
    warnings.forEach(w => console.log(w));
  }

  // Print errors and exit if any
  if (errors.length > 0) {
    console.error('\n❌ Environment Validation Failed:\n');
    errors.forEach(e => console.error(e));
    console.error('\n🔧 Please fix these issues before starting the application.\n');
    process.exit(1);
  }

  console.log('\n✅ All environment variables validated successfully!\n');
}

/**
 * Generate a secure random secret
 * Helper function for generating secrets
 */
export function generateSecureSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Check if running with secure configuration
 */
export function isSecureConfig(): boolean {
  try {
    validateEnv();
    return true;
  } catch {
    return false;
  }
}

export default validateEnv;
