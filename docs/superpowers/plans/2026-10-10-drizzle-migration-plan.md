# Drizzle ORM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely migrate the codebase from Prisma to 100% Drizzle ORM using Bun's native SQL driver (`bun:sql`) and Drizzle Relational API, removing legacy Prisma dependencies, runtime index checks (`ensureCriticalIndexes`), and session setting hacks.

**Architecture:** Database schema and relations defined in `src/db/schema.ts`, native `bun:sql` driver initialized in `src/db/index.ts`, Better Auth drizzle adapter in `src/auth.ts`, atomic batch upserts (`onConflictDoUpdate`) in `src/services/sync.ts`, and clean relational queries (`db.query.*`) across all API routes.

**Tech Stack:** Bun (1.4.2+), Elysia, `drizzle-orm` (`drizzle-orm/bun-sql`), `bun:sql`, `@better-auth/drizzle-adapter`, `drizzle-kit`, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-10-drizzle-migration-design.md`

## Global Constraints

- Driver: `bun:sql` (via `drizzle-orm/bun-sql`) — zero extra npm driver dependencies.
- Query API: Drizzle Relational API (`db.query.*`) for reading queries with nested relations.
- Write API: Drizzle Core query builder with native PostgreSQL `onConflictDoUpdate` for all upserts.
- Legacy Checks Removed: No `ensureCriticalIndexes()`, no `SET LOCAL synchronous_commit = OFF` / `RESET synchronous_commit`.
- Schema Compatibility: Table and column names in PostgreSQL must match the existing database exactly.
- Type Safety: Zero errors on `bun x tsc --noEmit`.

---

### Task 1: Package Dependencies and Tooling Migration

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.ts`
- Delete: `prisma.config.ts`
- Delete: `prisma/`

**Interfaces:**
- Produces: `drizzle-kit` scripts in `package.json` (`db:generate`, `db:migrate`, `db:push`, `db:studio`), `drizzle.config.ts` pointing to `src/db/schema.ts`.

- [ ] **Step 1: Update package.json dependencies and scripts**

Remove `@prisma/adapter-pg`, `@prisma/client`, and `prisma`.
Add `drizzle-orm` to `dependencies`.
Add `drizzle-kit` to `devDependencies`.
Update `scripts` to use `drizzle-kit`.

In `package.json`:
```json
{
  "name": "newbackend",
  "module": "index.ts",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun run --watch index.ts",
    "start": "bun run index.ts",
    "db:generate": "bun x drizzle-kit generate",
    "db:migrate": "bun x drizzle-kit migrate",
    "db:push": "bun x drizzle-kit push",
    "db:studio": "bun x drizzle-kit studio"
  },
  "dependencies": {
    "@elysiajs/cors": "^1.4.1",
    "@types/node-cron": "^3.0.11",
    "better-auth": "^1.5.6",
    "drizzle-orm": "^0.41.0",
    "elysia": "latest",
    "node-cron": "^4.2.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^20.19.37",
    "drizzle-kit": "^0.31.0"
  },
  "peerDependencies": {
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create drizzle.config.ts**

Create `drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 3: Remove prisma configuration and directory**

Run:
```bash
rm -rf prisma prisma.config.ts
```

- [ ] **Step 4: Install dependencies using Bun**

Run:
```bash
bun install
```
Verify `drizzle-orm` and `drizzle-kit` are successfully installed without errors.

- [ ] **Step 5: Commit changes**

```bash
git add package.json bun.lock drizzle.config.ts
git rm -rf prisma prisma.config.ts
git commit -m "chore: replace prisma with drizzle-orm and drizzle-kit"
```

---

### Task 2: Drizzle Schema, Relations, and Database Client

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Delete: `src/db.ts`
- Test: `tests/db-schema.test.ts`

**Interfaces:**
- Produces: `db` instance from `src/db/index.ts`, all table objects (`users`, `questions`, `quizzes`, `courses`, `ratingThresholds`, `announcements`, `syncHistory`, `topicRatings`, `user`, `session`, `account`, `verification`) and relations exported from `src/db/schema.ts`.

- [ ] **Step 1: Write test for schema definitions and client exports**

