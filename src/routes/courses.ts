import { Elysia } from 'elysia';
import { db } from '../db.js';

export const courseRoutes = new Elysia({ prefix: '/api/courses' })
  .get('/', async () => {
    try {
      const courses = await db.course.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      });

      return courses;
    } catch (error) {
      console.error('Error getting courses:', error);
      return { error: 'Internal server error' };
    }
  });
