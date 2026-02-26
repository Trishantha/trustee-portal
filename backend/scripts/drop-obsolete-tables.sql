-- Drop Obsolete Tables from Supabase
-- Run this in Supabase SQL Editor to clean up unused tables

-- NOTE: This script drops tables that may have been created during development
-- but are no longer used. Review carefully before running!

-- Drop tables if they exist (in order of dependencies)
-- Using CASCADE to drop dependent objects

-- Drop legacy/obsolete tables (commented out - uncomment only if you're sure)

-- DROP TABLE IF EXISTS public.audit_log CASCADE;
-- DROP TABLE IF EXISTS public.notifications CASCADE;
-- DROP TABLE IF EXISTS public.documents CASCADE;
-- DROP TABLE IF EXISTS public.document_folders CASCADE;
-- DROP TABLE IF EXISTS public.committee_members CASCADE;
-- DROP TABLE IF EXISTS public.committees CASCADE;
-- DROP TABLE IF EXISTS public.board_members CASCADE;
-- DROP TABLE IF EXISTS public.boards CASCADE;
-- DROP TABLE IF EXISTS public.organization_members CASCADE;
-- DROP TABLE IF EXISTS public.organizations CASCADE;
-- DROP TABLE IF EXISTS public.users CASCADE;
-- DROP TABLE IF EXISTS public.subscription_plans CASCADE;
-- DROP TABLE IF EXISTS public.activity_logs CASCADE;

-- ============================================
-- SAFE CLEANUP - Only drop obviously obsolete tables
-- ============================================

-- Drop any test tables
DROP TABLE IF EXISTS public.test_table CASCADE;
DROP TABLE IF EXISTS public.temp_table CASCADE;
DROP TABLE IF EXISTS public.tmp_table CASCADE;

-- Drop any migration tracking tables (if not using a proper migration system)
DROP TABLE IF EXISTS public.schema_migrations CASCADE;
DROP TABLE IF EXISTS public.migrations CASCADE;

-- Drop any old/renamed tables that might exist
DROP TABLE IF EXISTS public.organizations_old CASCADE;
DROP TABLE IF EXISTS public.users_old CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;  -- if renamed to subscription_plans
DROP TABLE IF EXISTS public.members CASCADE;  -- if renamed to organization_members

-- Drop any Supabase auth tables that were duplicated (keep the ones in auth schema)
-- These might have been created accidentally
DROP TABLE IF EXISTS public.auth_users CASCADE;

-- ============================================
-- CLEANUP UNUSED COLUMNS (optional)
-- ============================================

-- Remove obsolete columns from organizations if they exist
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS old_column_name;

-- Remove obsolete columns from users if they exist  
-- ALTER TABLE public.users DROP COLUMN IF EXISTS old_column_name;

-- ============================================
-- VERIFY REMAINING TABLES
-- ============================================

-- List all tables in public schema
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
