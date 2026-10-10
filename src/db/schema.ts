import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
  integer,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ==========================================
// Canvas / LMS Domain Tables
// ==========================================

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    studentId: text("studentId").notNull(),
    name: text("name").notNull(),
    shortName: text("shortName").notNull(),
    courseId: text("courseId").notNull(),
    rating: doublePrecision("rating").notNull().default(1500),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("users_studentId_courseId_key").on(table.studentId, table.courseId),
    index("idx_users_student_course").on(table.studentId, table.courseId),
    index("users_courseId_idx").on(table.courseId),
    index("users_studentId_idx").on(table.studentId),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    quizId: text("quizId").notNull(),
    quizName: text("quizName").notNull(),
    courseId: text("courseId").notNull(),
    types: text("types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lesson: text("lesson"),
    difficulty: doublePrecision("difficulty"),
    class: integer("class"),
    rating: doublePrecision("rating").notNull().default(1500),
    submissionCount: integer("submissionCount").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("questions_quizId_courseId_key").on(table.quizId, table.courseId),
    index("idx_questions_course_quiz").on(table.courseId, table.quizId),
    index("questions_courseId_idx").on(table.courseId),
    index("questions_quizId_idx").on(table.quizId),
  ],
);

export const quizzes = pgTable(
  "quizzes",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: integer("questionId")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    submissionId: text("submissionId").notNull().unique(),
    score: doublePrecision("score").notNull(),
    maxScore: doublePrecision("maxScore").notNull(),
    submittedAt: timestamp("submittedAt", { mode: "date" }).notNull(),
    ratingChange: doublePrecision("ratingChange").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("quizzes_userId_questionId_key").on(table.userId, table.questionId),
    index("idx_quizzes_user_question").on(table.userId, table.questionId),
    index("idx_quizzes_userid_include").on(table.userId, table.questionId),
    index("quizzes_userId_idx").on(table.userId),
    index("quizzes_questionId_idx").on(table.questionId),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    randomId: text("randomId")
      .notNull()
      .unique()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    quote: text("quote").default("Thi đua là yêu nước, yêu nước phải thi đua"),
    quoteAuthor: text("quoteAuthor").default("Bác Hồ"),
    assignmentCount: integer("assignmentCount").notNull().default(0),
    showDebt: boolean("showDebt").notNull().default(false),
    customRatingThresholds: boolean("customRatingThresholds")
      .notNull()
      .default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("courses_randomId_key").on(table.randomId)],
);

export const ratingThresholds = pgTable(
  "rating_thresholds",
  {
    id: serial("id").primaryKey(),
    courseId: text("courseId")
      .notNull()
      .unique()
      .references(() => courses.id, { onDelete: "cascade" }),
    newbieThreshold: integer("newbieThreshold").notNull().default(0),
    amateurThreshold: integer("amateurThreshold").notNull().default(1000),
    expertThreshold: integer("expertThreshold").notNull().default(1300),
    candidateMasterThreshold: integer("candidateMasterThreshold")
      .notNull()
      .default(1600),
    masterThreshold: integer("masterThreshold").notNull().default(1900),
    grandmasterThreshold: integer("grandmasterThreshold")
      .notNull()
      .default(2100),
    targetThreshold: integer("targetThreshold").notNull().default(2400),
    adminThreshold: integer("adminThreshold").notNull().default(3000),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("rating_thresholds_courseId_key").on(table.courseId)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    title: text("title").notNull(),
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_announcements_course").on(table.courseId)],
);

export const syncHistory = pgTable(
  "sync_history",
  {
    id: serial("id").primaryKey(),
    courseId: text("courseId").notNull().unique(),
    lastSync: timestamp("lastSync", { mode: "date" }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("sync_history_courseId_key").on(table.courseId),
    index("idx_sync_history_course").on(table.courseId),
  ],
);

export const topicRatings = pgTable(
  "topic_ratings",
  {
    id: serial("id").primaryKey(),
    topic: text("topic").notNull(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("courseId").notNull(),
    rating: doublePrecision("rating").notNull().default(1500),
    submissionCount: integer("submissionCount").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("topic_ratings_topic_userId_courseId_key").on(
      table.topic,
      table.userId,
      table.courseId,
    ),
    index("topic_ratings_userId_idx").on(table.userId),
    index("topic_ratings_courseId_idx").on(table.courseId),
  ],
);

// ==========================================
// Better Auth Tables
// ==========================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ==========================================
// Relations Definitions
// ==========================================

export const usersRelations = relations(users, ({ many }) => ({
  quizzes: many(quizzes),
  topicRatings: many(topicRatings),
}));

export const questionsRelations = relations(questions, ({ many }) => ({
  quizzes: many(quizzes),
}));

export const quizzesRelations = relations(quizzes, ({ one }) => ({
  user: one(users, {
    fields: [quizzes.userId],
    references: [users.id],
  }),
  question: one(questions, {
    fields: [quizzes.questionId],
    references: [questions.id],
  }),
}));

export const coursesRelations = relations(courses, ({ many, one }) => ({
  announcements: many(announcements),
  ratingThresholds: one(ratingThresholds, {
    fields: [courses.id],
    references: [ratingThresholds.courseId],
  }),
}));

export const ratingThresholdsRelations = relations(
  ratingThresholds,
  ({ one }) => ({
    course: one(courses, {
      fields: [ratingThresholds.courseId],
      references: [courses.id],
    }),
  }),
);

export const announcementsRelations = relations(announcements, ({ one }) => ({
  course: one(courses, {
    fields: [announcements.courseId],
    references: [courses.id],
  }),
}));

export const topicRatingsRelations = relations(topicRatings, ({ one }) => ({
  user: one(users, {
    fields: [topicRatings.userId],
    references: [users.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
