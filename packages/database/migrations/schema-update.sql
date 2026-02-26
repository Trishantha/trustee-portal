-- ============================================================
-- Trustee Portal - Database Schema Update
-- Fixes missing tables and relationships
-- Run this in Supabase SQL Editor to fix database issues
-- ============================================================

-- ============================================================
-- 1. TASKS TABLE (Missing - causes dashboard errors)
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- ============================================================
-- 2. MEETINGS TABLES (Missing - causes dashboard errors)
-- ============================================================
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

CREATE TABLE IF NOT EXISTS public.meeting_attendees (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rsvp_status TEXT DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'attending', 'declined', 'tentative')),
    attended BOOLEAN DEFAULT FALSE,
    notes TEXT,
    UNIQUE(meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meetings_org_id ON public.meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON public.meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user_id ON public.meeting_attendees(user_id);

-- ============================================================
-- 3. MESSAGING TABLES (Missing - causes dashboard errors)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT,
    type TEXT DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
    created_by INTEGER REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON public.messages(sent_at);

-- ============================================================
-- 4. RECRUITMENT TABLES (Missing - causes recruitment module errors)
-- ============================================================
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

CREATE TABLE IF NOT EXISTS public.shortlisted_interviewers (
    id SERIAL PRIMARY KEY,
    shortlisted_id INTEGER NOT NULL REFERENCES public.shortlisted_candidates(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    UNIQUE(shortlisted_id, user_id)
);

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

CREATE INDEX IF NOT EXISTS idx_job_openings_org_id ON public.job_openings(organization_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_email ON public.applications(email);

-- ============================================================
-- 5. FIX ORGANIZATIONS TABLE - Add missing columns for SaaS
-- ============================================================
-- Add subscription_plan_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'subscription_plan_id'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN subscription_plan_id INTEGER REFERENCES public.subscription_plans(id);
    END IF;
END $$;

-- Add trial_ends_at if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'trial_ends_at'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN trial_ends_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add subscription_status if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'subscription_status'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN subscription_status TEXT DEFAULT 'trial' 
            CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended'));
    END IF;
END $$;

-- Add stripe_customer_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN stripe_customer_id TEXT;
    END IF;
END $$;

-- Add stripe_subscription_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN stripe_subscription_id TEXT;
    END IF;
END $$;

-- Add is_active to users if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Add avatar to users if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'avatar'
    ) THEN
        ALTER TABLE public.users ADD COLUMN avatar TEXT;
    END IF;
END $$;

-- Add is_super_admin to users if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_super_admin'
    ) THEN
        ALTER TABLE public.users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ============================================================
-- 6. INSERT DEFAULT DATA
-- ============================================================

-- Insert default subscription plans if they don't exist
INSERT INTO public.subscription_plans (name, code, price_monthly, price_yearly, max_trustees, features, is_active) VALUES
('Trial', 'trial', 0, 0, 5, '["Basic Features", "5 Trustees", "30 Days"]', TRUE),
('Basic', 'basic', 29, 290, 10, '["All Basic Features", "10 Trustees", "Email Support", "Document Storage"]', TRUE),
('Standard', 'standard', 79, 790, 25, '["All Basic Features", "25 Trustees", "Priority Support", "Advanced Reports", "API Access"]', TRUE),
('Enterprise', 'enterprise', 199, 1990, 100, '["All Standard Features", "Unlimited Trustees", "24/7 Support", "Custom Integrations", "Dedicated Account Manager"]', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Insert default platform admin user (password: admin123 - bcrypt hash)
INSERT INTO public.users (email, password, role, first_name, last_name, is_super_admin, is_active, created_at) VALUES
('platform@admin.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'platform_admin', 'Platform', 'Admin', TRUE, TRUE, NOW())
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 7. CREATE UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables with updated_at
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
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on tables
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Create policies for tasks (simplified - full access for now)
DROP POLICY IF EXISTS tasks_all_access ON public.tasks;
CREATE POLICY tasks_all_access ON public.tasks FOR ALL USING (true) WITH CHECK (true);

-- Create policies for meetings
DROP POLICY IF EXISTS meetings_all_access ON public.meetings;
CREATE POLICY meetings_all_access ON public.meetings FOR ALL USING (true) WITH CHECK (true);

-- Create policies for meeting_attendees
DROP POLICY IF EXISTS meeting_attendees_all_access ON public.meeting_attendees;
CREATE POLICY meeting_attendees_all_access ON public.meeting_attendees FOR ALL USING (true) WITH CHECK (true);

-- Create policies for conversations
DROP POLICY IF EXISTS conversations_all_access ON public.conversations;
CREATE POLICY conversations_all_access ON public.conversations FOR ALL USING (true) WITH CHECK (true);

-- Create policies for messages
DROP POLICY IF EXISTS messages_all_access ON public.messages;
CREATE POLICY messages_all_access ON public.messages FOR ALL USING (true) WITH CHECK (true);

-- Create policies for job_openings
DROP POLICY IF EXISTS job_openings_all_access ON public.job_openings;
CREATE POLICY job_openings_all_access ON public.job_openings FOR ALL USING (true) WITH CHECK (true);

-- Create policies for applications
DROP POLICY IF EXISTS applications_all_access ON public.applications;
CREATE POLICY applications_all_access ON public.applications FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 9. CREATE INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_shortlisted_status ON public.shortlisted_candidates(status);

-- ============================================================
-- SCHEMA UPDATE COMPLETE
-- ============================================================
SELECT 'Schema update completed successfully!' as result;
