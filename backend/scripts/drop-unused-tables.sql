-- Drop Unused Tables from Supabase
-- Based on codebase analysis
-- ⚠️  WARNING: Review carefully before running!

-- Tables identified as UNUSED by code analyzer:
-- - boards (0 references)
-- - board_members (0 references)  
-- - committee_members (0 references)
-- - document_folders (0 references)
-- - documents (0 references)
-- - notifications (0 references)

-- ============================================
-- SAFE DROPS - Tables with zero code references
-- ============================================

-- Drop boards and related
DROP TABLE IF EXISTS public.board_members CASCADE;
DROP TABLE IF EXISTS public.boards CASCADE;

-- Drop committee members (committees table IS used, keep it)
DROP TABLE IF EXISTS public.committee_members CASCADE;

-- Drop document tables
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.document_folders CASCADE;

-- Drop notifications
DROP TABLE IF EXISTS public.notifications CASCADE;

-- ============================================
-- VERIFY REMAINING TABLES
-- ============================================

SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
