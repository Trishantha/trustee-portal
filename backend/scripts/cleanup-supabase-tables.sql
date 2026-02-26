-- Supabase Table Cleanup Script
-- Identifies and drops obsolete/unused tables

-- ============================================
-- STEP 1: View all current tables
-- ============================================
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- STEP 2: Drop obviously obsolete tables
-- ============================================

-- Test/temp tables
DROP TABLE IF EXISTS public.test_table CASCADE;
DROP TABLE IF EXISTS public.temp_table CASCADE;
DROP TABLE IF EXISTS public.tmp_table CASCADE;
DROP TABLE IF EXISTS public.test CASCADE;

-- Old/backup tables (usually created during migrations)
DROP TABLE IF EXISTS public.organizations_old CASCADE;
DROP TABLE IF EXISTS public.users_old CASCADE;
DROP TABLE IF EXISTS public.organizations_backup CASCADE;
DROP TABLE IF EXISTS public.users_backup CASCADE;

-- Legacy table names (if renamed)
DROP TABLE IF EXISTS public.plans CASCADE;  -- renamed to subscription_plans
DROP TABLE IF EXISTS public.members CASCADE;  -- renamed to organization_members
DROP TABLE IF EXISTS public.orgs CASCADE;  -- renamed to organizations

-- Duplicated auth tables (should use auth schema)
DROP TABLE IF EXISTS public.auth_users CASCADE;
DROP TABLE IF EXISTS public.supabase_auth_users CASCADE;

-- Migration tables (if using external migration tool)
-- DROP TABLE IF EXISTS public.schema_migrations CASCADE;
-- DROP TABLE IF EXISTS public.knex_migrations CASCADE;
-- DROP TABLE IF EXISTS public.knex_migrations_lock CASCADE;

-- ============================================
-- STEP 3: Optional - Consolidate logging tables
-- ============================================
-- If both exist, you may want to keep only one:
-- activity_logs vs audit_log - they serve similar purposes

-- To migrate data from audit_log to activity_logs before dropping:
/*
INSERT INTO public.activity_logs (organization_id, user_id, action, entity_type, entity_id, details, created_at)
SELECT 
    organization_id,
    user_id,
    action,
    table_name as entity_type,
    record_id as entity_id,
    jsonb_build_object('old', old_values, 'new', new_values) as details,
    created_at
FROM public.audit_log;

DROP TABLE IF EXISTS public.audit_log CASCADE;
*/

-- ============================================
-- STEP 4: Clean up unused indexes
-- ============================================
-- Drop indexes on dropped tables automatically via CASCADE
-- But you can also drop unused indexes manually:

-- DROP INDEX IF EXISTS idx_unused_index;

-- ============================================
-- STEP 5: Verify final table list
-- ============================================
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- RECOMMENDED CORE TABLES (keep these)
-- ============================================
-- users - User accounts
-- organizations - Organizations/tenants
-- organization_members - Membership linking
-- subscription_plans - Subscription plans/pricing
-- activity_logs - Activity audit trail
-- boards - Board management (if using)
-- board_members - Board membership
-- committees - Committee management (if using)
-- committee_members - Committee membership
-- documents - File storage (if using)
-- document_folders - Folder structure (if using)
-- notifications - User notifications (if using)
-- audit_log - Detailed audit (if using, or merge with activity_logs)
