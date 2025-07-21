# HSGS Hackathon Backend

A TypeScript backend API using ElysiaJS, Prisma ORM, and PostgreSQL for managing student quiz submissions and ELO-based rating system.

## Features

- **ELO Rating System**: Dynamic rating calculation for both users and questions
- **Multi-Course Support**: Support for multiple Canvas courses
- **Cluster-based Learning**: Organized by subject clusters (ART, BUSINESS, etc.)
- **Real-time Sync**: Automatic and manual synchronization with Canvas LMS
- **Problem Recommendations**: AI-powered problem recommendations based on user performance
- **RESTful API**: Clean, documented endpoints for frontend integration

## Tech Stack

- **Runtime**: Bun
- **Framework**: ElysiaJS
- **Database**: PostgreSQL with Prisma ORM
- **External API**: Canvas LMS Integration
- **Scheduling**: node-cron for automatic sync

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Database Setup

First, make sure you have PostgreSQL running. Then update your `.env` file:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/hsgs_hackathon?schema=public"

# Canvas API
CANVAS_API_BASE_URL="https://your-canvas-instance.com"
CANVAS_API_KEY="your_canvas_api_key"
COURSE_ID="your_default_course_id"

# Application
PORT=3000
SYNC_PASSWORD="your_secure_sync_password"

# Cron Settings
CRON_INTERVAL="*/45 * * * *"
```

### 3. Database Migration

```bash
# Push schema to database
bun run db:push

# Or run migrations (recommended for production)
bun run db:migrate

# Generate Prisma client
bun run db:generate
```

### 4. Run the Application

```bash
# Development mode (with auto-reload)
bun run dev

# Production mode
bun run start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
- `GET /api/health` - Check service status

### Users
- `GET /api/users/details/:userId` - Get detailed user information with recommendations
- `GET /api/users/list` - Get list of all users

### Rankings
- `GET /api/ranking/:courseId` - Get ranking for specific course
- `GET /api/ranking` - Get ranking for default course

### Sync
- `POST /api/sync` - Manual sync (requires password)
- `GET /api/sync/status/:courseId` - Get sync status for course
- `GET /api/sync/status` - Get sync status for default course

## Database Schema

The system uses the following main entities:

- **User**: Student information with ratings per course/cluster
- **Question**: Quiz metadata with difficulty ratings
- **Quiz**: Individual submissions linking users to questions
- **Course**: Course information
- **SyncHistory**: Tracking sync operations

## ELO Rating System

### How it works:

1. **Expected Score**: Calculated using standard ELO formula
2. **K-Factor**: Dynamic based on experience:
   - Users: `80 * e^(-problems/20) + 30`
   - Questions: `80 * e^(-submissions/30) + 15`
3. **Rating Updates**: Both user and question ratings are updated after each submission

### Key Features:

- **Higher user ratings**: More experienced users gain/lose rating more slowly
- **More submissions on problems**: Problems with many submissions have more stable ratings
- **Balanced ecosystem**: Ratings naturally balance around skill levels

## Manual Sync

To manually trigger a sync:

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{"password": "your_sync_password", "courseId": "optional_course_id"}'
```

## Problem Recommendations

The system recommends problems based on:

1. **User's current rating in each cluster**
2. **Unsolved problems only**
3. **Slight difficulty preference** (user rating + 100)
4. **Cluster-specific recommendations**

## Development

### Database Commands

```bash
# View database in browser
bun run db:studio

# Reset database (development only!)
bun run db:reset

# Generate client after schema changes
bun run db:generate
```

### Project Structure

```
src/
├── routes/          # API route handlers
├── services/        # Business logic services
├── utils/           # Utility functions
├── db.ts           # Database client
└── types.ts        # TypeScript interfaces

prisma/
└── schema.prisma   # Database schema
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `CANVAS_API_BASE_URL` | Canvas LMS API base URL | Required |
| `CANVAS_API_KEY` | Canvas API access token | Required |
| `COURSE_ID` | Default Canvas course ID | Required |
| `PORT` | Server port | 3000 |
| `SYNC_PASSWORD` | Password for manual sync | Required |
| `CRON_INTERVAL` | Cron expression for auto sync | `*/45 * * * *` |

## Canvas Integration

The system integrates with Canvas LMS to:

1. **Fetch quiz data** from specified courses
2. **Monitor submissions** for rating updates
3. **Get user profiles** and avatars
4. **Parse quiz titles** for cluster classification

### Quiz Title Format

Quizzes should follow this naming pattern for automatic cluster detection:
- `[READING][ART 1]` 
- `[LISTENING] [BUSINESS 2]`
- `[TECHNOLOGY 3]`

## License

MIT License - see LICENSE file for details.
