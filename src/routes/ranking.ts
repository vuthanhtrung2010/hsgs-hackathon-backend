import { Elysia } from 'elysia';
import { db } from '../db.js';
import { CLUSTER_NAMES, type Clusters } from '../types.js';

export const rankingRoutes = new Elysia({ prefix: '/api/ranking' })
  .get('/:courseId', async ({ params: { courseId } }) => {
    try {
      // Get all users for the specified course
      const users = await db.user.findMany({
        where: { courseId },
        include: {
          quizzes: {
            include: { question: true }
          }
        }
      });

      if (!users.length) {
        return [];
      }

      // Group users by studentId and calculate averages
      const userMap: Record<string, any> = {};

      for (const user of users) {
        if (!userMap[user.studentId]) {
          userMap[user.studentId] = {
            studentId: user.studentId,
            name: user.name,
            shortName: user.shortName,
            ratings: [],
            clusters: {} as Clusters
          };
        }

        userMap[user.studentId].ratings.push(user.rating);
        userMap[user.studentId].clusters[user.cluster] = user.rating;
      }

      // Calculate average ratings and create ranking
      const ranking = Object.values(userMap).map((userData: any) => {
        const validRatings = userData.ratings.filter((r: number) => r > 0);
        const averageRating = validRatings.length > 0 
          ? validRatings.reduce((sum: number, rating: number) => sum + rating, 0) / validRatings.length
          : 1500;

        // Fill missing clusters with null
        const clusters: Clusters = {};
        for (const cluster of CLUSTER_NAMES) {
          clusters[cluster] = userData.clusters[cluster] || null;
        }

        return {
          studentId: userData.studentId,
          name: userData.name,
          shortName: userData.shortName,
          averageRu: Math.round(averageRating),
          clusters
        };
      }).sort((a: any, b: any) => b.averageRu - a.averageRu);

      return ranking;
    } catch (error) {
      console.error(`Error getting ranking for course ${courseId}:`, error);
      return { error: 'Internal server error' };
    }
  })

  .get('/', async () => {
    try {
      // Default behavior - get ranking for the first course or all courses combined
      const defaultCourseId = process.env.COURSE_ID;
      
      if (!defaultCourseId) {
        return { error: 'No default course ID configured' };
      }

      // Redirect to specific course ranking
      const users = await db.user.findMany({
        where: { courseId: defaultCourseId },
        include: {
          quizzes: {
            include: { question: true }
          }
        }
      });

      // ... same logic as above but for default course
      const userMap: Record<string, any> = {};

      for (const user of users) {
        if (!userMap[user.studentId]) {
          userMap[user.studentId] = {
            studentId: user.studentId,
            name: user.name,
            shortName: user.shortName,
            ratings: [],
            clusters: {} as Clusters
          };
        }

        userMap[user.studentId].ratings.push(user.rating);
        userMap[user.studentId].clusters[user.cluster] = user.rating;
      }

      const ranking = Object.values(userMap).map((userData: any) => {
        const validRatings = userData.ratings.filter((r: number) => r > 0);
        const averageRating = validRatings.length > 0 
          ? validRatings.reduce((sum: number, rating: number) => sum + rating, 0) / validRatings.length
          : 1500;

        const clusters: Clusters = {};
        for (const cluster of CLUSTER_NAMES) {
          clusters[cluster] = userData.clusters[cluster] || null;
        }

        return {
          studentId: userData.studentId,
          name: userData.name,
          shortName: userData.shortName,
          averageRu: Math.round(averageRating),
          clusters
        };
      }).sort((a: any, b: any) => b.averageRu - a.averageRu);

      return ranking;
    } catch (error) {
      console.error('Error getting default ranking:', error);
      return { error: 'Internal server error' };
    }
  });
