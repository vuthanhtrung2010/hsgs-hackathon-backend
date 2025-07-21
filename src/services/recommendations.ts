import { db } from '../db.js';
import { CLUSTER_NAMES, type ClusterType, type Recommendations } from '../types.js';

/**
 * Get problem recommendations for a user in a specific course and cluster
 */
export async function getRecommendationsForUser(
  studentId: string,
  courseId: string,
  cluster: ClusterType,
  count: number = 3
): Promise<Recommendations[]> {
  // Get user's current rating in this cluster
  const user = await db.user.findUnique({
    where: {
      studentId_courseId_cluster: {
        studentId,
        courseId,
        cluster
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

  // Find unsolved problems in this cluster with rating close to user's rating
  // Prefer problems slightly above user's rating for growth
  const unsolvedQuestions = await db.question.findMany({
    where: {
      courseId,
      cluster,
      quizId: {
        notIn: solvedQuizIds
      }
    },
    orderBy: {
      // Order by rating difference from user's rating + 100 (slightly harder)
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
    quizName: question.quizName,
    cluster: cluster,
    estimatedDifficulty: Math.round(question.rating)
  }));
}

/**
 * Get recommendations for all clusters for a user
 */
export async function getAllRecommendationsForUser(
  studentId: string,
  courseId: string,
  recommendationsPerCluster: number = 3
): Promise<Record<ClusterType, Recommendations[]>> {
  const recommendations: Record<string, Recommendations[]> = {};

  for (const cluster of CLUSTER_NAMES) {
    try {
      const clusterRecommendations = await getRecommendationsForUser(
        studentId,
        courseId,
        cluster,
        recommendationsPerCluster
      );
      recommendations[cluster] = clusterRecommendations;
    } catch (error) {
      console.warn(`Failed to get recommendations for cluster ${cluster}:`, error);
      recommendations[cluster] = [];
    }
  }

  return recommendations as Record<ClusterType, Recommendations[]>;
}
