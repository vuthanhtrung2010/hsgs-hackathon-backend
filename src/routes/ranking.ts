import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import { calculateCourseRanking } from "../services/rankingService.js";

export const rankingRoutes = new Elysia({ prefix: "/api/ranking" })
  // Public sub-leaderboard ranking route
  .get("/sub/:id", async ({ params: { id }, set }) => {
    try {
      const subLeaderboard = await db.query.subLeaderboards.findFirst({
        where: eq(schema.subLeaderboards.id, id),
        with: {
          course: {
            with: {
              ratingThresholds: true,
            },
          },
          members: true,
        },
      });

      if (!subLeaderboard) {
        set.status = 404;
        return {
          error: "Sub-leaderboard not found",
          message: `No sub-leaderboard found with ID: ${id}`,
        };
      }

      const memberStudentIds = subLeaderboard.members.map((m) => m.studentId);
      const rankingData = await calculateCourseRanking(
        subLeaderboard.course,
        memberStudentIds,
      );

      return {
        subLeaderboard: {
          id: subLeaderboard.id,
          name: subLeaderboard.name,
          courseId: subLeaderboard.course.id,
          courseName: subLeaderboard.course.name,
        },
        ...rankingData,
      };
    } catch (error) {
      console.error(`Error getting ranking for sub-leaderboard ${id}:`, error);
      set.status = 500;
      return { error: "Internal server error" };
    }
  })

  // Main course ranking route
  .get("/:randomizedCourseId", async ({ params: { randomizedCourseId }, set }) => {
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
  });