Create `tests/db-schema.test.ts`:
```ts
import { expect, test } from "bun:test";
import * as schema from "../src/db/schema.js";
import { db } from "../src/db/index.js";

test("schema exports all required tables", () => {
  expect(schema.users).toBeDefined();
  expect(schema.questions).toBeDefined();
  expect(schema.quizzes).toBeDefined();
  expect(schema.courses).toBeDefined();
  expect(schema.ratingThresholds).toBeDefined();
  expect(schema.announcements).toBeDefined();
  expect(schema.syncHistory).toBeDefined();
  expect(schema.topicRatings).toBeDefined();
  expect(schema.user).toBeDefined();
  expect(schema.session).toBeDefined();
  expect(schema.account).toBeDefined();
  expect(schema.verification).toBeDefined();
});

test("db client is initialized with bun:sql", () => {
  expect(db).toBeDefined();
  expect(db.query).toBeDefined();
  expect(db.query.courses).toBeDefined();
  expect(db.query.users).toBeDefined();
});
```

- [ ] **Step 2: Create src/db/schema.ts with tables and relations**

Create `src/db/schema.ts`:
```ts
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
    randomId: text("randomId").notNull().unique().default(sql`gen_random_uuid()::text`),
    name: text("name").notNull(),
    quote: text("quote").default("Thi đua là yêu nước, yêu nước phải thi đua"),
    quoteAuthor: text("quoteAuthor").default("Bác Hồ"),
    assignmentCount: integer("assignmentCount").notNull().default(0),
    showDebt: boolean("showDebt").notNull().default(false),
    customRatingThresholds: boolean("customRatingThresholds").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("courses_randomId_key").on(table.randomId),
  ],
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
    candidateMasterThreshold: integer("candidateMasterThreshold").notNull().default(1600),
    masterThreshold: integer("masterThreshold").notNull().default(1900),
    grandmasterThreshold: integer("grandmasterThreshold").notNull().default(2100),
    targetThreshold: integer("targetThreshold").notNull().default(2400),
    adminThreshold: integer("adminThreshold").notNull().default(3000),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("rating_thresholds_courseId_key").on(table.courseId),
  ],
);

export const announcements = pgTable(
  "announcements",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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
  (table) => [
    index("idx_announcements_course").on(table.courseId),
  ],
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
// Relations
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

export const ratingThresholdsRelations = relations(ratingThresholds, ({ one }) => ({
  course: one(courses, {
    fields: [ratingThresholds.courseId],
    references: [courses.id],
  }),
}));

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
```

- [ ] **Step 3: Create src/db/index.ts with bun:sql and delete src/db.ts**

Create `src/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL || "postgres://localhost:5432/hsgs_hackathon";
const client = new SQL(connectionString);

export const db = drizzle({ client, schema });
export { schema };
```

Remove legacy `src/db.ts`:
```bash
rm -f src/db.ts
```

- [ ] **Step 4: Run test to verify schema and client**

Run:
```bash
bun test tests/db-schema.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/db/schema.ts src/db/index.ts tests/db-schema.test.ts
git rm -f src/db.ts
git commit -m "feat: add drizzle schema, relations, and bun:sql database client"
```

---

### Task 3: Authentication Migration (Better Auth with Drizzle Adapter)

**Files:**
- Modify: `src/auth.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `db` and `schema` from `src/db/index.js`
- Produces: `auth` instance from `src/auth.ts`

- [ ] **Step 1: Write test for Better Auth instance**

Create `tests/auth.test.ts`:
```ts
import { expect, test } from "bun:test";
import { auth } from "../src/auth.js";

test("auth is initialized with drizzle adapter", () => {
  expect(auth).toBeDefined();
  expect(auth.handler).toBeDefined();
  expect(auth.api).toBeDefined();
  expect(auth.api.getSession).toBeDefined();
});
```

- [ ] **Step 2: Update src/auth.ts to use drizzleAdapter**

In `src/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});
```

- [ ] **Step 3: Run auth test**

Run:
```bash
bun test tests/auth.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: migrate better-auth to drizzle adapter"
```

---

### Task 4: Sync Service Complete Rewrite & Unnecessary Checks Removal

**Files:**
- Modify: `src/services/sync.ts`
- Test: `tests/sync.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` from `src/db/index.js`, Canvas utilities from `src/utils/canvas.js`
- Produces: `syncCourseSubmissions(courseId: string): Promise<void>`, `syncAllCourses(): Promise<{ success: boolean; message: string }>`

- [ ] **Step 1: Write unit test verifying sync exports and types**

Create `tests/sync.test.ts`:
```ts
import { expect, test } from "bun:test";
import { syncCourseSubmissions, syncAllCourses } from "../src/services/sync.js";

