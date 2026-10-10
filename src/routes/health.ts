import { Elysia } from "elysia";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

export const healthRoutes = new Elysia({ prefix: "/api/health" }).get(
  "/",
  async () => {
    try {
      // Test database connection
      await db.execute(sql`SELECT 1`);

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        version: "1.0.0",
      };
    } catch (error) {
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);
