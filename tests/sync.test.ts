import { expect, test } from "bun:test";
import { syncCourseSubmissions, syncAllCourses } from "../src/services/sync.js";

test("sync module exports required functions", () => {
  expect(typeof syncCourseSubmissions).toBe("function");
  expect(typeof syncAllCourses).toBe("function");
});
