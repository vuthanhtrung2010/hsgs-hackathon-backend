import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  fetchAllQuizzes,
  fetchAllUpdatedSubmissions,
  fetchUserProfile,
  fetchAllCourses,
  fetchAllUsersFromCourse,
  fetchSubmissionAttempt,
  countAssignments,
} from "../utils/canvas.js";
import { parseQuiz, type ParsedQuiz } from "../utils/parseQuiz.js";
import { updateRatings } from "../utils/elo.js";
import { env } from "../env.js";
import type { CanvasSubmission } from "../types.js";

const CONCURRENCY_LIMIT = 5; // Maximum concurrent operations

// Cache to avoid multiple API calls for the same user
const userProfileCache = new Map<string, any>();

/**
 * Helper function to update topic ratings for a user based on quiz submission
 */
async function updateTopicRatings(
  userId: number,
  studentId: string,
  courseId: string,
  topics: string[],
  accuracy: number,
): Promise<void> {
  if (!topics || topics.length === 0) return;

  try {
    // Calculate rating change based on accuracy
    // Higher accuracy = higher rating, lower accuracy = lower rating
    const baseRatingChange = Math.round((accuracy - 0.5) * 100); // Simple linear model

    console.log(
      `📊 Updating ${topics.length} topics for user ${studentId} with change ${baseRatingChange > 0 ? "+" : ""}${baseRatingChange}`,
    );

    const now = new Date();
    // Update each topic rating with native PostgreSQL batch upsert
    const topicRecords = topics.map((topic) => ({
      topic,
      userId,
      courseId,
      rating: 1500 + baseRatingChange,
      submissionCount: 1,
      createdAt: now,
      updatedAt: now,
    }));

    await db
      .insert(schema.topicRatings)
      .values(topicRecords)
      .onConflictDoUpdate({
        target: [
          schema.topicRatings.topic,
          schema.topicRatings.userId,
          schema.topicRatings.courseId,
        ],
        set: {
          rating: sql`${schema.topicRatings.rating} + ${baseRatingChange}`,
          submissionCount: sql`${schema.topicRatings.submissionCount} + 1`,
          updatedAt: now,
        },
      });
  } catch (error) {
    console.error(`Error updating topic ratings for user ${studentId}:`, error);
  }
}

// Function to sync course information - OPTIMIZED with native upsert
async function syncCourseInfo(courseId: string) {
  try {
    // Fetch course info from Canvas API
    const url = new URL(`/api/v1/courses/${courseId}`, env.CANVAS_BASE_URL);
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${env.CANVAS_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.log(`Failed to fetch course ${courseId} from Canvas`);
      return;
    }

    const courseData = (await response.json()) as { name?: string; id: string };

    // Fetch assignment count for the course
    console.log(`📊 Fetching assignment count for course ${courseId}...`);
    let assignmentCount = 0;
    try {
      assignmentCount = await countAssignments(courseId);
      console.log(
        `✅ Found ${assignmentCount} published assignments in course ${courseId}`,
      );
    } catch (error) {
      console.warn(
        `⚠️  Failed to fetch assignment count for course ${courseId}:`,
        error,
      );
    }

    const now = new Date();
    const courseName = courseData.name || `Course ${courseId}`;

    await db
      .insert(schema.courses)
      .values({
        id: courseId,
        name: courseName,
        assignmentCount,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.courses.id,
        set: {
          name: courseName,
          assignmentCount,
          updatedAt: now,
        },
      });

    console.log(
      `Synced course ${courseId}: ${courseName} (${assignmentCount} assignments)`,
    );
  } catch (error) {
    console.error(`Error syncing course ${courseId}:`, error);
  }
}

/**
 * Sync users from course enrollments - SUPER OPTIMIZED with chunked native bulk upsert
 */
