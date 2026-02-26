# Trustee Portal API Documentation

## Base URL
```
Production: https://api.trusteeportal.com/v1
Staging: https://api-staging.trusteeportal.com/v1
Local: http://localhost:3001/api
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Getting a Token

**POST** `/auth/login`

```json
{
  "email": "user@charity.org",
  "password": "SecurePass123!",
  "organizationId": "org_uuid" // Optional
}
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_uuid",
      "email": "user@charity.org",
      "firstName": "John",
      "lastName": "Doe",
      "role": "trustee",
      "emailVerified": true
    },
    "organization": {
      "id": "org_uuid",
      "name": "Test Charity",
      "slug": "test-charity",
      "role": "owner",
      "subscriptionStatus": "trial",
      "trialEndsAt": "2026-03-12T00:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "abc123..."
  }
}
```

---

## Authentication Endpoints

### Register Organization
**POST** `/auth/register`

Creates a new organization with the signup user as Owner.

**Request:**
```json
{
  "email": "admin@charity.org",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "Test Charity",
  "organizationSlug": "test-charity",
  "timezone": "Europe/London",  // Optional
  "language": "en"              // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_uuid",
      "email": "admin@charity.org",
      "firstName": "John",
      "lastName": "Doe",
      "role": "owner",
      "emailVerified": false
    },
    "organization": {
      "id": "org_uuid",
      "name": "Test Charity",
      "slug": "test-charity",
      "subscriptionStatus": "trial",
      "trialEndsAt": "2026-03-12T00:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "abc123...",
    "requiresEmailVerification": true
  }
}
```

**Error Responses:**
- `400` - Weak password or invalid input
- `409` - Email or slug already exists
- `500` - Registration failed

---

### Login
**POST** `/auth/login`

**Request:**
```json
{
  "email": "user@charity.org",
  "password": "SecurePass123!",
  "organizationId": "org_uuid"  // Optional - auto-selects if single org
}
```

**Response:** Same as register

**Error Responses:**
- `401` - Invalid credentials
- `403` - Account deactivated or subscription expired
- `423` - Account locked

---

### Select Organization
**POST** `/auth/select-organization`

For users with multiple organizations.

**Request:**
```json
{
  "organizationId": "org_uuid"
}
```

**Headers:**
```
Authorization: Bearer <token_without_org_context>
```

---

### Refresh Token
**POST** `/auth/refresh`

**Request:**
```json
{
  "refreshToken": "abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

### Logout
**POST** `/auth/logout`

Invalidates the refresh token.

**Headers:**
```
Authorization: Bearer <access_token>
```

---

### Verify Email
**POST** `/auth/verify-email`

**Request:**
```json
{
  "token": "verification_token_from_email"
}
```

---

### Forgot Password
**POST** `/auth/forgot-password`

**Request:**
```json
{
  "email": "user@charity.org"
}
```

**Note:** Always returns success to prevent email enumeration.

---

### Reset Password
**POST** `/auth/reset-password`

**Request:**
```json
{
  "token": "reset_token_from_email",
  "password": "NewSecurePass123!"
}
```

---

### Change Password (Authenticated)
**POST** `/auth/change-password`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass123!"
}
```

---

### Get Current User
**GET** `/auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_uuid",
      "email": "user@charity.org",
      "firstName": "John",
      "lastName": "Doe",
      "avatar": "https://...",
      "jobTitle": "Board Member",
      "bio": "...",
      "role": "trustee",
      "isSuperAdmin": false,
      "emailVerified": true,
      "timezone": "Europe/London",
      "language": "en",
      "createdAt": "2026-01-15T10:30:00Z"
    },
    "organization": {
      "id": "org_uuid",
      "name": "Test Charity",
      "slug": "test-charity",
      "role": "trustee",
      "subscriptionStatus": "active"
    },
    "membership": {
      "role": "trustee",
      "department": "Governance",
      "title": "Board Member",
      "joinedAt": "2026-01-20T14:00:00Z",
      "termStartDate": "2026-01-20",
      "termEndDate": "2029-01-20"
    }
  }
}
```

---

## Organization Endpoints

### Get My Organizations
**GET** `/organizations/my`

List all organizations where the user is a member.

---

### Get Organization
**GET** `/organizations/:id`

**Permissions:** `org:view`

---

### Update Organization
**PUT** `/organizations/:id`

**Permissions:** `org:manage`

**Request:**
```json
{
  "name": "Updated Charity Name",
  "description": "...",
  "websiteUrl": "https://...",
  "contactEmail": "contact@charity.org",
  "contactPhone": "+44...",
  "primaryColor": "#4f46e5",
  "settings": {
    "timezone": "Europe/London",
    "dateFormat": "DD/MM/YYYY"
  },
  "termSettings": {
    "defaultTermLengthYears": 3,
    "maxConsecutiveTerms": 2,
    "renewalNotificationDays": [90, 60, 30],
    "autoRenewalPolicy": "opt_in",
    "enableTermTracking": true
  }
}
```

---

### Delete Organization
**DELETE** `/organizations/:id`

**Permissions:** `org:delete` (Owner only)

---

## Member & Invitation Endpoints

### List Members
**GET** `/organizations/:id/members`

**Permissions:** `user:view`

**Query Parameters:**
- `status` - `active`, `inactive`, `all`
- `role` - Filter by role
- `search` - Search by name/email
- `page`, `limit` - Pagination

**Response:**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "id": "member_uuid",
        "userId": "user_uuid",
        "email": "user@charity.org",
        "firstName": "John",
        "lastName": "Doe",
        "avatar": "https://...",
        "role": "trustee",
        "department": "Governance",
        "title": "Board Member",
        "joinedAt": "2026-01-20T14:00:00Z",
        "lastActiveAt": "2026-02-26T10:00:00Z",
        "termStartDate": "2026-01-20",
        "termEndDate": "2029-01-20",
        "termLengthYears": 3
      }
    ],
    "pendingInvitations": [
      {
        "id": "invite_uuid",
        "email": "pending@charity.org",
        "role": "trustee",
        "invitedAt": "2026-02-25T10:00:00Z",
        "expiresAt": "2026-03-04T10:00:00Z",
        "invitedBy": "Admin User"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "totalPages": 1
    }
  }
}
```

