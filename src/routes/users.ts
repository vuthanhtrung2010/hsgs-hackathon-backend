import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { fetchUserAvatar } from "../utils/canvas.js";
import { getBalancedRecommendationsForUser } from "../services/recommendations.js";
import { type IUserData, type Course } from "../types.js";
import { auth } from "../auth.js";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  // Get current user profile
  .get("/profile", async ({ request }) => {
    try {
      // Get session from better-auth
      const session = await auth.api.getSession({ headers: request.headers });

      if (!session) {
        return { error: "Unauthorized" };
      }

      const user = await db.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
      });

      if (!user) {
        return { error: "User not found" };
      }

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return { error: "Internal server error" };
    }
  })

  // Update current user profile
  .put(
    "/profile",
    async ({ request, body }: { request: Request; body: any }) => {
      try {
        // Get session from better-auth
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return { error: "Unauthorized" };
        }

        const { name, email, password, oldPassword } = body;

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

        // Handle password update separately
        if (password && password.trim()) {
          if (!oldPassword || !oldPassword.trim()) {
            return {
              success: false,
              error: "Current password is required when changing password",
            };
          }

          try {
            await auth.api.changePassword({
              body: {
                newPassword: password.trim(),
                currentPassword: oldPassword.trim(),
                revokeOtherSessions: false,
              },
              headers: request.headers,
            });
          } catch (error: any) {
            return {
              success: false,
              error: error.message || "Failed to change password",
            };
          }
        }

        // Update user profile (name, email)
        const updatedUsers = await db
          .update(schema.user)
          .set({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            updatedAt: new Date(),
          })
          .where(eq(schema.user.id, session.user.id))
          .returning();

        const updatedUser = updatedUsers[0];

        return {
          success: true,
          user: updatedUser,
          message: "Profile updated successfully",
        };
      } catch (error) {
        console.error("Error updating user profile:", error);

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
          error: "Failed to update profile",
        };
      }
    },
  )
  .get("/details/:userId/submissions", async ({ params: { userId } }) => {
    try {
      // Get all Canvas users with this studentId across all courses
      const users = await db.query.users.findMany({
        where: eq(schema.users.studentId, userId),
        with: {
          quizzes: {
            orderBy: [desc(schema.quizzes.submittedAt)],
            with: {
              question: true,
            },
          },
        },
      });

      if (!users.length) {
        return { error: "User not found" };
      }

      const canvasBaseUrl = process.env.CANVAS_BASE_URL || "";

      // Collect all submissions from all courses
      const submissions = users.flatMap((u) =>
        u.quizzes.map((quiz) => ({
          id: quiz.id,
          submissionId: quiz.submissionId,
          quizId: quiz.question.quizId,
          quizName: quiz.question.lesson || quiz.question.quizName,
          courseId: u.courseId,
          courseName: "", // Will be filled from Course table
          score: quiz.score,
          maxScore: quiz.maxScore,
          rating: quiz.question.rating,
          submittedAt: quiz.submittedAt,
          submissionUrl: `${canvasBaseUrl}/courses/${u.courseId}/quizzes/${quiz.question.quizId}/history?quiz_submission_id=${quiz.submissionId}&version=1`,
        })),
      );

      // Get course names
      const courseIds = [...new Set(users.map((u) => u.courseId))];
      const courses =
        courseIds.length > 0
          ? await db.query.courses.findMany({
              where: inArray(schema.courses.id, courseIds),
            })
          : [];

      const courseMap = new Map(courses.map((c) => [c.id, c.name]));

      // Fill in course names
      submissions.forEach((sub) => {
        sub.courseName =
          courseMap.get(sub.courseId) || `Course ${sub.courseId}`;
      });

      return {
        success: true,
        submissions,
        total: submissions.length,
      };
    } catch (error) {
      console.error("Error fetching user submissions:", error);
      return { error: "Internal server error" };
    }
  })

  .get("/details/:userId", async ({ params: { userId } }) => {
    try {
      // Get user data across all courses
      const users = await db.query.users.findMany({
        where: eq(schema.users.studentId, userId),
        with: {
          quizzes: {
            orderBy: [desc(schema.quizzes.submittedAt)],
            with: { question: true },
          },
        },
      });

      if (!users.length) {
        return { error: "User not found" };
      }

      // Get avatar URL
      const avatarURL = await fetchUserAvatar(userId);

      // Group by course
      const courseData: Record<string, Course> = {};

      for (const u of users) {
        if (!courseData[u.courseId]) {
          const course = await db.query.courses.findFirst({
            where: eq(schema.courses.id, u.courseId),
          });

          courseData[u.courseId] = {
            courseId: u.courseId,
            courseName: course?.name || `Course ${u.courseId}`,
            minRating: 1500,
            maxRating: 1500,
            ratingChanges: [],
            clusters: {},
            quizzesCompleted: 0,
          };
        }
        const courseInfo = courseData[u.courseId]!;

        // Sort quizzes by submission date to track rating progression
        const sortedQuizzes = [...u.quizzes].sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        );

        // Get all TopicRating entries for this user in this course
        const topicRatings = await db.query.topicRatings.findMany({
          where: and(
            eq(schema.topicRatings.userId, u.id),
            eq(schema.topicRatings.courseId, u.courseId),
          ),
          orderBy: [asc(schema.topicRatings.updatedAt)],
        });

        // Build rating changes history based on quiz submission times and topic rating updates
        if (topicRatings.length > 0) {
          const ratingChangesByDate: Map<
            string,
            {
              date: Date;
              topicRatings: {
                topic: string;
                rating: number;
                submissionCount: number;
              }[];
            }
          > = new Map();

          for (const quiz of sortedQuizzes) {
            const dateKey = quiz.submittedAt.toISOString();
            if (!ratingChangesByDate.has(dateKey)) {
              ratingChangesByDate.set(dateKey, {
                date: quiz.submittedAt,
                topicRatings: [],
              });
            }
          }

          let currentTopicRatings: {
            topic: string;
            rating: number;
            submissionCount: number;
          }[] = [];

          for (const topicRating of topicRatings) {
            const dateKey = topicRating.updatedAt.toISOString();

            const existingIndex = currentTopicRatings.findIndex(
              (tr) => tr.topic === topicRating.topic,
            );
            if (existingIndex >= 0) {
              currentTopicRatings[existingIndex] = {
                topic: topicRating.topic,
                rating: topicRating.rating,
                submissionCount: topicRating.submissionCount,
              };
            } else {
              currentTopicRatings.push({
                topic: topicRating.topic,
                rating: topicRating.rating,
                submissionCount: topicRating.submissionCount,
              });
            }

            if (!ratingChangesByDate.has(dateKey)) {
              ratingChangesByDate.set(dateKey, {
                date: topicRating.updatedAt,
                topicRatings: [...currentTopicRatings],
              });
            } else {
              ratingChangesByDate.get(dateKey)!.topicRatings = [
                ...currentTopicRatings,
              ];
            }
          }

          const sortedDates = Array.from(ratingChangesByDate.values()).sort(
            (a, b) => a.date.getTime() - b.date.getTime(),
          );

          for (const entry of sortedDates) {
            if (entry.topicRatings.length > 0) {
              let totalRatingSum = 0;
              let totalSubmissions = 0;

              for (const tr of entry.topicRatings) {
                totalRatingSum += tr.rating * tr.submissionCount;
                totalSubmissions += tr.submissionCount;
              }

              const weightedAvgRating =
                totalSubmissions > 0
                  ? Math.round(totalRatingSum / totalSubmissions)
                  : 1500;

              courseInfo.ratingChanges.push({
                date: entry.date.toISOString(),
                rating: weightedAvgRating,
              });
            }
          }
        } else {
          // Fallback to type ratings progression
          const typeRatingsProgression: Record<string, number[]> = {};

          for (let i = 0; i < sortedQuizzes.length; i++) {
            const quiz = sortedQuizzes[i]!;
            const question = quiz.question;

            for (const type of question.types) {
              if (!typeRatingsProgression[type]) {
                typeRatingsProgression[type] = [];
              }
              typeRatingsProgression[type].push(question.rating);
            }

            const typeAverages: number[] = [];
            for (const [, ratings] of Object.entries(
              typeRatingsProgression,
            )) {
              if (ratings.length > 0) {
                const typeAverage =
                  ratings.reduce((sum, rating) => sum + rating, 0) /
                  ratings.length;
                typeAverages.push(typeAverage);
              }
            }

            const averageClusterRating =
              typeAverages.length > 0
                ? typeAverages.reduce((sum, avg) => sum + avg, 0) /
                  typeAverages.length
                : 1500;

            courseInfo.ratingChanges.push({
              date: quiz.submittedAt.toISOString(),
              rating: Math.round(averageClusterRating),
            });
          }
        }

        // Get topic ratings for this user from database
        const userTopicRatings = await db.query.topicRatings.findMany({
          where: and(
            eq(schema.topicRatings.userId, u.id),
            eq(schema.topicRatings.courseId, u.courseId),
          ),
        });

        const skillsClusters: Record<string, number> = {};

        if (userTopicRatings.length > 0) {
          for (const topicRating of userTopicRatings) {
            skillsClusters[topicRating.topic] = topicRating.rating;
          }
        } else {
          const typeRatings: Record<string, number[]> = {};

          for (const quiz of u.quizzes) {
            const question = quiz.question;
            for (const type of question.types) {
              if (!typeRatings[type]) {
                typeRatings[type] = [];
              }
              typeRatings[type].push(question.rating);
            }
          }

          for (const [type, ratings] of Object.entries(typeRatings)) {
            if (ratings.length > 0) {
              skillsClusters[type] =
                ratings.reduce((sum, rating) => sum + rating, 0) /
                ratings.length;
            }
          }
        }

        courseInfo.clusters = skillsClusters;
        courseInfo.quizzesCompleted = u.quizzes.length;

        const courseTopicRatings = await db.query.topicRatings.findMany({
          where: and(
            eq(schema.topicRatings.userId, u.id),
            eq(schema.topicRatings.courseId, u.courseId),
          ),
        });

        if (courseTopicRatings.length > 0) {
          const ratings = courseTopicRatings.map((tr) => tr.rating);
          courseInfo.minRating = Math.min(...ratings);
          courseInfo.maxRating = Math.max(...ratings);
        } else if (courseInfo.ratingChanges.length > 0) {
          const ratings = courseInfo.ratingChanges.map((rc) => rc.rating);
          courseInfo.minRating = Math.min(...ratings);
          courseInfo.maxRating = Math.max(...ratings);
        }
      }

      // Get recommendations for primary course
      const primaryCourse = Object.values(courseData)[0];
      if (primaryCourse) {
        const recommendations = await getBalancedRecommendationsForUser(
          userId,
          primaryCourse.courseId,
          4,
        );
        primaryCourse.recommendations = recommendations;
      }

      // Calculate user's overall rating as weighted average of topic ratings
      let overallRating = 1500;
      let totalTopicSubmissions = 0;
      let totalTopicRatingSum = 0;

      const allTopicRatings: {
        topic: string;
        rating: number;
        submissionCount: number;
      }[] = [];

      for (const u of users) {
        const trs = await db.query.topicRatings.findMany({
          where: eq(schema.topicRatings.userId, u.id),
        });
        allTopicRatings.push(...trs);
      }

      if (allTopicRatings.length > 0) {
        for (const topicRating of allTopicRatings) {
          totalTopicRatingSum +=
            topicRating.rating * topicRating.submissionCount;
          totalTopicSubmissions += topicRating.submissionCount;
        }

        if (totalTopicSubmissions > 0) {
          overallRating = Math.round(
            totalTopicRatingSum / totalTopicSubmissions,
          );
        }
      } else if (users.length > 0 && users[0]) {
        overallRating = users[0].rating;
      }

      const userData: IUserData = {
        id: userId,
        name: users[0]?.name || "Undefined name",
        shortName: users[0]?.shortName || "Undefined short name",
        rating: overallRating,
        avatarURL,
        courses: Object.values(courseData),
      };

      return userData;
    } catch (error) {
      console.error("Error getting user details:", error);
      return { error: "Internal server error" };
    }
  });
