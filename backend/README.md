# Trustee Portal API v2

A complete TypeScript rewrite of the Trustee Portal backend with enhanced security, RBAC, and audit logging.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed

# Start development server
npm run dev

# Or start production server
npm run build
npm start
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.ts          # Prisma client setup
│   ├── middleware/
│   │   └── auth.middleware.ts   # JWT authentication
│   ├── routes/
│   │   ├── auth.routes.ts       # Authentication endpoints
│   │   ├── organization.routes.ts
│   │   ├── user.routes.ts
│   │   ├── invitation.routes.ts
│   │   └── audit.routes.ts
│   ├── services/
│   │   ├── rbac.service.ts      # Role-based access control
│   │   ├── audit.service.ts     # Audit logging
│   │   └── email.service.ts     # Email notifications
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   ├── utils/
│   │   ├── api-response.ts      # Response utilities
│   │   └── logger.ts            # Winston logger
│   └── app.ts                   # Express app
├── prisma/
│   └── schema.prisma            # Database schema
├── tests/
│   ├── unit/
│   └── integration/
└── package.json
```

## 🔐 Security Features

- **JWT Authentication** with refresh tokens
- **Password Security**: bcrypt with 12 rounds, strong password requirements
- **Account Lockout**: After 5 failed login attempts
- **Rate Limiting**: Per-endpoint configurable limits
- **Audit Logging**: All actions logged for compliance
- **RBAC**: 13 roles with granular permissions
- **Helmet**: Security headers
- **CORS**: Configurable origin whitelist
- **Input Validation**: Zod schemas

## 👥 Supported Roles

| Role | Code | Description |
|------|------|-------------|
| Owner | `owner` | Full organization control |
| Admin | `admin` | User and content management |
| Chair | `chair` | Board leadership |
| Vice Chair | `vice_chair` | Board vice leadership |
| Treasurer | `treasurer` | Financial management |
| Secretary | `secretary` | Meeting and record management |
| MLRO | `mlro` | Money Laundering Reporting Officer |
| Compliance Officer | `compliance_officer` | Regulatory compliance |
| Health Officer | `health_officer` | Health and safety |
| Trustee | `trustee` | Board member |
| Volunteer | `volunteer` | Limited access |
| Viewer | `viewer` | Read-only access |

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Create organization with owner
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/accept-invitation` - Accept invitation
- `GET /api/auth/me` - Get current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Organizations
- `GET /api/organizations/my` - List user's organizations
- `GET /api/organizations/:id` - Get organization details
- `PUT /api/organizations/:id` - Update organization
- `GET /api/organizations/:id/members` - List members
- `POST /api/organizations/:id/invitations` - Invite member
- `PUT /api/organizations/:id/members/:id` - Update member
- `DELETE /api/organizations/:id/members/:id` - Remove member

### Users
- `GET /api/users/me` - Get profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/change-password` - Change password

### Audit
- `GET /api/audit/organizations/:id/logs` - Get audit logs
- `GET /api/audit/users/me/activity` - Get user activity

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## 📊 Database Schema

Key entities:
- **User**: Authentication and profile
- **Organization**: Multi-tenant organizations
- **OrganizationMember**: Membership with roles
- **OrganizationInvitation**: Pending invitations
- **AuditLog**: Compliance audit trail
- **SubscriptionPlan**: Billing plans

## 🔧 Environment Variables

See `.env.example` for required variables:

- `PORT` - Server port
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing key (min 32 chars)
- `FRONTEND_URL` - Frontend application URL
- `SMTP_*` - Email configuration

## 📈 Performance

- Database connection pooling via Prisma
- Compression middleware
- Rate limiting per endpoint
- Async audit logging
- Efficient queries with proper indexing

## 📝 License

MIT License - see LICENSE file for details
