# Sub-Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the sub-leaderboard subsystem allowing admins to create and manage scoped leaderboards for subsets of students by Canvas student IDs, and public users to view sub-leaderboard rankings via unique CUIDs.

**Architecture:** Add `sub_leaderboards` and `sub_leaderboard_members` tables in Drizzle ORM. Extract core ranking calculation logic into `src/services/rankingService.ts` to share between main and sub-leaderboards. Add public `GET /api/ranking/sub/:id` and authenticated admin CRUD endpoints under `/api/admin/sub-leaderboards`.

**Tech Stack:** Bun, Elysia, PostgreSQL, Drizzle ORM, `@paralleldrive/cuid2`, `better-auth`.

**Spec:** `docs/superpowers/specs/2026-10-12-sub-leaderboards-design.md`

## Global Constraints

- Preserve the existing main leaderboard route (`GET /api/ranking/:randomizedCourseId`) and its calculation behavior.
- Use CUID for `sub_leaderboards.id` via `@paralleldrive/cuid2` `createId()`.
- Return Canvas student IDs (`studentId`) and student names (`name`, `shortName`) in the admin detail endpoint.
- Require admin authentication on all `/api/admin/sub-leaderboards/*` endpoints using `requireAdmin`.
- Public endpoint `GET /api/ranking/sub/:id` must not require authentication.
- All new code must be fully tested with `bun test` and type-checked with `bun x tsc --noEmit`.

---

### Task 1: Database Schema & Migration for Sub-Leaderboards

**Files:**
- Modify: `src/db/schema.ts`
- Create: `tests/sub-leaderboard-schema.test.ts`
- Generated: `drizzle/0002_*.sql`

**Interfaces:**
- Produces: `subLeaderboards`, `subLeaderboardMembers`, `subLeaderboardsRelations`, `subLeaderboardMembersRelations` exported from `src/db/schema.ts`.

- [ ] **Step 1: Write the failing schema test**

Create `tests/sub-leaderboard-schema.test.ts`:
```typescript
import { describe, expect, it } from "bun:test";
import * as schema from "../src/db/schema.js";

describe("Sub-leaderboards Schema", () => {
  it("exports subLeaderboards and subLeaderboardMembers tables", () => {
    expect(schema.subLeaderboards).toBeDefined();
    expect(schema.subLeaderboardMembers).toBeDefined();
  });

  it("subLeaderboards has expected column configuration", () => {
    const table = schema.subLeaderboards;
    expect(table.id).toBeDefined();
    expect(table.name).toBeDefined();
    expect(table.courseId).toBeDefined();
    expect(table.createdAt).toBeDefined();
    expect(table.updatedAt).toBeDefined();
  });

  it("subLeaderboardMembers has expected column configuration", () => {
    const table = schema.subLeaderboardMembers;
    expect(table.id).toBeDefined();
    expect(table.subLeaderboardId).toBeDefined();
    expect(table.studentId).toBeDefined();
    expect(table.createdAt).toBeDefined();
  });

  it("subLeaderboards.id generates valid CUID default", () => {
    const defaultVal = schema.subLeaderboards.id.defaultFn?.();
    expect(typeof defaultVal).toBe("string");
    expect((defaultVal as string).length).toBeGreaterThan(15);
  });

  it("exports relations for subLeaderboards and subLeaderboardMembers", () => {
    expect(schema.subLeaderboardsRelations).toBeDefined();
    expect(schema.subLeaderboardMembersRelations).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sub-leaderboard-schema.test.ts`
Expected: FAIL with `subLeaderboards is not defined`.

- [ ] **Step 3: Implement minimal schema additions**

In `src/db/schema.ts`:
1. Define `subLeaderboards` table:
```typescript
export const subLeaderboards = pgTable(
  "sub_leaderboards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_sub_leaderboards_course").on(table.courseId),
  ],
);
```

2. Define `subLeaderboardMembers` table:
```typescript
export const subLeaderboardMembers = pgTable(
  "sub_leaderboard_members",
  {
    id: serial("id").primaryKey(),
    subLeaderboardId: text("subLeaderboardId")
      .notNull()
      .references(() => subLeaderboards.id, { onDelete: "cascade" }),
    studentId: text("studentId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("sub_leaderboard_members_unique_key").on(
      table.subLeaderboardId,
      table.studentId,
    ),
    index("idx_sub_leaderboard_members_leaderboard").on(table.subLeaderboardId),
    index("idx_sub_leaderboard_members_student").on(table.studentId),
  ],
);
```

