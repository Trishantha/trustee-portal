-- Fix missing columns in Supabase schema
-- Run this in Supabase SQL Editor

-- organization_members table
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS invited_by INTEGER REFERENCES users(id);

-- organizations table (if not already added)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;

-- Add client_id column for unique organization identifier
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS client_id TEXT UNIQUE;

-- Generate client IDs for existing organizations without one
DO $$
DECLARE
    org RECORD;
    new_client_id TEXT;
    id_exists BOOLEAN;
BEGIN
    FOR org IN SELECT id FROM organizations WHERE client_id IS NULL
    LOOP
        -- Generate unique 12-character alphanumeric ID (excluding 0, O, 1, I, L)
        LOOP
            new_client_id := upper(substring(replace(replace(replace(replace(md5(random()::text), '0', ''), 'O', ''), '1', ''), 'I', '') from 1 for 12));
            IF length(new_client_id) < 12 THEN
                new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from 1 for (12 - length(new_client_id))));
            END IF;
            -- Check if this ID already exists
            SELECT EXISTS(SELECT 1 FROM organizations WHERE client_id = new_client_id) INTO id_exists;
            EXIT WHEN NOT id_exists;
        END LOOP;
        
        UPDATE organizations SET client_id = new_client_id WHERE id = org.id;
    END LOOP;
END $$;

-- Create index for client_id lookups
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON organizations(client_id);

-- Update platform admin user
UPDATE users SET is_super_admin = true, role = 'platform_admin' WHERE email = 'platform@admin.com';
