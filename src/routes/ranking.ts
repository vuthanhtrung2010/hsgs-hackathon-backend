import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { calculateCourseRanking } from "../services/rankingService.js";

export const rankingRoutes = new Elysia({ prefix: "/api/ranking" }).get(
  "/:randomizedCourseId",
  async ({ params: { randomizedCourseId }, set }) => {
    try {
      const realCourse = await db.query.courses.findFirst({
        where: eq(schema.courses.randomId, randomizedCourseId),
        with: {
          ratingThresholds: true,
        },
      });

      if (!realCourse) {
        set.status = 404;
        return {
          error: "Course not found",
          message: `No course found with randomized ID: ${randomizedCourseId}`,
        };
      }

      const rankingData = await calculateCourseRanking(realCourse);
      if (!rankingData.ranking.length) {
        return [];
      }
      return rankingData;
    } catch (error) {
      console.error(
        `Error getting ranking for course ${randomizedCourseId}:`,
        error,
      );
      set.status = 500;
      return { error: "Internal server error" };
    }
  },
);
