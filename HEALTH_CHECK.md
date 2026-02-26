# Trustee Portal - Health Check & Troubleshooting Guide

## Quick Start

Run the health check script to diagnose issues:

```bash
cd backend && node scripts/health-check.js
```

## Common Issues & Fixes

### 1. Database Connection Issues

**Error:** `Could not find the table 'public.tasks'`

**Cause:** The database schema is missing required tables.

**Fix:** Run the schema update SQL in Supabase SQL Editor:

1. Go to your Supabase project dashboard
2. Open the SQL Editor
3. Copy the contents of `backend/database/schema-update.sql`
4. Run the SQL

**Tables that will be created:**
- `tasks` - Task management
- `meetings` & `meeting_attendees` - Meeting scheduling
- `conversations` & `messages` - Messaging system
- `job_openings`, `applications`, `shortlisted_candidates`, `selected_candidates` - Recruitment module

### 2. Foreign Key Relationship Error

**Error:** `Could not find a relationship between 'organizations' and 'subscription_plans'`

**Cause:** The `organizations` table is missing the `subscription_plan_id` column.

**Fix:** The schema update SQL includes:
```sql
ALTER TABLE public.organizations 
ADD COLUMN subscription_plan_id INTEGER REFERENCES public.subscription_plans(id);
```

### 3. Stripe Configuration Issue

**Error:** Stripe payment not working

**Fix:** Check your `.env` file:
```bash
# In backend/.env
STRIPE_PUBLISHABLE_KEY=pk_test_...        # Should start with pk_test_ or pk_live_
STRIPE_SECRET_KEY=sk_test_...             # Should start with sk_test_ or sk_live_
```

**Note:** There was a typo in some versions: `pk_testpk_test_` - make sure it says `pk_test_` only once.

### 4. Email Not Configured

**Warning:** `Email not configured. Set SMTP_HOST and SMTP_USER environment variables.`

**Impact:** Email notifications won't be sent, but the app will still work.

**Fix (Optional):** Add SMTP settings to `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

### 5. Dashboard Shows No Data

**Cause:** Missing database tables (tasks, meetings, etc.)

**Fix:** Run the schema update SQL (see Issue #1 above).

## Schema Update Checklist

Run this SQL in Supabase to verify your schema is complete:

```sql
-- Check if all required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'users', 'organizations', 'organization_members', 
    'boards', 'committees', 'tasks', 'meetings',
    'conversations', 'messages', 'job_openings', 
    'applications', 'shortlisted_candidates'
);
```

Expected: 15+ rows returned.

## Environment Variables Checklist

Required (App won't start without these):
- [ ] `SUPABASE_URL` - Your Supabase project URL
- [ ] `SUPABASE_SERVICE_KEY` - Service role key (keep secret!)
- [ ] `SUPABASE_ANON_KEY` - Anonymous/public key
- [ ] `JWT_SECRET` - Secret for JWT tokens (change from default!)

Optional (For full functionality):
- [ ] `STRIPE_SECRET_KEY` - For payments
- [ ] `STRIPE_PUBLISHABLE_KEY` - For payments
- [ ] `SMTP_HOST` - For email notifications
- [ ] `SMTP_USER` - For email notifications
- [ ] `SMTP_PASS` - For email notifications

## Health Check Results

### Exit Codes

- `0` - All checks passed or only warnings
- `1` - Critical issues (database connection failed)
- `2` - Errors present (missing tables, config issues)

### Common Warnings

These don't prevent the app from running but limit functionality:

- `Optional variable not set: STRIPE_SECRET_KEY` - Payments disabled
- `Optional variable not set: SMTP_HOST` - Email notifications disabled
- `JWT_SECRET is using a weak/default value` - Security risk

## Fixing Specific Errors

### PGRST200 - Foreign Key Relationship Error

This means Supabase can't find a relationship between two tables.

**Fix:** Run the schema update SQL which adds:
```sql
ALTER TABLE organizations 
ADD COLUMN subscription_plan_id INTEGER REFERENCES subscription_plans(id);
```

### PGRST205 - Table Not Found

The table doesn't exist in your database.

**Fix:** Run the schema update SQL to create missing tables.

### Connection Refused / Network Error

**Check:**
1. Is your Supabase project active?
2. Is the `SUPABASE_URL` correct?
3. Are the API keys valid (not revoked)?
4. Is your internet connection working?

## Support

If issues persist:

1. Check Supabase dashboard for any service outages
2. Verify your project hasn't exceeded free tier limits
3. Check that Row Level Security (RLS) policies are configured correctly
4. Review server logs: `backend/server.log`

## Post-Update Verification

After running the schema update, verify:

1. Restart the backend server
2. Open the browser at `http://localhost:3001`
3. Check browser console for errors
4. Run the health check script again
5. Test key features:
   - Login/Logout
   - Dashboard loading
   - Creating a task
   - Viewing calendar

## Backup Before Changes

Always backup before making schema changes:

```bash
# Create a backup
cd /workspaces/trustee-portal
tar -czf "backup_$(date +%Y%m%d_%H%M%S).tar.gz" --exclude='node_modules' --exclude='.git' .
```

Or use Supabase's built-in backup feature in the dashboard.
