import { Elysia } from "elysia";
import { db } from "../db.js";

export const rankingRoutes = new Elysia({ prefix: "/api/ranking" }).get(
  "/:randomizedCourseId",
  async ({ params: { randomizedCourseId }, set }) => {
    try {
      const realCourse = await db.course.findUnique({
        where: { randomId: randomizedCourseId },
        select: { id: true, name: true, quote: true, quoteAuthor: true },
      });

      if (!realCourse) {
        set.status = 404;
        return {
          error: "Course not found",
          message: `No course found with randomized ID: ${randomizedCourseId}`,
        };
      }

      // Get all users for the specified course
      const users = await db.canvasUser.findMany({
        where: { courseId: realCourse.id },
        select: {
          id: true,
          studentId: true,
          name: true,
          shortName: true,
          topicRatings: {
            where: {
              courseId: realCourse.id,
            },
            select: {
              rating: true,
              submissionCount: true,
              topic: true,
            },
          },
          quizzes: {
            select: {
              id: true,
            },
            where: {
              question: {
                courseId: realCourse.id,
              },
            },
          },
        },
      });

      if (!users.length) {
        return [];
      }

      const courseName = realCourse.name || `Course ${realCourse.id}`;

      // Calculate average rating as weighted average of topic ratings for each user
      const ranking = users
        .map((user) => {
          let averageRating = 1500; // Default rating

          // Calculate weighted average of topic ratings if available
          if (user.topicRatings.length > 0) {
            let totalRatingSum = 0;
            let totalSubmissions = 0;

            for (const topicRating of user.topicRatings) {
              totalRatingSum +=
                topicRating.rating * topicRating.submissionCount;
              totalSubmissions += topicRating.submissionCount;
            }

            if (totalSubmissions > 0) {
              averageRating = totalRatingSum / totalSubmissions;
            }
          }

          return {
            id: parseInt(user.studentId), // Canvas user ID as number
            name: user.name,
            shortName: user.shortName,
            course: {
              courseId: parseInt(realCourse.id || "0"),
              courseName,
              rating: Math.round(averageRating), // Weighted average rating across all topics
              quizzesCompleted: user.quizzes.length, // Number of completed quizzes
              quote: realCourse.quote, // Course quote
              quoteAuthor: realCourse.quoteAuthor,
            },
          };
        })
        .sort((a, b) => b.course.rating - a.course.rating);

      return ranking;
    } catch (error) {
      console.error(
        `Error getting ranking for course ${randomizedCourseId}:`,
        error
      );
      set.status = 500;
      return { error: "Internal server error" };
    }
  }
);
