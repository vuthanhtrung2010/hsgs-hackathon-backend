import { describe, expect, it } from "bun:test";
import { courseRoutes } from "../src/routes/courses.js";
import { announcementRoutes } from "../src/routes/announcements.js";
import { courseSettingsRoute } from "../src/routes/courseSettings.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Course Routes", () => {
  it("course routes are defined", () => {
    expect(courseRoutes).toBeDefined();
    expect(announcementRoutes).toBeDefined();
    expect(courseSettingsRoute).toBeDefined();
  });

  it("returns 404 when fetching students for nonexistent course", async () => {
    const res = await courseRoutes.handle(
      new Request("http://localhost/api/courses/nonexistent-course-id/students"),
    );
    expect(res.status).toBe(404);
  });

  it("returns list of { id, name } students for a course", async () => {
    const testCourseId = `course-students-test-${Date.now()}`;
    await db.insert(schema.courses).values({
      id: testCourseId,
      name: "Test Course Students",
      quote: "Q",
      quoteAuthor: "A",
      assignmentCount: 2,
    });

    await db.insert(schema.users).values([
      {
        studentId: "12345",
        name: "Nguyen Van A",
        shortName: "Van A",
        courseId: testCourseId,
      },
      {
        studentId: "67890",
        name: "Tran Thi B",
        shortName: "Thi B",
        courseId: testCourseId,
      },
    ]);

    try {
      const res = await courseRoutes.handle(
        new Request(`http://localhost/api/courses/${testCourseId}/students`),
      );
      expect(res.status).toBe(200);
      const students = (await res.json()) as any;
      expect(Array.isArray(students)).toBe(true);
      expect(students.length).toBe(2);
      expect(students[0]).toEqual({ id: "12345", name: "Nguyen Van A" });
      expect(students[1]).toEqual({ id: "67890", name: "Tran Thi B" });
    } finally {
      await db.delete(schema.courses).where(eq(schema.courses.id, testCourseId));
    }
  });
});
