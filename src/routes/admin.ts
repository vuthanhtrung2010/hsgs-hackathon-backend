import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, desc, asc, count } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

export const adminRoutes = new Elysia({ prefix: "/api/admin" })
  // Get dashboard stats
  .get("/stats", async ({ request }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const [canvasUserCountResult, announcementCountResult] =
        await Promise.all([
          db.select({ count: count() }).from(schema.users),
          db.select({ count: count() }).from(schema.announcements),
        ]);

      return {
        success: true,
        stats: {
          canvasUserCount: canvasUserCountResult[0]?.count ?? 0,
          announcementCount: announcementCountResult[0]?.count ?? 0,
        },
      };
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      return {
        success: false,
        error: "Failed to fetch dashboard stats",
      };
    }
  })

  // Announcement routes
  // Get all announcements for a course
  .get(
    "/announcements/course/:randomizedCourseId",
    async ({ request, params: { randomizedCourseId } }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const course = await db.query.courses.findFirst({
          where: eq(schema.courses.randomId, randomizedCourseId),
        });

        if (!course) {
          return {
            success: true,
            announcements: [],
          };
        }

        const announcements = await db.query.announcements.findMany({
          where: eq(schema.announcements.courseId, course.id),
          orderBy: [desc(schema.announcements.createdAt)],
        });

        return {
          success: true,
          announcements,
        };
      } catch (error) {
        console.error("Error fetching announcements:", error);
        return {
          success: false,
          error: "Failed to fetch announcements",
        };
      }
    },
  )

  // Create announcement for a course
  .post(
    "/announcements/course/:randomizedCourseId",
    async ({ request, body, params: { randomizedCourseId } }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const { title } = body as { title: string };

        if (!title || !title.trim()) {
          return {
            success: false,
            error: "Title is required",
          };
        }

        const course = await db.query.courses.findFirst({
          where: eq(schema.courses.randomId, randomizedCourseId),
        });

        if (!course) {
          return {
            success: false,
            error: "Course not found",
          };
        }

        const now = new Date();
        const newAnnouncements = await db
          .insert(schema.announcements)
          .values({
            title: title.trim(),
            content: "",
            courseId: course.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          success: true,
          announcement: newAnnouncements[0],
        };
      } catch (error) {
        console.error("Error creating announcement:", error);
        return {
          success: false,
          error: "Failed to create announcement",
        };
      }
    },
  )

  // Get single announcement
  .get(
    "/announcements/:id",
    async ({
      request,
      params,
    }: {
      request: Request;
      params: { id: string };
    }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const announcement = await db.query.announcements.findFirst({
          where: eq(schema.announcements.id, params.id),
          with: {
            course: true,
          },
        });

        if (!announcement) {
          return {
            success: false,
            error: "Announcement not found",
          };
        }

        return {
          success: true,
          announcement,
        };
      } catch (error) {
        console.error("Error fetching announcement:", error);
        return {
          success: false,
          error: "Failed to fetch announcement",
        };
      }
    },
  )

  // Update announcement
  .put(
    "/announcements/:id",
    async ({
      request,
      params,
      body,
    }: {
      request: Request;
      params: { id: string };
      body: any;
    }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const { title, content } = body;

        if (!title || !title.trim()) {
          return {
            success: false,
            error: "Title is required",
          };
        }

        const updatedAnnouncements = await db
          .update(schema.announcements)
          .set({
            title: title.trim(),
            content: content || "",
            updatedAt: new Date(),
          })
          .where(eq(schema.announcements.id, params.id))
          .returning();

        return {
          success: true,
          announcement: updatedAnnouncements[0],
        };
      } catch (error) {
        console.error("Error updating announcement:", error);
        return {
          success: false,
          error: "Failed to update announcement",
        };
      }
    },
  )

  // Delete announcement
  .delete(
    "/announcements/:id",
    async ({
      request,
      params,
    }: {
      request: Request;
      params: { id: string };
    }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        await db
          .delete(schema.announcements)
          .where(eq(schema.announcements.id, params.id));

        return {
          success: true,
          message: "Announcement deleted successfully",
        };
      } catch (error) {
        console.error("Error deleting announcement:", error);
        return {
          success: false,
          error: "Failed to delete announcement",
        };
      }
    },
  )

  // Get all users (better-auth users)
  .get("/users", async ({ request }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const users = await db.query.user.findMany({
        orderBy: [desc(schema.user.createdAt)],
      });

      return {
        success: true,
        users,
      };
    } catch (error) {
      console.error("Error fetching users:", error);
      return {
        success: false,
        error: "Failed to fetch users",
      };
    }
  })

  // Get specific user by ID (better-auth user)
  .get(
    "/users/:id",
    async ({
      request,
      params,
    }: {
      request: Request;
      params: { id: string };
    }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const user = await db.query.user.findFirst({
          where: eq(schema.user.id, params.id),
        });

        if (!user) {
          return {
            success: false,
            error: "User not found",
          };
        }

        return {
          success: true,
          user,
        };
      } catch (error) {
        console.error("Error fetching user:", error);
        return {
          success: false,
          error: "Failed to fetch user",
        };
      }
    },
  )

  // Update user information (better-auth user)
  .put(
    "/users/:id",
    async ({
      request,
      params,
      body,
    }: {
      request: Request;
      params: { id: string };
      body: any;
    }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const { name, email } = body;

        if (!name || !email) {
          return {
            success: false,
            error: "Name and email are required",
          };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return {
            success: false,
            error: "Invalid email format",
          };
        }

        const updatedUsers = await db
          .update(schema.user)
          .set({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            updatedAt: new Date(),
          })
          .where(eq(schema.user.id, params.id))
          .returning();

        return {
          success: true,
          user: updatedUsers[0],
          message: "User updated successfully",
        };
      } catch (error) {
        console.error("Error updating user:", error);

        if (
          error instanceof Error &&
          (error.message.includes("Unique constraint") ||
            error.message.includes("unique"))
        ) {
          return {
            success: false,
            error: "Email already exists",
          };
        }

        return {
          success: false,
          error: "Failed to update user",
        };
      }
    },
  )

  // Get all courses with admin access
  .get("/courses", async ({ request }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const courses = await db.query.courses.findMany({
        orderBy: [asc(schema.courses.name)],
      });

      const coursesWithCounts = await Promise.all(
        courses.map(async (course) => {
          const [canvasUsersRes, questionsRes] = await Promise.all([
            db
              .select({ count: count() })
              .from(schema.users)
              .where(eq(schema.users.courseId, course.id)),
            db
              .select({ count: count() })
              .from(schema.questions)
              .where(eq(schema.questions.courseId, course.id)),
          ]);

          return {
            ...course,
            _count: {
              canvasUsers: canvasUsersRes[0]?.count ?? 0,
              questions: questionsRes[0]?.count ?? 0,
            },
          };
        }),
      );

      return {
        success: true,
        courses: coursesWithCounts,
      };
    } catch (error) {
      console.error("Error fetching courses:", error);
      return {
        success: false,
        error: "Failed to fetch courses",
      };
    }
  })

  // Update course details
  .put(
    "/courses/:id",
    async ({
      request,
      params,
      body,
    }: {
      request: Request;
      params: { id: string };
      body: any;
    }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const { quote, quoteAuthor, showDebt } = body;

        const updateData: Partial<typeof schema.courses.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (quote !== undefined) updateData.quote = quote;
        if (quoteAuthor !== undefined) updateData.quoteAuthor = quoteAuthor;
        if (showDebt !== undefined) updateData.showDebt = showDebt;

        const updatedCourses = await db
          .update(schema.courses)
          .set(updateData)
          .where(eq(schema.courses.id, params.id))
          .returning();

        return {
          success: true,
          course: updatedCourses[0],
          message: "Course updated successfully",
        };
      } catch (error) {
        console.error("Error updating course:", error);
        return {
          success: false,
          error: "Failed to update course",
        };
      }
    },
  );
