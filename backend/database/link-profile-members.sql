-- ============================================================
-- Link Profile and Organization Members
-- This migration creates the bidirectional relationship between
-- user profiles and organization member details
-- ============================================================

-- ============================================================
-- 1. Add missing profile columns to users table
-- ============================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS location_city TEXT,
ADD COLUMN IF NOT EXISTS location_country TEXT,
ADD COLUMN IF NOT EXISTS area TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS twitter_url TEXT,
ADD COLUMN IF NOT EXISTS github_url TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================
-- 2. Add missing columns to organization_members table
-- ============================================================
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================
-- 3. Create function to sync profile to organization_members
-- ============================================================
CREATE OR REPLACE FUNCTION sync_user_profile_to_member()
RETURNS TRIGGER AS $$
BEGIN
    -- When a user's job_title is updated, sync to all their organization memberships
    UPDATE organization_members 
    SET title = NEW.job_title,
        updated_at = NOW()
    WHERE user_id = NEW.id
      AND (title IS NULL OR title = '' OR title != NEW.job_title);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_profile_to_member ON users;

-- Create trigger to auto-sync on user update
CREATE TRIGGER trg_sync_profile_to_member
    AFTER UPDATE OF job_title ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_profile_to_member();

-- ============================================================
-- 4. Create function to sync organization_members to profile
-- ============================================================
CREATE OR REPLACE FUNCTION sync_member_to_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- When organization_member's title is updated and user's job_title is empty, sync it
    IF NEW.title IS NOT NULL AND NEW.title != '' THEN
        UPDATE users 
        SET job_title = NEW.job_title,
            updated_at = NOW()
        WHERE id = NEW.user_id
          AND (job_title IS NULL OR job_title = '');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_member_to_profile ON organization_members;

-- Create trigger to auto-sync on member update
CREATE TRIGGER trg_sync_member_to_profile
    AFTER UPDATE OF title ON organization_members
    FOR EACH ROW
    EXECUTE FUNCTION sync_member_to_user_profile();

-- ============================================================
-- 5. Sync existing data (one-time migration)
-- ============================================================

-- Copy job_title from users to organization_members.title where empty
UPDATE organization_members om
SET title = u.job_title,
    updated_at = NOW()
FROM users u
WHERE om.user_id = u.id
  AND u.job_title IS NOT NULL 
  AND u.job_title != ''
  AND (om.title IS NULL OR om.title = '');

-- Copy title from organization_members to users.job_title where empty
UPDATE users u
SET job_title = om.title,
    updated_at = NOW()
FROM organization_members om
WHERE u.id = om.user_id
  AND om.title IS NOT NULL 
  AND om.title != ''
  AND (u.job_title IS NULL OR u.job_title = '');

-- ============================================================
-- 6. Add comments for documentation
-- ============================================================
COMMENT ON COLUMN users.job_title IS 'User job title - synced with organization_members.title';
COMMENT ON COLUMN organization_members.title IS 'Member title/position - synced with users.job_title';
COMMENT ON COLUMN organization_members.department IS 'Member department within the organization';

-- ============================================================
-- 7. Create indexes for better performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_job_title ON users(job_title);
CREATE INDEX IF NOT EXISTS idx_org_members_title ON organization_members(title);
CREATE INDEX IF NOT EXISTS idx_org_members_department ON organization_members(department);

-- ============================================================
-- Completion
-- ============================================================
SELECT 'Profile-Member link migration completed successfully!' as result;
