import { Elysia } from "elysia";
import { db } from "../db";
import { requireAdmin } from "../middleware/auth";

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
      const course = await db.course.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          quote: true,
          quoteAuthor: true,
          showDebt: true,
          customRatingThresholds: true,
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

      // Update the course
      const updatedCourse = await db.course.update({
        where: { id: params.id },
        data: {
          quote: quote !== undefined ? quote : undefined,
          quoteAuthor: quoteAuthor !== undefined ? quoteAuthor : undefined,
          showDebt: showDebt !== undefined ? showDebt : undefined,
          customRatingThresholds:
            customRatingThresholds !== undefined
              ? customRatingThresholds
              : undefined,
        },
      });

      // Handle rating thresholds if using custom ones
      if (customRatingThresholds && thresholds) {
        // Upsert (create or update) rating thresholds
        await db.ratingThresholds.upsert({
          where: { courseId: params.id },
          update: {
            newbieThreshold: thresholds.newbieThreshold,
            amateurThreshold: thresholds.amateurThreshold,
            expertThreshold: thresholds.expertThreshold,
            candidateMasterThreshold: thresholds.candidateMasterThreshold,
            masterThreshold: thresholds.masterThreshold,
            grandmasterThreshold: thresholds.grandmasterThreshold,
            targetThreshold: thresholds.targetThreshold,
            adminThreshold: thresholds.adminThreshold,
            updatedAt: new Date(),
          },
          create: {
            courseId: params.id,
            newbieThreshold: thresholds.newbieThreshold,
            amateurThreshold: thresholds.amateurThreshold,
            expertThreshold: thresholds.expertThreshold,
            candidateMasterThreshold: thresholds.candidateMasterThreshold,
            masterThreshold: thresholds.masterThreshold,
            grandmasterThreshold: thresholds.grandmasterThreshold,
            targetThreshold: thresholds.targetThreshold,
            adminThreshold: thresholds.adminThreshold,
          },
        });
      } else if (customRatingThresholds === false) {
        // If custom thresholds are disabled, delete any existing thresholds
        await db.ratingThresholds.deleteMany({
          where: { courseId: params.id },
        });
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
  });