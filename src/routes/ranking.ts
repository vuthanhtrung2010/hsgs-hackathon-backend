import { Elysia } from 'elysia';
import { db } from '../db.js';

export const rankingRoutes = new Elysia({ prefix: '/api/ranking' })
  .get('/:courseId', async ({ params: { courseId } }) => {
    try {
      // Get all users for the specified course
      const users = await db.user.findMany({
        where: { courseId },
        select: {
          studentId: true,
          name: true,
          shortName: true,
          rating: true,
          courseId: true
        }
      });

      if (!users.length) {
        return [];
      }

      // Get course information
      const course = await db.course.findUnique({
        where: { id: courseId },
        select: { name: true }
      });

      const courseName = course?.name || `Course ${courseId}`;

      // Group users by studentId and calculate average ratings
      const userMap: Record<string, {
        studentId: string;
        name: string;
        shortName: string;
        ratings: number[];
      }> = {};

      for (const user of users) {
        if (!userMap[user.studentId]) {
          userMap[user.studentId] = {
            studentId: user.studentId,
            name: user.name,
            shortName: user.shortName,
            ratings: []
          };
        }
        userMap[user.studentId]!.ratings.push(user.rating);
      }

      // Calculate average ratings and create ranking
      const ranking = Object.values(userMap).map((userData) => {
        const averageRating = userData.ratings.reduce((sum, rating) => sum + rating, 0) / userData.ratings.length;

        return {
          id: parseInt(userData.studentId), // Canvas user ID as number
          name: userData.name,
          shortName: userData.shortName,
          course: {
            courseId: parseInt(courseId),
            courseName,
            rating: Math.round(averageRating)
          }
        };
      }).sort((a, b) => b.course.rating - a.course.rating);

      return ranking;
    } catch (error) {
      console.error(`Error getting ranking for course ${courseId}:`, error);
      return { error: 'Internal server error' };
    }
  })

  .get('/', async () => {
    try {
      // Default behavior - get ranking for the default course
      const defaultCourseId = process.env.COURSE_ID;
      
      if (!defaultCourseId) {
        return { error: 'No default course ID configured' };
      }

      // Get all users for the default course
      const users = await db.user.findMany({
        where: { courseId: defaultCourseId },
        select: {
          studentId: true,
          name: true,
          shortName: true,
          rating: true,
          courseId: true
        }
      });

      if (!users.length) {
        return [];
      }

      // Get course information
      const course = await db.course.findUnique({
        where: { id: defaultCourseId },
        select: { name: true }
      });

      const courseName = course?.name || `Course ${defaultCourseId}`;

      // Group users by studentId and calculate average ratings
      const userMap: Record<string, {
        studentId: string;
        name: string;
        shortName: string;
        ratings: number[];
      }> = {};

      for (const user of users) {
        if (!userMap[user.studentId]) {
          userMap[user.studentId] = {
            studentId: user.studentId,
            name: user.name,
            shortName: user.shortName,
            ratings: []
          };
        }
        userMap[user.studentId]!.ratings.push(user.rating);
      }

      // Calculate average ratings and create ranking
      const ranking = Object.values(userMap).map((userData) => {
        const averageRating = userData.ratings.reduce((sum, rating) => sum + rating, 0) / userData.ratings.length;

        return {
          id: parseInt(userData.studentId), // Canvas user ID as number
          name: userData.name,
          shortName: userData.shortName,
          course: {
            courseId: parseInt(defaultCourseId),
            courseName,
            rating: Math.round(averageRating)
          }
        };
      }).sort((a, b) => b.course.rating - a.course.rating);

      return ranking;
    } catch (error) {
      console.error('Error getting default ranking:', error);
      return { error: 'Internal server error' };
    }
  });
