import { Elysia } from 'elysia';
import { db } from '../db.js';
import { fetchUserAvatar } from '../utils/canvas.js';
import { getBalancedRecommendationsForUser } from '../services/recommendations.js';
import { type IUserData, type Course } from '../types.js';

export const userRoutes = new Elysia({ prefix: '/api/users' })
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