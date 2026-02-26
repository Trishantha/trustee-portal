# Trustee Portal - Deployment Guide

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+ (or Supabase)
- npm or yarn

## Environment Setup

### 1. Clone and Install

```bash
cd backend
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Critical Security Setup:**
```bash
# Generate secure secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('COOKIE_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

Add generated values to `.env`.

### 3. Database Setup

Option A: Supabase (Recommended)
- Create project at supabase.com
- Copy URL and service key to `.env`
- Run migrations: `npm run db:migrate`

Option B: Self-hosted PostgreSQL
```bash
# Create database
createdb trustee_portal

# Run migrations
npm run db:migrate
```

### 4. Build Application

```bash
npm run build
```

This creates compiled JavaScript in `dist/` folder.

## Production Deployment

### Option 1: Traditional Server (Ubuntu/Debian)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/app.js --name trustee-portal
pm2 save
pm2 startup

# View logs
pm2 logs trustee-portal
```

### Option 2: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/app.js"]
```

```bash
docker build -t trustee-portal .
docker run -p 3001:3001 --env-file .env trustee-portal
```

### Option 3: Railway/Render/Fly.io

1. Push code to GitHub
2. Connect platform to repository
3. Set environment variables in dashboard
4. Deploy

## Health Checks

The application includes a health check endpoint:

```bash
GET /api/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "2.0.0",
    "environment": "production",
    "database": "connected"
  }
}
```

## Monitoring & Logging

### PM2 Monitoring
```bash
pm2 monit
```

### Log Files
- Development: Console output
- Production: `logs/error.log` and `logs/combined.log`

### Health Check Script
```bash
#!/bin/bash
# Add to cron for monitoring
HEALTH=$(curl -s http://localhost:3001/api/health | grep -c "healthy")
if [ "$HEALTH" -eq 0 ]; then
  echo "Service unhealthy at $(date)" | mail -s "Trustee Portal Alert" admin@domain.com
fi
```

## SSL/HTTPS Setup

### Using Nginx (Recommended)

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Using Cloudflare
1. Set DNS to proxied (orange cloud)
2. Enable "Always Use HTTPS"
3. Set SSL/TLS to "Full (strict)"

## Security Checklist

Before production:

- [ ] Change default JWT_SECRET (64+ random chars)
- [ ] Change default COOKIE_SECRET (different from JWT)
- [ ] Set NODE_ENV=production
- [ ] Configure CORS_ORIGIN to exact domain
- [ ] Enable HTTPS only
- [ ] Set up database SSL connections
- [ ] Configure rate limiting appropriately
- [ ] Enable audit logging
- [ ] Remove any test/dummy data
- [ ] Set up automated backups

## Troubleshooting

### Build Errors
```bash
# Clean and rebuild
rm -rf dist
npm run build
```

### Database Connection Issues
```bash
# Test connection
npm run db:studio
```

### Port Already in Use
```bash
# Find and kill process
lsof -i :3001
kill -9 <PID>
```

## Rollback Procedure

```bash
# Using PM2
pm2 stop trustee-portal
pm2 delete trustee-portal
git checkout <previous-version>
npm install
npm run build
pm2 start dist/app.js --name trustee-portal
```

## Support

For deployment issues:
1. Check logs: `pm2 logs` or `docker logs`
2. Verify environment variables
3. Test database connectivity
4. Check firewall/network settings
