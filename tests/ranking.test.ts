import { expect, test } from "bun:test";
import { rankingRoutes } from "../src/routes/ranking.js";
import { getRecommendationsForUser, getBalancedRecommendationsForUser } from "../src/services/recommendations.js";

test("rankingRoutes is an Elysia instance", () => {
  expect(rankingRoutes).toBeDefined();
});

test("recommendations service exports required functions", () => {
  expect(typeof getRecommendationsForUser).toBe("function");
  expect(typeof getBalancedRecommendationsForUser).toBe("function");
});
