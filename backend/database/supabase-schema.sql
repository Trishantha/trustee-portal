-- Supabase PostgreSQL Schema for Trustee Portal
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    role TEXT DEFAULT 'trustee' CHECK (role IN ('platform_admin', 'organization_owner', 'admin', 'chair', 'secretary', 'trustee', 'viewer')),
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id SERIAL PRIMARY KEY,
    client_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE,
    license_type TEXT DEFAULT 'trial' CHECK (license_type IN ('trial', 'basic', 'standard', 'enterprise')),
    license_expires_at TIMESTAMP WITH TIME ZONE,
    max_trustees INTEGER DEFAULT 5,
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT,
    website TEXT,
    term_length_years INTEGER DEFAULT 3,
    term_notification_days INTEGER[] DEFAULT ARRAY[90, 60, 30]
);

-- Index for fast client_id lookups
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON organizations(client_id);

-- Organization members with term tracking
CREATE TABLE IF NOT EXISTS public.organization_members (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'trustee' CHECK (role IN ('owner', 'admin', 'chair', 'secretary', 'trustee', 'viewer')),
    term_start_date DATE,
    term_end_date DATE,
    term_length_years INTEGER DEFAULT 3,
    renewal_notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Boards table
CREATE TABLE IF NOT EXISTS public.boards (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Board members
CREATE TABLE IF NOT EXISTS public.board_members (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    organization_member_id INTEGER NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
    position TEXT CHECK (position IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(board_id, organization_member_id)
);

-- Committees table
CREATE TABLE IF NOT EXISTS public.committees (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    board_id INTEGER REFERENCES public.boards(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Committee members
CREATE TABLE IF NOT EXISTS public.committee_members (
    id SERIAL PRIMARY KEY,
    committee_id INTEGER NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    organization_member_id INTEGER NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('chair', 'vice_chair', 'secretary', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(committee_id, organization_member_id)
);

-- Subscription plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    price_monthly INTEGER,
    price_yearly INTEGER,
    max_trustees INTEGER,
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity log
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document folders
CREATE TABLE IF NOT EXISTS public.document_folders (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES public.document_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS public.documents (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES public.document_folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    file_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_term_end ON public.organization_members(term_end_date);
CREATE INDEX IF NOT EXISTS idx_boards_org_id ON public.boards(organization_id);
CREATE INDEX IF NOT EXISTS idx_committees_org_id ON public.committees(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_org_id ON public.activity_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON public.activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, code, price_monthly, price_yearly, max_trustees, features, is_active) VALUES
('Trial', 'trial', 0, 0, 5, '["Basic Features", "5 Trustees", "30 Days"]', TRUE),
('Basic', 'basic', 29, 290, 10, '["All Basic Features", "10 Trustees", "Email Support", "Document Storage"]', TRUE),
('Standard', 'standard', 79, 790, 25, '["All Basic Features", "25 Trustees", "Priority Support", "Advanced Reports", "API Access"]', TRUE),
('Enterprise', 'enterprise', 199, 1990, 100, '["All Standard Features", "Unlimited Trustees", "24/7 Support", "Custom Integrations", "Dedicated Account Manager"]', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Insert default platform admin user (password: password123 - bcrypt hash)
INSERT INTO public.users (email, password, role, first_name, last_name, created_at) VALUES
('platform@admin.com', '$2b$10$YourHashHere', 'platform_admin', 'Platform', 'Admin', NOW())
ON CONFLICT (email) DO NOTHING;

-- Create function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_boards_updated_at ON public.boards;
CREATE TRIGGER update_boards_updated_at
    BEFORE UPDATE ON public.boards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_committees_updated_at ON public.committees;
CREATE TRIGGER update_committees_updated_at
    BEFORE UPDATE ON public.committees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
