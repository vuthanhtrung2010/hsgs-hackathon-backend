import { db } from '../db.js';
import { fetchAllQuizzes, fetchAllUpdatedSubmissions, fetchUserProfile, fetchAllCourses, fetchAllUsersFromCourse } from '../utils/canvas.js';
import { parseQuiz, type ParsedQuiz } from '../utils/parseQuiz.js';
import { updateRatings } from '../utils/elo.js';
import { env } from '../env.js';
import type { CanvasSubmission } from '../types.js';

const CONCURRENCY_LIMIT = 5; // Maximum concurrent operations

// Cache to avoid multiple API calls for the same user
const userProfileCache = new Map<string, any>();

/**
 * Ensure critical indexes exist for optimal sync performance
 */
async function ensureCriticalIndexes(): Promise<void> {
  try {
    console.log('Ensuring critical database indexes exist...');
    
    // Critical indexes for sync performance
    const indexes = [
      // Users table - for student/course lookups
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_student_course ON "users"("studentId", "courseId")',
      
      // Quizzes table - for user/question joins
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quizzes_user_question ON "quizzes"("userId", "questionId")',
      
      // Questions table - for course/quiz lookups  
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_course_quiz ON "questions"("courseId", "quizId")',
      
      // Composite index for the submission lookup query
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quizzes_userid_include ON "quizzes"("userId") INCLUDE ("questionId")',
      
      // Sync history lookup
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_history_course ON "sync_history"("courseId")'
    ];
    
    // Execute indexes concurrently for better performance
    await Promise.all(indexes.map(async (indexSQL, i) => {
      try {
        await db.$executeRawUnsafe(indexSQL);
        console.log(`✓ Index ${i + 1}/${indexes.length} created/verified`);
      } catch (error) {
        // Ignore "already exists" errors
        if (error instanceof Error && !error.message.includes('already exists')) {
          console.warn(`Warning creating index: ${error.message}`);
        }
      }
    }));
    
    console.log('✓ All critical indexes verified');
  } catch (error) {
    console.warn('Warning ensuring indexes:', error);
  }
}

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
 * Sync users from course enrollments - SUPER OPTIMIZED with chunked bulk upsert
 */
