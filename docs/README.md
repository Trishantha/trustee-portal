# 🏛️ Trustee Portal

A comprehensive governance and compliance platform for Board of Trustees. Features recruitment workflows, committee management, meeting scheduling, task tracking, and secure document storage.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Modern web browser

### Run the Application

```bash
# Start both backend and frontend
./start.sh

# Or manually:
cd backend
npm install
npm run db:init
npm start
```

Then open http://localhost:3001 in your browser.

## 📋 Default Login Credentials

| Role     | Email                        | Password    |
|----------|------------------------------|-------------|
| Admin    | admin@trusteeportal.org      | admin123    |
| Chair    | chair@trusteeportal.org      | chair123    |
| Trustee  | trustee@trusteeportal.org    | trustee123  |

## 🏗️ Architecture

### Frontend
- **Pure HTML/CSS/JS** - No build step required
- **Modular SPA** - Dynamic module loading via fetch()
- **Responsive Design** - Mobile-first CSS
- **File Upload Support** - Drag & drop functionality
- **Location**: `/` (root)

### Backend
- **Node.js + Express** - RESTful API
- **Dual Database Support** - SQLite (local) or Supabase (cloud PostgreSQL)
- **JWT Authentication** - Secure token-based auth
- **Role-Based Access** - Admin, Chair, Trustee roles
- **Location**: `/backend/`

### API Client
- **Frontend Integration** - `/js/api.js`
- **Auto-authentication** - Token management
- **Error Handling** - User-friendly messages

## 📁 Project Structure

```
trustee-portal/
├── index.html              # Main SPA entry point
├── css/
│   └── styles.css          # Shared styles (38KB)
├── js/
│   ├── app.js              # Main application logic
│   └── api.js              # Backend API client
├── modules/                # Dynamic HTML modules
│   ├── dashboard.html
│   ├── recruitment.html
│   ├── committees.html
│   ├── meetings.html
│   ├── tasks.html
│   ├── calendar.html
│   ├── messaging.html
│   ├── minutes.html
│   ├── policies.html
│   ├── training.html
│   ├── onboarding.html
│   └── admin.html
├── backend/                # Node.js API
│   ├── server.js           # Express server
│   ├── config/
│   │   └── database.js     # SQLite connection
│   ├── middleware/
│   │   └── auth.js         # JWT & RBAC
│   ├── routes/
│   │   ├── auth.js         # Authentication
│   │   ├── users.js        # User management
│   │   ├── committees.js   # Committees
│   │   ├── meetings.js     # Meetings
│   │   ├── tasks.js        # Tasks
│   │   ├── recruitment.js  # Recruitment workflow
│   │   └── dashboard.js    # Dashboard stats
│   ├── database/
│   │   ├── init.js         # Database setup
│   │   └── trustee_portal.db  # SQLite file
│   ├── package.json
│   └── README.md
└── start.sh                # Startup script
```

## 🗄️ Database Configuration

### Option 1: SQLite (Default - Local)
No configuration needed. SQLite database is created automatically at `backend/database/trustee_portal.db`.

### Option 2: Supabase (Cloud PostgreSQL)
For production deployments with cloud database:

