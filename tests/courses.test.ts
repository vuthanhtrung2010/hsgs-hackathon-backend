import { expect, test } from "bun:test";
import { courseRoutes } from "../src/routes/courses.js";
import { announcementRoutes } from "../src/routes/announcements.js";
import { courseSettingsRoute } from "../src/routes/courseSettings.js";

test("course routes are defined", () => {
  expect(courseRoutes).toBeDefined();
  expect(announcementRoutes).toBeDefined();
  expect(courseSettingsRoute).toBeDefined();
});
