# Migration Guide: JavaScript to TypeScript

This guide will help you migrate from the existing JavaScript backend to the new TypeScript implementation.

---

## 📋 Pre-Migration Checklist

- [ ] Backup your database
- [ ] Document current environment variables
- [ ] Note any custom modifications to the codebase
- [ ] Prepare maintenance window for deployment

---

## 🗄️ Database Migration

### Step 1: Create Migration Script

Create a new file `prisma/migrations/20240226000000_add_audit_logs/migration.sql`:

```sql
-- Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_resource_type_idx" ON "audit_logs"("resource_type");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- Add missing columns to organizations
ALTER TABLE "organizations" 
ADD COLUMN IF NOT EXISTS "default_term_length_years" INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS "max_consecutive_terms" INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS "renewal_notification_days" INTEGER[] DEFAULT ARRAY[90, 60, 30],
ADD COLUMN IF NOT EXISTS "auto_renewal_policy" TEXT DEFAULT 'opt_in',
ADD COLUMN IF NOT EXISTS "enable_term_tracking" BOOLEAN DEFAULT true;

-- Add missing columns to users
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "refresh_token" TEXT,
ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);

-- Add missing columns to organization_members
ALTER TABLE "organization_members"
ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3);
```

### Step 2: Run Migration

```bash
cd backend
npx prisma migrate dev --name add_audit_logs
```

---

## 🔧 Backend Migration

### Step 1: Install Dependencies

```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Step 2: Update Environment Variables

Add new required variables to your `.env`:

```bash
# Required new variables
JWT_EXPIRES_IN=24h
FRONTEND_URL=https://your-domain.com

# Optional: for better security
NODE_ENV=production
```

### Step 3: Update Database Schema

```bash
npm run db:generate
```

### Step 4: Build and Test

```bash
# Type check
npm run type-check

# Build
npm run build

# Run tests
npm test
```

### Step 5: Deploy

```bash
# Start production server
npm start
```

---

## 🎨 Frontend Migration

### Step 1: Update API Client

Replace the old API client with the new one:

```html
<!-- In your HTML files, replace: -->
<script src="js/api.js"></script>

<!-- With: -->
<script src="js/api-v2.js"></script>
```

### Step 2: Update API Calls

The new API client is mostly compatible, but there are some changes:

#### Old:
```javascript
await api.post('/auth/saas/register', userData);
```

#### New:
```javascript
await authAPI.register(userData);
```

### Step 3: Error Handling

The new API throws `APIError` objects:

```javascript
try {
  await authAPI.login(email, password);
} catch (error) {
  if (error instanceof APIError) {
    console.log(error.code);    // 'INVALID_CREDENTIALS'
    console.log(error.message); // 'Invalid email or password'
  }
}
```

---

## 🔄 Data Migration (if needed)

### Migrate Existing Invitations

If you have existing invitations, you need to hash their tokens:

```javascript
// Run this once to migrate existing invitations
const crypto = require('crypto');

async function migrateInvitations() {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { acceptedAt: null }
  });
  
  for (const inv of invitations) {
    // Generate new secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await prisma.organizationInvitation.update({
      where: { id: inv.id },
      data: { tokenHash }
    });
    
    console.log(`Migrated invitation ${inv.id}, new token: ${token}`);
    // Send new invitation email with token
  }
}
```

---

## ✅ Post-Migration Checklist

- [ ] All API endpoints responding correctly
- [ ] Authentication working (login/logout/register)
- [ ] Invitations can be sent and accepted
- [ ] RBAC permissions working correctly
- [ ] Audit logs being created
- [ ] Emails being sent (if configured)
- [ ] Frontend can connect to new API
- [ ] Existing data still accessible
- [ ] No errors in logs

---

## 🐛 Common Issues

### Issue: "Cannot find module '@prisma/client'"

**Solution:**
```bash
npm run db:generate
```

### Issue: "JWT_SECRET not set"

**Solution:**
Add to `.env`:
```bash
JWT_SECRET=your-minimum-32-character-secret-key-here
```

### Issue: "Database connection failed"

**Solution:**
Check `DATABASE_URL` format:
```bash
DATABASE_URL="postgresql://user:password@host:port/database?schema=public"
```

### Issue: CORS errors in frontend

**Solution:**
Update `FRONTEND_URL` in `.env` to match your frontend domain.

---

## 📞 Support

If you encounter issues:

1. Check the logs: `logs/error.log` (in production)
2. Enable debug logging: `LOG_LEVEL=debug`
3. Review the API documentation in `docs/API_DOCUMENTATION.md`
4. Check the RBAC matrix in `docs/RBAC_MATRIX.md`

---

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/en/guide/routing.html)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