3. Add relations in `src/db/schema.ts`:
```typescript
export const subLeaderboardsRelations = relations(
  subLeaderboards,
  ({ one, many }) => ({
    course: one(courses, {
      fields: [subLeaderboards.courseId],
      references: [courses.id],
    }),
    members: many(subLeaderboardMembers),
  }),
);

export const subLeaderboardMembersRelations = relations(
  subLeaderboardMembers,
  ({ one }) => ({
    subLeaderboard: one(subLeaderboards, {
      fields: [subLeaderboardMembers.subLeaderboardId],
      references: [subLeaderboards.id],
    }),
  }),
);
```
And add `subLeaderboards: many(subLeaderboards)` to `coursesRelations`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/sub-leaderboard-schema.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Generate drizzle migration**

Run: `bun x drizzle-kit generate`
Expected: Generates `drizzle/0002_*.sql` containing `CREATE TABLE "sub_leaderboards"` and `CREATE TABLE "sub_leaderboard_members"`.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/ tests/sub-leaderboard-schema.test.ts
git commit -m "feat(db): add sub_leaderboards and sub_leaderboard_members tables"
```

---

### Task 2: Ranking Calculation Service

**Files:**
- Create: `src/services/rankingService.ts`
- Modify: `src/routes/ranking.ts`
- Create: `tests/ranking-service.test.ts`

**Interfaces:**
- Consumes: `CourseWithThresholds` from schema/types, `db` from `src/db/index.js`, `schema` from `src/db/schema.js`.
- Produces: `calculateCourseRanking(realCourse, filterStudentIds?)` from `src/services/rankingService.ts`.

- [ ] **Step 1: Write unit tests for rankingService**

Create `tests/ranking-service.test.ts`:
```typescript
import { describe, expect, it } from "bun:test";
import { calculateCourseRanking } from "../src/services/rankingService.js";

