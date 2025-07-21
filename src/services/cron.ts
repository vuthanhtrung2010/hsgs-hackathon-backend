import * as cron from 'node-cron';
import { syncCourseSubmissions } from './sync.js';

/**
 * Start the cron job for automatic syncing
 */
export function startCronJobs(): void {
  const cronInterval = process.env.CRON_INTERVAL || '*/45 * * * *'; // Default: every 45 minutes
  const courseId = process.env.COURSE_ID;

  if (!courseId) {
    console.warn('COURSE_ID not set, cron jobs will not start');
    return;
  }

  console.log(`Starting cron job with interval: ${cronInterval} for course: ${courseId}`);

  cron.schedule(cronInterval, async () => {
    try {
      console.log('Cron job started - syncing submissions...');
      await syncCourseSubmissions(courseId);
      console.log('Cron job completed successfully');
    } catch (error) {
      console.error('Cron job failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('Cron jobs initialized');
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
