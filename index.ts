import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { userRoutes } from './src/routes/users.js';
import { rankingRoutes } from './src/routes/ranking.js';
import { syncRoutes } from './src/routes/sync.js';
import { healthRoutes } from './src/routes/health.js';
import { courseRoutes } from './src/routes/courses.js';
import { problemRoutes } from './src/routes/problems.js';
import { adminRoutes } from './src/routes/admin.js';
import { announcementRoutes } from './src/routes/announcements.js';
import { startCronJobs, stopCronJobs } from './src/services/cron.js';
import { auth } from './src/auth.js';
import { env } from './src/env.js';

const app = new Elysia()
  // CORS middleware
  .use(
    cors({
      origin: env.NODE_ENV === 'production' ? 'https://your-frontend-domain.com' : 'http://localhost:5173',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  
  // Better Auth handler
  .mount(auth.handler)
  
  // Handle preflight requests
  .options('*', () => new Response(null, { status: 200 }))
  
  // Health check endpoint
  .use(healthRoutes)
  
  // API routes
  .use(courseRoutes)
  .use(problemRoutes)
  .use(userRoutes)
  .use(rankingRoutes)
  .use(syncRoutes)
  .use(announcementRoutes)
  .use(adminRoutes)
  
  // Root endpoint
  .get('/', () => ({
    message: 'HSGS Hackathon Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      courses: '/api/courses',
      problems: '/api/problems',
      users: {
        details: '/api/users/details/:userId',
        list: '/api/users/list'
      },
      ranking: {
        course: '/api/ranking/:courseId',
        default: '/api/ranking'
      },
      sync: {
        manual: 'POST /api/sync',
        status: '/api/sync/status/:courseId'
      }
    }
  }))
  
  // Error handling
  .onError(({ code, error, set }) => {
    console.error('Application error:', { code, error });
    
    if (code === 'VALIDATION') {
      set.status = 400;
      return { error: 'Validation failed', details: error.message };
    }
    
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Endpoint not found' };
    }
    
    set.status = 500;
    return { 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  })
  
  // Start server
  .listen(env.PORT);

console.log(`🚀 Server is running at http://localhost:${app.server?.port}`);

// Start cron jobs with initial sync
startCronJobs().then(() => {
  console.log('🎯 Server fully initialized with sync jobs');
}).catch((error) => {
  console.error('❌ Failed to start cron jobs:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  stopCronJobs();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  stopCronJobs();
  process.exit(0);
});