1. **Create Supabase Project**
   - Go to [https://supabase.com](https://supabase.com)
   - Create a new project
   - Copy the project URL and API keys

2. **Configure Environment Variables**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env and add:
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-key
   SUPABASE_ANON_KEY=your-anon-key
   USE_SUPABASE=true
   ```

3. **Run Database Schema**
   - Open Supabase SQL Editor
   - Copy contents from `backend/database/supabase-schema.sql`
   - Execute to create tables

4. **Migrate Data (Optional)**
   ```bash
   node backend/scripts/migrate-to-supabase.js
   ```

5. **Test Connection**
   ```bash
   node backend/scripts/test-supabase.js
   ```

See [SUPABASE_MIGRATION.md](SUPABASE_MIGRATION.md) for detailed instructions.

## 🎯 Key Features

### Recruitment Workflow
- **5-Stage Pipeline**: Applications → Shortlisted → Interviews → Biometric Verification → Selection
- **Job Posting Management**: Create, edit, close positions
- **Application Tracking**: Review, shortlist, reject candidates
- **Interview Scheduling**: Calendar integration
- **Onboarding Checklist**: New hire preparation

### Committee Management
- **Committee Creation**: Configure boards and subcommittees
- **Member Assignment**: Add/remove trustees
- **Role Designation**: Chair, Secretary, Member roles
- **Meeting Scheduling**: Auto-populate attendees

### Meeting Management
- **Calendar Integration**: Visual schedule display
- **RSVP System**: Accept/decline/tentative responses
- **Agenda Builder**: Structured meeting prep
- **Minutes Storage**: Document versioning
- **Attendance Tracking**: Who attended what

### Task Management
- **Assignment System**: Assign to specific trustees
- **Priority Levels**: High, Medium, Low
- **Due Dates**: Calendar-based deadlines
- **Status Tracking**: Pending, In Progress, Completed
- **Categories**: Organize by type

### Messaging System
- **Direct Messages**: 1-on-1 conversations
- **Group Chats**: Committee discussions
- **Read Receipts**: Know who's seen messages
- **Notifications**: Real-time alerts

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/login          # Login with email/password
POST   /api/auth/register       # Register new user
GET    /api/auth/me             # Get current user profile
PUT    /api/auth/profile        # Update profile
POST   /api/auth/change-password # Change password
```

### Users (Admin only for write)
```
GET    /api/users               # List all users
GET    /api/users/:id           # Get user details
POST   /api/users               # Create user
PUT    /api/users/:id           # Update user
DELETE /api/users/:id           # Delete user
```

### Committees
```
GET    /api/committees          # List committees
GET    /api/committees/:id      # Get committee details
POST   /api/committees          # Create committee
PUT    /api/committees/:id      # Update committee
POST   /api/committees/:id/members      # Add member
DELETE /api/committees/:id/members/:userId # Remove member
```

### Meetings
```
GET    /api/meetings            # List meetings
GET    /api/meetings/:id        # Get meeting details
POST   /api/meetings            # Create meeting
PUT    /api/meetings/:id        # Update meeting
PUT    /api/meetings/:id/rsvp   # RSVP to meeting
DELETE /api/meetings/:id        # Delete meeting
```

### Tasks
```
GET    /api/tasks               # List tasks
GET    /api/tasks/:id           # Get task details
POST   /api/tasks               # Create task
PUT    /api/tasks/:id           # Update task
POST   /api/tasks/:id/complete  # Mark complete
DELETE /api/tasks/:id           # Delete task
```

### Recruitment
```
GET    /api/recruitment/jobs              # List jobs
GET    /api/recruitment/jobs/:id          # Get job details
POST   /api/recruitment/jobs              # Create job
PUT    /api/recruitment/jobs/:id          # Update job
POST   /api/recruitment/jobs/:id/close    # Close job
GET    /api/recruitment/applications      # List applications
POST   /api/recruitment/apply             # Submit application
PUT    /api/recruitment/applications/:id/status # Update status
GET    /api/recruitment/shortlisted       # Get shortlisted
GET    /api/recruitment/selected          # Get selected
POST   /api/recruitment/selected          # Select candidate
```

### Dashboard
```
GET    /api/dashboard           # Get dashboard stats
GET    /api/dashboard/calendar  # Get calendar events
GET    /api/dashboard/activity  # Get activity feed
```

## 🛠️ Development

### Backend Scripts
```bash
cd backend
npm start          # Start server
npm run dev        # Development with nodemon
npm run db:init    # Initialize database
npm run db:reset   # Reset database (fresh start)
```

### Environment Variables
Create `backend/.env`:
```
PORT=3001
JWT_SECRET=your-secret-key-here
NODE_ENV=development
```

## 🔐 Security Features

- **Password Hashing**: bcrypt (10 rounds)
- **JWT Tokens**: 24-hour expiration
- **Role-Based Access**: Admin, Chair, Trustee permissions
- **CORS Protection**: Configured origins only
- **SQL Injection Prevention**: Parameterized queries
- **Input Validation**: Server-side validation

## 🗄️ Database Schema

### Core Tables
- `users` - Trustees, chairs, admins
- `committees` - Board committees
- `committee_members` - Membership links
- `meetings` - Scheduled meetings
- `meeting_attendees` - RSVP tracking
- `tasks` - Assigned tasks
- `messages` - Internal messaging

### Recruitment Tables
- `job_openings` - Posted positions
- `applications` - Submitted applications
- `shortlisted_candidates` - Interview pipeline
- `selected_candidates` - Hires
- `biometric_verifications` - ID checks

### System Tables
- `notifications` - User alerts
- `audit_log` - Activity tracking
- `training_modules` - Training content
- `user_training` - Progress tracking

## 📱 Mobile Support

- Responsive design for tablets and phones
- Touch-friendly navigation
- Optimized forms for mobile input
- Collapsible sidebar menu

## 🎨 UI Components

- **Modal System**: Create job, view details
- **Tab Navigation**: Recruitment workflow stages
- **Card Layout**: Job listings, tasks
- **Calendar Widget**: Visual meeting schedule
- **Toast Notifications**: Success/error messages
- **Progress Bars**: Task completion

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Reset database if corrupted
cd backend
npm run db:reset
```

### Frontend can't connect to API
- Ensure backend is running on port 3001
- Check CORS settings in backend/config
- Verify API_BASE_URL in js/api.js

### Login fails
- Use default credentials from table above
- Check database is initialized
- Verify JWT_SECRET is set

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

Built with ❤️ for effective governance
