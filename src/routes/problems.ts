import { Elysia } from 'elysia';
import { db } from '../db.js';
import { env } from '../env.js';

export const problemRoutes = new Elysia({ prefix: '/api/problems' })
  .get('/', async () => {
    try {
      // Get all questions (problems) with their course information
      const questions = await db.question.findMany({
        include: {
          _count: {
            select: {
              quizzes: true
            }
          }
        },
        orderBy: [
          { courseId: 'asc' },
          { rating: 'desc' }
        ]
      });

      // Get course information for all unique courseIds
      const courseIds = [...new Set(questions.map(q => q.courseId))];
      const courses = await db.course.findMany({
        where: {
          id: {
            in: courseIds
          }
        }
      });
      const courseMap = new Map(courses.map(c => [c.id, c]));

      // Transform the data to match the frontend Problem interface
      const problems = questions.map(question => {
        const course = courseMap.get(question.courseId);
        return {
          problemId: question.quizId,
          name: question.lesson || question.quizName, // Use lesson (clean name) or fallback to quizName
          course: {
            courseId: question.courseId,
            name: course?.name || `Course ${question.courseId}`,
            canvasUrl: `${env.CANVAS_BASE_URL}/courses/${question.courseId}`
          },
          type: question.types, // Return the types array directly
          rating: Math.round(question.rating)
        };
      });

      return problems;
    } catch (error) {
      console.error('Error fetching problems:', error);
      return { error: 'Failed to fetch problems' };
    }
  });
