-- Cleanup Script for Supabase
-- Remove all organizations and related data, keep platform admin
-- Run this in Supabase SQL Editor

-- Start transaction
BEGIN;

-- Delete activity logs
DELETE FROM activity_logs WHERE organization_id IS NOT NULL;

-- Delete committee members
DELETE FROM committee_members WHERE committee_id IN (
    SELECT id FROM committees WHERE organization_id IS NOT NULL
);

-- Delete committees
DELETE FROM committees WHERE organization_id IS NOT NULL;

-- Delete board members
DELETE FROM board_members WHERE board_id IN (
    SELECT id FROM boards WHERE organization_id IS NOT NULL
);

-- Delete boards
DELETE FROM boards WHERE organization_id IS NOT NULL;

-- Delete documents and folders
DELETE FROM documents WHERE organization_id IS NOT NULL;
DELETE FROM document_folders WHERE organization_id IS NOT NULL;

-- Delete meeting attendees and meetings
DELETE FROM meeting_attendees WHERE meeting_id IN (
    SELECT id FROM meetings WHERE organization_id IS NOT NULL
);
DELETE FROM meetings WHERE organization_id IS NOT NULL;

-- Delete messages and conversations
DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE organization_id IS NOT NULL
);
DELETE FROM conversation_participants WHERE conversation_id IN (
    SELECT id FROM conversations WHERE organization_id IS NOT NULL
);
DELETE FROM conversations WHERE organization_id IS NOT NULL;

-- Delete notifications
DELETE FROM notifications WHERE organization_id IS NOT NULL;

-- Delete tasks
DELETE FROM tasks WHERE organization_id IS NOT NULL;

-- Delete policies
DELETE FROM policies WHERE organization_id IS NOT NULL;

-- Delete user training
DELETE FROM user_training WHERE member_id IN (
    SELECT id FROM organization_members WHERE organization_id IS NOT NULL
);

-- Delete training modules (organization-specific)
DELETE FROM training_modules WHERE organization_id IS NOT NULL;

-- Delete recruitment data
DELETE FROM biometric_verifications WHERE organization_id IS NOT NULL;
DELETE FROM selected_candidates WHERE organization_id IS NOT NULL;
DELETE FROM shortlisted_interviewers WHERE shortlisted_id IN (
    SELECT id FROM shortlisted_candidates WHERE organization_id IS NOT NULL
);
DELETE FROM shortlisted_candidates WHERE organization_id IS NOT NULL;
DELETE FROM applications WHERE organization_id IS NOT NULL;
DELETE FROM job_openings WHERE organization_id IS NOT NULL;

-- Delete organization invitations
DELETE FROM organization_invitations WHERE organization_id IS NOT NULL;

-- Delete organization members
DELETE FROM organization_members WHERE organization_id IS NOT NULL;

-- Delete organizations
DELETE FROM organizations WHERE id IS NOT NULL;

-- Delete non-platform-admin users
DELETE FROM users WHERE email != 'platform@admin.com';

-- Reset subscription plans
DELETE FROM subscription_plans;

-- Re-insert default plans
INSERT INTO subscription_plans (name, code, price_monthly, price_yearly, max_trustees, features, is_active) VALUES
    ('Starter', 'starter', 49, 490, 5, '["Up to 5 trustees", "3 committees", "5GB storage", "Email support"]', TRUE),
    ('Professional', 'professional', 149, 1490, 25, '["Up to 25 trustees", "10 committees", "50GB storage", "Priority support"]', TRUE),
    ('Enterprise', 'enterprise', 399, 3990, 100, '["Up to 100 trustees", "Unlimited committees", "500GB storage", "24/7 support"]', TRUE);

-- Reset sequences (optional - for PostgreSQL)
SELECT setval('organizations_id_seq', 1, false);
SELECT setval('organization_members_id_seq', 1, false);
SELECT setval('committees_id_seq', 1, false);
SELECT setval('meetings_id_seq', 1, false);
SELECT setval('tasks_id_seq', 1, false);
SELECT setval('documents_id_seq', 1, false);
SELECT setval('job_openings_id_seq', 1, false);
SELECT setval('applications_id_seq', 1, false);

-- Commit transaction
COMMIT;

-- Verify cleanup
SELECT 'Organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'Users (should be 1 for platform admin)', COUNT(*) FROM users
UNION ALL
SELECT 'Subscription Plans (should be 3)', COUNT(*) FROM subscription_plans;
