-- Cleanup Script for Supabase (Simple Version)
-- Remove all organizations and related data, keep platform admin
-- Run this in Supabase SQL Editor

-- Delete from tables that exist (ignore missing tables)
DO $$
BEGIN
    -- Delete activity logs
    BEGIN DELETE FROM activity_logs WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'activity_logs: %', SQLERRM; END;
    
    -- Delete committee related data
    BEGIN DELETE FROM committee_members; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'committee_members: %', SQLERRM; END;
    BEGIN DELETE FROM committees; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'committees: %', SQLERRM; END;
    
    -- Delete board related data
    BEGIN DELETE FROM board_members; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'board_members: %', SQLERRM; END;
    BEGIN DELETE FROM boards; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'boards: %', SQLERRM; END;
    
    -- Delete documents
    BEGIN DELETE FROM documents WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'documents: %', SQLERRM; END;
    BEGIN DELETE FROM document_folders WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'document_folders: %', SQLERRM; END;
    
    -- Delete meetings
    BEGIN DELETE FROM meeting_attendees; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'meeting_attendees: %', SQLERRM; END;
    BEGIN DELETE FROM meetings WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'meetings: %', SQLERRM; END;
    
    -- Delete conversations and messages
    BEGIN DELETE FROM messages; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'messages: %', SQLERRM; END;
    BEGIN DELETE FROM conversation_participants; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'conversation_participants: %', SQLERRM; END;
    BEGIN DELETE FROM conversations WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'conversations: %', SQLERRM; END;
    
    -- Delete notifications
    BEGIN DELETE FROM notifications WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'notifications: %', SQLERRM; END;
    
    -- Delete tasks
    BEGIN DELETE FROM tasks WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'tasks: %', SQLERRM; END;
    
    -- Delete policies
    BEGIN DELETE FROM policies WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'policies: %', SQLERRM; END;
    
    -- Delete training
    BEGIN DELETE FROM user_training; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'user_training: %', SQLERRM; END;
    BEGIN DELETE FROM training_modules WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'training_modules: %', SQLERRM; END;
    
    -- Delete recruitment data
    BEGIN DELETE FROM biometric_verifications WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'biometric_verifications: %', SQLERRM; END;
    BEGIN DELETE FROM selected_candidates WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'selected_candidates: %', SQLERRM; END;
    BEGIN DELETE FROM shortlisted_interviewers; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'shortlisted_interviewers: %', SQLERRM; END;
    BEGIN DELETE FROM shortlisted_candidates WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'shortlisted_candidates: %', SQLERRM; END;
    BEGIN DELETE FROM applications WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'applications: %', SQLERRM; END;
    BEGIN DELETE FROM job_openings WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'job_openings: %', SQLERRM; END;
    
    -- Delete audit logs
    BEGIN DELETE FROM audit_log WHERE organization_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'audit_log: %', SQLERRM; END;
    
    -- Delete organization related
    BEGIN DELETE FROM organization_invitations; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'organization_invitations: %', SQLERRM; END;
    BEGIN DELETE FROM organization_members; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'organization_members: %', SQLERRM; END;
    BEGIN DELETE FROM organizations; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'organizations: %', SQLERRM; END;
    
    -- Delete non-platform-admin users
    BEGIN DELETE FROM users WHERE email != 'platform@admin.com'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'users cleanup: %', SQLERRM; END;
    
END $$;

-- Reset subscription plans
DELETE FROM subscription_plans;

INSERT INTO subscription_plans (name, code, price_monthly, price_yearly, max_trustees, features, is_active) VALUES
    ('Starter', 'starter', 49, 490, 5, '["Up to 5 trustees", "3 committees", "5GB storage", "Email support"]', TRUE),
    ('Professional', 'professional', 149, 1490, 25, '["Up to 25 trustees", "10 committees", "50GB storage", "Priority support"]', TRUE),
    ('Enterprise', 'enterprise', 399, 3990, 100, '["Up to 100 trustees", "Unlimited committees", "500GB storage", "24/7 support"]', TRUE);

-- Verify cleanup
SELECT 'Organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'Users (should be 1 for platform admin)', COUNT(*) FROM users
UNION ALL
SELECT 'Platform Admin Exists', COUNT(*) FROM users WHERE email='platform@admin.com'
UNION ALL
SELECT 'Subscription Plans (should be 3)', COUNT(*) FROM subscription_plans;
