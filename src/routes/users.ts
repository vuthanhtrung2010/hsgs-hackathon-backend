import { Elysia } from 'elysia';
import { db } from '../db.js';
import { fetchUserAvatar } from '../utils/canvas.js';
import { getAllRecommendationsForUser } from '../services/recommendations.js';
import { CLUSTER_NAMES, type IUserData, type IUsersListData, type Course, type Clusters } from '../types.js';

export const userRoutes = new Elysia({ prefix: '/api/users' })
  .get('/details/:userId', async ({ params: { userId } }) => {
    try {
      // Get user data across all courses and clusters
      const users = await db.user.findMany({
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
            clusters: {}
          };
        }

        const courseInfo = courseData[user.courseId]!; // We know it exists from above
        
        // Update rating bounds
        courseInfo.minRating = Math.min(courseInfo.minRating, user.rating);
        courseInfo.maxRating = Math.max(courseInfo.maxRating, user.rating);
        
        // Set cluster rating
        courseInfo.clusters[user.cluster] = user.rating;

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
        const recommendations = await getAllRecommendationsForUser(userId, primaryCourse.courseId);
        primaryCourse.recommendations = Object.values(recommendations).flat();
      }

      // Fill missing clusters with null
      for (const course of Object.values(courseData)) {
        const clusters: Clusters = {};
        for (const cluster of CLUSTER_NAMES) {
          clusters[cluster] = course.clusters[cluster] || null;
        }
        course.clusters = clusters;
      }

      const userData: IUserData = {
        id: userId,
        name: users[0]?.name || "Undefined name",
        shortName: users[0]?.shortName || "Undefined short name",
        rating: Math.round(Object.values(courseData).reduce((sum, course) => {
          const validRatings = Object.values(course.clusters).filter(r => r !== null) as number[];
          return sum + (validRatings.length ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length : 1500);
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
  
  .get('/list', async () => {
    try {
      // Get all users with their course ratings
      const users = await db.user.findMany({
        include: {
          quizzes: {
            include: { question: true }
          }
        }
      });

      // Group by student ID
      const userMap: Record<string, any> = {};
      
      for (const user of users) {
        if (!userMap[user.studentId]) {
          userMap[user.studentId] = {
            id: user.studentId,
            name: user.name,
            shortName: user.shortName,
            courses: {}
          };
        }

        // Get course name
        const course = await db.course.findUnique({
          where: { id: user.courseId }
        });

        userMap[user.studentId].courses[user.courseId] = {
          courseId: user.courseId,
          courseName: course?.name || `Course ${user.courseId}`,
          rating: Math.round(user.rating)
        };
      }

      const usersList: IUsersListData[] = Object.values(userMap).map((user: any) => ({
        id: user.id,
        name: user.name,
        shortName: user.shortName,
        course: Object.values(user.courses)
      }));

      return usersList;
    } catch (error) {
      console.error('Error getting users list:', error);
      return { error: 'Internal server error' };
    }
  });
