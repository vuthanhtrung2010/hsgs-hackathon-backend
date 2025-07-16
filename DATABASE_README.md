# Student Rating System Backend

A backend system for tracking student quiz performance using ELO rating system across different subject clusters.

## Database Structure

### Models

#### User
- `id`: Unique identifier (CUID)
- `studentId`: Canvas student ID (unique)
- `name`: Full name
- `shortName`: Short/display name
- `createdAt`/`updatedAt`: Timestamps

#### Quiz
- `id`: Canvas quiz ID
- `title`: Quiz title
- `quizPointsPossible`: Maximum points for the quiz
- `cluster`: Subject cluster (enum)
- `Rq`: Quiz difficulty rating (ELO)
- `submissionCount`: Number of submissions

#### UserRating
- `id`: Unique identifier
- `userId`: Reference to User
- `cluster`: Subject cluster
- `Ru`: User rating for this cluster (ELO)

#### QuizSubmission
- `id`: Unique identifier
- `userId`: Reference to User
- `quizId`: Reference to Quiz
- `score`: Points scored
- `maxScore`: Maximum possible points
- `workflowState`: Canvas submission state
- `finishedAt`: When quiz was completed
- `canvasSubmissionId`: Canvas submission ID

#### CronHistory
- `id`: Unique identifier
- `lastRun`: Timestamp of last cron execution

### Clusters (Enums)
- ART, BUSINESS, COMMUNICATION, CRIME, ECONOMY, EDUCATION
- ENVIRONMENT, FAMILY_AND_CHILDREN, FOOD, HEALTH, LANGUAGE
- MEDIA, READING, TECHNOLOGY, TRANSPORT, TRAVEL

## Setup

1. **Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   Fill in your configuration:
   - `DATABASE_URL`: PostgreSQL connection string
   - `CANVAS_API_URL`: Canvas LMS API base URL
   - `CANVAS_API_KEY`: Canvas API token
   - `CANVAS_COURSE_ID`: Canvas course ID

2. **Database Setup**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run migrations
   npx prisma migrate dev --name init
   
   # (Optional) Open Prisma Studio
   npx prisma studio
   ```

3. **Install Dependencies**
   ```bash
   bun install
   ```

4. **Run the Application**
   ```bash
   bun run src/index.ts
   ```

## API Endpoints

### General
- `GET /health` - Health check
- `GET /clusters` - List all available clusters

### Rankings
- `GET /ranking` - Overall ranking across all clusters
- `GET /ranking/:cluster` - Cluster-specific ranking

### Users
- `GET /users/:studentId/stats` - Get user statistics
  - Query params: `cluster` (optional)

### Quizzes
- `GET /quizzes/:quizId/stats` - Get quiz statistics

### System
- `GET /health` - Health check with system information
- `GET /sync/status` - Get sync system status and statistics
- `GET /cron/history` - Get cron job execution history
- `POST /sync` - Manually trigger data sync
  - Body: `{ "force": false }` - Set to true for full sync (all data)
- `GET /log/level` - Get current log level
- `POST /log/level` - Set log level (DEBUG, INFO, WARN, ERROR, FATAL)

## Logging System

The application features a comprehensive logging system with colored output and multiple log levels:

### Log Levels
- **DEBUG** (0): Shows all logs including API calls, database operations, detailed processing steps
- **INFO** (1): Shows general information, sync operations, important events, successes
- **WARN** (2): Shows warnings and potential issues
- **ERROR** (3): Shows errors only
- **FATAL** (4): Shows only fatal/critical errors

### Log Categories
- **🔵 INFO**: General information and important events
- **🟢 SUCCESS**: Successful operations and completions
- **🟡 WARN**: Warnings and potential issues
- **🔴 ERROR**: Error conditions
- **⚫ DEBUG**: Detailed debugging information
- **🔵 SYNC**: Synchronization operations
- **🟣 API**: HTTP API requests and responses
- **🟡 DB**: Database operations
- **🔵 CANVAS**: Canvas LMS API interactions
- **🟢 ELO**: ELO rating calculations and updates

### Configuration
Set the log level in your `.env` file:
```bash
LOG_LEVEL="INFO"  # or DEBUG, WARN, ERROR, FATAL
```

### Runtime Log Level Control
```bash
# Get current log level
curl http://localhost:3000/log/level

# Set log level to DEBUG (show all logs)
curl -X POST http://localhost:3000/log/level \
  -H "Content-Type: application/json" \
  -d '{"level": "DEBUG"}'

# Set log level to ERROR (show only errors)
curl -X POST http://localhost:3000/log/level \
  -H "Content-Type: application/json" \
  -d '{"level": "ERROR"}'
```

## ELO Rating System

The system uses an ELO rating algorithm where:
- Users start with Ru = 1500 for each cluster
- Quizzes start with Rq = 2000
- K-factors decrease with experience:
  - User K-factor: `80 * exp(-n/20) + 30`
  - Quiz K-factor: `80 * exp(-n/30) + 15`

## Data Sync

The system runs a cron job every 45 minutes to:
1. Fetch new quiz submissions from Canvas
2. Parse quiz titles to determine clusters
3. Calculate ELO rating updates
4. Store submissions and update ratings

### Sync Function

The core `Sync()` function can be called in two modes:
- **Incremental Sync** (default): Only processes submissions updated since last run
- **Full Sync**: Processes all submissions (useful for development/testing)

### Manual Sync

You can trigger manual sync via POST request:
```bash
# Incremental sync
curl -X POST http://localhost:3000/sync

# Full sync (processes all data)
curl -X POST http://localhost:3000/sync -H "Content-Type: application/json" -d '{"force": true}'
```

### Sync Statistics

Each sync operation returns statistics:
- `processedQuizzes`: Number of quizzes checked
- `processedSubmissions`: Total submissions processed
- `newUsers`: New users created
- `updatedRatings`: Number of rating updates
- `skippedSubmissions`: Submissions that were skipped

## Development

- The application uses Prisma as the ORM
- TypeScript for type safety
- Express.js for the API server
- Node-cron for scheduled tasks
- Axios for Canvas API integration

## Database Migrations

When you modify the schema:
```bash
npx prisma migrate dev --name "description_of_change"
npx prisma generate
```

## Monitoring

- Check `/health` for system status
- Check `/cron/history` for sync job status
- Use Prisma Studio for database inspection
