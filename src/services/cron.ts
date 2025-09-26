import * as cron from "node-cron";
import { syncCourseSubmissions, syncAllCourses } from "./sync.js";
import { env } from "../env.js";

/**
 * Start the cron job for automatic syncing and do initial sync
 */
export async function startCronJobs(): Promise<void> {
  const cronInterval = env.CRON_INTERVAL;

  console.log("🚀 Starting initial full sync on server startup...");

  // Do initial full sync on startup (always sync all courses)
  try {
    console.log(`🔄 Syncing all courses from Canvas...`);
    const result = await syncAllCourses();
    console.log(`📊 Sync result: ${result.message}`);
    console.log("✅ Initial sync completed successfully");
  } catch (error) {
    console.error("❌ Initial sync failed:", error);
  }

  // Set up cron job (always sync all courses)
  console.log(
    `📅 Setting up cron job with interval: ${cronInterval} for all courses`,
  );

  cron.schedule(
    cronInterval,
    async () => {
      try {
        console.log("⏰ Cron job started - syncing all courses...");
        const result = await syncAllCourses();
        console.log(`✅ Cron job completed: ${result.message}`);
      } catch (error) {
        console.error("❌ Cron job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: "UTC",
    },
  );

  console.log("🕒 Cron jobs initialized");
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