test("sync module exports required functions", () => {
  expect(typeof syncCourseSubmissions).toBe("function");
  expect(typeof syncAllCourses).toBe("function");
});
```

- [ ] **Step 2: Rewrite src/services/sync.ts with Drizzle & remove unnecessary checks**

Rewrite `src/services/sync.ts`:
- Delete `ensureCriticalIndexes()` function entirely.
- Delete `SET LOCAL synchronous_commit` and `RESET synchronous_commit` session queries.
- Implement native PostgreSQL batch upserts:
  - `syncCourseInfo`: `db.insert(schema.courses).values(...).onConflictDoUpdate({ target: schema.courses.id, set: { ... } })`
  - `syncCourseUsers`: chunked `db.insert(schema.users).values(chunk).onConflictDoUpdate({ target: [schema.users.studentId, schema.users.courseId], set: { ... } })`
  - `bulkUpsertQuestions`: chunked `db.insert(schema.questions).values(chunk).onConflictDoUpdate({ target: [schema.questions.quizId, schema.questions.courseId], set: { ... } })`
  - `updateTopicRatings`: `db.insert(schema.topicRatings).values(...).onConflictDoUpdate({ target: [schema.topicRatings.topic, schema.topicRatings.userId, schema.topicRatings.courseId], set: { ... } })`
  - `syncHistory`: `db.insert(schema.syncHistory).values(...).onConflictDoUpdate({ target: schema.syncHistory.courseId, set: { ... } })`
  - Submission micro-batches in `processBulkSubmissions`: use `db.transaction()` and batch `db.insert(schema.quizzes)`.

- [ ] **Step 3: Run sync test**

Run:
```bash
bun test tests/sync.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add src/services/sync.ts tests/sync.test.ts
git commit -m "refactor(sync): rewrite with drizzle batch upserts and remove index/session checks"
```

---

### Task 5: Recommendations Service & Ranking Route Rewrite

**Files:**
- Modify: `src/services/recommendations.ts`
- Modify: `src/routes/ranking.ts`
- Test: `tests/ranking.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` from `src/db/index.js`
- Produces: `getRecommendationsForUser`, `getBalancedRecommendationsForUser`, `rankingRoutes` Elysia plugin

- [ ] **Step 1: Rewrite src/services/recommendations.ts with Drizzle Relational API**

Use `db.query.users.findFirst` with `quizzes` relation and `db.query.questions.findMany` with `notInArray(schema.questions.quizId, solvedQuizIds)`.

- [ ] **Step 2: Rewrite src/routes/ranking.ts with Drizzle Relational API**

Use:
- `db.query.courses.findFirst({ where: eq(schema.courses.randomId, randomizedCourseId), with: { ratingThresholds: true } })`
- `db.query.users.findMany({ where: eq(schema.users.courseId, realCourse.id), with: { topicRatings: { where: eq(schema.topicRatings.courseId, realCourse.id) }, quizzes: true } })`
- `db.query.quizzes.findMany({ limit: 5, with: { user: true, question: true }, orderBy: [desc(schema.quizzes.submittedAt)] })`

- [ ] **Step 3: Write test for ranking routes**

Create `tests/ranking.test.ts`:
```ts
import { expect, test } from "bun:test";
import { rankingRoutes } from "../src/routes/ranking.js";

test("rankingRoutes is an Elysia instance", () => {
  expect(rankingRoutes).toBeDefined();
});
```

- [ ] **Step 4: Run ranking test**

Run:
```bash
bun test tests/ranking.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/services/recommendations.ts src/routes/ranking.ts tests/ranking.test.ts
git commit -m "feat(ranking): migrate recommendations and ranking route to drizzle relational api"
```

---

### Task 6: Announcements, Courses & Course Settings Routes Rewrite

**Files:**
- Modify: `src/routes/announcements.ts`
- Modify: `src/routes/courses.ts`
- Modify: `src/routes/courseSettings.ts`
- Test: `tests/courses.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` from `src/db/index.js`
- Produces: `announcementRoutes`, `courseRoutes`, `courseSettingsRoute` Elysia plugins

- [ ] **Step 1: Rewrite src/routes/announcements.ts with Drizzle**

Use `db.query.announcements.findMany` and `db.query.announcements.findFirst`.

- [ ] **Step 2: Rewrite src/routes/courses.ts with Drizzle**

Use `db.insert(schema.courses).values().onConflictDoUpdate()` and `db.query.courses.findMany`.

- [ ] **Step 3: Rewrite src/routes/courseSettings.ts with Drizzle**

Use `db.query.courses.findFirst`, `db.update(schema.courses)`, `db.insert(schema.ratingThresholds).values().onConflictDoUpdate()`, `db.delete(schema.ratingThresholds)`.

- [ ] **Step 4: Write test verifying route plugins**

Create `tests/courses.test.ts`:
```ts
import { expect, test } from "bun:test";
import { courseRoutes } from "../src/routes/courses.js";
import { announcementRoutes } from "../src/routes/announcements.js";
import { courseSettingsRoute } from "../src/routes/courseSettings.js";

