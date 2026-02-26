# Trustee Portal

A comprehensive SaaS platform for charity governance and compliance management.

## 🏗️ Project Structure

This is a monorepo containing both the frontend web application and the backend API.

```
trustee-portal/
├── apps/
│   ├── web/              # Frontend web application
│   │   ├── src/
│   │   │   ├── pages/    # HTML pages (index.html, apply.html, etc.)
│   │   │   ├── styles/   # CSS files
│   │   │   ├── scripts/  # JavaScript files
│   │   │   └── components/# HTML modules (dashboard, admin, etc.)
│   │   └── README.md
│   └── api/              # Backend API
│       ├── src/          # TypeScript source code
│       ├── tests/        # Test suites
│       ├── package.json
│       └── README.md
├── packages/
│   └── database/         # Database migrations and schemas
│       ├── migrations/   # SQL migration files
│       ├── seeds/        # Seed data
│       └── schemas/      # Database schema definitions
├── docs/                 # Documentation
│   ├── architecture/     # Architecture and design docs
│   ├── deployment/       # Deployment guides
│   ├── security/         # Security documentation
│   └── guides/           # User and developer guides
├── scripts/              # Utility scripts
│   ├── dev/              # Development scripts
│   ├── deploy/           # Deployment scripts
│   └── backup/           # Backup scripts
├── config/               # Shared configuration
├── package.json          # Root package.json
└── README.md             # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL (or Supabase account)

### Installation

```bash
# Clone and navigate to project
cd trustee-portal

# Install all dependencies
npm run setup

# Set up environment variables
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your configuration
```

### Development

```bash
# Start the API server (port 3001)
npm run dev:api

# In another terminal, start the web server (port 3000)
npm run dev:web
```

### Building

```bash
# Build the API
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📚 Documentation

- [Architecture Overview](docs/architecture/README.md)
- [Deployment Guide](docs/deployment/README.md)
- [Security Guidelines](docs/security/README.md)
- [API Documentation](apps/api/README.md)

## 🔧 Technology Stack

### Frontend
- HTML5 / CSS3 / JavaScript (ES6+)
- Module-based architecture
- Responsive design

### Backend
- Node.js 18+
- Express.js with TypeScript
- Supabase (PostgreSQL)
- JWT Authentication
- CSRF Protection

### Database
- PostgreSQL 14+
- Supabase
- Migration-based schema management

## 🛡️ Security

See [SECURITY.md](docs/security/SECURITY.md) for security guidelines and best practices.

Key security features:
- JWT-based authentication
- CSRF protection
- Rate limiting
- Helmet security headers
- Input validation with Zod

## 📦 Deployment

See [DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md) for detailed deployment instructions.

Quick deployment:
```bash
# Production build
npm run build

# Start production server
cd apps/api && npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact: support@trusteeportal.com
