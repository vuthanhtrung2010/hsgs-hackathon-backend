import { Elysia } from "elysia";
import { adminRoutes } from "./routes/admin";
import { courseSettingsRoute } from "./routes/courseSettings";
import { adminSubLeaderboardRoutes } from "./routes/adminSubLeaderboards";

export const adminApp = new Elysia()
  .use(adminRoutes)
  .use(courseSettingsRoute)
  .use(adminSubLeaderboardRoutes);