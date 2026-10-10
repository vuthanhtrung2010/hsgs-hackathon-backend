# Design Document: Migration from Prisma to 100% Drizzle ORM

## Context & Motivation

The application is the HSGS Hackathon backend, built with Bun and Elysia. Currently, the project uses Prisma with `@prisma/adapter-pg`.

### Problems with Prisma
1. **NixOS and Cross-Platform Incompatibility**: Prisma relies on precompiled engine binaries (or generated client artifacts) that dynamically link against glibc in standard paths (`/lib64/ld-linux-x86-64.so.2`). On NixOS and other non-FHS distributions, these binaries fail without patching or nix-specific environment configurations.
2. **Performance Overhead**: Prisma's query translation engine introduces unnecessary latency and memory overhead compared to lightweight, native SQL query builders.
3. **Fragile Runtime Workarounds**: The previous implementation contained runtime hacks such as running `ensureCriticalIndexes()` (which repeatedly executed 5 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` queries on every sync run) and temporary session setting mutations (`SET LOCAL synchronous_commit = OFF`).
4. **Inefficient Batch Operations**: Because Prisma lacked robust bulk upserts, sync operations fell back to `createMany({ skipDuplicates: true })` followed by sequential row-by-row `updateMany()` loops.

### Goals
- Completely remove Prisma dependencies (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `prisma/`, `prisma.config.ts`).
- Migrate to 100% Drizzle ORM using Bun's native SQL driver (`bun:sql`) via `drizzle-orm/bun-sql`.
- Leverage Drizzle's Relational API (`db.query.*`) for querying with nested relations across all routes.
- Replace sequential sync loops with native PostgreSQL batch upserts (`db.insert().values().onConflictDoUpdate()`).
- Remove redundant runtime index checks (`ensureCriticalIndexes`) and session setting overrides.
- Migrate Better Auth to `@better-auth/drizzle-adapter`.
- Ensure clean type checking with zero TypeScript errors.

---

## Architecture & Technology Stack

- **Runtime**: Bun (>= 1.4.2)
- **Framework**: Elysia
- **ORM**: `drizzle-orm`
- **Driver**: `bun:sql` (Bun's native built-in PostgreSQL driver) - zero extra npm driver dependencies, native C/Zig performance, ideal for NixOS
- **Migration & Tooling**: `drizzle-kit`
- **Auth**: `better-auth` with `@better-auth/drizzle-adapter`
- **Database**: PostgreSQL

---

## Database Schema & Models (`src/db/schema.ts`)

All database tables and column names maintain 100% backward compatibility with the existing PostgreSQL database schema.

### 1. Domain Tables
- **`users` (`CanvasUser`)**:
  - `id`: `serial("id").primaryKey()`
  - `studentId`: `text("studentId").notNull()`
  - `name`: `text("name").notNull()`
  - `shortName`: `text("shortName").notNull()`
  - `courseId`: `text("courseId").notNull()`
  - `rating`: `doublePrecision("rating").notNull().default(1500)`
  - `createdAt`: `timestamp("createdAt", { mode: "date" }).notNull().defaultNow()`
  - `updatedAt`: `timestamp("updatedAt", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date())`
  - Constraints/Indexes: unique `(studentId, courseId)`, index on `courseId`, index on `studentId`.

- **`questions` (`Question`)**:
  - `id`: `serial("id").primaryKey()`
  - `quizId`: `text("quizId").notNull()`
  - `quizName`: `text("quizName").notNull()`
  - `courseId`: `text("courseId").notNull()`
  - `types`: `text("types").array().notNull().default(sql`'{}'::text[]`)`
  - `lesson`: `text("lesson")`
  - `difficulty`: `doublePrecision("difficulty")`
  - `class`: `integer("class")`
  - `rating`: `doublePrecision("rating").notNull().default(1500)`
  - `submissionCount`: `integer("submissionCount").notNull().default(0)`
  - `createdAt`: `timestamp("createdAt", { mode: "date" }).notNull().defaultNow()`
  - `updatedAt`: `timestamp("updatedAt", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date())`
  - Constraints/Indexes: unique `(quizId, courseId)`, index on `courseId`, index on `quizId`.

- **`quizzes` (`Quiz`)**:
  - `id`: `serial("id").primaryKey()`
  - `userId`: `integer("userId").notNull().references(() => users.id, { onDelete: "cascade" })`
  - `questionId`: `integer("questionId").notNull().references(() => questions.id, { onDelete: "cascade" })`
  - `submissionId`: `text("submissionId").notNull().unique()`
  - `score`: `doublePrecision("score").notNull()`
  - `maxScore`: `doublePrecision("maxScore").notNull()`
  - `submittedAt`: `timestamp("submittedAt", { mode: "date" }).notNull()`
  - `ratingChange`: `doublePrecision("ratingChange").notNull().default(0)`
  - `createdAt`: `timestamp("createdAt", { mode: "date" }).notNull().defaultNow()`
  - Constraints/Indexes: unique `(userId, questionId)`, index on `userId`, index on `questionId`.

- **`courses` (`Course`)**:
  - `id`: `text("id").primaryKey()`
  - `randomId`: `text("randomId").notNull().unique()`
  - `name`: `text("name").notNull()`
  - `quote`: `text("quote").default("Thi đua là yêu nước, yêu nước phải thi đua")`
  - `quoteAuthor`: `text("quoteAuthor").default("Bác Hồ")`
  - `assignmentCount`: `integer("assignmentCount").notNull().default(0)`
  - `showDebt`: `boolean("showDebt").notNull().default(false)`
  - `customRatingThresholds`: `boolean("customRatingThresholds").notNull().default(false)`
  - `createdAt`: `timestamp("createdAt", { mode: "date" }).notNull().defaultNow()`
  - `updatedAt`: `timestamp("updatedAt", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date())`

- **`rating_thresholds` (`RatingThresholds`)**:
  - `id`: `serial("id").primaryKey()`
  - `courseId`: `text("courseId").notNull().unique().references(() => courses.id, { onDelete: "cascade" })`
  - Threshold integers: `newbieThreshold` (0), `amateurThreshold` (1000), `expertThreshold` (1300), `candidateMasterThreshold` (1600), `masterThreshold` (1900), `grandmasterThreshold` (2100), `targetThreshold` (2400), `adminThreshold` (3000)
  - `createdAt`, `updatedAt`

- **`announcements` (`Announcement`)**:
  - `id`: `text("id").primaryKey()`
  - `title`: `text("title").notNull()`
  - `courseId`: `text("courseId").notNull().references(() => courses.id, { onDelete: "cascade" })`
  - `content`: `text("content").notNull().default("")`
  - `createdAt`, `updatedAt`, index on `courseId`

- **`sync_history` (`SyncHistory`)**:
  - `id`: `serial("id").primaryKey()`
  - `courseId`: `text("courseId").notNull().unique()`
  - `lastSync`: `timestamp("lastSync", { mode: "date" }).notNull()`
  - `createdAt`, `updatedAt`, index on `courseId`

- **`topic_ratings` (`TopicRating`)**:
  - `id`: `serial("id").primaryKey()`
  - `topic`: `text("topic").notNull()`
  - `userId`: `integer("userId").notNull().references(() => users.id, { onDelete: "cascade" })`
  - `courseId`: `text("courseId").notNull()`
  - `rating`: `doublePrecision("rating").notNull().default(1500)`
  - `submissionCount`: `integer("submissionCount").notNull().default(0)`
  - `createdAt`, `updatedAt`
  - Constraints/Indexes: unique `(topic, userId, courseId)`, index on `userId`, index on `courseId`

### 2. Better Auth Tables
- `user`: `id`, `name`, `email` (unique), `emailVerified`, `image`, `createdAt`, `updatedAt`
- `session`: `id`, `expiresAt`, `token` (unique), `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, `userId` (fk `user.id`)
- `account`: `id`, `accountId`, `providerId`, `userId` (fk `user.id`), `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt`
- `verification`: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`

### 3. Relations Definitions
- `usersRelations`: `quizzes` (many), `topicRatings` (many)
- `questionsRelations`: `quizzes` (many)
- `quizzesRelations`: `user` (one), `question` (one)
- `coursesRelations`: `announcements` (many), `ratingThresholds` (one)
- `announcementsRelations`: `course` (one)
- `ratingThresholdsRelations`: `course` (one)
- `topicRatingsRelations`: `user` (one)
- `userRelations`: `accounts` (many), `sessions` (many)
- `sessionRelations`: `user` (one)
- `accountRelations`: `user` (one)

---

## Database Client (`src/db/index.ts`)

```ts
import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema.js";

const client = new SQL(process.env.DATABASE_URL!);

export const db = drizzle({ client, schema });
export { schema };
```

---

## Authentication Integration (`src/auth.ts`)

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
});
```

---

## Sync Service Refactor (`src/services/sync.ts`)

1. **Delete `ensureCriticalIndexes()`**:
   - Redundant DDL statements on every course sync are removed.
2. **Remove Session Overrides**:
   - `SET LOCAL synchronous_commit = OFF` and `RESET synchronous_commit` are removed.
3. **Native PostgreSQL Bulk Upserts**:
   - User sync:
     ```ts
     await db.insert(schema.users)
       .values(chunk)
       .onConflictDoUpdate({
         target: [schema.users.studentId, schema.users.courseId],
         set: {
           name: sql`excluded."name"`,
           shortName: sql`excluded."shortName"`,
           updatedAt: new Date(),
         },
       });
     ```
   - Question sync:
     ```ts
     await db.insert(schema.questions)
       .values(chunk)
       .onConflictDoUpdate({
         target: [schema.questions.quizId, schema.questions.courseId],
         set: {
           quizName: sql`excluded."quizName"`,
           types: sql`excluded."types"`,
           lesson: sql`excluded."lesson"`,
           difficulty: sql`excluded."difficulty"`,
           class: sql`excluded."class"`,
           updatedAt: new Date(),
         },
       });
     ```
   - Topic rating sync:
     ```ts
     await db.insert(schema.topicRatings)
       .values(topicRecords)
       .onConflictDoUpdate({
         target: [schema.topicRatings.topic, schema.topicRatings.userId, schema.topicRatings.courseId],
         set: {
           rating: sql`${schema.topicRatings.rating} + excluded."rating" - 1500`,
           submissionCount: sql`${schema.topicRatings.submissionCount} + 1`,
           updatedAt: new Date(),
         },
       });
     ```
   - Course and Sync History sync: replaced with single atomic `db.insert().values().onConflictDoUpdate()`.
4. **Micro-transactions and Submission Batches**:
   - Handled via `db.transaction(async (tx) => { ... })` with Drizzle batch operations.

---

## Route-by-Route Migration

1. **`src/routes/ranking.ts`**:
   - `db.query.courses.findFirst({ where: eq(courses.randomId, randomizedCourseId), with: { ratingThresholds: true } })`
   - `db.query.users.findMany({ where: eq(users.courseId, realCourse.id), with: { topicRatings: { where: eq(topicRatings.courseId, realCourse.id) }, quizzes: { where: eq(quizzes.questionId, ...) } } })`
   - `db.query.quizzes.findMany({ limit: 5, with: { user: true, question: true }, orderBy: desc(quizzes.submittedAt) })`
2. **`src/routes/announcements.ts`**:
   - `db.query.announcements.findMany({ with: { course: true }, orderBy: ... })`
   - `db.query.announcements.findFirst({ where: eq(announcements.id, id) })`
3. **`src/routes/admin.ts` & `src/routes/courseSettings.ts`**:
   - Stats count: `db.select({ count: count() }).from(schema.users)`
   - Announcements CRUD: `db.query`, `db.insert`, `db.update`, `db.delete`
   - User administration: `db.query.user.findMany`, `db.query.user.findFirst`, `db.update(schema.user)`
   - Course settings & thresholds: `db.update(schema.courses)`, `db.insert(schema.ratingThresholds).values().onConflictDoUpdate()`
4. **`src/routes/users.ts`**:
   - User profile: `db.query.user.findFirst({ where: eq(user.id, session.user.id) })`
   - Submissions: `db.query.users.findMany({ where: eq(users.studentId, userId), with: { quizzes: { with: { question: true } } } })`
   - Profile update: `db.update(schema.user).set(...).where(eq(schema.user.id, ...)).returning()`
5. **`src/routes/problems.ts`**:
   - `db.query.questions.findMany({ with: { quizzes: true } })` and `db.query.courses.findMany()`
6. **`src/routes/health.ts`**:
   - Database health verification via `db.execute(sql`SELECT 1`)`
7. **`scripts/create-user.ts`**:
   - Migrated to Better Auth + Drizzle query `db.query.user.findFirst({ where: eq(user.email, email) })`

---

## Tooling & Configuration

- `drizzle.config.ts`:
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
- `package.json`:
  - Scripts:
    ```json
    "db:generate": "bun x drizzle-kit generate",
    "db:migrate": "bun x drizzle-kit migrate",
    "db:push": "bun x drizzle-kit push",
    "db:studio": "bun x drizzle-kit studio"
    ```
  - Removed: `@prisma/adapter-pg`, `@prisma/client`, `prisma`
  - Added: `drizzle-orm`, `drizzle-kit` (devDependencies)
  - Driver: native `bun:sql` (built into Bun runtime)

---

## Verification & Validation

1. **Compilation Check**: Run `bun x tsc --noEmit` and resolve all TypeScript errors across the entire codebase.
2. **Dependency Verification**: Confirm no references to Prisma remain in `src/`, `scripts/`, or `package.json`.
3. **Runtime Verification**:
   - Health check endpoint `/api/health`.
   - API routes responses match previous response shapes.
   - Script `scripts/create-user.ts` works with Drizzle.
