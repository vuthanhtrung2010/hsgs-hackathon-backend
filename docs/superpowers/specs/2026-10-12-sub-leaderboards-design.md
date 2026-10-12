# Sub-Leaderboards Architectural Specification

- **Date:** 2026-10-12
- **Status:** Approved
- **Scope:** Sub-leaderboard subsystem for HSGS Hackathon Backend

---

## 1. Overview & Motivation

The primary leaderboard (`/api/ranking/:randomizedCourseId`) displays all students enrolled in a course. For large cohorts, instructors and students benefit from scoped leaderboards ("sub-leaderboards") displaying a specific subset of students (e.g. by recitation section, study group, or classroom track).

This feature introduces independent sub-leaderboards associated with a course, each with a unique CUID identifier, manageable via authenticated admin endpoints and publicly viewable via a dedicated ranking endpoint.

---

## 2. Architecture & Data Model

### 2.1 Database Schema (`src/db/schema.ts`)

Two new tables are introduced:

#### `sub_leaderboards`
Represents an individual sub-leaderboard instance tied to a course.
- `id` (`text`, primary key): Auto-generated CUID using `@paralleldrive/cuid2` `createId()`.
- `name` (`text`, not null): Human-readable title of the sub-leaderboard (e.g., `"Class 10A1"`, `"Track B Study Group"`).
- `courseId` (`text`, not null): Foreign key referencing `courses.id` (`onDelete: "cascade"`).
- `createdAt` (`timestamp`, not null, default `now()`).
- `updatedAt` (`timestamp`, not null, default `now()`, updated on modification).
- **Indexes**: `idx_sub_leaderboards_course` on `courseId`.

#### `sub_leaderboard_members`
A junction table mapping sub-leaderboards to member students.
- `id` (`serial`, primary key).
- `subLeaderboardId` (`text`, not null): Foreign key referencing `sub_leaderboards.id` (`onDelete: "cascade"`).
- `studentId` (`text`, not null): Canvas student identifier corresponding to `users.studentId`.
- `createdAt` (`timestamp`, not null, default `now()`).
- **Constraints & Indexes**:
  - Unique constraint `sub_leaderboard_members_unique_key` on `(subLeaderboardId, studentId)`.
  - Index `idx_sub_leaderboard_members_leaderboard` on `subLeaderboardId`.
  - Index `idx_sub_leaderboard_members_student` on `studentId`.

### 2.2 Drizzle Relations
- `subLeaderboardsRelations`:
  - `course`: `one(courses, { fields: [subLeaderboards.courseId], references: [courses.id] })`
  - `members`: `many(subLeaderboardMembers)`
- `subLeaderboardMembersRelations`:
  - `subLeaderboard`: `one(subLeaderboards, { fields: [subLeaderboardMembers.subLeaderboardId], references: [subLeaderboards.id] })`
- `coursesRelations`:
  - Extended to include `subLeaderboards: many(subLeaderboards)`

---

## 3. Services & Calculation Logic

### 3.1 Ranking Service (`src/services/rankingService.ts`)

Extract the calculation logic currently in `src/routes/ranking.ts` into a reusable function:

```typescript
export async function calculateCourseRanking(
  course: CourseWithThresholds,
  filterStudentIds?: string[],
): Promise<{
  ranking: LeaderboardUserEntry[];
  recentSubmissions: RecentSubmissionEntry[];
}>;
```

#### Behavior:
1. **Empty Filter Check**: If `filterStudentIds` is passed and `filterStudentIds.length === 0`, return `{ ranking: [], recentSubmissions: [] }` immediately.
2. **Users Query**: Query `users` for `course.id`. If `filterStudentIds` is defined, filter via `inArray(schema.users.studentId, filterStudentIds)`. Include each user's `topicRatings` and `quizzes` (joined with `question`).
3. **Recent Submissions Query**: Select recent 5 submissions for `course.id`. If `filterStudentIds` is defined, filter via `inArray(schema.users.studentId, filterStudentIds)`.
4. **Scoring & Debt Calculation**: Compute weighted average topic rating, completed quizzes count, debt calculation, and sort rankings descending by rating, identical to the main leaderboard.

---

## 4. API Endpoints

### 4.1 Public Ranking Route

Mounted in `src/routes/ranking.ts`:

