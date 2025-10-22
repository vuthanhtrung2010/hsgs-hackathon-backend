import { Elysia } from "elysia";
import { db } from "../db.js";

export const rankingRoutes = new Elysia({ prefix: "/api/ranking" }).get(
  "/:randomizedCourseId",
  async ({ params: { randomizedCourseId }, set }) => {
    try {
      const realCourse = await db.course.findUnique({
        where: { randomId: randomizedCourseId },
        include: {
          ratingThresholds: true
        }
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

      // Get last 5 recent submissions for the course
      const recentSubmissions = await db.quiz.findMany({
        where: {
          question: {
            courseId: realCourse.id,
          },
        },
        select: {
          id: true,
          submittedAt: true,
          user: {
            select: {
              studentId: true,
              name: true,
              shortName: true,
            },
          },
          question: {
            select: {
              quizName: true,
              lesson: true,
            },
          },
        },
        orderBy: {
          submittedAt: "desc",
        },
        take: 5,
      });

      // Calculate max quizzes completed by any user
      const maxQuizzesCompleted = Math.max(
        ...users.map((u) => u.quizzes.length),
        0
      );

      // Check if debt calculation is valid
      const isDebtValid = 
        realCourse.showDebt && 
        realCourse.assignmentCount > 0 && 
        maxQuizzesCompleted <= realCourse.assignmentCount;

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

          const quizzesCompleted = user.quizzes.length;
          const debt = isDebtValid 
            ? Math.max(0, realCourse.assignmentCount - quizzesCompleted)
            : 0;

          return {
            id: parseInt(user.studentId), // Canvas user ID as number
            name: user.name,
            shortName: user.shortName,
            course: {
              courseId: parseInt(realCourse.id || "0"),
              courseName,
              rating: Math.round(averageRating), // Weighted average rating across all topics
              quizzesCompleted, // Number of completed quizzes
              debt, // Number of assignments not completed
              quote: realCourse.quote, // Course quote
              quoteAuthor: realCourse.quoteAuthor,
              showDebt: realCourse.showDebt,
              assignmentCount: realCourse.assignmentCount,
              customRatingThresholds: realCourse.customRatingThresholds || false,
              ratingThresholds: realCourse.customRatingThresholds ? realCourse.ratingThresholds : null,
            },
          };
        })
        .sort((a, b) => b.course.rating - a.course.rating);

      return {
        ranking,
        recentSubmissions: recentSubmissions.map((submission) => ({
          id: submission.id,
          submittedAt: submission.submittedAt,
          userName: submission.user.name,
          userShortName: submission.user.shortName,
          userId: parseInt(submission.user.studentId),
          quizName: submission.question.lesson || submission.question.quizName,
        })),
      };
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
