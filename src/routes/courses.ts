import { Elysia } from 'elysia';
import { db } from '../db.js';
import { COURSES_CONFIG } from '../config.js';

export const courseRoutes = new Elysia({ prefix: '/api/courses' })
  .get('/', async () => {
    try {
      // Ensure courses from config exist in database
      for (const courseConfig of COURSES_CONFIG) {
        await db.course.upsert({
          where: { id: courseConfig.id },
          create: {
            id: courseConfig.id,
            name: courseConfig.name,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          update: {}
        });
      }

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
