import { Elysia } from 'elysia';
import { userRoutes } from './src/routes/users.js';
import { rankingRoutes } from './src/routes/ranking.js';
import { syncRoutes } from './src/routes/sync.js';
import { healthRoutes } from './src/routes/health.js';
import { courseRoutes } from './src/routes/courses.js';
import { startCronJobs, stopCronJobs } from './src/services/cron.js';

const app = new Elysia()
  // CORS middleware
  .use(async (app) => 
    app.onRequest(({ set }) => {
      set.headers['Access-Control-Allow-Origin'] = '*';
      set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    })
  )
  
  // Handle preflight requests
  .options('*', () => new Response(null, { status: 200 }))
  
  // Health check endpoint
  .use(healthRoutes)
  
  // API routes
  .use(courseRoutes)
  .use(userRoutes)
  .use(rankingRoutes)
  .use(syncRoutes)
  
  // Root endpoint
  .get('/', () => ({
    message: 'HSGS Hackathon Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      courses: '/api/courses',
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
  .listen(process.env.PORT || 3000);

console.log(`🚀 Server is running at http://localhost:${app.server?.port}`);

// Start cron jobs
startCronJobs();

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