import { Elysia } from "elysia";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import { eq, or, and, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

export const adminSubLeaderboardRoutes = new Elysia({
  prefix: "/api/admin/sub-leaderboards",
})
  // Create sub-leaderboard
  .post("/", async ({ request, body, set }) => {
    const authResult = await requireAdmin(request);
    if (!authResult.success) {
      set.status = 401;
      return { success: false, error: authResult.error };
    }

    const { courseId, name, studentIds } = (body || {}) as {
      courseId?: string;
      name?: string;
      studentIds?: string[];
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

    if (!created) {
      set.status = 500;
      return { success: false, error: "Failed to create sub-leaderboard" };
    }

    const uniqueStudentIds = Array.isArray(studentIds)
      ? Array.from(new Set(studentIds.map(String).filter((s) => s.trim())))
      : [];

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
  })

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
      const uniqueStudentIds = Array.from(
        new Set(studentIds.map(String).filter((s) => s.trim())),
      );

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

    if (!updated) {
      set.status = 500;
      return { success: false, error: "Failed to load updated sub-leaderboard" };
    }

    return {
      success: true,
      id: updated.id,
      name: updated.name,
      memberCount: updated.members.length,
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
