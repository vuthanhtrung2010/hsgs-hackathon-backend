import { describe, expect, it, spyOn } from "bun:test";
import { adminRoutes } from "../src/routes/admin.js";
import { courseSettingsRoute } from "../src/routes/courseSettings.js";
import * as authMiddleware from "../src/middleware/auth.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Admin Courses & Settings Routes", () => {
  it("populates ratingThresholds in admin courses list", async () => {
    const spy = spyOn(authMiddleware, "requireAdmin").mockResolvedValue({
      success: true,
      session: {} as any,
      user: {} as any,
    });

    const testCourseId = `admin-course-test-${Date.now()}`;

    try {
      await db.insert(schema.courses).values({
        id: testCourseId,
        name: "Admin Rating Threshold Test Course",
        quote: "Custom quote",
        quoteAuthor: "Custom author",
        assignmentCount: 5,
        customRatingThresholds: true,
      });

      await db.insert(schema.ratingThresholds).values({
        courseId: testCourseId,
        newbieThreshold: 0,
        amateurThreshold: 850,
        expertThreshold: 1150,
        candidateMasterThreshold: 1450,
        masterThreshold: 1750,
        grandmasterThreshold: 2050,
        targetThreshold: 2350,
        adminThreshold: 2850,
      });

      const res = await adminRoutes.handle(
        new Request("http://localhost/api/admin/courses"),
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);

      const foundCourse = data.courses.find(
        (c: any) => c.id === testCourseId,
      );
      expect(foundCourse).toBeDefined();
      expect(foundCourse.customRatingThresholds).toBe(true);
      expect(foundCourse.ratingThresholds).toBeDefined();
      expect(foundCourse.ratingThresholds.amateurThreshold).toBe(850);
      expect(foundCourse.ratingThresholds.expertThreshold).toBe(1150);
    } finally {
      await db.delete(schema.courses).where(eq(schema.courses.id, testCourseId));
      spy.mockRestore();
    }
  });

  it("updates and retrieves course settings with rating thresholds via courseSettingsRoute", async () => {
    const spy = spyOn(authMiddleware, "requireAdmin").mockResolvedValue({
      success: true,
      session: {} as any,
      user: {} as any,
    });

    const testCourseId = `admin-settings-test-${Date.now()}`;

    try {
      await db.insert(schema.courses).values({
        id: testCourseId,
        name: "Admin Course Settings Test",
        assignmentCount: 0,
      });

      const customThresholds = {
        newbieThreshold: 0,
        amateurThreshold: 900,
        expertThreshold: 1200,
        candidateMasterThreshold: 1500,
        masterThreshold: 1800,
        grandmasterThreshold: 2100,
        targetThreshold: 2400,
        adminThreshold: 3000,
      };

      const putRes = await courseSettingsRoute.handle(
        new Request(
          `http://localhost/api/admin/courses/${testCourseId}/settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quote: "Updated quote",
              quoteAuthor: "Updated author",
              showDebt: true,
              customRatingThresholds: true,
              thresholds: customThresholds,
            }),
          },
        ),
      );

      expect(putRes.status).toBe(200);
      const putData = (await putRes.json()) as any;
      expect(putData.success).toBe(true);

      const getRes = await courseSettingsRoute.handle(
        new Request(
          `http://localhost/api/admin/courses/${testCourseId}/settings`,
        ),
      );

      expect(getRes.status).toBe(200);
      const getData = (await getRes.json()) as any;
      expect(getData.success).toBe(true);
      expect(getData.settings.quote).toBe("Updated quote");
      expect(getData.settings.customRatingThresholds).toBe(true);
      expect(getData.settings.ratingThresholds).toBeDefined();
      expect(getData.settings.ratingThresholds.amateurThreshold).toBe(900);
      expect(getData.settings.ratingThresholds.expertThreshold).toBe(1200);
    } finally {
      await db.delete(schema.courses).where(eq(schema.courses.id, testCourseId));
      spy.mockRestore();
    }
  });
});