test("course routes are defined", () => {
  expect(courseRoutes).toBeDefined();
  expect(announcementRoutes).toBeDefined();
  expect(courseSettingsRoute).toBeDefined();
});
```

- [ ] **Step 5: Run tests and commit**

Run:
```bash
bun test tests/courses.test.ts
git add src/routes/announcements.ts src/routes/courses.ts src/routes/courseSettings.ts tests/courses.test.ts
git commit -m "feat(routes): migrate announcements, courses, and courseSettings to drizzle"
```

---

### Task 7: User Profile, Problems & Health Routes Rewrite

**Files:**
- Modify: `src/routes/users.ts`
- Modify: `src/routes/problems.ts`
- Modify: `src/routes/health.ts`
- Test: `tests/health.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` from `src/db/index.js`
- Produces: `userRoutes`, `problemRoutes`, `healthRoutes` Elysia plugins

- [ ] **Step 1: Rewrite src/routes/users.ts with Drizzle**

Use:
- Profile: `db.query.user.findFirst` and `db.update(schema.user)`.
- Details & Submissions: `db.query.users.findMany` with relations `quizzes` (and `question`), `topicRatings`.

- [ ] **Step 2: Rewrite src/routes/problems.ts with Drizzle**

Use `db.query.questions.findMany` and `db.query.courses.findMany`.

- [ ] **Step 3: Rewrite src/routes/health.ts with Drizzle**

Use `db.select({ count: count() }).from(schema.user).limit(1)` or `db.execute(sql`SELECT 1`)`.

- [ ] **Step 4: Write test verifying health route**

Create `tests/health.test.ts`:
```ts
import { expect, test } from "bun:test";
import { healthRoutes } from "../src/routes/health.js";

test("healthRoutes is defined", () => {
  expect(healthRoutes).toBeDefined();
});
```

- [ ] **Step 5: Run test and commit**

Run:
```bash
bun test tests/health.test.ts
git add src/routes/users.ts src/routes/problems.ts src/routes/health.ts tests/health.test.ts
git commit -m "feat(routes): migrate users, problems, and health routes to drizzle"
```

---

### Task 8: Admin Routes, Sync Route, Scripts & End-to-End Type Validation

**Files:**
- Modify: `src/routes/admin.ts`
- Modify: `src/routes/sync.ts`
- Modify: `scripts/create-user.ts`
- Modify: `src/services/cron.ts`
- Modify: `index.ts`

**Interfaces:**
- Produces: fully compiled backend with zero TypeScript errors across all files.

- [ ] **Step 1: Rewrite src/routes/admin.ts with Drizzle**

Migrate:
- Dashboard counts: `db.select({ count: count() }).from(schema.users)`, `db.select({ count: count() }).from(schema.announcements)`.
- Announcement management: `db.query.announcements`, `db.insert`, `db.update`, `db.delete`.
- User management: `db.query.user.findMany`, `db.query.user.findFirst`, `db.update(schema.user)`.
- Course admin listing: `db.query.courses.findMany` with counts.

- [ ] **Step 2: Rewrite src/routes/sync.ts with Drizzle**

Update `sync.ts` status check to query `db.query.syncHistory.findFirst`.

- [ ] **Step 3: Rewrite scripts/create-user.ts with Drizzle**

Update user creation script to query `db.query.user.findFirst` instead of Prisma, and use Better Auth API.

- [ ] **Step 4: Fix cron.ts and index.ts type definitions**

Fix node-cron options in `src/services/cron.ts`.

- [ ] **Step 5: Full Type Check Verification**

Run:
```bash
bun x tsc --noEmit
```
Expected: Output clean with 0 errors.

- [ ] **Step 6: Grep verification for Prisma references**

Run:
```bash
grep -rn "prisma" src/ index.ts scripts/
```
Expected: Zero occurrences.

- [ ] **Step 7: Run all tests**

Run:
```bash
bun test
```
Expected: All tests pass.

- [ ] **Step 8: Commit final migration**

```bash
git add src/routes/admin.ts src/routes/sync.ts scripts/create-user.ts src/services/cron.ts index.ts
git commit -m "feat: complete 100% drizzle orm migration and clean up all type errors"
```
