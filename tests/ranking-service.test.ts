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