- **`GET /api/ranking/sub/:id`**
  - **Access**: Public
  - **Parameters**: `id` - CUID of the sub-leaderboard.
  - **Flow**:
    1. Query `subLeaderboards` by `id` with its related `course` (including `ratingThresholds`) and `members`.
    2. If not found, return 404 `{ error: "Sub-leaderboard not found" }`.
    3. Extract `studentIds = subLeaderboard.members.map((m) => m.studentId)`.
    4. Call `calculateCourseRanking(subLeaderboard.course, studentIds)`.
    5. Return 200:
       ```json
       {
         "subLeaderboard": {
           "id": "cuid...",
           "name": "Class 10A1",
           "courseId": "12345",
           "courseName": "Math 101"
         },
         "ranking": [...],
         "recentSubmissions": [...]
       }
       ```

### 4.2 Admin Management Routes

Mounted under `/api/admin/sub-leaderboards` in `src/routes/admin.ts`, protected with `requireAdmin`:

- **`POST /api/admin/sub-leaderboards`**
  - **Body**: `{ courseId: string, name: string, studentIds: string[] }`
  - Validates `courseId` (resolves either direct `courses.id` or `courses.randomId`), non-empty `name`, and valid `studentIds` array.
  - Creates `sub_leaderboards` record and inserts member rows into `sub_leaderboard_members`.
  - **Response 201**: `{ success: true, id: string, name: string, memberCount: number }`

- **`GET /api/admin/sub-leaderboards/course/:randomizedCourseId`**
  - Lists all sub-leaderboards for the course.
  - **Response 200**: `{ success: true, subLeaderboards: [{ id, name, courseId, memberCount, createdAt, updatedAt }] }`

- **`GET /api/admin/sub-leaderboards/:id`**
  - Retrieves sub-leaderboard metadata and full member list with Canvas student IDs and names.
  - Joins `sub_leaderboard_members` with `users` on `users.studentId = members.studentId AND users.courseId = subLeaderboards.courseId`.
  - **Response 200**:
    ```json
    {
      "success": true,
      "subLeaderboard": {
        "id": "cuid...",
        "name": "Class 10A1",
        "courseId": "12345",
        "createdAt": "...",
        "updatedAt": "..."
      },
      "members": [
        {
          "studentId": "1001",
          "name": "Nguyen Van A",
          "shortName": "Van A"
        }
      ]
    }
    ```

- **`PUT /api/admin/sub-leaderboards/:id`**
  - **Body**: `{ name?: string, studentIds?: string[] }`
  - Updates name if provided; if `studentIds` provided, reconciles/replaces member rows in `sub_leaderboard_members`.
  - **Response 200**: `{ success: true, id: string, name: string, memberCount: number }`

- **`DELETE /api/admin/sub-leaderboards/:id`**
  - Deletes the sub-leaderboard; associated member records cascade delete.
  - **Response 200**: `{ success: true, message: "Sub-leaderboard deleted" }`

---

## 5. Migration & Backwards Compatibility

1. **Backwards Compatibility**:
   - `GET /api/ranking/:randomizedCourseId` remains completely unchanged, internally delegating to `calculateCourseRanking(realCourse)`.
   - Existing tables, models, and migrations remain intact.
2. **Database Migration**:
   - Run `bun x drizzle-kit generate` to produce a clean SQL migration for the new tables and indexes.

---

## 6. Verification & Test Plan

1. **Schema & Models Test** (`tests/sub-leaderboard-schema.test.ts`):
   - Assert `subLeaderboards` and `subLeaderboardMembers` tables export properly.
   - Assert default CUID generation for `subLeaderboards.id`.
   - Assert schema constraints and relations.
2. **Ranking Service Unit Test** (`tests/ranking-service.test.ts`):
   - Assert `calculateCourseRanking` calculates leaderboard correctly for all users.
   - Assert `calculateCourseRanking` filters rankings and submissions to only supplied `studentIds`.
   - Assert empty `studentIds` returns `{ ranking: [], recentSubmissions: [] }`.
3. **Route Integration Tests** (`tests/sub-leaderboard-routes.test.ts`):
   - Test admin CRUD operations: create sub-leaderboard, fetch details (with names & student IDs), list by course, update members, delete.
   - Test unauthorized rejection for unauthenticated requests to admin endpoints.
   - Test public `GET /api/ranking/sub/:id` returns 404 for nonexistent IDs and 200 for valid ones.
4. **Regression Verification**:
   - Full test suite execution with `bun test`.
   - Type check with `bun x tsc --noEmit`.
