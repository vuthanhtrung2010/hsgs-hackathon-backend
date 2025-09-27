import { Elysia } from "elysia";
import { db } from "../db.js";
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

      const user = await db.user.findUnique({
        where: { id: session.user.id },
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
        return { error: "User not found" };
      }

      return {
        success: true,
        user,
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

        const updateData: any = {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          updatedAt: new Date(),
        };

        // Handle password update separately
        if (password && password.trim()) {
          // Validate old password
          if (!oldPassword || !oldPassword.trim()) {
            return {
              success: false,
              error: "Current password is required when changing password",
            };
          }

          // Use better-auth's built-in changePassword method
          try {
            await auth.api.changePassword({
              body: {
                newPassword: password.trim(),
                currentPassword: oldPassword.trim(),
                revokeOtherSessions: false, // Don't revoke other sessions for now
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
        const updatedUser = await db.user.update({
          where: { id: session.user.id },
          data: updateData,
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
          message: "Profile updated successfully",
        };
      } catch (error) {
        console.error("Error updating user profile:", error);

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
          error: "Failed to update profile",
        };
      }
    },
  )
  .get("/details/:userId", async ({ params: { userId } }) => {
    try {
      // Get user data across all courses
      const users = await db.canvasUser.findMany({
        where: { studentId: userId },
        include: {
          quizzes: {
            orderBy: { submittedAt: "desc" },
            include: { question: true },
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

      for (const user of users) {
        if (!courseData[user.courseId]) {
          // Get course name (you might want to cache this)
          const course = await db.course.findUnique({
            where: { id: user.courseId },
          });

          courseData[user.courseId] = {
            courseId: user.courseId,
            courseName: course?.name || `Course ${user.courseId}`,
            minRating: 1500, // Will be calculated from rating changes
            maxRating: 1500, // Will be calculated from rating changes
            ratingChanges: [],
            clusters: {}, // Will be populated with type-based skills
            quizzesCompleted: 0, // Will be calculated from user quizzes
          };
        }
        const courseInfo = courseData[user.courseId]!; // We know it exists from above

        // Sort quizzes by submission date to track rating progression
        const sortedQuizzes = user.quizzes.sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        );
        
        // Get all TopicRating entries for this user in this course to calculate weighted average progression
        const topicRatings = await db.topicRating.findMany({
          where: {
            userId: user.id,
            courseId: user.courseId
          },
          select: {
            topic: true,
            rating: true,
            submissionCount: true,
            updatedAt: true
          },
          orderBy: {
            updatedAt: 'asc'
          }
        });
        
        // Build rating changes history based on quiz submission times and topic rating updates
        if (topicRatings.length > 0) {
          // Group topic ratings by updatedAt date to calculate weighted average at each point
          const ratingChangesByDate: Map<string, { 
            date: Date, 
            topicRatings: { topic: string, rating: number, submissionCount: number }[] 
          }> = new Map();
          
          // Initialize with quizzes to get the submission dates
          for (const quiz of sortedQuizzes) {
            const dateKey = quiz.submittedAt.toISOString();
            if (!ratingChangesByDate.has(dateKey)) {
              ratingChangesByDate.set(dateKey, {
                date: quiz.submittedAt,
                topicRatings: []
              });
            }
          }
          
          // Fill in topic ratings based on their update dates
          let currentTopicRatings: { topic: string, rating: number, submissionCount: number }[] = [];
          
          // Process each topic rating update
          for (const topicRating of topicRatings) {
            const dateKey = topicRating.updatedAt.toISOString();
            
            // Update our current knowledge of topic ratings
            const existingIndex = currentTopicRatings.findIndex(tr => tr.topic === topicRating.topic);
            if (existingIndex >= 0) {
              currentTopicRatings[existingIndex] = {
                topic: topicRating.topic,
                rating: topicRating.rating,
                submissionCount: topicRating.submissionCount
              };
            } else {
              currentTopicRatings.push({
                topic: topicRating.topic,
                rating: topicRating.rating,
                submissionCount: topicRating.submissionCount
              });
            }
            
            // Create or update entry for this date
            if (!ratingChangesByDate.has(dateKey)) {
              ratingChangesByDate.set(dateKey, {
                date: topicRating.updatedAt,
                topicRatings: [...currentTopicRatings]
              });
            } else {
              ratingChangesByDate.get(dateKey)!.topicRatings = [...currentTopicRatings];
            }
          }
          
          // Convert to sorted array and calculate weighted average ratings
          const sortedDates = Array.from(ratingChangesByDate.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime());
          
          for (const entry of sortedDates) {
            // Calculate weighted average rating at this point in time
            if (entry.topicRatings.length > 0) {
              let totalRatingSum = 0;
              let totalSubmissions = 0;
              
              for (const topicRating of entry.topicRatings) {
                totalRatingSum += topicRating.rating * topicRating.submissionCount;
                totalSubmissions += topicRating.submissionCount;
              }
              
              const weightedAvgRating = totalSubmissions > 0
                ? Math.round(totalRatingSum / totalSubmissions)
                : 1500;
              
              courseInfo.ratingChanges.push({
                date: entry.date.toISOString(),
                rating: weightedAvgRating
              });
            }
          }
        } else {
          // Fallback to old method if no topic ratings exist yet
          const typeRatingsProgression: Record<string, number[]> = {};
          
          for (let i = 0; i < sortedQuizzes.length; i++) {
            const quiz = sortedQuizzes[i]!;
            const question = quiz.question;
            
            // Update type ratings up to this point in time
            for (const type of question.types) {
              if (!typeRatingsProgression[type]) {
                typeRatingsProgression[type] = [];
              }
              typeRatingsProgression[type].push(question.rating);
            }
            
            // Calculate average cluster rating at this point in time
            const typeAverages: number[] = [];
            for (const [type, ratings] of Object.entries(typeRatingsProgression)) {
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
              rating: Math.round(averageClusterRating)
            });
          }
        }

        // Get topic ratings for this user from the database
        const userTopicRatings = await db.topicRating.findMany({
          where: {
            userId: user.id,
            courseId: user.courseId
          }
        });
        
        // Initialize clusters from topic ratings
        const skillsClusters: Record<string, number> = {};
        
        if (userTopicRatings.length > 0) {
          // Use the direct topic ratings from the database
          for (const topicRating of userTopicRatings) {
            skillsClusters[topicRating.topic] = topicRating.rating;
          }
        } else {
          // Fallback to old method if no topic ratings exist yet
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
          
          // Calculate average rating per type
          for (const [type, ratings] of Object.entries(typeRatings)) {
            if (ratings.length > 0) {
              skillsClusters[type] =
                ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
            }
          }
        }
        
        // Update course clusters with calculated skills
        courseInfo.clusters = skillsClusters;

        // Set quizzes completed count for this course
        courseInfo.quizzesCompleted = user.quizzes.length;

        // Calculate min/max from topic ratings directly
        const courseTopicRatings = await db.topicRating.findMany({
          where: {
            userId: user.id,
            courseId: user.courseId
          }
        });
        
        if (courseTopicRatings.length > 0) {
          const ratings = courseTopicRatings.map(tr => tr.rating);
          courseInfo.minRating = Math.min(...ratings);
          courseInfo.maxRating = Math.max(...ratings);
        } else if (courseInfo.ratingChanges.length > 0) {
          // Fallback to rating changes if no topic ratings
          const ratings = courseInfo.ratingChanges.map((rc) => rc.rating);
          courseInfo.minRating = Math.min(...ratings);
          courseInfo.maxRating = Math.max(...ratings);
        }
      }

      // Get recommendations for the primary course (first one)
      const primaryCourse = Object.values(courseData)[0];
      if (primaryCourse) {
        // Get recommendations based on quiz types instead of clusters
        const recommendations = await getBalancedRecommendationsForUser(
          userId,
          primaryCourse.courseId,
          4,
        );
        primaryCourse.recommendations = recommendations;
      }

      // Calculate user's overall rating as the weighted average of their topic ratings
      let overallRating = 1500; // Default starting rating
      let totalTopicSubmissions = 0;
      let totalTopicRatingSum = 0;
      
      // Collect all topic ratings across all courses
      const allTopicRatings: {topic: string, rating: number, submissionCount: number}[] = [];
      
      // Get all topic ratings for this user from database
      for (const user of users) {
        const topicRatings = await db.topicRating.findMany({
          where: {
            userId: user.id
          }
        });
        
        allTopicRatings.push(...topicRatings);
      }
      
      // Calculate weighted average if we have topic ratings
      if (allTopicRatings.length > 0) {
        for (const topicRating of allTopicRatings) {
          totalTopicRatingSum += topicRating.rating * topicRating.submissionCount;
          totalTopicSubmissions += topicRating.submissionCount;
        }
        
        if (totalTopicSubmissions > 0) {
          overallRating = Math.round(totalTopicRatingSum / totalTopicSubmissions);
        }
      } else if (users.length > 0 && users[0]) {
        // Fallback to user's rating in database if no topic ratings
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
