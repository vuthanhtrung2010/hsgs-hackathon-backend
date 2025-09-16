import { Elysia } from 'elysia';
import { db } from '../db.js';
import { fetchUserAvatar } from '../utils/canvas.js';
import { getBalancedRecommendationsForUser } from '../services/recommendations.js';
import { type IUserData, type Course } from '../types.js';
import { auth } from '../auth.js';

export const userRoutes = new Elysia({ prefix: '/api/users' })
  // Get current user profile
  .get('/profile', async ({ request }) => {
    try {
      // Get session from better-auth
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session) {
        return { error: 'Unauthorized' };
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
          updatedAt: true
        }
      });

      if (!user) {
        return { error: 'User not found' };
      }

      return {
        success: true,
        user
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return { error: 'Internal server error' };
    }
  })

  // Update current user profile
  .put('/profile', async ({ request, body }: { request: Request, body: any }) => {
    try {
      // Get session from better-auth
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session) {
        return { error: 'Unauthorized' };
      }

      const { name, email, password } = body;

      if (!name || !email) {
        return {
          success: false,
          error: 'Name and email are required'
        };
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return {
          success: false,
          error: 'Invalid email format'
        };
      }

      const updateData: any = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        updatedAt: new Date()
      };

      // Only update password if provided
      if (password && password.trim()) {
        // Note: In a real app, you'd hash the password
        // For now, we'll store it as plain text (not recommended for production)
        updateData.password = password.trim();
      }

      const updatedUser = await db.user.update({
        where: { id: session.user.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          updatedAt: true
        }
      });

      return {
        success: true,
        user: updatedUser,
        message: 'Profile updated successfully'
      };
    } catch (error) {
      console.error('Error updating user profile:', error);
      
      // Handle unique constraint violation for email
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return {
          success: false,
          error: 'Email already exists'
        };
      }

      return {
        success: false,
        error: 'Failed to update profile'
      };
    }
  })
  .get('/details/:userId', async ({ params: { userId } }) => {
    try {
      // Get user data across all courses
      const users = await db.canvasUser.findMany({
        where: { studentId: userId },
        include: {
          quizzes: {
            orderBy: { submittedAt: 'desc' },
            include: { question: true }
          }
        }
      });

      if (!users.length) {
        return { error: 'User not found' };
      }

      // Get avatar URL
      const avatarURL = await fetchUserAvatar(userId);

      // Group by course
      const courseData: Record<string, Course> = {};
      
      for (const user of users) {
        if (!courseData[user.courseId]) {
          // Get course name (you might want to cache this)
          const course = await db.course.findUnique({
            where: { id: user.courseId }
          });

          courseData[user.courseId] = {
            courseId: user.courseId,
            courseName: course?.name || `Course ${user.courseId}`,
            minRating: user.rating,
            maxRating: user.rating,
            ratingChanges: [],
            clusters: {} // Keep empty for compatibility, but not used
          };
        }

        const courseInfo = courseData[user.courseId]!; // We know it exists from above
        
        // Update rating bounds
        courseInfo.minRating = Math.min(courseInfo.minRating, user.rating);
        courseInfo.maxRating = Math.max(courseInfo.maxRating, user.rating);

        // Add rating changes from quizzes
        for (const quiz of user.quizzes) {
          courseInfo.ratingChanges.push({
            date: quiz.submittedAt.toISOString(),
            rating: user.rating // This is simplified - ideally track historical ratings
          });
        }
      }

      // Get recommendations for the primary course (first one)
      const primaryCourse = Object.values(courseData)[0];
      if (primaryCourse) {
        // Get recommendations based on quiz types instead of clusters
        const recommendations = await getBalancedRecommendationsForUser(userId, primaryCourse.courseId, 4);
        primaryCourse.recommendations = recommendations;
      }

      const userData: IUserData = {
        id: userId,
        name: users[0]?.name || "Undefined name",
        shortName: users[0]?.shortName || "Undefined short name",
        rating: Math.round(Object.values(courseData).reduce((sum, course) => {
          // Use course average rating since we don't have clusters
          return sum + course.minRating; // Simplified - use min rating as representative
        }, 0) / Object.keys(courseData).length),
        avatarURL,
        courses: Object.values(courseData)
      };

      return userData;
    } catch (error) {
      console.error('Error getting user details:', error);
      return { error: 'Internal server error' };
    }
  })