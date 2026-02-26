-- Step 1: See what roles currently exist
SELECT DISTINCT role FROM users;

-- Step 2: Update any invalid roles to 'trustee' (safest default)
UPDATE users 
SET role = 'trustee' 
WHERE role NOT IN ('super_admin', 'owner', 'admin', 'chair', 'vice_chair', 
                   'treasurer', 'secretary', 'mlro', 'compliance_officer', 
                   'health_officer', 'trustee', 'volunteer', 'viewer');

-- Step 3: Now drop and recreate the constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IN ('super_admin', 'owner', 'admin', 'chair', 'vice_chair', 
                'treasurer', 'secretary', 'mlro', 'compliance_officer', 
                'health_officer', 'trustee', 'volunteer', 'viewer'));

-- Step 4: Create platform admin
INSERT INTO users (
  email, password, first_name, last_name, 
  role, is_active, email_verified, timezone, language, created_at
) VALUES (
  'platform-admin@trusteeportal.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
  'Platform',
  'Administrator',
  'super_admin',
  true,
  true,
  'UTC',
  'en',
  NOW()
) ON CONFLICT (email) DO UPDATE 
SET role = 'super_admin', is_super_admin = true;
