-- Fix Organizations Table Schema
-- Run this in Supabase Dashboard → SQL Editor

-- Add missing columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS subscription_plan_id INTEGER REFERENCES subscription_plans(id),
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS client_id VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS term_length_years INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS term_notification_days INTEGER[] DEFAULT ARRAY[90, 60, 30],
ADD COLUMN IF NOT EXISTS license_type VARCHAR(50) DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS max_trustees INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS website_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS renewal_notification_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS enable_term_tracking BOOLEAN DEFAULT true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_plan_id ON organizations(subscription_plan_id);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_status ON organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON organizations(client_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Update existing organizations to have default values
UPDATE organizations 
SET subscription_status = 'trial',
    license_type = 'trial'
WHERE subscription_status IS NULL;

-- Check the structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'organizations' 
ORDER BY ordinal_position;
