import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { asc, desc, inArray } from "drizzle-orm";
import { env } from "../env.js";

export const problemRoutes = new Elysia({ prefix: "/api/problems" }).get(
  "/",
  async () => {
    try {
      // Get all questions (problems)
      const questions = await db.query.questions.findMany({
        orderBy: [
          asc(schema.questions.courseId),
          desc(schema.questions.rating),
        ],
      });

      // Get course information for all unique courseIds
      const courseIds = [...new Set(questions.map((q) => q.courseId))];
      const courses =
        courseIds.length > 0
          ? await db.query.courses.findMany({
              where: inArray(schema.courses.id, courseIds),
            })
          : [];
      const courseMap = new Map(courses.map((c) => [c.id, c]));

      // Transform the data to match the frontend Problem interface
      const problems = questions.map((question) => {
        const course = courseMap.get(question.courseId);
        return {
          problemId: question.quizId,
          name: question.lesson || question.quizName, // Use lesson (clean name) or fallback to quizName
          course: {
            courseId: question.courseId,
            name: course?.name || `Course ${question.courseId}`,
            canvasUrl: `${env.CANVAS_BASE_URL}/courses/${question.courseId}/quizzes/${question.quizId}`,
          },
          type: question.types, // Return the types array directly
          rating: Math.round(question.rating),
        };
      });

      return problems;
    } catch (error) {
      console.error("Error fetching problems:", error);
      return { error: "Failed to fetch problems" };
    }
  },
);
