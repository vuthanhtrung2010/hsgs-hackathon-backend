import { expect, test } from "bun:test";
import { healthRoutes } from "../src/routes/health.js";
import { problemRoutes } from "../src/routes/problems.js";
import { userRoutes } from "../src/routes/users.js";

test("health, problems, and user routes are defined", () => {
  expect(healthRoutes).toBeDefined();
  expect(problemRoutes).toBeDefined();
  expect(userRoutes).toBeDefined();
});
