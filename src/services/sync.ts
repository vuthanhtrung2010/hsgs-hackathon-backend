import { db } from '../db.js';
import { fetchAllQuizzes, fetchAllUpdatedSubmissions, fetchUserProfile } from '../utils/canvas.js';
import { parseCluster } from '../utils/parseCluster.js';
import { updateRatings } from '../utils/elo.js';
import type { CanvasSubmission } from '../types.js';

const CONCURRENCY_LIMIT = 5; // Maximum concurrent operations

// Cache for user profiles to avoid duplicate API calls
const userProfileCache = new Map<string, { name: string; short_name: string }>();

/**
 * Get user profile with caching
 */
async function getCachedUserProfile(studentId: string): Promise<{ name: string; short_name: string }> {
  if (userProfileCache.has(studentId)) {
    return userProfileCache.get(studentId)!;
  }
  
  const profile = await fetchUserProfile(studentId);
  userProfileCache.set(studentId, profile);
  return profile;
}
async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrencyLimit: number = CONCURRENCY_LIMIT
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += concurrencyLimit) {
    const batch = items.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Sync submissions from Canvas for a specific course
 */
export async function syncCourseSubmissions(courseId: string): Promise<void> {
  console.log(`Starting sync for course ${courseId}`);

  // Get last sync time or use epoch if first sync
  let lastSync = new Date('1970-01-01T00:00:00Z');
  
  const syncHistory = await db.syncHistory.findUnique({
    where: { courseId }
  });
  
  if (syncHistory) {
    lastSync = syncHistory.lastSync;
  }

  const now = new Date();
  
  try {
    // Fetch all quizzes for the course
    const quizzes = await fetchAllQuizzes(courseId);
    console.log(`Found ${quizzes.length} quizzes in course ${courseId}`);

    // Process quizzes in parallel batches
    await processWithConcurrency(
      quizzes,
      async (quiz) => {
        const cluster = parseCluster(quiz.title);
        if (!cluster) {
          console.log(`Skipping quiz "${quiz.title}" - no cluster found`);
          return;
        }

        console.log(`Processing quiz: ${quiz.title} (Cluster: ${cluster})`);

        // Fetch updated submissions since last sync
        const submissions = await fetchAllUpdatedSubmissions(courseId, quiz.id.toString(), lastSync);
        
        if (!submissions.length) {
          console.log(`No new submissions for quiz ${quiz.id}`);
          return;
        }

        console.log(`Found ${submissions.length} new submissions for quiz ${quiz.id}`);

        // Process submissions in parallel batches for this quiz
        await processWithConcurrency(
          submissions,
          async (submission) => {
            try {
              await processSubmission(submission, quiz, cluster, courseId);
            } catch (error) {
              console.error(`Error processing submission ${submission.id}:`, error);
              // Continue with other submissions even if one fails
            }
          },
          CONCURRENCY_LIMIT
        );
      },
      CONCURRENCY_LIMIT
    );

    // Update sync history
    await db.syncHistory.upsert({
      where: { courseId },
      update: { lastSync: now },
      create: { courseId, lastSync: now }
    });

    // Clear user profile cache after sync
    userProfileCache.clear();

    console.log(`Sync completed for course ${courseId}`);
  } catch (error) {
    console.error(`Error syncing course ${courseId}:`, error);
    // Clear cache on error too
    userProfileCache.clear();
    throw error;
  }
}

/**
 * Process a single submission
 */
async function processSubmission(
  submission: CanvasSubmission,
  quiz: any,
  cluster: string,
  courseId: string
): Promise<void> {
  // Skip if not finished
  if (!submission.finished_at) {
    console.log(`Skipping submission ${submission.id} - not finished`);
    return;
  }

  // Skip if not complete
  if (submission.workflow_state !== 'complete') {
    console.log(`Skipping submission ${submission.id} - not complete`);
    return;
  }

  // Skip if no score data
  if (submission.score == null || submission.quiz_points_possible == null) {
    console.log(`Skipping submission ${submission.id} - no score data`);
    return;
  }

  const studentId = submission.user_id.toString();
  const quizId = submission.quiz_id.toString();

  console.log(`Processing submission for student ${studentId}, quiz ${quizId}, cluster ${cluster}`);

  // Use transaction for better performance and data consistency
  const result = await db.$transaction(async (tx) => {
    // Find or create user
    let user = await tx.user.findUnique({
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

    if (!user) {
      console.log(`Creating new user ${studentId} for course ${courseId}, cluster ${cluster}`);
      
      // Fetch user profile from Canvas (with caching)
      const profile = await getCachedUserProfile(studentId);
      
      user = await tx.user.create({
        data: {
          studentId,
          courseId,
          cluster,
          name: profile.name,
          shortName: profile.short_name,
          rating: 1500 // Default rating
        },
        include: {
          quizzes: {
            include: {
              question: true
            }
          }
        }
      });
    }

    // Check if user already completed this quiz
    const existingQuiz = user.quizzes.find((q: any) => q.question.quizId === quizId);
    if (existingQuiz) {
      console.log(`User ${studentId} already completed quiz ${quizId}`);
      return null;
    }

    // Find or create question
    let question = await tx.question.findUnique({
      where: {
        quizId_courseId: {
          quizId,
          courseId
        }
      }
    });

    if (!question) {
      console.log(`Creating new question ${quizId} for course ${courseId}`);
      question = await tx.question.create({
        data: {
          quizId,
          quizName: quiz.title,
          courseId,
          cluster,
          rating: 1500, // Default rating
          submissionCount: 0
        }
      });
    }

    // Calculate new ratings
    const userScore = submission.score! / submission.quiz_points_possible!;
    const userProblemsInCluster = user.quizzes.filter((q: any) => q.question.cluster === cluster).length;
    
    const { newUserRating, newQuestionRating, ratingChange } = updateRatings(
      user.rating,
      question.rating,
      userScore,
      userProblemsInCluster,
      question.submissionCount
    );

    console.log(`Rating change for user ${studentId}: ${user.rating} -> ${newUserRating} (${ratingChange >= 0 ? '+' : ''}${ratingChange.toFixed(2)})`);
    console.log(`Rating change for question ${quizId}: ${question.rating} -> ${newQuestionRating}`);

    // Update user rating, question rating, and create quiz record in parallel
    await Promise.all([
      tx.user.update({
        where: { id: user.id },
        data: { rating: newUserRating }
      }),
      tx.question.update({
        where: { id: question.id },
        data: {
          rating: newQuestionRating,
          submissionCount: { increment: 1 }
        }
      }),
      tx.quiz.create({
        data: {
          userId: user.id,
          questionId: question.id,
          score: submission.score!,
          maxScore: submission.quiz_points_possible!,
          submittedAt: new Date(submission.finished_at!),
          ratingChange
        }
      })
    ]);

    return { studentId, quizId, ratingChange };
  });

  if (result) {
    console.log(`Successfully processed submission ${submission.id}`);
  }
}