---

### Invite Member
**POST** `/organizations/:id/invitations`

**Permissions:** `user:invite`

**Request:**
```json
{
  "email": "newmember@charity.org",
  "role": "trustee",
  "department": "Governance",
  "title": "Board Member",
  "termLengthYears": 3,
  "termStartDate": "2026-03-01"
}
```

**Roles Available:** Based on inviter's role hierarchy

**Response:**
```json
{
  "success": true,
  "data": {
    "invitation": {
      "id": "invite_uuid",
      "email": "newmember@charity.org",
      "role": "trustee",
      "department": "Governance",
      "invitedAt": "2026-02-26T10:14:00Z",
      "expiresAt": "2026-03-05T10:14:00Z"
    },
    "acceptUrl": "https://app.trusteeportal.com/accept-invitation?token=abc123"
  }
}
```

**Error Responses:**
- `400` - Invalid email or role
- `403` - Cannot invite with that role
- `409` - Already a member or pending invitation

---

### Accept Invitation
**POST** `/auth/accept-invitation`

**Request:**
```json
{
  "token": "invitation_token",
  "password": "SecurePass123!",      // Required for new users
  "firstName": "New",
  "lastName": "Member"
}
```

**Response:** Same as login

---

### Update Member
**PUT** `/organizations/:id/members/:memberId`

**Permissions:** `user:update`

**Request:**
```json
{
  "role": "chair",
  "department": "Executive",
  "title": "Board Chair",
  "isActive": true
}
```

**Note:** Cannot change own role through this endpoint.

---

### Remove Member
**DELETE** `/organizations/:id/members/:memberId`

**Permissions:** `user:delete`

**Note:** Cannot remove yourself. Use transfer ownership first.

---

### Cancel Invitation
**DELETE** `/organizations/:id/invitations/:invitationId`

**Permissions:** Invitation creator or Admin

---

### Resend Invitation
**POST** `/organizations/:id/invitations/:invitationId/resend`

**Permissions:** Invitation creator or Admin

---

## User Endpoints

### Update Profile
**PUT** `/users/profile`

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "jobTitle": "Senior Board Member",
  "bio": "Experienced trustee...",
  "phone": "+44...",
  "locationCity": "London",
  "locationCountry": "UK",
  "website": "https://...",
  "linkedinUrl": "https://linkedin.com/...",
  "timezone": "Europe/London"
}
```

---

### Upload Avatar
**POST** `/users/avatar`

**Content-Type:** `multipart/form-data`

**Body:**
- `avatar` - Image file (max 5MB)

---

## Audit Log Endpoints

### Get Audit Logs
**GET** `/organizations/:id/audit-logs`

**Permissions:** `audit:view`

**Query Parameters:**
- `action` - Filter by action type
- `resourceType` - Filter by resource
- `userId` - Filter by user
- `startDate`, `endDate` - Date range
- `page`, `limit` - Pagination

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_uuid",
        "action": "invite",
        "resourceType": "invitation",
        "resourceId": "invite_uuid",
        "userId": "admin_uuid",
        "userEmail": "admin@charity.org",
        "details": {
          "email": "new@charity.org",
          "role": "trustee"
        },
        "ipAddress": "192.168.1.1",
        "createdAt": "2026-02-26T10:14:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 150
    }
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional context
    }
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /auth/login` | 5 per minute |
| `POST /auth/register` | 3 per hour |
| `POST /auth/forgot-password` | 3 per hour |
| `POST /organizations/:id/invitations` | 10 per minute |
| All other endpoints | 100 per minute |

---

## Webhooks

### Event Types

- `user.invited` - User invited to organization
- `user.joined` - User accepted invitation
- `user.role_changed` - Member role updated
- `subscription.trial_ending` - Trial expiring soon
- `subscription.payment_failed` - Payment failed

### Webhook Payload

```json
{
  "event": "user.joined",
  "timestamp": "2026-02-26T10:14:00Z",
  "organizationId": "org_uuid",
  "data": {
    "userId": "user_uuid",
    "email": "user@charity.org",
    "role": "trustee",
    "invitedBy": "admin_uuid"
  }
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { TrusteePortalAPI } from '@trusteeportal/sdk';

const api = new TrusteePortalAPI({
  baseURL: 'https://api.trusteeportal.com/v1',
  token: 'your_jwt_token'
});

// Login
const { data } = await api.auth.login({
  email: 'user@charity.org',
  password: 'SecurePass123!'
});

// Invite member
await api.organizations.inviteMember('org_uuid', {
  email: 'new@charity.org',
  role: Role.TRUSTEE,
  department: 'Governance'
});

// List members
const members = await api.organizations.getMembers('org_uuid', {
  status: 'active',
  page: 1,
  limit: 20
});
```

### cURL

```bash
# Login
curl -X POST https://api.trusteeportal.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@charity.org",
    "password": "SecurePass123!"
  }'

# Invite member
curl -X POST https://api.trusteeportal.com/v1/organizations/org_uuid/invitations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "new@charity.org",
    "role": "trustee"
  }'
```

---

## Changelog

### v1.0.0 (2026-02-26)
- Initial API release
- Organization management
- RBAC with 13 roles
- Invitation system
- Audit logging
