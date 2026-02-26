# Trustee Portal - SaaS Migration Guide

## 🎉 Phase 1 & 2 Complete!

We've successfully implemented the foundation for multi-tenant SaaS architecture. Here's what's been done:

---

## ✅ Completed Features

### Phase 1: Multi-tenancy Foundation

#### 1. New Database Schema (`backend/database/init-saas.js`)
- **Organizations Table**: Core tenant entity with subdomain/custom domain support
- **Subscription Plans**: Starter ($49), Professional ($149), Enterprise ($399)
- **Organization Members**: Links users to organizations with roles (owner, admin, chair, secretary, trustee, viewer)
- **Organization Invitations**: Email-based invitation system
- **Audit Log**: Organization-scoped activity tracking
- **Updated All Tables**: Added `organization_id` to all existing tables

#### 2. Tenant Middleware (`backend/middleware/tenant.js`)
- Extracts tenant from:
  - Custom domain (`portal.company.com`)
  - Subdomain (`company.trusteeportal.com`)
  - `X-Organization-ID` header
  - Query parameter (`?org=company`)
- Validates subscription status (trial, active, suspended)
- Checks organization limits (users, storage, committees)
- Loads organization settings

### Phase 2: Authentication & Organization Management

#### 1. SaaS Auth Routes (`backend/routes/auth-saas.js`)
- `POST /api/auth/saas/login` - Login with optional organization context
- `POST /api/auth/saas/register` - Register new organization with owner
- `POST /api/auth/saas/select-organization` - Switch between organizations
- `POST /api/auth/saas/accept-invitation` - Accept email invitation
- `POST /api/auth/saas/forgot-password` - Password reset flow
- `POST /api/auth/saas/reset-password` - Reset password with token
- `POST /api/auth/saas/verify-email` - Email verification
- `GET /api/auth/saas/me` - Get current user with organization context

#### 2. Organization Routes (`backend/routes/organizations.js`)
- `POST /api/organizations` - Create new organization with trial
- `GET /api/organizations/check-slug/:slug` - Check slug availability
- `GET /api/organizations/my` - Get user's organizations
- `GET /api/organizations/:id` - Get organization details
- `PUT /api/organizations/:id` - Update organization settings
- `POST /api/organizations/:id/members` - Invite new member
- `GET /api/organizations/:id/members` - List members
- `PUT /api/organizations/:id/members/:memberId` - Update member
- `DELETE /api/organizations/:id/members/:memberId` - Remove member
- Super admin endpoints for platform management

#### 3. SaaS Auth Middleware (`backend/middleware/auth-saas.js`)
- JWT token generation with organization context
- Multi-tenant authentication
- Role-based authorization (owner > admin > chair > secretary > trustee > viewer)
- Organization membership verification
- Super admin checks

#### 4. Migration Script (`backend/database/migrate-to-saas.js`)
- Migrates existing single-tenant data to multi-tenant structure
- Creates default organization
- Maps existing users to organization members
- Preserves all existing data

---

## 🚀 Quick Start

### Fresh SaaS Installation

```bash
cd backend

# Reset database with SaaS schema
npm run db:reset-saas

# Start server
npm start
```

### Migrate Existing Data

```bash
cd backend

# Run migration (preserves existing data)
npm run db:migrate-saas

# Start server
npm start
```

---

## 📋 API Usage Examples

### 1. Create Organization (Registration)

```bash
curl -X POST http://localhost:3001/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "admin_email": "admin@acme.com",
    "admin_first_name": "John",
    "admin_last_name": "Doe",
    "admin_password": "SecurePass123!"
  }'
```

Response:
```json
{
  "message": "Organization created successfully!",
  "organization": {
    "id": 1,
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "subscription_status": "trial",
    "trial_ends_at": "2025-03-05T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { ... }
}
```

### 2. Login

```bash
curl -X POST http://localhost:3001/api/auth/saas/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@acme.com",
    "password": "SecurePass123!"
  }'
```

### 3. Invite Member

```bash
curl -X POST http://localhost:3001/api/organizations/1/members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "trustee@acme.com",
    "role": "trustee",
    "department": "Finance"
  }'
```

