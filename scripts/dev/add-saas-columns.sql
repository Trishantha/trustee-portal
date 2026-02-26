-- Add missing SaaS columns to organizations table
-- Run this in Supabase SQL Editor

-- Add plan_id column
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES subscription_plans(id);

-- Add subscription status columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial' 
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled'));

-- Add trial dates
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add billing period columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' 
    CHECK (billing_cycle IN ('monthly', 'yearly'));

-- Add Stripe columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add billing info
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS storage_used_mb INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_plan_id ON organizations(plan_id);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_status ON organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);

-- Update existing organizations to have default values
UPDATE organizations SET 
    subscription_status = COALESCE(subscription_status, 'trial'),
    billing_cycle = COALESCE(billing_cycle, 'monthly'),
    is_active = COALESCE(is_active, TRUE),
    storage_used_mb = COALESCE(storage_used_mb, 0)
WHERE subscription_status IS NULL OR billing_cycle IS NULL;
