import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { asc, sql, eq, or } from "drizzle-orm";
import { fetchAllCourses } from "../utils/canvas.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";

export const courseRoutes = new Elysia({ prefix: "/api/courses" })
  .get(
    "/",
    async ({ request }) => {
      try {
        // Check if user is authenticated
        const authResult = await requireAuth(request);
        const isAuthenticated = authResult.success;

        // Fetch all courses from Canvas and ensure they exist in database
        const canvasCourses = await fetchAllCourses();
        const now = new Date();

        if (canvasCourses.length > 0) {
          const courseValues = canvasCourses.map((c) => ({
            id: c.id,
            name: c.name,
            createdAt: now,
            updatedAt: now,
          }));

          await db
            .insert(schema.courses)
            .values(courseValues)
            .onConflictDoUpdate({
              target: schema.courses.id,
              set: {
                name: sql`excluded."name"`,
                updatedAt: now,
              },
            });
        }

        const courses = await db.query.courses.findMany({
          orderBy: [asc(schema.courses.name)],
        });

        // Only include randomId if authenticated
        const coursesWithUrl = courses.map((course) => ({
          id: course.id,
          name: course.name,
          ...(isAuthenticated && { randomId: course.randomId }),
          canvasUrl: `${env.CANVAS_BASE_URL}/courses/${course.id}`,
        }));

        return coursesWithUrl;
      } catch (error) {
        console.error("Error getting courses:", error);
        return {
          success: false,
          error: "Internal server error",
        };
      }
    },
  )

  // Get all students enrolled in a course
  .get("/:courseId/students", async ({ params: { courseId }, set }) => {
    try {
      const course = await db.query.courses.findFirst({
        where: or(
          eq(schema.courses.id, courseId),
          eq(schema.courses.randomId, courseId),
        ),
      });

      if (!course) {
        set.status = 404;
        return {
          error: "Course not found",
          message: `No course found with ID: ${courseId}`,
        };
      }

      const courseUsers = await db.query.users.findMany({
        where: eq(schema.users.courseId, course.id),
        orderBy: [asc(schema.users.name)],
      });

      return courseUsers.map((u) => ({
        id: u.studentId,
        name: u.name,
      }));
    } catch (error) {
      console.error(`Error getting students for course ${courseId}:`, error);
      set.status = 500;
      return { error: "Internal server error" };
    }
  });
