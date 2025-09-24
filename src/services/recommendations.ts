import { db } from '../db.js';
import { type Recommendations } from '../types.js';
import { env } from '../env.js';

/**
 * Get problem recommendations for a user in a specific course
 * Simplified version without cluster logic
 */
export async function getRecommendationsForUser(
  studentId: string,
  courseId: string,
  count: number = 3
): Promise<Recommendations[]> {
  // Get user's current rating in this course
  const user = await db.canvasUser.findUnique({
    where: {
      studentId_courseId: {
        studentId,
        courseId
      }
    },
    include: {
      quizzes: {
        include: {
          question: true
        }
      }
    }
  });

  const userRating = user?.rating || 1500;
  const solvedQuizIds = user?.quizzes.map((q: any) => q.question.quizId) || [];

  // Find unsolved problems
  const unsolvedQuestions = await db.question.findMany({
    where: {
      courseId,
      quizId: {
        notIn: solvedQuizIds
      }
    },
    orderBy: {
      rating: 'asc'
    },
    take: count * 3 // Get more than needed for better filtering
  });

  if (!unsolvedQuestions.length) {
    return [];
  }

  // Sort by rating proximity to user's rating + 100 (prefer slightly harder problems)
  const targetRating = userRating + 100;
  const sortedQuestions = unsolvedQuestions
    .map((question: any) => ({
      question,
      ratingDiff: Math.abs(question.rating - targetRating)
    }))
    .sort((a: any, b: any) => a.ratingDiff - b.ratingDiff)
    .slice(0, count);

  return sortedQuestions.map(({ question }: any) => ({
    quizId: question.quizId,
    quizName: question.lesson || question.quizName, // Use lesson (clean name) or fallback to quizName
    rating: Math.round(question.rating),
    canvasUrl: `${env.CANVAS_BASE_URL}/courses/${courseId}/quizzes/${question.quizId}`
  }));
}

/**
 * Get balanced recommendations for a user
 * Simplified version that just gets the best unsolved problems
 */
export async function getBalancedRecommendationsForUser(
  studentId: string,
  courseId: string,
  totalCount: number = 4
): Promise<Recommendations[]> {
  // Get user's solved quiz IDs
  const users = await db.canvasUser.findMany({
    where: {
      studentId,
      courseId
    },
    include: {
      quizzes: {
        include: {
          question: true
        }
      }
    }
  });

  const solvedQuizIds = users.flatMap((user: any) =>
    user.quizzes.map((q: any) => q.question.quizId)
  );

  // Get user's rating
  const userRating = users.length > 0 ? users[0]!.rating : 1500;

  // Find unsolved problems
  const unsolvedQuestions = await db.question.findMany({
    where: {
      courseId,
      quizId: {
        notIn: solvedQuizIds
      }
    },
    take: totalCount * 2 // Get more for better selection
  });

  if (!unsolvedQuestions.length) {
    return [];
  }

  // Sort by rating proximity to user's rating + 100 (prefer slightly harder problems)
  const targetRating = userRating + 100;
  const sortedQuestions = unsolvedQuestions
    .map((question: any) => ({
      question,
      ratingDiff: Math.abs(question.rating - targetRating)
    }))
    .sort((a: any, b: any) => a.ratingDiff - b.ratingDiff)
    .slice(0, totalCount);

  return sortedQuestions.map(({ question }: any) => ({
    quizId: question.quizId,
    quizName: question.lesson || question.quizName, // Use lesson (clean name) or fallback to quizName
    rating: Math.round(question.rating),
    canvasUrl: `${env.CANVAS_BASE_URL}/courses/${courseId}/quizzes/${question.quizId}`
  }));
}
