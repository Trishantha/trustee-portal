-- ==========================================
-- COMPLETE DATABASE RESET & RE-CREATE
-- Trustee Portal v2.0 - TypeScript Backend
-- ==========================================
-- WARNING: This will DELETE ALL EXISTING DATA
-- Run this in Supabase SQL Editor
-- ==========================================

-- ==========================================
-- PART 1: DROP ALL EXISTING TABLES (in dependency order)
-- ==========================================

-- Drop tables with foreign key dependencies first
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS organization_invitations CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Drop any custom types
DROP TYPE IF EXISTS subscription_status CASCADE;

-- ==========================================
-- PART 2: CREATE USERS TABLE
-- ==========================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Authentication
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    
    -- Profile
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    avatar TEXT,
    job_title TEXT,
    bio TEXT,
    phone TEXT,
    
    -- Location
    location_city TEXT,
    location_country TEXT,
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    
    -- Social Links
    website TEXT,
    linkedin_url TEXT,
    twitter_url TEXT,
    github_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_super_admin BOOLEAN DEFAULT false,
    
    -- Email Verification
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    verification_token TEXT,
    
    -- MFA
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret TEXT,
    
    -- Password Reset
    reset_password_token TEXT,
    reset_password_expires TIMESTAMP WITH TIME ZONE,
    password_changed_at TIMESTAMP WITH TIME ZONE,
    
    -- Security
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip TEXT,
    
    -- Refresh Token
    refresh_token TEXT,
    refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE INDEX idx_users_reset_token ON users(reset_password_token);
CREATE INDEX idx_users_refresh_token ON users(refresh_token);

-- ==========================================
-- PART 3: CREATE SUBSCRIPTION PLANS TABLE
-- ==========================================

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    
    -- Pricing (in cents)
    price_monthly INTEGER NOT NULL,
    price_yearly INTEGER NOT NULL,
    
    -- Limits
    max_users INTEGER NOT NULL,
    max_storage_mb INTEGER NOT NULL,
    max_committees INTEGER NOT NULL,
    
    -- Features
    features JSONB,
    
    -- Stripe
    stripe_price_id_monthly TEXT,
    stripe_price_id_yearly TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_popular BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- PART 4: CREATE ORGANIZATIONS TABLE
-- ==========================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT UNIQUE NOT NULL,
    
    -- Basic Info
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    
    -- URLs
    website_url TEXT,
    custom_domain TEXT,
    
    -- Branding
    logo_url TEXT,
    favicon_url TEXT,
    primary_color TEXT,
    secondary_color TEXT,
    
    -- Contact
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    
    -- Subscription
    plan_id UUID REFERENCES subscription_plans(id),
    subscription_status TEXT DEFAULT 'trial',
    subscription_stripe_id TEXT,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    subscription_started_at TIMESTAMP WITH TIME ZONE,
    subscription_ends_at TIMESTAMP WITH TIME ZONE,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    
    -- Limits
    max_members INTEGER DEFAULT 5,
    storage_used_mb INTEGER DEFAULT 0,
    max_storage_mb INTEGER DEFAULT 5120,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Term Settings
    default_term_length_years INTEGER DEFAULT 3,
    max_consecutive_terms INTEGER DEFAULT 2,
    renewal_notification_days INTEGER[] DEFAULT ARRAY[90, 60, 30],
    auto_renewal_policy TEXT DEFAULT 'opt_in',
    enable_term_tracking BOOLEAN DEFAULT true,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Relations
    created_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Organizations indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_client_id ON organizations(client_id);
CREATE INDEX idx_organizations_custom_domain ON organizations(custom_domain);

-- ==========================================
-- PART 5: CREATE ORGANIZATION MEMBERS TABLE
-- ==========================================

CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role (RBAC)
    role TEXT NOT NULL,
    department TEXT,
    title TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Invitation Tracking
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE,
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMP WITH TIME ZONE,
    
    -- Term Tracking
    term_start_date DATE,
    term_end_date DATE,
    term_length_years INTEGER,
    renewal_notified_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(organization_id, user_id)
);

-- Organization members indexes
CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(role);

-- ==========================================
-- PART 6: CREATE ORGANIZATION INVITATIONS TABLE
-- ==========================================

CREATE TABLE organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    title TEXT,
    
    -- Security
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Status
    accepted_at TIMESTAMP WITH TIME ZONE,
    accepted_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Term Settings
    term_length_years INTEGER,
    term_start_date DATE,
    
    -- Relations
    invited_by UUID NOT NULL REFERENCES users(id),
    
    -- Timestamps
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization invitations indexes
CREATE INDEX idx_invitations_org_id ON organization_invitations(organization_id);
CREATE INDEX idx_invitations_email ON organization_invitations(email);
CREATE INDEX idx_invitations_token ON organization_invitations(token_hash);

-- ==========================================
-- PART 7: CREATE AUDIT LOGS TABLE
-- ==========================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Action Details
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB,
    
    -- Context
    ip_address TEXT,
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_org_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ==========================================
-- PART 8: ADD CONSTRAINTS
-- ==========================================

-- Add role check constraint for users
ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IS NULL OR role IN (
    'super_admin', 'owner', 'admin', 'chair', 'vice_chair', 
    'treasurer', 'secretary', 'mlro', 'compliance_officer', 
    'health_officer', 'trustee', 'volunteer', 'viewer'
));

-- Add role check constraint for organization_members
ALTER TABLE organization_members ADD CONSTRAINT org_members_role_check 
CHECK (role IN (
    'owner', 'admin', 'chair', 'vice_chair', 'treasurer', 
    'secretary', 'mlro', 'compliance_officer', 'health_officer', 
    'trustee', 'volunteer', 'viewer'
));

-- Add role check constraint for organization_invitations
ALTER TABLE organization_invitations ADD CONSTRAINT invitations_role_check 
CHECK (role IN (
    'admin', 'chair', 'vice_chair', 'treasurer', 'secretary', 
    'mlro', 'compliance_officer', 'health_officer', 'trustee', 
    'volunteer', 'viewer'
));

-- Add subscription status check
ALTER TABLE organizations ADD CONSTRAINT org_subscription_status_check 
CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended'));

-- ==========================================
-- PART 9: ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- PART 10: CREATE SEED DATA
-- ==========================================

-- Create Platform Admin
INSERT INTO users (
    email, 
    password_hash, 
    first_name, 
    last_name, 
    is_super_admin, 
    email_verified,
    timezone,
    language
) VALUES (
    'platform-admin@trusteeportal.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    'Platform',
    'Administrator',
    true,
    true,
    'UTC',
    'en'
);

-- Create Subscription Plans
INSERT INTO subscription_plans (
    name, 
    slug, 
    description, 
    price_monthly, 
    price_yearly, 
    max_users, 
    max_storage_mb, 
    max_committees,
    is_active,
    sort_order
) VALUES 
(
    'Starter', 
    'starter', 
    'Perfect for small charities just getting started with digital governance',
    4900, 
    49000, 
    5, 
    5120, 
    3,
    true,
    1
),
(
    'Professional', 
    'professional', 
    'For growing organizations with multiple committees',
    14900, 
    149000, 
    25, 
    51200, 
    10,
    true,
    2
),
(
    'Enterprise', 
    'enterprise', 
    'For large organizations with advanced compliance needs',
    39900, 
    399000, 
    100, 
    512000, 
    100,
    true,
    3
);

-- ==========================================
-- PART 11: CREATE UPDATE TRIGGER FUNCTION
-- ==========================================

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON organization_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- DONE!
-- ==========================================
