import { describe, expect, it } from "bun:test";
import { rankingRoutes } from "../src/routes/ranking.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Sub-leaderboard Ranking Route", () => {
  it("returns 404 when sub-leaderboard is not found", async () => {
    const response = await rankingRoutes.handle(
      new Request("http://localhost/api/ranking/sub/nonexistent-cuid-id"),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as any;
    expect(body.error).toBe("Sub-leaderboard not found");
  });

  it("returns 200 with ranking structure when sub-leaderboard exists", async () => {
    // Setup test course
    const testCourseId = `test-sl-course-${Date.now()}`;
    await db.insert(schema.courses).values({
      id: testCourseId,
      name: "Test SL Course",
      quote: "Test Quote",
      quoteAuthor: "Author",
      assignmentCount: 5,
    });

    // Create test sub-leaderboard
    const [subLb] = await db
      .insert(schema.subLeaderboards)
      .values({
        name: "Test Group Alpha",
        courseId: testCourseId,
      })
      .returning();

    expect(subLb).toBeDefined();

    try {
      const response = await rankingRoutes.handle(
        new Request(`http://localhost/api/ranking/sub/${subLb!.id}`),
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.subLeaderboard).toBeDefined();
      expect(data.subLeaderboard.id).toBe(subLb!.id);
      expect(data.subLeaderboard.name).toBe("Test Group Alpha");
      expect(data.subLeaderboard.courseId).toBe(testCourseId);
      expect(Array.isArray(data.ranking)).toBe(true);
      expect(Array.isArray(data.recentSubmissions)).toBe(true);
    } finally {
      // Clean up test data
      await db.delete(schema.courses).where(eq(schema.courses.id, testCourseId));
    }
  });
});
