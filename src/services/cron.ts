import * as cron from 'node-cron';
import { syncCourseSubmissions, syncAllCourses } from './sync.js';
import { COURSES_CONFIG } from '../config.js';
import { env } from '../env.js';

/**
 * Start the cron job for automatic syncing and do initial sync
 */
export async function startCronJobs(): Promise<void> {
  const cronInterval = env.CRON_INTERVAL;
  const courseId = env.COURSE_ID;

  console.log('🚀 Starting initial full sync on server startup...');
  
  // Do initial full sync on startup
  try {
    if (courseId) {
      console.log(`🔄 Syncing specific course: ${courseId}...`);
      await syncCourseSubmissions(courseId);
    } else {
      console.log(`🔄 Syncing all configured courses (${COURSES_CONFIG.length} courses)...`);
      const result = await syncAllCourses();
      console.log(`📊 Sync result: ${result.message}`);
    }
    console.log('✅ Initial sync completed successfully');
  } catch (error) {
    console.error('❌ Initial sync failed:', error);
  }

  // Set up cron job
  if (courseId) {
    console.log(`📅 Setting up cron job with interval: ${cronInterval} for course: ${courseId}`);

    cron.schedule(cronInterval, async () => {
      try {
        console.log('⏰ Cron job started - syncing submissions...');
        await syncCourseSubmissions(courseId);
        console.log('✅ Cron job completed successfully');
      } catch (error) {
        console.error('❌ Cron job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
  } else {
    console.log(`📅 Setting up cron job with interval: ${cronInterval} for all configured courses`);

    cron.schedule(cronInterval, async () => {
      try {
        console.log('⏰ Cron job started - syncing all courses...');
        const result = await syncAllCourses();
        console.log(`✅ Cron job completed: ${result.message}`);
      } catch (error) {
        console.error('❌ Cron job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
  }

  console.log('🕒 Cron jobs initialized');
}

/**
 * Stop all cron jobs (for graceful shutdown)
 */
export function stopCronJobs(): void {
  cron.getTasks().forEach((task, name) => {
    console.log(`Stopping cron task: ${name}`);
    task.stop();
  });
}
