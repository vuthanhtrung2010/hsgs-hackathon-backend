import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, desc, inArray, and } from "drizzle-orm";

export type CourseWithThresholds = typeof schema.courses.$inferSelect & {
  ratingThresholds?: typeof schema.ratingThresholds.$inferSelect | null;
};

export interface LeaderboardUserEntry {
  id: number;
  name: string;
  shortName: string;
  course: {
    courseId: number;
    courseName: string;
    rating: number;
    quizzesCompleted: number;
    debt: number;
    quote: string | null;
    quoteAuthor: string | null;
    showDebt: boolean;
    assignmentCount: number;
    customRatingThresholds: boolean;
    ratingThresholds: typeof schema.ratingThresholds.$inferSelect | null;
  };
}

export interface RecentSubmissionEntry {
  id: number;
  submittedAt: Date;
  userName: string;
  userShortName: string;
  userId: number;
  quizName: string | null;
}

export async function calculateCourseRanking(
  realCourse: CourseWithThresholds,
  filterStudentIds?: string[],
): Promise<{
  ranking: LeaderboardUserEntry[];
  recentSubmissions: RecentSubmissionEntry[];
}> {
  if (filterStudentIds && filterStudentIds.length === 0) {
    return { ranking: [], recentSubmissions: [] };
  }

  const userWhereClause = filterStudentIds
    ? and(
        eq(schema.users.courseId, realCourse.id),
        inArray(schema.users.studentId, filterStudentIds),
      )
    : eq(schema.users.courseId, realCourse.id);

  // Get all users for the specified course (optionally filtered by student IDs)
  const users = await db.query.users.findMany({
    where: userWhereClause,
    with: {
      topicRatings: {
        where: eq(schema.topicRatings.courseId, realCourse.id),
      },
      quizzes: {
        with: {
          question: true,
        },
      },
    },
  });

  if (!users.length) {
    return { ranking: [], recentSubmissions: [] };
  }

  const courseName = realCourse.name || `Course ${realCourse.id}`;

  const submissionWhere = filterStudentIds
    ? and(
        eq(schema.questions.courseId, realCourse.id),
        inArray(schema.users.studentId, filterStudentIds),
      )
    : eq(schema.questions.courseId, realCourse.id);

  // Get last 5 recent submissions for the course (optionally filtered by student IDs)
  const recentSubmissions = await db
    .select({
      id: schema.quizzes.id,
      submittedAt: schema.quizzes.submittedAt,
      studentId: schema.users.studentId,
      userName: schema.users.name,
      userShortName: schema.users.shortName,
      quizName: schema.questions.quizName,
      lesson: schema.questions.lesson,
    })
    .from(schema.quizzes)
    .innerJoin(schema.users, eq(schema.quizzes.userId, schema.users.id))
    .innerJoin(
      schema.questions,
      eq(schema.quizzes.questionId, schema.questions.id),
    )
    .where(submissionWhere)
    .orderBy(desc(schema.quizzes.submittedAt))
    .limit(5);

  // Filter quizzes per user to only those belonging to this course
  const usersWithCourseQuizzes = users.map((u) => ({
    ...u,
    courseQuizzes: u.quizzes.filter(
      (q) => q.question.courseId === realCourse.id,
    ),
  }));

  // Calculate max quizzes completed by any user
  const maxQuizzesCompleted = Math.max(
    ...usersWithCourseQuizzes.map((u) => u.courseQuizzes.length),
    0,
  );

  // Check if debt calculation is valid
  const isDebtValid =
    realCourse.showDebt &&
    realCourse.assignmentCount > 0 &&
    maxQuizzesCompleted <= realCourse.assignmentCount;

  // Calculate average rating as weighted average of topic ratings for each user
  const ranking: LeaderboardUserEntry[] = usersWithCourseQuizzes
    .map((user) => {
      let averageRating = 1500; // Default rating

      // Calculate weighted average of topic ratings if available
      if (user.topicRatings.length > 0) {
        let totalRatingSum = 0;
        let totalSubmissions = 0;

        for (const topicRating of user.topicRatings) {
          totalRatingSum +=
            topicRating.rating * topicRating.submissionCount;
          totalSubmissions += topicRating.submissionCount;
        }

        if (totalSubmissions > 0) {
          averageRating = totalRatingSum / totalSubmissions;
        }
      }

      const quizzesCompleted = user.courseQuizzes.length;
      const debt = isDebtValid
        ? Math.max(0, realCourse.assignmentCount - quizzesCompleted)
        : 0;

      return {
        id: parseInt(user.studentId), // Canvas user ID as number
        name: user.name,
        shortName: user.shortName,
        course: {
          courseId: parseInt(realCourse.id || "0"),
          courseName,
          rating: Math.round(averageRating), // Weighted average rating across all topics
          quizzesCompleted, // Number of completed quizzes
          debt, // Number of assignments not completed
          quote: realCourse.quote, // Course quote
          quoteAuthor: realCourse.quoteAuthor,
          showDebt: realCourse.showDebt,
          assignmentCount: realCourse.assignmentCount,
          customRatingThresholds: realCourse.customRatingThresholds || false,
          ratingThresholds: realCourse.customRatingThresholds
            ? realCourse.ratingThresholds || null
            : null,
        },
      };
    })
    .sort((a, b) => b.course.rating - a.course.rating);

  return {
    ranking,
    recentSubmissions: recentSubmissions.map((submission) => ({
      id: submission.id,
      submittedAt: submission.submittedAt,
      userName: submission.userName,
      userShortName: submission.userShortName,
      userId: parseInt(submission.studentId),
      quizName: submission.lesson || submission.quizName,
    })),
  };
}
