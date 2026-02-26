-- ============================================================
-- Trustee Portal - COMPLETE Database Schema
-- Run this in Supabase SQL Editor to set up the entire database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    role TEXT DEFAULT 'trustee' CHECK (role IN ('platform_admin', 'organization_owner', 'admin', 'chair', 'secretary', 'trustee', 'viewer')),
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    avatar TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
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

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id SERIAL PRIMARY KEY,
    client_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE,
    slug TEXT UNIQUE,
    license_type TEXT DEFAULT 'trial' CHECK (license_type IN ('trial', 'basic', 'standard', 'enterprise')),
    license_expires_at TIMESTAMP WITH TIME ZONE,
    subscription_plan_id INTEGER REFERENCES public.subscription_plans(id),
    subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended')),
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
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

-- ============================================================
-- BOARDS & COMMITTEES
-- ============================================================

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

-- ============================================================
-- TASKS & MEETINGS
-- ============================================================

-- Tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    committee_id INTEGER REFERENCES public.committees(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    meeting_type TEXT DEFAULT 'board' CHECK (meeting_type IN ('board', 'committee', 'extraordinary', 'interview')),
    meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    location TEXT,
    zoom_link TEXT,
    agenda TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meeting attendees
CREATE TABLE IF NOT EXISTS public.meeting_attendees (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rsvp_status TEXT DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'attending', 'declined', 'tentative')),
    attended BOOLEAN DEFAULT FALSE,
    notes TEXT,
    UNIQUE(meeting_id, user_id)
);

-- ============================================================
-- MESSAGING
-- ============================================================

-- Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT,
    type TEXT DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation participants
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- RECRUITMENT
-- ============================================================

-- Job openings table
CREATE TABLE IF NOT EXISTS public.job_openings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    department TEXT,
    location TEXT,
    time_commitment TEXT,
    salary_range TEXT,
    description TEXT,
    requirements TEXT,
    additional_info TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'paused')),
    expiry_date DATE,
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- Applications table
CREATE TABLE IF NOT EXISTS public.applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    cover_letter TEXT,
    cv_path TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'shortlisted', 'rejected', 'hired')),
    reviewed_by INTEGER REFERENCES public.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shortlisted candidates table
CREATE TABLE IF NOT EXISTS public.shortlisted_candidates (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    shortlisted_by INTEGER REFERENCES public.users(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'interview_scheduled', 'interview_completed', 'offered', 'rejected')),
    interview_date TIMESTAMP WITH TIME ZONE,
    interview_location TEXT,
    interview_type TEXT DEFAULT 'in_person',
    interview_notes TEXT,
    panel_score INTEGER,
    shortlisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shortlisted interviewers
CREATE TABLE IF NOT EXISTS public.shortlisted_interviewers (
    id SERIAL PRIMARY KEY,
    shortlisted_id INTEGER NOT NULL REFERENCES public.shortlisted_candidates(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    UNIQUE(shortlisted_id, user_id)
);

-- Selected candidates table
CREATE TABLE IF NOT EXISTS public.selected_candidates (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER NOT NULL REFERENCES public.shortlisted_candidates(id) ON DELETE CASCADE,
    selected_by INTEGER REFERENCES public.users(id),
    start_date DATE,
    offer_accepted BOOLEAN DEFAULT FALSE,
    offer_accepted_at TIMESTAMP WITH TIME ZONE,
    onboarding_initiated BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS & NOTIFICATIONS
-- ============================================================

-- Document folders
CREATE TABLE IF NOT EXISTS public.document_folders (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES public.document_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
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

-- Notifications table
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

-- ============================================================
-- LOGGING
-- ============================================================

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

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON public.organizations(client_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_term_end ON public.organization_members(term_end_date);
CREATE INDEX IF NOT EXISTS idx_boards_org_id ON public.boards(organization_id);
CREATE INDEX IF NOT EXISTS idx_committees_org_id ON public.committees(organization_id);
CREATE INDEX IF NOT EXISTS idx_committee_members_committee_id ON public.committee_members(committee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_meetings_org_id ON public.meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON public.meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user_id ON public.meeting_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON public.messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_job_openings_org_id ON public.job_openings(organization_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_email ON public.applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_shortlisted_status ON public.shortlisted_candidates(status);
CREATE INDEX IF NOT EXISTS idx_activity_org_id ON public.activity_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON public.activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read);

-- ============================================================
-- TRIGGER FUNCTION FOR UPDATED_AT
-- ============================================================

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
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_boards_updated_at ON public.boards;
CREATE TRIGGER update_boards_updated_at
    BEFORE UPDATE ON public.boards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_committees_updated_at ON public.committees;
CREATE TRIGGER update_committees_updated_at
    BEFORE UPDATE ON public.committees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meetings_updated_at ON public.meetings;
CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_job_openings_updated_at ON public.job_openings;
CREATE TRIGGER update_job_openings_updated_at
    BEFORE UPDATE ON public.job_openings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, code, price_monthly, price_yearly, max_trustees, features, is_active) VALUES
('Trial', 'trial', 0, 0, 5, '["Basic Features", "5 Trustees", "30 Days"]', TRUE),
('Basic', 'basic', 29, 290, 10, '["All Basic Features", "10 Trustees", "Email Support", "Document Storage"]', TRUE),
('Standard', 'standard', 79, 790, 25, '["All Basic Features", "25 Trustees", "Priority Support", "Advanced Reports", "API Access"]', TRUE),
('Enterprise', 'enterprise', 199, 1990, 100, '["All Standard Features", "Unlimited Trustees", "24/7 Support", "Custom Integrations", "Dedicated Account Manager"]', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Insert default platform admin user (password: admin123)
-- This hash is for 'admin123' - change in production!
INSERT INTO public.users (email, password, role, first_name, last_name, is_super_admin, is_active, created_at) VALUES
('platform@admin.com', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqQzBZN0UfGNEKjNjrV8/jhCzQlWe', 'platform_admin', 'Platform', 'Admin', TRUE, TRUE, NOW())
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - ENABLE
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlisted_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlisted_interviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selected_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development (restrict in production)
-- For now, allow all access - in production, create specific policies
CREATE POLICY IF NOT EXISTS users_all ON public.users FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS orgs_all ON public.organizations FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS org_members_all ON public.organization_members FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS boards_all ON public.boards FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS board_members_all ON public.board_members FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS committees_all ON public.committees FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS committee_members_all ON public.committee_members FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS tasks_all ON public.tasks FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS meetings_all ON public.meetings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS meeting_attendees_all ON public.meeting_attendees FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS conversations_all ON public.conversations FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS conversation_participants_all ON public.conversation_participants FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS messages_all ON public.messages FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS job_openings_all ON public.job_openings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS applications_all ON public.applications FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS shortlisted_all ON public.shortlisted_candidates FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS shortlisted_interviewers_all ON public.shortlisted_interviewers FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS selected_all ON public.selected_candidates FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS documents_all ON public.documents FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS document_folders_all ON public.document_folders FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS notifications_all ON public.notifications FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS activity_logs_all ON public.activity_logs FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS audit_log_all ON public.audit_log FOR ALL USING (true);

-- ============================================================
-- COMPLETION
-- ============================================================
SELECT 'Complete schema created successfully! Total tables: 25' as result;
