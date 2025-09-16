import { db } from '../db.js';
import { CLUSTER_NAMES, type ClusterType, type Recommendations } from '../types.js';
import { env } from '../env.js';

/**
 * Get problem recommendations for a user in a specific course and cluster
 */
export async function getRecommendationsForUser(
  studentId: string,
  courseId: string,
  cluster: ClusterType,
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

  // Find unsolved problems with types that match the cluster
  // Use the first type that matches or contains the cluster name
  const unsolvedQuestions = await db.question.findMany({
    where: {
      courseId,
      quizId: {
        notIn: solvedQuizIds
      },
      types: {
        hasSome: [cluster] // Check if cluster is in the types array
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
    quizName: question.quizName,
    cluster: cluster,
    rating: Math.round(question.rating),
    canvasUrl: `${env.CANVAS_BASE_URL}/courses/${courseId}/quizzes/${question.quizId}`
  }));
}

/**
 * Get balanced recommendations across multiple clusters for a user
 * Returns 3-5 total recommendations with good variety from ALL clusters
 */
export async function getBalancedRecommendationsForUser(
  studentId: string,
  courseId: string,
  totalCount: number = 4
): Promise<Recommendations[]> {
  // Get user's ratings across all clusters
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

  // Get solved quiz IDs across all clusters
  const solvedQuizIds = users.flatMap((user: any) => 
    user.quizzes.map((q: any) => q.question.quizId)
  );

  // Get user ratings by cluster (default to 1500 for new clusters)
  const userRatingsByCluster: Record<string, number> = {};
  // Since users don't have cluster field, we'll use a single rating for all clusters
  const userRating = users.length > 0 ? users[0]!.rating : 1500;
  for (const cluster of CLUSTER_NAMES) {
    userRatingsByCluster[cluster] = userRating;
  }

  const allRecommendations: (Recommendations & { priority: number })[] = [];

  // Get recommendations from ALL clusters (not just where user has participated)
  for (const cluster of CLUSTER_NAMES) {
    const userRating = userRatingsByCluster[cluster] || 1500; // Default rating for new clusters

    // Find unsolved problems with types that match the cluster
    const unsolvedQuestions = await db.question.findMany({
      where: {
        courseId,
        types: {
          hasSome: [cluster]
        },
        quizId: {
          notIn: solvedQuizIds
        }
      },
      take: 10 // Get more for better selection
    });

    // Prioritize problems based on rating difference
    for (const question of unsolvedQuestions) {
      // For clusters user hasn't tried, recommend easier problems (user rating - 50)
      // For clusters user has tried, recommend slightly harder problems (user rating + 50)
      const hasParticipated = userRatingsByCluster[cluster] !== undefined;
      const targetRating = hasParticipated ? userRating + 50 : userRating - 50;
      const ratingDiff = Math.abs(question.rating - targetRating);
      
      // Give bonus priority to new clusters to encourage exploration
      const explorationBonus = hasParticipated ? 0 : 100;
      const priority = 1000 - ratingDiff + explorationBonus;

      allRecommendations.push({
        quizId: question.quizId,
        quizName: question.quizName,
        cluster: cluster as ClusterType,
        rating: Math.round(question.rating),
        canvasUrl: `${env.CANVAS_BASE_URL}/courses/${courseId}/quizzes/${question.quizId}`,
        priority
      });
    }
  }

  // Sort by priority and take diverse recommendations
  const sortedRecs = allRecommendations.sort((a, b) => b.priority - a.priority);
  const finalRecommendations: Recommendations[] = [];
  const usedClusters = new Set<string>();

  // First pass: get one from each cluster (prioritizing new clusters)
  for (const rec of sortedRecs) {
    if (!usedClusters.has(rec.cluster) && finalRecommendations.length < totalCount) {
      finalRecommendations.push({
        quizId: rec.quizId,
        quizName: rec.quizName,
        cluster: rec.cluster,
        rating: rec.rating,
        canvasUrl: rec.canvasUrl
      });
      usedClusters.add(rec.cluster);
    }
  }

  // Second pass: fill remaining slots with best recommendations
  for (const rec of sortedRecs) {
    if (finalRecommendations.length >= totalCount) break;
    
    const alreadyIncluded = finalRecommendations.some(r => r.quizId === rec.quizId);
    if (!alreadyIncluded) {
      finalRecommendations.push({
        quizId: rec.quizId,
        quizName: rec.quizName,
        cluster: rec.cluster,
        rating: rec.rating,
        canvasUrl: rec.canvasUrl
      });
    }
  }

  return finalRecommendations;
}
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
