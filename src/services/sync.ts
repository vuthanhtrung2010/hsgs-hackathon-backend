import { db } from '../db.js';
import { fetchAllQuizzes, fetchAllUpdatedSubmissions, fetchUserProfile } from '../utils/canvas.js';
import { parseCluster } from '../utils/parseCluster.js';
import { updateRatings } from '../utils/elo.js';
import { COURSES_CONFIG } from '../config.js';
import { env } from '../env.js';
import type { CanvasSubmission } from '../types.js';

const CONCURRENCY_LIMIT = 5; // Maximum concurrent operations

// Cache to avoid multiple API calls for the same user
const userProfileCache = new Map<string, any>();

// Function to sync course information
async function syncCourseInfo(courseId: string) {
  try {
    // Fetch course info from Canvas API
    const response = await fetch(`${env.CANVAS_BASE_URL}/api/v1/courses/${courseId}`, {
      headers: {
        'Authorization': `Bearer ${env.CANVAS_ACCESS_TOKEN}`
      }
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch course ${courseId} from Canvas`);
      return;
    }
    
    const courseData = await response.json() as { name?: string; id: string };
    
    // Check if course exists in database
    const existingCourse = await db.course.findUnique({
      where: { id: courseId }
    });
    
    if (existingCourse) {
      // Update if name changed
      if (existingCourse.name !== courseData.name) {
        await db.course.update({
          where: { id: courseId },
          data: { 
            name: courseData.name || `Course ${courseId}`,
            updatedAt: new Date()
          }
        });
        console.log(`Updated course ${courseId} name to: ${courseData.name}`);
      }
    } else {
      // Create new course
      await db.course.create({
        data: {
          id: courseId,
          name: courseData.name || `Course ${courseId}`,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log(`Created new course ${courseId}: ${courseData.name}`);
    }
  } catch (error) {
    console.error(`Error syncing course ${courseId}:`, error);
  }
}

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

  // First, sync course information
  await syncCourseInfo(courseId);

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
    let user = await tx.canvasUser.findUnique({
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
      
      user = await tx.canvasUser.create({
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

    // Check if user has already taken this quiz
    const existingQuiz = user!.quizzes.find((q: any) => q.question.quizId === quizId);
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
    const userProblemsInCluster = user!.quizzes.filter((q: any) => q.question.cluster === cluster).length;
    
    const { newUserRating, newQuestionRating, ratingChange } = updateRatings(
      user!.rating,
      question.rating,
      userScore,
      userProblemsInCluster,
      question.submissionCount
    );

    console.log(`Rating change for user ${studentId}: ${user!.rating} -> ${newUserRating} (${ratingChange >= 0 ? '+' : ''}${ratingChange.toFixed(2)})`);
    console.log(`Rating change for question ${quizId}: ${question.rating} -> ${newQuestionRating}`);

    // Update user rating, question rating, and create quiz record in parallel
    await Promise.all([
      tx.canvasUser.update({
        where: { id: user!.id },
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
          userId: user!.id,
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

/**
 * Sync all configured courses
 */
export async function syncAllCourses(): Promise<{ success: boolean; message: string }> {
  const startTime = Date.now();
  
  try {
    console.log('Starting sync for all configured courses...');
    
    // Sync all courses from config
    for (const courseConfig of COURSES_CONFIG) {
      console.log(`Syncing course: ${courseConfig.id}`);
      await syncCourseSubmissions(courseConfig.id);
    }
    
    const duration = Date.now() - startTime;
    console.log(`All courses synced successfully in ${duration}ms`);
    
    return {
      success: true,
      message: `Synced ${COURSES_CONFIG.length} courses in ${duration}ms`
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error syncing courses:', error);
    
    return {
      success: false,
      message: `Sync failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
