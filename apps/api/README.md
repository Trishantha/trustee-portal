# Trustee Portal API

Backend API for the Trustee Portal platform.

## Structure

```
src/
├── app.ts              # Main Express application
├── config/
│   └── database.ts     # Database configuration
├── middleware/
│   └── auth.middleware.ts
├── routes/
│   ├── auth.routes.ts
│   ├── organization.routes.ts
│   ├── user.routes.ts
│   ├── invitation.routes.ts
│   └── audit.routes.ts
├── services/
│   ├── rbac.service.ts
│   ├── audit.service.ts
│   └── email.service.ts
├── types/
│   └── index.ts
└── utils/
    ├── api-response.ts
    └── logger.ts
```

## Setup

```bash
cp .env.example .env
# Edit .env with your configuration
npm install
npm run build
npm start
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test
npm run test:coverage
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions.
See [SECURITY.md](SECURITY.md) for security configuration.