async function syncCourseUsers(courseId: string): Promise<void> {
  console.log(`Starting user sync for course ${courseId}`);

  try {
    // Fetch all users from Canvas course
    const canvasUsers = await fetchAllUsersFromCourse(courseId);
    console.log(`Found ${canvasUsers.length} users in course ${courseId}`);

    if (canvasUsers.length === 0) {
      console.log(`No users found for course ${courseId}`);
      return;
    }

    // Process in smaller chunks to avoid query parameter limits and improve performance
    const CHUNK_SIZE = 100;
    let totalAffected = 0;

    console.log(
      `📊 Processing ${canvasUsers.length} users in chunks of ${CHUNK_SIZE}...`,
    );

    for (let i = 0; i < canvasUsers.length; i += CHUNK_SIZE) {
      const chunk = canvasUsers.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(canvasUsers.length / CHUNK_SIZE);

      console.log(
        `⏳ Processing user chunk ${chunkNum}/${totalChunks} (${chunk.length} users)...`,
      );

      const startTime = Date.now();
      const now = new Date();

      try {
        const userValues = chunk.map((u) => ({
          studentId: u.id.toString(),
          courseId: courseId,
          name: u.name,
          shortName: u.short_name,
          rating: 1500,
          createdAt: now,
          updatedAt: now,
        }));

        await db
          .insert(schema.users)
          .values(userValues)
          .onConflictDoUpdate({
            target: [schema.users.studentId, schema.users.courseId],
            set: {
              name: sql`excluded."name"`,
              shortName: sql`excluded."shortName"`,
              updatedAt: now,
            },
          });

        totalAffected += chunk.length;
        const duration = Date.now() - startTime;
        console.log(
          `✅ Chunk ${chunkNum}/${totalChunks} completed in ${duration}ms`,
        );
      } catch (error) {
        const duration = Date.now() - startTime;
        console.warn(
          `❌ Error processing user chunk ${chunkNum}/${totalChunks} after ${duration}ms:`,
          error,
        );
      }
    }

    console.log(
      `Bulk upserted ${canvasUsers.length} users for course ${courseId} (${totalAffected} affected rows)`,
    );
    console.log(`User sync completed for course ${courseId}`);
  } catch (error) {
    console.error(`Error syncing users for course ${courseId}:`, error);
    throw error;
  }
}

/**
 * Get user profile with caching
 */
async function getCachedUserProfile(
  studentId: string,
): Promise<{ name: string; short_name: string }> {
  if (userProfileCache.has(studentId)) {
    return userProfileCache.get(studentId)!;
  }

  const profile = await fetchUserProfile(studentId);
  userProfileCache.set(studentId, profile);
  return profile;
}

/**
 * Bulk upsert questions for better performance with native PostgreSQL onConflictDoUpdate
 */
