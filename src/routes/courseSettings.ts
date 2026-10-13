import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, or, asc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

export const courseSettingsRoute = new Elysia({ prefix: "/api/admin/courses" })
  // Get course settings including rating thresholds
  .get("/:id/settings", async ({ request, params }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, params.id),
        with: {
          ratingThresholds: true,
        },
      });

      if (!course) {
        return {
          success: false,
          error: "Course not found",
        };
      }

      return {
        success: true,
        settings: course,
      };
    } catch (error) {
      console.error("Error fetching course settings:", error);
      return {
        success: false,
        error: "Failed to fetch course settings",
      };
    }
  })

  // Update course settings
  .put("/:id/settings", async ({ request, params, body }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const {
        quote,
        quoteAuthor,
        showDebt,
        customRatingThresholds,
        thresholds,
      } = body as {
        quote?: string;
        quoteAuthor?: string;
        showDebt?: boolean;
        customRatingThresholds?: boolean;
        thresholds?: {
          newbieThreshold: number;
          amateurThreshold: number;
          expertThreshold: number;
          candidateMasterThreshold: number;
          masterThreshold: number;
          grandmasterThreshold: number;
          targetThreshold: number;
          adminThreshold: number;
        };
      };

      // Validate thresholds if using custom ones
      if (customRatingThresholds && thresholds) {
        const {
          newbieThreshold,
          amateurThreshold,
          expertThreshold,
          candidateMasterThreshold,
          masterThreshold,
          grandmasterThreshold,
          targetThreshold,
          adminThreshold,
        } = thresholds;

        // Verify thresholds are in ascending order
        if (
          !(
            newbieThreshold < amateurThreshold &&
            amateurThreshold < expertThreshold &&
            expertThreshold < candidateMasterThreshold &&
            candidateMasterThreshold < masterThreshold &&
            masterThreshold < grandmasterThreshold &&
            grandmasterThreshold < targetThreshold &&
            targetThreshold < adminThreshold
          )
        ) {
          return {
            success: false,
            error: "Rating thresholds must be in ascending order",
          };
        }
      }

      const updateData: Partial<typeof schema.courses.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (quote !== undefined) updateData.quote = quote;
      if (quoteAuthor !== undefined) updateData.quoteAuthor = quoteAuthor;
      if (showDebt !== undefined) updateData.showDebt = showDebt;
      if (customRatingThresholds !== undefined) {
        updateData.customRatingThresholds = customRatingThresholds;
      }

      // Update the course
      const updatedCourses = await db
        .update(schema.courses)
        .set(updateData)
        .where(eq(schema.courses.id, params.id))
        .returning();

      const updatedCourse = updatedCourses[0];

      // Handle rating thresholds if using custom ones
      if (customRatingThresholds && thresholds) {
        const now = new Date();
        await db
          .insert(schema.ratingThresholds)
          .values({
            courseId: params.id,
            newbieThreshold: thresholds.newbieThreshold,
            amateurThreshold: thresholds.amateurThreshold,
            expertThreshold: thresholds.expertThreshold,
            candidateMasterThreshold: thresholds.candidateMasterThreshold,
            masterThreshold: thresholds.masterThreshold,
            grandmasterThreshold: thresholds.grandmasterThreshold,
            targetThreshold: thresholds.targetThreshold,
            adminThreshold: thresholds.adminThreshold,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: schema.ratingThresholds.courseId,
            set: {
              newbieThreshold: thresholds.newbieThreshold,
              amateurThreshold: thresholds.amateurThreshold,
              expertThreshold: thresholds.expertThreshold,
              candidateMasterThreshold: thresholds.candidateMasterThreshold,
              masterThreshold: thresholds.masterThreshold,
              grandmasterThreshold: thresholds.grandmasterThreshold,
              targetThreshold: thresholds.targetThreshold,
              adminThreshold: thresholds.adminThreshold,
              updatedAt: now,
            },
          });
      } else if (customRatingThresholds === false) {
        // If custom thresholds are disabled, delete any existing thresholds
        await db
          .delete(schema.ratingThresholds)
          .where(eq(schema.ratingThresholds.courseId, params.id));
      }

      return {
        success: true,
        message: "Course settings updated successfully",
        course: updatedCourse,
      };
    } catch (error) {
      console.error("Error updating course settings:", error);
      return {
        success: false,
        error: "Failed to update course settings",
      };
    }
  })

  // Get all students enrolled in a course
  .get("/:id/students", async ({ request, params: { id }, set }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      set.status = 401;
      return {
        success: false,
        error: authResult.error,
      };
    }

    try {
      const course = await db.query.courses.findFirst({
        where: or(
          eq(schema.courses.id, id),
          eq(schema.courses.randomId, id),
        ),
      });

      if (!course) {
        set.status = 404;
        return {
          success: false,
          error: "Course not found",
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
      console.error("Error fetching course students:", error);
      set.status = 500;
      return {
        success: false,
        error: "Failed to fetch course students",
      };
    }
  });