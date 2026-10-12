import { describe, expect, it, spyOn } from "bun:test";
import { adminSubLeaderboardRoutes } from "../src/routes/adminSubLeaderboards.js";
import * as authMiddleware from "../src/middleware/auth.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Admin Sub-Leaderboard Routes", () => {
  it("exports Elysia admin sub-leaderboard routes instance", () => {
    expect(adminSubLeaderboardRoutes).toBeDefined();
  });

  it("rejects unauthorized create request with 401", async () => {
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
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it("rejects unauthorized list request with 401", async () => {
    const res = await adminSubLeaderboardRoutes.handle(
      new Request(
        "http://localhost/api/admin/sub-leaderboards/course/mock-course-id",
      ),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it("rejects unauthorized get detail request with 401", async () => {
    const res = await adminSubLeaderboardRoutes.handle(
      new Request("http://localhost/api/admin/sub-leaderboards/mock-id"),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it("rejects unauthorized delete request with 401", async () => {
    const res = await adminSubLeaderboardRoutes.handle(
      new Request("http://localhost/api/admin/sub-leaderboards/mock-id", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });

  it("performs full CRUD operations when authorized", async () => {
    const requireAdminSpy = spyOn(
      authMiddleware,
      "requireAdmin",
    ).mockResolvedValue({
      success: true,
      session: {} as any,
      user: {} as any,
    });

    const testCourseId = `admin-test-course-${Date.now()}`;

    try {
      // 1. Create test course and test users in DB
      await db.insert(schema.courses).values({
        id: testCourseId,
        name: "Admin Test Course",
        quote: "Quote",
        quoteAuthor: "Author",
        assignmentCount: 10,
      });

      await db.insert(schema.users).values([
        {
          studentId: "canvas-101",
          name: "Alice Wonderland",
          shortName: "Alice",
          courseId: testCourseId,
        },
        {
          studentId: "canvas-102",
          name: "Bob Builder",
          shortName: "Bob",
          courseId: testCourseId,
        },
      ]);

      // 2. POST create sub-leaderboard
      const createRes = await adminSubLeaderboardRoutes.handle(
        new Request("http://localhost/api/admin/sub-leaderboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: testCourseId,
            name: "Morning Cohort",
            studentIds: ["canvas-101", "canvas-102"],
          }),
        }),
      );

      expect(createRes.status).toBe(201);
      const createdData = (await createRes.json()) as any;
      expect(createdData.success).toBe(true);
      expect(createdData.id).toBeDefined();
      expect(createdData.name).toBe("Morning Cohort");
      expect(createdData.memberCount).toBe(2);

      const subLbId = createdData.id;

      // 3. GET list for course
      const listRes = await adminSubLeaderboardRoutes.handle(
        new Request(
          `http://localhost/api/admin/sub-leaderboards/course/${testCourseId}`,
        ),
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.success).toBe(true);
      expect(listData.subLeaderboards.length).toBeGreaterThanOrEqual(1);

      // 4. GET details with student names & IDs
      const detailRes = await adminSubLeaderboardRoutes.handle(
        new Request(`http://localhost/api/admin/sub-leaderboards/${subLbId}`),
      );
      expect(detailRes.status).toBe(200);
      const detailData = (await detailRes.json()) as any;
      expect(detailData.success).toBe(true);
      expect(detailData.subLeaderboard.id).toBe(subLbId);
      expect(detailData.members).toBeDefined();
      expect(detailData.members.length).toBe(2);
      expect(detailData.members[0].studentId).toBe("canvas-101");
      expect(detailData.members[0].name).toBe("Alice Wonderland");
      expect(detailData.members[1].studentId).toBe("canvas-102");
      expect(detailData.members[1].name).toBe("Bob Builder");

      // 5. PUT update name and members
      const updateRes = await adminSubLeaderboardRoutes.handle(
        new Request(`http://localhost/api/admin/sub-leaderboards/${subLbId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Morning Cohort (Updated)",
            studentIds: ["canvas-101"],
          }),
        }),
      );
      expect(updateRes.status).toBe(200);
      const updateData = (await updateRes.json()) as any;
      expect(updateData.success).toBe(true);
      expect(updateData.name).toBe("Morning Cohort (Updated)");
      expect(updateData.memberCount).toBe(1);

      // 6. DELETE sub-leaderboard
      const deleteRes = await adminSubLeaderboardRoutes.handle(
        new Request(`http://localhost/api/admin/sub-leaderboards/${subLbId}`, {
          method: "DELETE",
        }),
      );
      expect(deleteRes.status).toBe(200);
      const deleteData = (await deleteRes.json()) as any;
      expect(deleteData.success).toBe(true);

      // 7. Verify deletion (404)
      const verifyRes = await adminSubLeaderboardRoutes.handle(
        new Request(`http://localhost/api/admin/sub-leaderboards/${subLbId}`),
      );
      expect(verifyRes.status).toBe(404);
    } finally {
      requireAdminSpy.mockRestore();
      await db.delete(schema.courses).where(eq(schema.courses.id, testCourseId));
    }
  });
});
