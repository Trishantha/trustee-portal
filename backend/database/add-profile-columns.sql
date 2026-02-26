-- Add profile columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS job_title VARCHAR(255),
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS location_city VARCHAR(255),
ADD COLUMN IF NOT EXISTS location_country VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_country VARCHAR(255),
ADD COLUMN IF NOT EXISTS area VARCHAR(255),
ADD COLUMN IF NOT EXISTS website VARCHAR(500),
ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS github_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN users.job_title IS 'User job title or position';
COMMENT ON COLUMN users.bio IS 'User biography or description';
COMMENT ON COLUMN users.location_city IS 'City of residence';
COMMENT ON COLUMN users.location_country IS 'Country of residence';
COMMENT ON COLUMN users.website IS 'Personal website URL';
COMMENT ON COLUMN users.mfa_enabled IS 'Whether MFA is enabled for this user';