async function bulkUpsertQuestions(
  quizzes: any[],
  courseId: string,
): Promise<void> {
  const questionsToUpsert = quizzes
    .map((quiz) => {
      const parsedQuiz = parseQuiz(quiz.title);
      if (!parsedQuiz) return null;

      return {
        quizId: quiz.id.toString(),
        quizName: quiz.title,
        courseId,
        types: parsedQuiz.types,
        lesson: parsedQuiz.lesson || null,
        difficulty: parsedQuiz.difficulty ? parseFloat(parsedQuiz.difficulty) : null,
        class: parsedQuiz.class || null,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (questionsToUpsert.length === 0) {
    console.log("No valid questions to upsert");
    return;
  }

  const CHUNK_SIZE = 50;
  let totalAffected = 0;

  console.log(
    `📊 Processing ${questionsToUpsert.length} questions in chunks of ${CHUNK_SIZE}...`,
  );

  for (let i = 0; i < questionsToUpsert.length; i += CHUNK_SIZE) {
    const chunk = questionsToUpsert.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(questionsToUpsert.length / CHUNK_SIZE);

    console.log(
      `⏳ Processing questions chunk ${chunkNum}/${totalChunks} (${chunk.length} questions)...`,
    );

    const startTime = Date.now();
    const now = new Date();

    try {
      const questionValues = chunk.map((q) => ({
        quizId: q.quizId,
        courseId: q.courseId,
        quizName: q.quizName,
        types: q.types,
        lesson: q.lesson,
        difficulty: q.difficulty,
        class: q.class,
        rating: 1500,
        submissionCount: 0,
        createdAt: now,
        updatedAt: now,
      }));

      await db
        .insert(schema.questions)
        .values(questionValues)
        .onConflictDoUpdate({
          target: [schema.questions.quizId, schema.questions.courseId],
          set: {
            quizName: sql`excluded."quizName"`,
            types: sql`excluded."types"`,
            lesson: sql`excluded."lesson"`,
            difficulty: sql`excluded."difficulty"`,
            class: sql`excluded."class"`,
            updatedAt: now,
          },
        });

      totalAffected += chunk.length;
      const duration = Date.now() - startTime;
      console.log(
        `✅ Questions chunk ${chunkNum}/${totalChunks} completed in ${duration}ms`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn(
        `❌ Error processing questions chunk ${chunkNum}/${totalChunks} after ${duration}ms:`,
        error,
      );
    }
  }

  console.log(
    `Bulk upserted ${questionsToUpsert.length} questions for course ${courseId} (${totalAffected} records)`,
  );
}

/**
 * Process submissions in bulk for better performance with Drizzle transactions
 */
async function processBulkSubmissions(
  submissions: CanvasSubmission[],
  quiz: any,
  parsedQuiz: ParsedQuiz,
  courseId: string,
): Promise<void> {
  const validSubmissions: CanvasSubmission[] = [];

  for (const submission of submissions) {
    if (
      !submission.finished_at ||
      submission.workflow_state !== "complete" ||
      submission.score == null ||
      submission.quiz_points_possible == null
    ) {
      continue;
    }

    if (submission.attempt === 1) {
      validSubmissions.push(submission);
    } else {
      console.log(
        `📝 Fetching attempt 1 data for submission ${submission.id} (attempt ${submission.attempt})`,
      );
      const attempt1Data = await fetchSubmissionAttempt(
        courseId,
        quiz.id.toString(),
        submission.id.toString(),
        1,
      );

      if (attempt1Data) {
        console.log(
          `✅ Found attempt 1 data for submission ${submission.id}: score ${attempt1Data.score}/${attempt1Data.quiz_points_possible}`,
        );
        validSubmissions.push(attempt1Data);
      } else {
        console.warn(
          `❌ Could not fetch attempt 1 data for submission ${submission.id}, skipping`,
        );
      }
    }
  }

  const filteredOut = submissions.length - validSubmissions.length;
  if (filteredOut > 0) {
    console.log(
      `🔍 Filtered out ${filteredOut} submissions (${validSubmissions.length} valid, ${submissions.length} total)`,
    );
  }

  if (validSubmissions.length === 0) {
    console.log("No valid submissions to process");
    return;
  }

  validSubmissions.sort((a, b) => {
    const timeA = new Date(a.finished_at!).getTime();
    const timeB = new Date(b.finished_at!).getTime();
    return timeA - timeB;
  });

  console.log(
    `📅 Sorted ${validSubmissions.length} submissions by completion time (earliest first)`,
  );
  console.log(`   First submission: ${validSubmissions[0]?.finished_at}`);
  console.log(
    `   Last submission: ${validSubmissions[validSubmissions.length - 1]?.finished_at}`,
  );

  const studentIds = validSubmissions.map((s) => s.user_id.toString());
  const quizId = quiz.id.toString();

  const [dbUsers, question] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        studentId: schema.users.studentId,
        rating: schema.users.rating,
        problemsSolved: sql<number>`count(${schema.quizzes.id})`,
      })
      .from(schema.users)
      .leftJoin(schema.quizzes, eq(schema.users.id, schema.quizzes.userId))
      .where(
        and(
          inArray(schema.users.studentId, studentIds),
          eq(schema.users.courseId, courseId),
        ),
      )
      .groupBy(schema.users.id, schema.users.studentId, schema.users.rating),
    db.query.questions.findFirst({
      where: and(
        eq(schema.questions.quizId, quizId),
        eq(schema.questions.courseId, courseId),
      ),
    }),
  ]);

  if (!question) {
    console.error(
      `Question not found for quiz ${quizId} in course ${courseId}`,
    );
    return;
  }

  const userMap = new Map(dbUsers.map((u) => [u.studentId, u]));

  const MICRO_BATCH_SIZE = 10;
  let totalRatingChange = 0;
  let totalValidSubmissions = 0;

  console.log(
    `📊 Processing ${validSubmissions.length} submissions in micro-batches of ${MICRO_BATCH_SIZE}...`,
  );

  for (let i = 0; i < validSubmissions.length; i += MICRO_BATCH_SIZE) {
    const microBatch = validSubmissions.slice(i, i + MICRO_BATCH_SIZE);
    const batchNum = Math.floor(i / MICRO_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(validSubmissions.length / MICRO_BATCH_SIZE);

    console.log(
      `⏳ Processing submission micro-batch ${batchNum}/${totalBatches} (${microBatch.length} submissions)...`,
    );

    const startTime = Date.now();

    try {
      const batchResult = await db.transaction(async (tx) => {
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

          const userAccuracy =
            submission.score! / submission.quiz_points_possible!;

          if (userAccuracy === 0) {
            console.log(
              `⚠️  Zero accuracy detected: User ${studentId} scored ${submission.score}/${submission.quiz_points_possible} on quiz ${quizId}`,
            );
          }
          if (isNaN(userAccuracy)) {
            console.log(
              `🚨 NaN accuracy detected: User ${studentId} scored ${submission.score}/${submission.quiz_points_possible} on quiz ${quizId}`,
            );
          }

          console.log(
            `📊 User ${studentId} accuracy: ${userAccuracy.toFixed(3)} (${submission.score}/${submission.quiz_points_possible})`,
          );

          const userProblemsSolved = Number(user.problemsSolved);

          const { newUserRating, newQuestionRating, ratingChange } =
            updateRatings(
              user.rating,
              question.rating,
              userAccuracy,
              userProblemsSolved,
              question.submissionCount + batchValidSubmissions,
            );

          if (userAccuracy === 0 || isNaN(userAccuracy)) {
            console.log(
              `📈 Rating change for ${userAccuracy === 0 ? "zero accuracy" : "NaN accuracy"}: User ${user.rating} → ${newUserRating} (${ratingChange > 0 ? "+" : ""}${ratingChange})`,
            );
          }

          await updateTopicRatings(
            user.id,
            studentId,
            courseId,
            parsedQuiz.types,
            userAccuracy,
          );

          quizRecords.push({
            userId: user.id,
            questionId: question.id,
            submissionId: submission.id.toString(),
            score: submission.score!,
            maxScore: submission.quiz_points_possible!,
            submittedAt: new Date(submission.finished_at!),
            ratingChange,
            createdAt: new Date(),
          });

          userUpdates.push({
            id: user.id,
            newRating: newUserRating,
          });

          batchRatingChange += newQuestionRating - question.rating;
          batchValidSubmissions++;

          userMap.set(studentId, { ...user, rating: newUserRating });
        }

        if (quizRecords.length === 0) {
          return { ratingChange: 0, validCount: 0 };
        }

        // Bulk insert quizzes
        await tx.insert(schema.quizzes).values(quizRecords).onConflictDoNothing();

        // Update user ratings
        for (const update of userUpdates) {
          await tx
            .update(schema.users)
            .set({ rating: update.newRating, updatedAt: new Date() })
            .where(eq(schema.users.id, update.id));
        }

        return {
          ratingChange: batchRatingChange,
          validCount: batchValidSubmissions,
        };
      });

      totalRatingChange += batchResult.ratingChange;
      totalValidSubmissions += batchResult.validCount;

      const duration = Date.now() - startTime;
      console.log(
        `✅ Micro-batch ${batchNum}/${totalBatches} completed in ${duration}ms (${batchResult.validCount} submissions)`,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ Error processing micro-batch ${batchNum}/${totalBatches} after ${duration}ms:`,
        error,
      );
    }
  }

  // Update question rating
  if (totalValidSubmissions > 0) {
    try {
      const avgRatingChange = totalRatingChange / totalValidSubmissions;
      await db
        .update(schema.questions)
        .set({
          rating: question.rating + avgRatingChange,
          submissionCount: sql`${schema.questions.submissionCount} + ${totalValidSubmissions}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.questions.id, question.id));

      console.log(`Updated question ${quizId} rating and submission count`);
    } catch (error) {
      console.error(`Error updating question ${quizId}:`, error);
    }
  }
}