describe("rankingService", () => {
  it("exports calculateCourseRanking function", () => {
    expect(typeof calculateCourseRanking).toBe("function");
  });

  it("returns empty ranking and empty submissions when filterStudentIds is empty array", async () => {
    const fakeCourse = {
      id: "course-9999",
      randomId: "random-9999",
      name: "Mock Course",
      quote: "Quote",
      quoteAuthor: "Author",
      assignmentCount: 5,
      showDebt: false,
      customRatingThresholds: false,
      ratingThresholds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await calculateCourseRanking(fakeCourse as any, []);
    expect(result).toEqual({ ranking: [], recentSubmissions: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/ranking-service.test.ts`
Expected: FAIL with `Cannot find module '../src/services/rankingService.js'`.

- [ ] **Step 3: Implement `src/services/rankingService.ts` and refactor `src/routes/ranking.ts`**

Create `src/services/rankingService.ts`:
```typescript
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, desc, inArray, and } from "drizzle-orm";

export type CourseWithThresholds = typeof schema.courses.$inferSelect & {
  ratingThresholds?: typeof schema.ratingThresholds.$inferSelect | null;
};

export async function calculateCourseRanking(
  realCourse: CourseWithThresholds,
  filterStudentIds?: string[],
) {
  if (filterStudentIds && filterStudentIds.length === 0) {
    return { ranking: [], recentSubmissions: [] };
  }

  const userWhereClause = filterStudentIds
    ? and(
        eq(schema.users.courseId, realCourse.id),
        inArray(schema.users.studentId, filterStudentIds),
      )
    : eq(schema.users.courseId, realCourse.id);

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

  const usersWithCourseQuizzes = users.map((u) => ({
    ...u,
    courseQuizzes: u.quizzes.filter(
      (q) => q.question.courseId === realCourse.id,
    ),
  }));

  const maxQuizzesCompleted = Math.max(
    ...usersWithCourseQuizzes.map((u) => u.courseQuizzes.length),
    0,
  );

  const isDebtValid =
    realCourse.showDebt &&
    realCourse.assignmentCount > 0 &&
    maxQuizzesCompleted <= realCourse.assignmentCount;

  const ranking = usersWithCourseQuizzes
    .map((user) => {
      let averageRating = 1500;

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
        id: parseInt(user.studentId),
        name: user.name,
        shortName: user.shortName,
        course: {
          courseId: parseInt(realCourse.id || "0"),
          courseName,
          rating: Math.round(averageRating),
          quizzesCompleted,
          debt,
          quote: realCourse.quote,
          quoteAuthor: realCourse.quoteAuthor,
          showDebt: realCourse.showDebt,
          assignmentCount: realCourse.assignmentCount,
          customRatingThresholds: realCourse.customRatingThresholds || false,
          ratingThresholds: realCourse.customRatingThresholds
            ? realCourse.ratingThresholds
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
```

In `src/routes/ranking.ts`, update `GET /api/ranking/:randomizedCourseId` to use `calculateCourseRanking`:
```typescript
import { calculateCourseRanking } from "../services/rankingService.js";
...
const rankingData = await calculateCourseRanking(realCourse);
return rankingData;
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `bun test tests/ranking-service.test.ts tests/ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/rankingService.ts src/routes/ranking.ts tests/ranking-service.test.ts
git commit -m "refactor: extract calculateCourseRanking service"
```

---

### Task 3: Public Sub-Leaderboard Ranking Route

**Files:**
- Modify: `src/routes/ranking.ts`
- Create: `tests/sub-leaderboard-ranking-route.test.ts`

**Interfaces:**
- Consumes: `calculateCourseRanking` from `src/services/rankingService.ts`, `subLeaderboards` from `src/db/schema.ts`.
- Produces: `GET /api/ranking/sub/:id` endpoint on `rankingRoutes`.

- [ ] **Step 1: Write test for public sub-leaderboard route**

Create `tests/sub-leaderboard-ranking-route.test.ts`:
```typescript
import { describe, expect, it } from "bun:test";
import { rankingRoutes } from "../src/routes/ranking.js";

describe("Sub-leaderboard Ranking Route", () => {
  it("returns 404 when sub-leaderboard is not found", async () => {
    const response = await rankingRoutes.handle(
      new Request("http://localhost/api/ranking/sub/nonexistent-cuid-id"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Sub-leaderboard not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sub-leaderboard-ranking-route.test.ts`
Expected: FAIL with 404 route not found (or Elysia default handling).

- [ ] **Step 3: Add `GET /sub/:id` handler to `rankingRoutes`**

In `src/routes/ranking.ts`:
```typescript
.get("/sub/:id", async ({ params: { id }, set }) => {
  try {
    const subLeaderboard = await db.query.subLeaderboards.findFirst({
      where: eq(schema.subLeaderboards.id, id),
      with: {
        course: {
          with: {
            ratingThresholds: true,
          },
        },
        members: true,
      },
    });

    if (!subLeaderboard) {
      set.status = 404;
      return {
        error: "Sub-leaderboard not found",
        message: `No sub-leaderboard found with ID: ${id}`,
      };
    }

    const memberStudentIds = subLeaderboard.members.map((m) => m.studentId);
    const rankingData = await calculateCourseRanking(
      subLeaderboard.course,
      memberStudentIds,
    );

    return {
      subLeaderboard: {
        id: subLeaderboard.id,
        name: subLeaderboard.name,
        courseId: subLeaderboard.course.id,
        courseName: subLeaderboard.course.name,
      },
      ...rankingData,
    };
  } catch (error) {
    console.error(`Error getting ranking for sub-leaderboard ${id}:`, error);
    set.status = 500;
    return { error: "Internal server error" };
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/sub-leaderboard-ranking-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/ranking.ts tests/sub-leaderboard-ranking-route.test.ts
git commit -m "feat(ranking): add public GET /api/ranking/sub/:id route"
```

---

### Task 4: Admin Sub-Leaderboard Management Routes

**Files:**
- Create: `src/routes/adminSubLeaderboards.ts`
- Modify: `src/routes/admin.ts`
- Create: `tests/admin-sub-leaderboards.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `src/middleware/auth.js`, schema tables `subLeaderboards`, `subLeaderboardMembers`, `courses`, `users`.
- Produces: `adminSubLeaderboardRoutes` mounted in `adminRoutes` (or `adminApp`).

- [ ] **Step 1: Write integration tests for Admin Sub-Leaderboard endpoints**

Create `tests/admin-sub-leaderboards.test.ts`:
```typescript
import { describe, expect, it } from "bun:test";
import { adminSubLeaderboardRoutes } from "../src/routes/adminSubLeaderboards.js";

describe("Admin Sub-Leaderboard Routes", () => {
  it("rejects unauthorized requests with 401", async () => {
    const res = await adminSubLeaderboardRoutes.handle(
      new Request("http://localhost/api/admin/sub-leaderboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "mock",
          name: "Test Group",
          studentIds: ["123"],
        }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("exports Elysia admin sub-leaderboard routes instance", () => {
    expect(adminSubLeaderboardRoutes).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/admin-sub-leaderboards.test.ts`
Expected: FAIL with `Cannot find module '../src/routes/adminSubLeaderboards.js'`.

- [ ] **Step 3: Implement `src/routes/adminSubLeaderboards.ts`**

Create `src/routes/adminSubLeaderboards.ts`:
```typescript
import { Elysia, t } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, or, and, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

export const adminSubLeaderboardRoutes = new Elysia({
  prefix: "/api/admin/sub-leaderboards",
})
  // Create sub-leaderboard
  .post(
    "/",
    async ({ request, body, set }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        set.status = 401;
        return { success: false, error: authResult.error };
      }

      const { courseId, name, studentIds } = body as {
        courseId: string;
        name: string;
        studentIds: string[];
      };

      if (!name || !name.trim()) {
        set.status = 400;
        return { success: false, error: "Name is required" };
      }

      if (!courseId) {
        set.status = 400;
        return { success: false, error: "Course ID is required" };
      }

      const course = await db.query.courses.findFirst({
        where: or(
          eq(schema.courses.id, courseId),
          eq(schema.courses.randomId, courseId),
        ),
      });

      if (!course) {
        set.status = 404;
        return { success: false, error: "Course not found" };
      }

      const [created] = await db
        .insert(schema.subLeaderboards)
        .values({
          name: name.trim(),
          courseId: course.id,
        })
        .returning();

      const uniqueStudentIds = Array.from(new Set(studentIds || []));
      if (uniqueStudentIds.length > 0) {
        await db.insert(schema.subLeaderboardMembers).values(
          uniqueStudentIds.map((studentId) => ({
            subLeaderboardId: created.id,
            studentId,
          })),
        );
      }

      set.status = 201;
      return {
        success: true,
        id: created.id,
        name: created.name,
        courseId: created.courseId,
        memberCount: uniqueStudentIds.length,
      };
    },
  )

  // List all sub-leaderboards for a course
  .get(
    "/course/:randomizedCourseId",
    async ({ request, params: { randomizedCourseId }, set }) => {
      const authResult = await requireAdmin(request);
      if (!authResult.success) {
        set.status = 401;
        return { success: false, error: authResult.error };
      }

      const course = await db.query.courses.findFirst({
        where: or(
          eq(schema.courses.id, randomizedCourseId),
          eq(schema.courses.randomId, randomizedCourseId),
        ),
        with: {
          subLeaderboards: {
            with: {
              members: true,
            },
          },
        },
      });

      if (!course) {
        set.status = 404;
        return { success: false, error: "Course not found" };
      }

      return {
        success: true,
        subLeaderboards: course.subLeaderboards.map((sl) => ({
          id: sl.id,
          name: sl.name,
          courseId: sl.courseId,
          memberCount: sl.members.length,
          createdAt: sl.createdAt,
          updatedAt: sl.updatedAt,
        })),
      };
    },
  )

  // Get details and members of a sub-leaderboard
  .get("/:id", async ({ request, params: { id }, set }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      set.status = 401;
      return { success: false, error: authResult.error };
    }

    const subLeaderboard = await db.query.subLeaderboards.findFirst({
      where: eq(schema.subLeaderboards.id, id),
      with: {
        members: true,
      },
    });

    if (!subLeaderboard) {
      set.status = 404;
      return { success: false, error: "Sub-leaderboard not found" };
    }

    const studentIds = subLeaderboard.members.map((m) => m.studentId);

    // Find users matching these studentIds in the course to get their names
    let membersWithNames: Array<{
      studentId: string;
      name: string;
      shortName: string;
    }> = [];

    if (studentIds.length > 0) {
      const matchedUsers = await db.query.users.findMany({
        where: and(
          eq(schema.users.courseId, subLeaderboard.courseId),
          inArray(schema.users.studentId, studentIds),
        ),
      });

      const userMap = new Map(matchedUsers.map((u) => [u.studentId, u]));

      membersWithNames = studentIds.map((studentId) => {
        const u = userMap.get(studentId);
        return {
          studentId,
          name: u?.name || "Unknown",
          shortName: u?.shortName || "Unknown",
        };
      });
    }

    return {
      success: true,
      subLeaderboard: {
        id: subLeaderboard.id,
        name: subLeaderboard.name,
        courseId: subLeaderboard.courseId,
        createdAt: subLeaderboard.createdAt,
        updatedAt: subLeaderboard.updatedAt,
      },
      members: membersWithNames,
    };
  })

  // Update a sub-leaderboard
  .put("/:id", async ({ request, params: { id }, body, set }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      set.status = 401;
      return { success: false, error: authResult.error };
    }

    const subLeaderboard = await db.query.subLeaderboards.findFirst({
      where: eq(schema.subLeaderboards.id, id),
    });

    if (!subLeaderboard) {
      set.status = 404;
      return { success: false, error: "Sub-leaderboard not found" };
    }

    const { name, studentIds } = (body || {}) as {
      name?: string;
      studentIds?: string[];
    };

    if (name && name.trim()) {
      await db
        .update(schema.subLeaderboards)
        .set({ name: name.trim() })
        .where(eq(schema.subLeaderboards.id, id));
    }

    if (Array.isArray(studentIds)) {
      const uniqueStudentIds = Array.from(new Set(studentIds));

      // Replace members
      await db
        .delete(schema.subLeaderboardMembers)
        .where(eq(schema.subLeaderboardMembers.subLeaderboardId, id));

      if (uniqueStudentIds.length > 0) {
        await db.insert(schema.subLeaderboardMembers).values(
          uniqueStudentIds.map((studentId) => ({
            subLeaderboardId: id,
            studentId,
          })),
        );
      }
    }

    const updated = await db.query.subLeaderboards.findFirst({
      where: eq(schema.subLeaderboards.id, id),
      with: { members: true },
    });

    return {
      success: true,
      id: updated!.id,
      name: updated!.name,
      memberCount: updated!.members.length,
    };
  })

  // Delete a sub-leaderboard
  .delete("/:id", async ({ request, params: { id }, set }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      set.status = 401;
      return { success: false, error: authResult.error };
    }

    const existing = await db.query.subLeaderboards.findFirst({
      where: eq(schema.subLeaderboards.id, id),
    });

    if (!existing) {
      set.status = 404;
      return { success: false, error: "Sub-leaderboard not found" };
    }

    await db
      .delete(schema.subLeaderboards)
      .where(eq(schema.subLeaderboards.id, id));

    return {
      success: true,
      message: "Sub-leaderboard deleted",
    };
  });
```

Mount `adminSubLeaderboardRoutes` in `src/routes/admin.ts` (or in `src/adminApp.ts`):
```typescript
import { adminSubLeaderboardRoutes } from "./adminSubLeaderboards.js";
...
adminRoutes.use(adminSubLeaderboardRoutes);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/admin-sub-leaderboards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/adminSubLeaderboards.ts src/routes/admin.ts tests/admin-sub-leaderboards.test.ts
git commit -m "feat(admin): add admin sub-leaderboard CRUD routes"
```

---

### Task 5: End-to-End Verification & Documentation Update

**Files:**
- Modify: `index.ts`
- Run: Full test suite & type checks

- [ ] **Step 1: Update API documentation in `index.ts`**

In `index.ts`, add the sub-leaderboard endpoints to the root info response:
```typescript
subLeaderboards: {
  ranking: "/api/ranking/sub/:id",
  admin: "/api/admin/sub-leaderboards",
}
```

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass (including existing and new tests).

- [ ] **Step 3: Run TypeScript compiler check**

Run: `bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add index.ts
git commit -m "docs: expose sub-leaderboard endpoints in root response"
```
