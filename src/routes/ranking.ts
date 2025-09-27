import { Elysia } from "elysia";
import { db } from "../db.js";

export const rankingRoutes = new Elysia({ prefix: "/api/ranking" })
  .get("/:courseId", async ({ params: { courseId } }) => {
    try {
      // Get all users for the specified course
      const users = await db.canvasUser.findMany({
        where: { courseId },
        select: {
          id: true,
          studentId: true,
          name: true,
          shortName: true,
          topicRatings: {
            where: {
              courseId: courseId,
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
                courseId: courseId,
              },
            },
          },
        },
      });

      if (!users.length) {
        return [];
      }

      // Get course information
      const course = await db.course.findUnique({
        where: { id: courseId },
        select: { name: true },
      });

      const courseName = course?.name || `Course ${courseId}`;

      // Calculate average rating as weighted average of topic ratings for each user
      const ranking = users
        .map((user) => {
          let averageRating = 1500; // Default rating
          
          // Calculate weighted average of topic ratings if available
          if (user.topicRatings.length > 0) {
            let totalRatingSum = 0;
            let totalSubmissions = 0;
            
            for (const topicRating of user.topicRatings) {
              totalRatingSum += topicRating.rating * topicRating.submissionCount;
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
              courseId: parseInt(courseId),
              courseName,
              rating: Math.round(averageRating), // Weighted average rating across all topics
              quizzesCompleted: user.quizzes.length, // Number of completed quizzes
            },
          };
        })
        .sort((a, b) => b.course.rating - a.course.rating);

      return ranking;
    } catch (error) {
      console.error(`Error getting ranking for course ${courseId}:`, error);
      return { error: "Internal server error" };
    }
  })

  .get("/", async () => {
    try {
      // Default behavior - get ranking for the default course
      const defaultCourseId = process.env.COURSE_ID;

      if (!defaultCourseId) {
        return { error: "No default course ID configured" };
      }

      // Get all users for the default course with their topic ratings
      const users = await db.canvasUser.findMany({
        where: { courseId: defaultCourseId },
        select: {
          id: true,
          studentId: true,
          name: true,
          shortName: true,
          topicRatings: {
            where: {
              courseId: defaultCourseId,
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
                courseId: defaultCourseId,
              },
            },
          },
        },
      });

      if (!users.length) {
        return [];
      }

      // Get course information
      const course = await db.course.findUnique({
        where: { id: defaultCourseId },
        select: { name: true },
      });

      const courseName = course?.name || `Course ${defaultCourseId}`;

      // Calculate average rating as weighted average of topic ratings for each user
      const ranking = users
        .map((user) => {
          let averageRating = 1500; // Default rating
          
          // Calculate weighted average of topic ratings if available
          if (user.topicRatings.length > 0) {
            let totalRatingSum = 0;
            let totalSubmissions = 0;
            
            for (const topicRating of user.topicRatings) {
              totalRatingSum += topicRating.rating * topicRating.submissionCount;
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
              courseId: parseInt(defaultCourseId),
              courseName,
              rating: Math.round(averageRating), // Weighted average rating across all topics
            },
          };
        })
        .sort((a, b) => b.course.rating - a.course.rating);

      return ranking;
    } catch (error) {
      console.error("Error getting default ranking:", error);
      return { error: "Internal server error" };
    }
  });