### 4. Get SaaS Info (Plans & Pricing)

```bash
curl http://localhost:3001/api/saas/info
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT REQUEST                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Tenant Middleware                                       │
│     - Extract org from domain/header/params                 │
│     - Validate subscription status                          │
│     - Attach req.organization & req.organizationId          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Auth Middleware                                         │
│     - Verify JWT token                                      │
│     - Load user & organization membership                   │
│     - Attach req.user, req.member, req.userRole             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Route Handler                                           │
│     - Check permissions (requireRole)                       │
│     - Check limits (checkOrganizationLimit)                 │
│     - Execute business logic                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Database                                                │
│     - All queries scoped by organization_id                 │
│     - Tenant isolation enforced                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Subscription Plans

| Plan | Monthly | Yearly | Users | Storage | Committees |
|------|---------|--------|-------|---------|------------|
| **Starter** | $49 | $490 | 5 | 5 GB | 3 |
| **Professional** | $149 | $1,490 | 25 | 50 GB | 10 |
| **Enterprise** | $399 | $3,990 | 100 | 500 GB | 50 |

---

## 👥 Role Hierarchy

```
Owner (6)
  └── Can do everything + manage billing + delete org
  
Admin (5)
  └── Can manage users, committees, settings
  
Chair (4)
  └── Can manage committee meetings, assign tasks
  
Secretary (3)
  └── Can manage documents, minutes
  
Trustee (2)
  └── Can view, participate, complete tasks
  
Viewer (1)
  └── Read-only access
```

---

## 🔄 Next Phases

### Phase 3: Subscription & Billing Foundation
- [ ] Stripe integration
- [ ] Webhook handlers for subscription events
- [ ] Usage tracking
- [ ] Upgrade/downgrade logic
- [ ] Invoice generation

### Phase 4: API Security & Tenant Isolation
- [ ] Update all legacy routes to be organization-aware
- [ ] Add organization scoping to all queries
- [ ] API rate limiting per organization
- [ ] Data export (GDPR compliance)

### Phase 5: Super Admin Panel
- [ ] Organization management dashboard
- [ ] User management
- [ ] Analytics & metrics
- [ ] Support tools

### Phase 6: White-label & Customization
- [ ] Custom domain configuration
- [ ] Branding (logo, colors)
- [ ] Email template customization

### Phase 7: Deployment & DevOps
- [ ] Docker containerization
- [ ] Environment configuration
- [ ] CI/CD pipeline
- [ ] Monitoring & logging

---

## 📝 Files Created/Modified

### New Files
- `backend/database/init-saas.js` - SaaS database schema
- `backend/database/migrate-to-saas.js` - Migration script
- `backend/middleware/tenant.js` - Tenant extraction
- `backend/middleware/auth-saas.js` - SaaS authentication
- `backend/routes/organizations.js` - Organization management
- `backend/routes/auth-saas.js` - SaaS authentication routes

### Modified Files
- `backend/server.js` - Updated to use SaaS routes
- `backend/package.json` - Added SaaS scripts

---

## ⚠️ Important Notes

1. **Backward Compatibility**: Legacy auth endpoints (`/api/auth/*`) still work for backward compatibility
2. **Database**: SQLite is used for development. For production SaaS, migrate to PostgreSQL
3. **Email**: Email sending is not implemented yet (marked with TODOs)
4. **Stripe**: Billing integration is pending (Phase 3)

---

## 🆘 Troubleshooting

### Database Issues
```bash
# Reset to fresh SaaS database
npm run db:reset-saas

# Or migrate existing data
npm run db:migrate-saas
```

### Port Already in Use
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9
```

### Check Database Schema
```bash
sqlite3 backend/database/trustee_portal.db ".schema"
```

---

## 🤝 Need Help?

The foundation is solid! Next steps would be:
1. Test the API endpoints
2. Build the frontend organization selection UI
3. Implement Stripe billing (Phase 3)
4. Update remaining legacy routes

Would you like me to continue with Phase 3 (Subscription & Billing) or work on any specific aspect?
