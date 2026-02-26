# Profile & Organization Member Relationship

## Overview

The **User Profile** and **Client Admin Details** (Organization Member) are now **bidirectionally linked**. This means updating one automatically updates the other - they cannot be independent.

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      users (Global Profile)                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ first_name   │ │ last_name    │ │ phone                    │ │
│  │ bio          │ │ location_*   │ │ website                  │ │
│  │ linkedin_url │ │ twitter_url  │ │ github_url               │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│                              │                                   │
│                    ┌─────────┴─────────┐                         │
│                    ▼                   ▼                         │
│              ┌──────────┐       ┌──────────┐                     │
│              │job_title │◄─────►│   title  │                     │
│              └──────────┘       └──────────┘                     │
│                    │                   │                         │
└────────────────────┼───────────────────┼─────────────────────────┘
                     │                   │
                     ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              organization_members (Org-Specific)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ role         │ │ department   │ │ term_start/end dates     │ │
│  │ title        │ │ joined_at    │ │ renewal info             │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Sync Behavior

### 1. Profile → Organization Member (When user updates their profile)
- `job_title` → `organization_members.title`
- `department` → `organization_members.department` (if provided)

**File:** `backend/routes/auth-saas.js` - `PUT /api/auth/saas/profile`

### 2. Organization Member → Profile (When admin updates member details)
- `organization_members.title` → `users.job_title`

**File:** `backend/routes/organizations.js` - `PUT /api/organizations/:id/members/:memberId`

### 3. Database Triggers (Auto-sync at DB level)
- When `users.job_title` is updated → auto-update `organization_members.title`
- When `organization_members.title` is updated → auto-update `users.job_title` (if empty)

**File:** `backend/database/link-profile-members.sql`

## API Changes

### GET /api/auth/saas/me
Now returns both user profile AND membership details:

```json
{
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "job_title": "Board Chair",
    "bio": "Experienced trustee...",
    "phone": "+1234567890",
    "location_city": "New York",
    "location_country": "USA",
    "website": "https://example.com",
    "linkedin_url": "https://linkedin.com/in/johndoe",
    "twitter_url": "https://twitter.com/johndoe",
    "github_url": "https://github.com/johndoe"
  },
  "organization": {
    "id": 1,
    "name": "ABC Organization",
    "slug": "abc-org"
  },
  "membership": {
    "role": "owner",
    "department": "Executive",
    "title": "Board Chair",
    "joined_at": "2024-01-15T00:00:00Z"
  }
}
```

### PUT /api/auth/saas/profile
Updates both user profile AND syncs to organization_members:

```json
{
  "first_name": "John",
  "last_name": "Doe",
  "job_title": "New Title",
  "bio": "Updated bio...",
  "department": "New Department",
  "phone": "+1234567890",
  "location_city": "Boston",
  "location_country": "USA"
}
```

## Frontend Changes

### js/profile-account.js

**Load Profile:**
- Fetches from `/api/auth/saas/me`
- Uses `membership.title` as fallback if `user.job_title` is empty
- Displays `membership.role` for role badge

**Save Profile:**
- Sends to `/api/auth/saas/profile`
- Also sends `department` if field exists
- Backend syncs to `organization_members`

## Database Migration

Run this SQL in Supabase to establish the relationship:

```bash
# File: backend/database/link-profile-members.sql
```

This will:
1. Add missing columns to both tables
2. Create sync triggers
3. Sync existing data both ways
4. Add indexes for performance

## Key Fields Mapping

| Profile (users) | Member (organization_members) | Direction |
|-----------------|-------------------------------|-----------|
| `job_title` | `title` | Bidirectional |
| `first_name` | - | Profile only |
| `last_name` | - | Profile only |
| `phone` | - | Profile only |
| `bio` | - | Profile only |
| `location_city` | - | Profile only |
| `location_country` | - | Profile only |
| `website` | - | Profile only |
| `linkedin_url` | - | Profile only |
| `twitter_url` | - | Profile only |
| `github_url` | - | Profile only |
| - | `role` | Member only |
| - | `department` | Member → Profile |
| - | `term_start_date` | Member only |
| - | `term_end_date` | Member only |

## Important Notes

1. **Job Title / Title** are the same field - editing one updates the other
2. **Department** is stored in `organization_members` but can be edited from profile
3. **Role** is organization-specific and not part of the global profile
4. **Term dates** are organization-specific and not part of the global profile
5. A user can belong to multiple organizations with different titles in each

## Testing the Sync

1. **Profile → Member:**
   - Go to Profile page
   - Change Job Title
   - Check Organization → Members - the title should be updated

2. **Member → Profile:**
   - Go to Organization → Members
   - Edit a member's title
   - Check their Profile - the job title should be updated

3. **Database Level:**
   - Update `users.job_title` directly in Supabase
   - Check `organization_members.title` - should auto-sync