async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrencyLimit: number = CONCURRENCY_LIMIT,
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
    // First, sync course information
    await syncCourseInfo(courseId);

    // Then, sync users from enrollments
    await syncCourseUsers(courseId);

    // Get last sync time or use epoch if first sync
    let lastSync = new Date("1970-01-01T00:00:00Z");

    const syncHistoryRecord = await db.query.syncHistory.findFirst({
      where: eq(schema.syncHistory.courseId, courseId),
    });

    if (syncHistoryRecord) {
      lastSync = syncHistoryRecord.lastSync;
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
    const existingSubmissions = await db
      .select({
        studentId: schema.users.studentId,
        quizId: schema.questions.quizId,
      })
      .from(schema.quizzes)
      .innerJoin(schema.users, eq(schema.quizzes.userId, schema.users.id))
      .innerJoin(
        schema.questions,
        eq(schema.quizzes.questionId, schema.questions.id),
      )
      .where(eq(schema.questions.courseId, courseId));

    const existingSubmissionKeys = new Set(
      existingSubmissions.map((sub) => `${sub.studentId}-${sub.quizId}`),
    );

    console.log(
      `Found ${existingSubmissionKeys.size} existing submissions for course ${courseId}`,
    );

    const QUIZ_BATCH_SIZE = 10;
    console.log(
      `📊 Processing ${quizzes.length} quizzes in batches of ${QUIZ_BATCH_SIZE}...`,
    );

    for (let i = 0; i < quizzes.length; i += QUIZ_BATCH_SIZE) {
      const quizBatch = quizzes.slice(i, i + QUIZ_BATCH_SIZE);
      const batchNum = Math.floor(i / QUIZ_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(quizzes.length / QUIZ_BATCH_SIZE);

      console.log(
        `⏳ Processing quiz batch ${batchNum}/${totalBatches} (${quizBatch.length} quizzes)...`,
      );
      const batchStartTime = Date.now();

      await Promise.all(
        quizBatch.map(async (quiz) => {
          const parsedQuiz = parseQuiz(quiz.title);
          if (!parsedQuiz) {
            console.log(`⏭️  Skipping quiz "${quiz.title}" - no cluster found`);
            return;
          }

          console.log(
            `🔍 Processing quiz: ${quiz.title} (Types: [${parsedQuiz.types.join(", ")}])`,
          );

          const submissions = await fetchAllUpdatedSubmissions(
            courseId,
            quiz.id.toString(),
            lastSync,
          );

          if (!submissions.length) {
            console.log(`⏭️  No submissions found for quiz ${quiz.id}`);
            return;
          }

          console.log(
            `📝 Found ${submissions.length} submissions for quiz ${quiz.id}`,
          );

          const newSubmissions = submissions.filter((submission) => {
            const key = `${submission.user_id}-${quiz.id}`;
            return !existingSubmissionKeys.has(key);
          });

          console.log(
            `Processing ${newSubmissions.length} new submissions (${submissions.length - newSubmissions.length} skipped as duplicates)`,
          );

          if (newSubmissions.length > 0) {
            await processBulkSubmissions(
              newSubmissions,
              quiz,
              parsedQuiz,
              courseId,
            );
          }
        }),
      );

      const batchDuration = Date.now() - batchStartTime;
      console.log(
        `✅ Quiz batch ${batchNum}/${totalBatches} completed in ${batchDuration}ms`,
      );
    }

    // Update sync history with atomic upsert
    await db
      .insert(schema.syncHistory)
      .values({
        courseId,
        lastSync: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.syncHistory.courseId,
        set: {
          lastSync: now,
          updatedAt: now,
        },
      });

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
export async function syncAllCourses(): Promise<{
  success: boolean;
  message: string;
}> {
  const startTime = Date.now();

  try {
    console.log("Fetching all courses from Canvas...");

    const courses = await fetchAllCourses();
    console.log(`Found ${courses.length} active courses in Canvas`);

    for (const course of courses) {
      console.log(`Syncing course: ${course.id} - ${course.name}`);
      await syncCourseSubmissions(course.id);
    }

    const duration = Date.now() - startTime;
    console.log(`All courses synced successfully in ${duration}ms`);

    return {
      success: true,
      message: `Synced ${courses.length} courses in ${duration}ms`,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Error syncing courses:", error);

    return {
      success: false,
      message: `Sync failed after ${duration}ms: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
