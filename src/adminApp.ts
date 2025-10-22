import { Elysia } from "elysia";
import { adminRoutes } from "./routes/admin";
import { courseSettingsRoute } from "./routes/courseSettings";

export const adminApp = new Elysia()
  .use(adminRoutes)
  .use(courseSettingsRoute);