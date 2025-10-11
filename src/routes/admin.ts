import { Elysia } from "elysia";
import { db } from "../db.js";
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
      const [canvasUserCount, announcementCount] =
        await Promise.all([
          db.canvasUser.count(),
          db.announcement.count(),
        ]);

      return {
        success: true,
        stats: {
          canvasUserCount,
          announcementCount,
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
  // Get all announcements
  .get("/announcements", async ({ request }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const announcements = await db.announcement.findMany({
        orderBy: {
          createdAt: "desc",
        },
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
  })

  // Create announcement
  .post("/announcements", async ({ request, body }: { request: Request; body: any }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const { title } = body;

      if (!title || !title.trim()) {
        return {
          success: false,
          error: "Title is required",
        };
      }

      const newAnnouncement = await db.announcement.create({
        data: {
          title: title.trim(),
          content: "",
        },
      });

      return {
        success: true,
        announcement: newAnnouncement,
      };
    } catch (error) {
      console.error("Error creating announcement:", error);
      return {
        success: false,
        error: "Failed to create announcement",
      };
    }
  })

  // Get single announcement
  .get("/announcements/:id", async ({ request, params }: { request: Request; params: { id: string } }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const announcement = await db.announcement.findUnique({
        where: { id: params.id },
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
  })

  // Update announcement
  .put(
    "/announcements/:id",
    async ({ request, params, body }: { request: Request; params: { id: string }; body: any }) => {
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

        const updatedAnnouncement = await db.announcement.update({
          where: { id: params.id },
          data: {
            title: title.trim(),
            content: content || "",
          },
        });

        return {
          success: true,
          announcement: updatedAnnouncement,
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
    async ({ request, params }: { request: Request; params: { id: string } }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        await db.announcement.delete({
          where: { id: params.id },
        });

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
      const users = await db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
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
  .get("/users/:id", async ({ request, params }: { request: Request; params: { id: string } }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const user = await db.user.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
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
  })

  // Update user information (better-auth user)
  .put(
    "/users/:id",
    async ({ request, params, body }: { request: Request; params: { id: string }; body: any }) => {
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

        const updatedUser = await db.user.update({
          where: { id: params.id },
          data: {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            updatedAt: new Date(),
          },
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            image: true,
            updatedAt: true,
          },
        });

        return {
          success: true,
          user: updatedUser,
          message: "User updated successfully",
        };
      } catch (error) {
        console.error("Error updating user:", error);

        // Handle unique constraint violation for email
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
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
      const courses = await db.course.findMany({
        select: {
          id: true,
          name: true,
          randomId: true,
          quote: true,
          quoteAuthor: true,
          assignmentCount: true,
          showDebt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      // Get counts separately for each course
      const coursesWithCounts = await Promise.all(
        courses.map(async (course) => {
          const [canvasUsersCount, questionsCount] = await Promise.all([
            db.canvasUser.count({ where: { courseId: course.id } }),
            db.question.count({ where: { courseId: course.id } }),
          ]);

          return {
            ...course,
            _count: {
              canvasUsers: canvasUsersCount,
              questions: questionsCount,
            },
          };
        })
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
    async ({ request, params, body }: { request: Request; params: { id: string }; body: any }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error,
        };
      }

      try {
        const { quote, quoteAuthor, showDebt } = body;

        const updatedCourse = await db.course.update({
          where: { id: params.id },
          data: {
            quote: quote !== undefined ? quote : undefined,
            quoteAuthor: quoteAuthor !== undefined ? quoteAuthor : undefined,
            showDebt: showDebt !== undefined ? showDebt : undefined,
            updatedAt: new Date(),
          },
        });

        return {
          success: true,
          course: updatedCourse,
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