async function syncCourseUsers(courseId: string): Promise<void> {
  console.log(`Starting user sync for course ${courseId}`);
  
  try {
    // Fetch all users from Canvas course
    const users = await fetchAllUsersFromCourse(courseId);
    console.log(`Found ${users.length} users in course ${courseId}`);

    if (users.length === 0) {
      console.log(`No users found for course ${courseId}`);
      return;
    }

    // Process in smaller chunks to avoid query size limits and improve performance
    const CHUNK_SIZE = 100; // Optimal chunk size for PostgreSQL
    let totalAffected = 0;
    
    console.log(`📊 Processing ${users.length} users in chunks of ${CHUNK_SIZE}...`);
    
    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i/CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(users.length/CHUNK_SIZE);
      
      console.log(`⏳ Processing user chunk ${chunkNum}/${totalChunks} (${chunk.length} users)...`);
      
      const startTime = Date.now();
      
    // Use createMany for better performance and safety
    try {
      const result = await db.canvasUser.createMany({
        data: chunk.map((user) => ({
          studentId: user.id.toString(),
          courseId: courseId,
          name: user.name,
          shortName: user.short_name,
          rating: 1500
        })),
        skipDuplicates: true // Handle conflicts efficiently
      });
      
      totalAffected += result.count;
      
      // Update existing records separately for better performance
      for (const user of chunk) {
        await db.canvasUser.updateMany({
          where: {
            studentId: user.id.toString(),
            courseId: courseId
          },
          data: {
            name: user.name,
            shortName: user.short_name,
            updatedAt: new Date()
          }
        });
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ Chunk ${chunkNum}/${totalChunks} completed in ${duration}ms (${result.count} new users)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn(`❌ Error processing user chunk ${chunkNum}/${totalChunks} after ${duration}ms:`, error);
    }
    }

    console.log(`Bulk upserted ${users.length} users for course ${courseId} (${totalAffected} affected rows)`);
    console.log(`User sync completed for course ${courseId}`);
  } catch (error) {
    console.error(`Error syncing users for course ${courseId}:`, error);
    throw error;
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

/**
 * Bulk upsert questions for better performance - SUPER OPTIMIZED with parameterized queries
 */
async function bulkUpsertQuestions(quizzes: any[], courseId: string): Promise<void> {
  const questionsToUpsert = quizzes
    .map(quiz => {
      const parsedQuiz = parseQuiz(quiz.title);
      if (!parsedQuiz) return null;
      
      return {
        quizId: quiz.id.toString(),
        quizName: quiz.title,
        courseId,
        types: parsedQuiz.types, // Keep as array for PostgreSQL
        lesson: parsedQuiz.lesson || null,
        difficulty: parsedQuiz.difficulty?.toString() || null,
        class: parsedQuiz.class || null,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null); // Type-safe filter

  if (questionsToUpsert.length === 0) {
    console.log('No valid questions to upsert');
    return;
  }

  // Process in chunks for better performance - use parameterized queries
  const CHUNK_SIZE = 50; // Smaller chunks for complex data
  let totalAffected = 0;
  
  console.log(`📊 Processing ${questionsToUpsert.length} questions in chunks of ${CHUNK_SIZE}...`);
  
  for (let i = 0; i < questionsToUpsert.length; i += CHUNK_SIZE) {
    const chunk = questionsToUpsert.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i/CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(questionsToUpsert.length/CHUNK_SIZE);
    
    console.log(`⏳ Processing questions chunk ${chunkNum}/${totalChunks} (${chunk.length} questions)...`);
    
    const startTime = Date.now();
    
    // Use createMany for better performance and safety
    try {
      const result = await db.question.createMany({
        data: chunk.map(q => ({
          quizId: q.quizId,
          courseId: q.courseId,
          quizName: q.quizName,
          types: q.types,
          lesson: q.lesson,
          difficulty: q.difficulty ? parseFloat(q.difficulty) : null,
          class: q.class,
          rating: 1500,
          submissionCount: 0
        })),
        skipDuplicates: true // Handle conflicts efficiently
      });
      
      totalAffected += result.count;
      
      // Update existing records separately for better performance
      for (const q of chunk) {
        await db.question.updateMany({
          where: {
            quizId: q.quizId,
            courseId: q.courseId
          },
          data: {
            quizName: q.quizName,
            types: q.types,
            lesson: q.lesson,
            difficulty: q.difficulty ? parseFloat(q.difficulty) : null,
            class: q.class,
            updatedAt: new Date()
          }
        });
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ Questions chunk ${chunkNum}/${totalChunks} completed in ${duration}ms (${result.count} new questions)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn(`❌ Error processing questions chunk ${chunkNum}/${totalChunks} after ${duration}ms:`, error);
    }
  }

  console.log(`Bulk upserted ${questionsToUpsert.length} questions for course ${courseId} (${totalAffected} new records)`);
}

/**
 * Process submissions in bulk for better performance - OPTIMIZED with smaller transactions
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
  
  // Process submissions in MICRO-BATCHES using smaller transactions to avoid deadlocks
  const MICRO_BATCH_SIZE = 10; // Much smaller batches for faster transactions
  
  let totalRatingChange = 0;
  let totalValidSubmissions = 0;
  
  console.log(`📊 Processing ${validSubmissions.length} submissions in micro-batches of ${MICRO_BATCH_SIZE}...`);
  
  for (let i = 0; i < validSubmissions.length; i += MICRO_BATCH_SIZE) {
    const microBatch = validSubmissions.slice(i, i + MICRO_BATCH_SIZE);
    const batchNum = Math.floor(i/MICRO_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(validSubmissions.length/MICRO_BATCH_SIZE);
    
    console.log(`⏳ Processing submission micro-batch ${batchNum}/${totalBatches} (${microBatch.length} submissions)...`);
    
    const startTime = Date.now();
    
    try {
      const batchResult = await db.$transaction(async (tx) => {
        const quizRecords = [];
        const userUpdates = [];
        let batchRatingChange = 0;
        let batchValidSubmissions = 0;

        for (const submission of microBatch) {
          const studentId = submission.user_id.toString();
          const user = userMap.get(studentId);
          
          if (!user) {
            console.log(`User ${studentId} not found in course ${courseId}`);
            continue;
          }

          const userScore = submission.score! / submission.quiz_points_possible!;
          
          // Get user's problem count (simplified - estimate based on rating)
          const userProblemsSolved = Math.max(0, Math.floor((user.rating - 1500) / 10));
          
          const { newUserRating, newQuestionRating, ratingChange } = updateRatings(
            user.rating,
            question.rating,
            userScore,
            userProblemsSolved,
            question.submissionCount + batchValidSubmissions
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

          batchRatingChange += (newQuestionRating - question.rating);
          batchValidSubmissions++;
          
          // Update user rating in map for next calculations
          userMap.set(studentId, { ...user, rating: newUserRating });
        }

        if (quizRecords.length === 0) {
          return { ratingChange: 0, validCount: 0 };
        }

        // Bulk operations within micro-transaction
        await Promise.all([
          // Create quiz records
          tx.quiz.createMany({
            data: quizRecords
          }),
          
          // Update user ratings using batch update
          ...userUpdates.map(update => 
            tx.canvasUser.update({
              where: { id: update.id },
              data: { rating: update.newRating, updatedAt: new Date() }
            })
          )
        ]);

        return { 
          ratingChange: batchRatingChange, 
          validCount: batchValidSubmissions 
        };
      }, {
        timeout: 10000, // 10 second timeout for micro-transactions
        maxWait: 5000,  // 5 second max wait
      });
      
      totalRatingChange += batchResult.ratingChange;
      totalValidSubmissions += batchResult.validCount;
      
      const duration = Date.now() - startTime;
      console.log(`✅ Micro-batch ${batchNum}/${totalBatches} completed in ${duration}ms (${batchResult.validCount} submissions)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Error processing micro-batch ${batchNum}/${totalBatches} after ${duration}ms:`, error);
      // Continue with next micro-batch instead of failing completely
    }
  }
  
  // Update question rating in separate transaction to avoid holding locks
  if (totalValidSubmissions > 0) {
    try {
      const avgRatingChange = totalRatingChange / totalValidSubmissions;
      await db.question.update({
        where: { id: question.id },
        data: {
          rating: question.rating + avgRatingChange,
          submissionCount: { increment: totalValidSubmissions }
        }
      });
      
      console.log(`Updated question ${quizId} rating and submission count`);
    } catch (error) {
      console.error(`Error updating question ${quizId}:`, error);
    }
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

  try {
    // Ensure critical indexes exist for optimal performance
    await ensureCriticalIndexes();
    
    // Optimize database for bulk operations - only use settings that work at session level
    await db.$executeRawUnsafe('SET LOCAL synchronous_commit = OFF'); // Faster writes (session-level)
    await db.$executeRawUnsafe('SET LOCAL commit_delay = 100000'); // 100ms delay for batching commits

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
    console.log(`📊 Processing ${quizzes.length} quizzes in batches of ${QUIZ_BATCH_SIZE}...`);
    
    for (let i = 0; i < quizzes.length; i += QUIZ_BATCH_SIZE) {
      const quizBatch = quizzes.slice(i, i + QUIZ_BATCH_SIZE);
      const batchNum = Math.floor(i/QUIZ_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(quizzes.length/QUIZ_BATCH_SIZE);
      
      console.log(`⏳ Processing quiz batch ${batchNum}/${totalBatches} (${quizBatch.length} quizzes)...`);
      const batchStartTime = Date.now();
      
      await Promise.all(quizBatch.map(async (quiz) => {
        const parsedQuiz = parseQuiz(quiz.title);
        if (!parsedQuiz) {
          console.log(`⏭️  Skipping quiz "${quiz.title}" - no cluster found`);
          return;
        }

        console.log(`🔍 Processing quiz: ${quiz.title} (Types: [${parsedQuiz.types.join(', ')}])`);

        // Fetch updated submissions since last sync
        const submissions = await fetchAllUpdatedSubmissions(courseId, quiz.id.toString(), lastSync);
        
        if (!submissions.length) {
          console.log(`⏭️  No submissions found for quiz ${quiz.id}`);
          return;
        }

        console.log(`📝 Found ${submissions.length} submissions for quiz ${quiz.id}`);

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
      
      const batchDuration = Date.now() - batchStartTime;
      console.log(`✅ Quiz batch ${batchNum}/${totalBatches} completed in ${batchDuration}ms`);
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
  } finally {
    // Reset database settings to default (LOCAL settings auto-reset at transaction end)
    try {
      await db.$executeRawUnsafe('RESET synchronous_commit');
      await db.$executeRawUnsafe('RESET commit_delay');
    } catch (e) {
      // Ignore reset errors as LOCAL settings auto-reset anyway
      console.debug('Database settings reset (auto-reset at session end)');
    }
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
