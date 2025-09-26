import { db } from '../db.js';
import { fetchAllQuizzes, fetchAllUpdatedSubmissions, fetchUserProfile, fetchAllCourses, fetchCourseEnrollments } from '../utils/canvas.js';
import { parseQuiz, type ParsedQuiz } from '../utils/parseQuiz.js';
import { updateRatings } from '../utils/elo.js';
import { env } from '../env.js';
import type { CanvasSubmission } from '../types.js';

const CONCURRENCY_LIMIT = 5; // Maximum concurrent operations

// Cache to avoid multiple API calls for the same user
const userProfileCache = new Map<string, any>();

// Function to sync course information - OPTIMIZED with upsert
async function syncCourseInfo(courseId: string) {
  try {
    // Fetch course info from Canvas API
    const url = new URL(`/api/v1/courses/${courseId}`, env.CANVAS_BASE_URL);
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${env.CANVAS_ACCESS_TOKEN}`
      }
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch course ${courseId} from Canvas`);
      return;
    }
    
    const courseData = await response.json() as { name?: string; id: string };
    
    // Use upsert for better performance - single DB operation instead of find + update/create
    const course = await db.course.upsert({
      where: { id: courseId },
      update: { 
        name: courseData.name || `Course ${courseId}`,
        updatedAt: new Date()
      },
      create: {
        id: courseId,
        name: courseData.name || `Course ${courseId}`,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    console.log(`Synced course ${courseId}: ${course.name}`);
  } catch (error) {
    console.error(`Error syncing course ${courseId}:`, error);
  }
}

/**
 * Sync users from course enrollments - OPTIMIZED with bulk upsert
 */
async function syncCourseUsers(courseId: string): Promise<void> {
  console.log(`Starting user sync for course ${courseId}`);
  
  try {
    // Fetch student enrollments from Canvas
    const enrollments = await fetchCourseEnrollments(courseId);
    console.log(`Found ${enrollments.length} student enrollments in course ${courseId}`);

    if (enrollments.length === 0) {
      console.log(`No enrollments found for course ${courseId}`);
      return;
    }

    // Use raw SQL for bulk upsert - much faster than individual operations
    const values = enrollments.map(enrollment => 
      `('${enrollment.user_id}', '${courseId}', '${enrollment.user.name.replace(/'/g, "''")}', '${enrollment.user.short_name.replace(/'/g, "''")}', 1500, NOW(), NOW())`
    ).join(',\n');

    const query = `
      INSERT INTO "users" ("studentId", "courseId", "name", "shortName", "rating", "createdAt", "updatedAt")
      VALUES ${values}
      ON CONFLICT ("studentId", "courseId") 
      DO UPDATE SET 
        "name" = EXCLUDED."name",
        "shortName" = EXCLUDED."shortName",
        "updatedAt" = NOW()
      WHERE "users"."name" != EXCLUDED."name" OR "users"."shortName" != EXCLUDED."shortName"
    `;

    const result = await db.$executeRawUnsafe(query);
    console.log(`Bulk upserted ${enrollments.length} users for course ${courseId} (${result} affected rows)`);

    console.log(`User sync completed for course ${courseId}`);
  } catch (error) {
    console.error(`Error syncing users for course ${courseId}:`, error);
    throw error;
  }
}

/**
 * Calculate average cluster rating for a user in a specific course
 */
async function calculateUserAverageClusterRating(userId: number, courseId: string, tx: any): Promise<number> {
  // Get all quizzes for this user in this course
  const userQuizzes = await tx.quiz.findMany({
    where: {
      userId: userId,
      question: {
        courseId: courseId
      }
    },
    include: {
      question: true
    }
  });

  if (userQuizzes.length === 0) {
    return 1500; // Default rating if no quizzes
  }

  // Group question ratings by type
  const typeRatings: Record<string, number[]> = {};
  
  for (const quiz of userQuizzes) {
    const question = quiz.question;
    
    // Process each type for this question
    for (const type of question.types) {
      if (!typeRatings[type]) {
        typeRatings[type] = [];
      }
      // Use the question rating as a measure of skill in this type
      typeRatings[type].push(question.rating);
    }
  }

  // Calculate average rating per type, then average across all types
  const typeAverages: number[] = [];
  for (const [type, ratings] of Object.entries(typeRatings)) {
    if (ratings.length > 0) {
      const typeAverage = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      typeAverages.push(typeAverage);
    }
  }

  if (typeAverages.length === 0) {
    return 1500; // Default if no valid types
  }

  return typeAverages.reduce((sum, avg) => sum + avg, 0) / typeAverages.length;
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

/**
 * Bulk upsert questions for better performance
 */
async function bulkUpsertQuestions(quizzes: any[], courseId: string): Promise<void> {
  const questionsToUpsert = quizzes
    .map(quiz => {
      const parsedQuiz = parseQuiz(quiz.title);
      if (!parsedQuiz) return null;
      
      return {
        quizId: quiz.id.toString(),
        quizName: quiz.title.replace(/'/g, "''"), // Escape single quotes
        courseId,
        types: JSON.stringify(parsedQuiz.types), // Store as JSON string for raw SQL
        lesson: parsedQuiz.lesson?.replace(/'/g, "''") || null,
        difficulty: parsedQuiz.difficulty?.toString() || null,
        class: parsedQuiz.class || null,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null); // Type-safe filter

  if (questionsToUpsert.length === 0) {
    console.log('No valid questions to upsert');
    return;
  }

  // Use raw SQL for bulk upsert
  const values = questionsToUpsert.map(q => 
    `('${q.quizId}', '${courseId}', '${q.quizName}', '${q.types}', ${q.lesson ? `'${q.lesson}'` : 'NULL'}, ${q.difficulty ? `'${q.difficulty}'` : 'NULL'}, ${q.class || 'NULL'}, 1500, 0, NOW(), NOW())`
  ).join(',\n');

  const query = `
    INSERT INTO "questions" ("quizId", "courseId", "quizName", "types", "lesson", "difficulty", "class", "rating", "submissionCount", "createdAt", "updatedAt")
    VALUES ${values}
    ON CONFLICT ("quizId", "courseId") 
    DO UPDATE SET 
      "quizName" = EXCLUDED."quizName",
      "types" = EXCLUDED."types",
      "lesson" = EXCLUDED."lesson",
      "difficulty" = EXCLUDED."difficulty",
      "class" = EXCLUDED."class",
      "updatedAt" = NOW()
    WHERE "questions"."quizName" != EXCLUDED."quizName" OR "questions"."types" != EXCLUDED."types"
  `;

  const result = await db.$executeRawUnsafe(query);
  console.log(`Bulk upserted ${questionsToUpsert.length} questions for course ${courseId} (${result} affected rows)`);
}

/**
 * Process submissions in bulk for better performance
 */
async function processBulkSubmissions(
  submissions: CanvasSubmission[],
  quiz: any,
  parsedQuiz: ParsedQuiz,
  courseId: string
): Promise<void> {
  // Filter valid submissions
  const validSubmissions = submissions.filter(submission => 
    submission.finished_at && 
    submission.workflow_state === 'complete' &&
    submission.score != null && 
    submission.quiz_points_possible != null
  );

  if (validSubmissions.length === 0) {
    console.log('No valid submissions to process');
    return;
  }

  // Get all users and questions in batch
  const studentIds = validSubmissions.map(s => s.user_id.toString());
  const quizId = quiz.id.toString();

  // Get users and question data in parallel
  const [users, question] = await Promise.all([
    db.$queryRawUnsafe<{id: number, studentId: string, rating: number}[]>(`
      SELECT id, "studentId", rating 
      FROM "users" 
      WHERE "studentId" = ANY($1::text[]) AND "courseId" = $2
    `, studentIds, courseId),
    db.question.findUnique({
      where: { quizId_courseId: { quizId, courseId } }
    })
  ]);

  if (!question) {
    console.error(`Question not found for quiz ${quizId} in course ${courseId}`);
    return;
  }

  const userMap = new Map(users.map(u => [u.studentId, u]));
  
  // Process submissions in batches using transactions
  const BATCH_SIZE = 50; // Process 50 submissions at a time
  
  for (let i = 0; i < validSubmissions.length; i += BATCH_SIZE) {
    const batch = validSubmissions.slice(i, i + BATCH_SIZE);
    
    await db.$transaction(async (tx) => {
      const quizRecords = [];
      const userUpdates = [];
      let totalRatingChange = 0;
      let validSubmissionCount = 0;

      for (const submission of batch) {
        const studentId = submission.user_id.toString();
        const user = userMap.get(studentId);
        
        if (!user) {
          console.log(`User ${studentId} not found in course ${courseId}`);
          continue;
        }

        const userScore = submission.score! / submission.quiz_points_possible!;
        
        // Get user's problem count (simplified - we'll estimate based on rating)
        const userProblemsSolved = Math.max(0, Math.floor((user.rating - 1500) / 10)); // Rough estimate
        
        const { newUserRating, newQuestionRating, ratingChange } = updateRatings(
          user.rating,
          question.rating,
          userScore,
          userProblemsSolved,
          question.submissionCount + validSubmissionCount
        );

        quizRecords.push({
          userId: user.id,
          questionId: question.id,
          score: submission.score!,
          maxScore: submission.quiz_points_possible!,
          submittedAt: new Date(submission.finished_at!),
          ratingChange
        });

        userUpdates.push({
          id: user.id,
          newRating: newUserRating
        });

        totalRatingChange += (newQuestionRating - question.rating);
        validSubmissionCount++;
        
        // Update user rating in map for next calculations
        userMap.set(studentId, { ...user, rating: newUserRating });
      }

      if (quizRecords.length === 0) {
        return;
      }

      // Bulk create quiz records
      await tx.quiz.createMany({
        data: quizRecords
      });

      // Bulk update user ratings using raw SQL for better performance
      if (userUpdates.length > 0) {
        const userUpdateValues = userUpdates.map(u => `(${u.id}, ${u.newRating})`).join(',');
        await tx.$executeRawUnsafe(`
          UPDATE "users" 
          SET rating = updates.rating, "updatedAt" = NOW()
          FROM (VALUES ${userUpdateValues}) AS updates(id, rating)
          WHERE "users".id = updates.id
        `);
      }

      // Update question rating and submission count
      const avgRatingChange = totalRatingChange / validSubmissionCount;
      await tx.question.update({
        where: { id: question.id },
        data: {
          rating: question.rating + avgRatingChange,
          submissionCount: { increment: validSubmissionCount }
        }
      });

      console.log(`Processed batch of ${quizRecords.length} submissions for quiz ${quizId}`);
    });
  }
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
export async function syncCourseSubmissions(courseId: string): Promise<void> {
  console.log(`Starting sync for course ${courseId}`);

  // First, sync course information
  await syncCourseInfo(courseId);

  // Then, sync users from enrollments (now bulk optimized)
  await syncCourseUsers(courseId);

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

    if (quizzes.length === 0) {
      console.log(`No quizzes found for course ${courseId}`);
      return;
    }

    // First, bulk create/update all questions for this course
    await bulkUpsertQuestions(quizzes, courseId);

    // Get all existing submissions for this course in one query
    const existingSubmissions = await db.$queryRawUnsafe<{studentId: string, quizId: string}[]>(`
      SELECT DISTINCT u."studentId", q."quizId"
      FROM "quizzes" quiz
      JOIN "users" u ON quiz."userId" = u.id
      JOIN "questions" q ON quiz."questionId" = q.id
      WHERE q."courseId" = $1
    `, courseId);

    const existingSubmissionKeys = new Set(
      existingSubmissions.map(sub => `${sub.studentId}-${sub.quizId}`)
    );

    console.log(`Found ${existingSubmissionKeys.size} existing submissions for course ${courseId}`);

    // Process quizzes in batches for better performance
    const QUIZ_BATCH_SIZE = 10; // Process 10 quizzes at a time
    for (let i = 0; i < quizzes.length; i += QUIZ_BATCH_SIZE) {
      const quizBatch = quizzes.slice(i, i + QUIZ_BATCH_SIZE);
      
      await Promise.all(quizBatch.map(async (quiz) => {
        const parsedQuiz = parseQuiz(quiz.title);
        if (!parsedQuiz) {
          console.log(`Skipping quiz "${quiz.title}" - no cluster found`);
          return;
        }

        console.log(`Processing quiz: ${quiz.title} (Types: [${parsedQuiz.types.join(', ')}])`);

        // Fetch updated submissions since last sync
        const submissions = await fetchAllUpdatedSubmissions(courseId, quiz.id.toString(), lastSync);
        
        if (!submissions.length) {
          return;
        }

        console.log(`Found ${submissions.length} submissions for quiz ${quiz.id}`);

        // Filter out existing submissions
        const newSubmissions = submissions.filter(submission => {
          const key = `${submission.user_id}-${quiz.id}`;
          return !existingSubmissionKeys.has(key);
        });

        console.log(`Processing ${newSubmissions.length} new submissions (${submissions.length - newSubmissions.length} skipped as duplicates)`);

        if (newSubmissions.length > 0) {
          // Process submissions in smaller batches
          await processBulkSubmissions(newSubmissions, quiz, parsedQuiz, courseId);
        }
      }));
    }

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
    userProfileCache.clear();
    throw error;
  }
}

/**
 * Sync all configured courses
 */
export async function syncAllCourses(): Promise<{ success: boolean; message: string }> {
  const startTime = Date.now();
  
  try {
    console.log('Fetching all courses from Canvas...');
    
    // Fetch all active courses from Canvas
    const courses = await fetchAllCourses();
    console.log(`Found ${courses.length} active courses in Canvas`);
    
    // Sync all courses
    for (const course of courses) {
      console.log(`Syncing course: ${course.id} - ${course.name}`);
      await syncCourseSubmissions(course.id);
    }
    
    const duration = Date.now() - startTime;
    console.log(`All courses synced successfully in ${duration}ms`);
    
    return {
      success: true,
      message: `Synced ${courses.length} courses in ${duration}ms`
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
