import { Elysia } from 'elysia';
import { db } from '../db.js';
import { fetchAllCourses } from '../utils/canvas.js';
import { env } from '../env.js';

export const courseRoutes = new Elysia({ prefix: '/api/courses' })
  .get('/', async () => {
    try {
      // Fetch all courses from Canvas and ensure they exist in database
      const canvasCourses = await fetchAllCourses();
      
      for (const course of canvasCourses) {
        await db.course.upsert({
          where: { id: course.id },
          create: {
            id: course.id,
            name: course.name,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          update: {
            name: course.name,
            updatedAt: new Date()
          }
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

      // Add canvasUrl to each course
      const coursesWithUrl = courses.map(course => ({
        id: course.id,
        name: course.name,
        canvasUrl: `${env.CANVAS_BASE_URL}/courses/${course.id}`
      }));

      return coursesWithUrl;
    } catch (error) {
      console.error('Error getting courses:', error);
      return { error: 'Internal server error' };
    }
  });
