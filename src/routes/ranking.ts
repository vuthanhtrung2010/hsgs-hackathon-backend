import { Elysia } from "elysia";
import { db } from "../db.js";

export const rankingRoutes = new Elysia({ prefix: "/api/ranking" })
  .get("/:courseId", async ({ params: { courseId } }) => {
    try {
      // Get all users with their quizzes and question types for the specified course
      const users = await db.canvasUser.findMany({
        where: { courseId },
        select: {
          studentId: true,
          name: true,
          shortName: true,
          quizzes: {
            select: {
              question: {
                select: {
                  rating: true,
                  types: true,
                },
              },
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

      // Calculate average rating across all cluster types for each user
      const ranking = users
        .map((user) => {
          let averageRating = 0;

          if (user.quizzes.length > 0) {
            // Group question ratings by type
            const typeRatings: Record<string, number[]> = {};

            for (const quiz of user.quizzes) {
              const question = quiz.question;

              // Process each type for this question
              for (const type of question.types) {
                if (!typeRatings[type]) {
                  typeRatings[type] = [];
                }
                // Use the question rating as a measure of skill in this type
                typeRatings[type].push(question.rating);
              }
            }

            // Calculate average rating per type, then average across all types
            const typeAverages: number[] = [];
            for (const [type, ratings] of Object.entries(typeRatings)) {
              if (ratings.length > 0) {
                const typeAverage =
                  ratings.reduce((sum, rating) => sum + rating, 0) /
                  ratings.length;
                typeAverages.push(typeAverage);
              }
            }

            if (typeAverages.length > 0) {
              averageRating =
                typeAverages.reduce((sum, avg) => sum + avg, 0) /
                typeAverages.length;
            }
          }

          return {
            id: parseInt(user.studentId), // Canvas user ID as number
            name: user.name,
            shortName: user.shortName,
            course: {
              courseId: parseInt(courseId),
              courseName,
              rating: Math.round(averageRating), // Average rating across all cluster types
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

      // Get all users with their quizzes and question types for the default course
      const users = await db.canvasUser.findMany({
        where: { courseId: defaultCourseId },
        select: {
          studentId: true,
          name: true,
          shortName: true,
          quizzes: {
            select: {
              question: {
                select: {
                  rating: true,
                  types: true,
                },
              },
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

      // Calculate average rating across all cluster types for each user
      const ranking = users
        .map((user) => {
          let averageRating = 0;

          if (user.quizzes.length > 0) {
            // Group question ratings by type
            const typeRatings: Record<string, number[]> = {};

            for (const quiz of user.quizzes) {
              const question = quiz.question;

              // Process each type for this question
              for (const type of question.types) {
                if (!typeRatings[type]) {
                  typeRatings[type] = [];
                }
                // Use the question rating as a measure of skill in this type
                typeRatings[type].push(question.rating);
              }
            }

            // Calculate average rating per type, then average across all types
            const typeAverages: number[] = [];
            for (const [type, ratings] of Object.entries(typeRatings)) {
              if (ratings.length > 0) {
                const typeAverage =
                  ratings.reduce((sum, rating) => sum + rating, 0) /
                  ratings.length;
                typeAverages.push(typeAverage);
              }
            }

            if (typeAverages.length > 0) {
              averageRating =
                typeAverages.reduce((sum, avg) => sum + avg, 0) /
                typeAverages.length;
            }
          }

          return {
            id: parseInt(user.studentId), // Canvas user ID as number
            name: user.name,
            shortName: user.shortName,
            course: {
              courseId: parseInt(defaultCourseId),
              courseName,
              rating: Math.round(averageRating), // Average rating across all cluster types
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
