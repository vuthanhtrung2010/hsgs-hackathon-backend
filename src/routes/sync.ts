import { Elysia } from 'elysia';
import { syncCourseSubmissions } from '../services/sync.js';

export const syncRoutes = new Elysia({ prefix: '/api/sync' })
  .post('/', async ({ body }: { body: any }) => {
    try {
      const { password, courseId } = body;

      // Check sync password
      if (password !== process.env.SYNC_PASSWORD) {
        return { 
          error: 'Unauthorized',
          status: 401 
        };
      }

      const targetCourseId = courseId || process.env.COURSE_ID;
      
      if (!targetCourseId) {
        return { 
          error: 'Course ID is required',
          status: 400 
        };
      }

      console.log(`Manual sync requested for course: ${targetCourseId}`);
      
      await syncCourseSubmissions(targetCourseId);
      
      return { 
        success: true, 
        message: `Sync completed for course ${targetCourseId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Manual sync error:', error);
      return { 
        error: 'Sync failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        status: 500
      };
    }
  })

  .get('/status/:courseId', async ({ params: { courseId } }) => {
    try {
      const syncHistory = await import('../db.js').then(m => m.db.syncHistory.findUnique({
        where: { courseId }
      }));

      if (!syncHistory) {
        return {
          courseId,
          lastSync: null,
          status: 'Never synced'
        };
      }

      return {
        courseId,
        lastSync: syncHistory.lastSync.toISOString(),
        status: 'Synced'
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return { 
        error: 'Failed to get sync status',
        status: 500 
      };
    }
  })

  .get('/status', async () => {
    try {
      const defaultCourseId = process.env.COURSE_ID;
      
      if (!defaultCourseId) {
        return { error: 'No default course ID configured' };
      }

      const syncHistory = await import('../db.js').then(m => m.db.syncHistory.findUnique({
        where: { courseId: defaultCourseId }
      }));

      if (!syncHistory) {
        return {
          courseId: defaultCourseId,
          lastSync: null,
          status: 'Never synced'
        };
      }

      return {
        courseId: defaultCourseId,
        lastSync: syncHistory.lastSync.toISOString(),
        status: 'Synced'
      };
    } catch (error) {
      console.error('Error getting default sync status:', error);
      return { 
        error: 'Failed to get sync status',
        status: 500 
      };
    }
  });
