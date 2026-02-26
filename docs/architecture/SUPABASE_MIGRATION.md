# Supabase Migration Guide

Complete guide for migrating the Trustee Portal from SQLite to Supabase (PostgreSQL).

## Overview

This migration enables:
- **Cloud-hosted PostgreSQL database** with automatic backups
- **Real-time subscriptions** for live data updates
- **Row Level Security (RLS)** for fine-grained access control
- **Connection pooling** for better performance
- **Horizontal scaling** as your SaaS grows

## Migration Steps

### 1. Install Dependencies

```bash
cd /workspaces/trustee-portal/backend
npm install @supabase/supabase-js
```

✅ Already completed.

### 2. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Enter project details:
   - **Name**: `trustee-portal` (or your preferred name)
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
4. Wait for project provisioning (1-2 minutes)

### 3. Get Supabase Credentials

1. In your Supabase project dashboard, go to **Settings > API**
2. Copy the following values:
   - **Project URL** (SUPABASE_URL)
   - **anon public** key (SUPABASE_ANON_KEY)
   - **service_role secret** key (SUPABASE_SERVICE_KEY)

3. Update your `.env` file:

```bash
cd /workspaces/trustee-portal/backend
```

Edit `.env`:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Enable Supabase
USE_SUPABASE=true
```

### 4. Create Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the contents of `backend/database/supabase-schema.sql`
4. Paste and click "Run"

This creates all tables, indexes, and triggers.

### 5. Migrate Existing Data

**Option A: Using the Migration Script**

```bash
cd /workspaces/trustee-portal/backend
node scripts/migrate-to-supabase.js
```

This transfers all data from SQLite to Supabase.

**Option B: Fresh Start (No Data Migration)**

If you don't need existing data, skip this step. The schema already includes seed data.

### 6. Test the Migration

1. Start the backend server:
```bash
cd /workspaces/trustee-portal/backend
npm start
```

2. Check the console output - you should see:
```
✅ Using Supabase (PostgreSQL) database
```

3. Test API endpoints:
```bash
# Health check
curl http://localhost:3001/api/health

# SaaS info
curl http://localhost:3001/api/saas/info
```

### 7. Configure Row Level Security (RLS)

In Supabase SQL Editor, run:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own data" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

-- Create policies for organizations
CREATE POLICY "Members can view their organizations" ON organizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id::text = auth.uid()::text
        )
    );

-- Create policies for organization_members
CREATE POLICY "Users can view org members" ON organization_members
    FOR SELECT USING (
        user_id::text = auth.uid()::text OR
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = organization_members.organization_id
            AND om.user_id::text = auth.uid()::text
        )
    );
```

### 8. Configure Connection Pooling (Optional)

For high-traffic production:

1. In Supabase dashboard, go to **Database > Connection Pooling**
2. Note the connection string
3. For serverless environments, use the pooled connection

### 9. Update Frontend for Real-Time (Optional)

To enable real-time updates in the frontend:

```javascript
// In js/app.js or specific modules
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://your-project-id.supabase.co',
    'your-anon-key'
);

// Subscribe to changes
const subscription = supabase
    .channel('trustees-channel')
    .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'organization_members' },
        (payload) => {
            console.log('Change received!', payload);
            // Refresh your UI
        }
    )
    .subscribe();
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Service role key (backend only) | Yes |
| `SUPABASE_ANON_KEY` | Anonymous key (frontend/backend) | Yes |
| `USE_SUPABASE` | Set to `true` to enable Supabase | Yes |
| `DB_PATH` | SQLite path (fallback when USE_SUPABASE=false) | No |

## Switching Back to SQLite

If you need to revert to SQLite:

1. Set `USE_SUPABASE=false` in `.env`
2. Restart the server
3. The app will automatically use SQLite

## Troubleshooting

### "Cannot find module '@supabase/supabase-js'"
```bash
cd backend && npm install
```

### "Invalid API key"
- Check that SUPABASE_SERVICE_KEY is correct
- Ensure you're using the service_role key, not anon key

### "Relation does not exist"
- Run the schema SQL in Supabase SQL Editor
- Check that tables were created successfully

### "Connection refused"
- Verify SUPABASE_URL is correct
- Check if project is paused (free tier pauses after 7 days)

### Data migration errors
- Ensure SQLite database exists at `backend/database/trustee_portal.db`
- Check that Supabase credentials are correct
- Run migration with `DEBUG=* node scripts/migrate-to-supabase.js` for verbose output

## Performance Considerations

### SQLite (Local)
- ✅ Zero latency
- ✅ No network dependencies
- ✅ Simple backups (just copy file)
- ❌ Single machine only
- ❌ No real-time features

### Supabase (Cloud)
- ✅ Horizontal scaling
- ✅ Real-time subscriptions
- ✅ Automatic backups
- ✅ Row Level Security
- ❌ Network latency (~20-100ms)
- ❌ Requires internet connection

## Security Best Practices

1. **Never expose SUPABASE_SERVICE_KEY** in frontend code
2. **Enable RLS policies** for production
3. **Use SSL** for all connections (enforced by Supabase)
4. **Rotate keys** periodically
5. **Monitor query performance** in Supabase dashboard

## Production Checklist

- [ ] Supabase project created
- [ ] Schema deployed
- [ ] Data migrated
- [ ] RLS policies configured
- [ ] Environment variables set
- [ ] API endpoints tested
- [ ] Frontend real-time features (if applicable)
- [ ] Backup strategy configured
- [ ] Monitoring/alerts set up

## Support

- Supabase Docs: [https://supabase.com/docs](https://supabase.com/docs)
- PostgreSQL Docs: [https://www.postgresql.org/docs/](https://www.postgresql.org/docs/)
- Trustee Portal Issues: Check project README
