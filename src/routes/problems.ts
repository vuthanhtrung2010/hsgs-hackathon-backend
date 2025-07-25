import { Elysia } from 'elysia';
import { db } from '../db.js';

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

      // Transform the data to match the frontend Problem interface
      const problems = questions.map(question => ({
        problemId: question.quizId,
        name: question.quizName,
        course: {
          courseId: question.courseId,
        },
        type: [
          question.cluster
            ? question.cluster.charAt(0).toUpperCase() + question.cluster.slice(1).toLowerCase()
            : question.cluster
        ], // Map cluster to problem type with first char uppercased
        rating: Math.round(question.rating)
      }));

      return problems;
    } catch (error) {
      console.error('Error fetching problems:', error);
      return { error: 'Failed to fetch problems' };
    }
  });
