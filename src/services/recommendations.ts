import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and, notInArray, asc } from "drizzle-orm";
import { type Recommendations } from "../types.js";
import { env } from "../env.js";

/**
 * Get problem recommendations for a user in a specific course
 * Simplified version without cluster logic
 */
export async function getRecommendationsForUser(
  studentId: string,
  courseId: string,
  count: number = 3,
): Promise<Recommendations[]> {
  // Get user's current rating in this course with solved quizzes
  const user = await db.query.users.findFirst({
    where: and(
      eq(schema.users.studentId, studentId),
      eq(schema.users.courseId, courseId),
    ),
    with: {
      quizzes: {
        with: {
          question: true,
        },
      },
    },
  });

  const userRating = user?.rating || 1500;
  const solvedQuizIds =
    user?.quizzes.map((q) => q.question.quizId) || [];

  // Find unsolved problems
  const whereConditions = [eq(schema.questions.courseId, courseId)];
  if (solvedQuizIds.length > 0) {
    whereConditions.push(notInArray(schema.questions.quizId, solvedQuizIds));
  }

  const unsolvedQuestions = await db.query.questions.findMany({
    where: and(...whereConditions),
    orderBy: [asc(schema.questions.rating)],
    limit: count * 3, // Get more than needed for better filtering
  });

  if (!unsolvedQuestions.length) {
    return [];
  }

  // Sort by rating proximity to user's rating + 100 (prefer slightly harder problems)
  const targetRating = userRating + 100;
  const sortedQuestions = unsolvedQuestions
    .map((question) => ({
      question,
      ratingDiff: Math.abs(question.rating - targetRating),
    }))
    .sort((a, b) => a.ratingDiff - b.ratingDiff)
    .slice(0, count);

  return sortedQuestions.map(({ question }) => ({
    quizId: question.quizId,
    quizName: question.lesson || question.quizName, // Use lesson (clean name) or fallback to quizName
    rating: Math.round(question.rating),
    canvasUrl: `${env.CANVAS_BASE_URL}/courses/${courseId}/quizzes/${question.quizId}`,
  }));
}

/**
 * Get balanced recommendations for a user
 * Simplified version that just gets the best unsolved problems
 */
export async function getBalancedRecommendationsForUser(
  studentId: string,
  courseId: string,
  totalCount: number = 4,
): Promise<Recommendations[]> {
  // Get user's solved quiz IDs
  const users = await db.query.users.findMany({
    where: and(
      eq(schema.users.studentId, studentId),
      eq(schema.users.courseId, courseId),
    ),
    with: {
      quizzes: {
        with: {
          question: true,
        },
      },
    },
  });

  const solvedQuizIds = users.flatMap((u) =>
    u.quizzes.map((q) => q.question.quizId),
  );

  // Get user's rating
  const userRating = users.length > 0 && users[0] ? users[0].rating : 1500;

  // Find unsolved problems
  const whereConditions = [eq(schema.questions.courseId, courseId)];
  if (solvedQuizIds.length > 0) {
    whereConditions.push(notInArray(schema.questions.quizId, solvedQuizIds));
  }

  const unsolvedQuestions = await db.query.questions.findMany({
    where: and(...whereConditions),
    limit: totalCount * 2,
  });

  if (!unsolvedQuestions.length) {
    return [];
  }

  // Sort by rating proximity to user's rating + 100 (prefer slightly harder problems)
  const targetRating = userRating + 100;
  const sortedQuestions = unsolvedQuestions
    .map((question) => ({
      question,
      ratingDiff: Math.abs(question.rating - targetRating),
    }))
    .sort((a, b) => a.ratingDiff - b.ratingDiff)
    .slice(0, totalCount);

  return sortedQuestions.map(({ question }) => ({
    quizId: question.quizId,
    quizName: question.lesson || question.quizName, // Use lesson (clean name) or fallback to quizName
    rating: Math.round(question.rating),
    canvasUrl: `${env.CANVAS_BASE_URL}/courses/${courseId}/quizzes/${question.quizId}`,
  }));
}
