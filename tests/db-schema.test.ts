import { expect, test } from "bun:test";
import * as schema from "../src/db/schema.js";
import { db } from "../src/db/index.js";

test("schema exports all required tables", () => {
  expect(schema.users).toBeDefined();
  expect(schema.questions).toBeDefined();
  expect(schema.quizzes).toBeDefined();
  expect(schema.courses).toBeDefined();
  expect(schema.ratingThresholds).toBeDefined();
  expect(schema.announcements).toBeDefined();
  expect(schema.syncHistory).toBeDefined();
  expect(schema.topicRatings).toBeDefined();
  expect(schema.user).toBeDefined();
  expect(schema.session).toBeDefined();
  expect(schema.account).toBeDefined();
  expect(schema.verification).toBeDefined();
});

test("schema exports relations", () => {
  expect(schema.usersRelations).toBeDefined();
  expect(schema.questionsRelations).toBeDefined();
  expect(schema.quizzesRelations).toBeDefined();
  expect(schema.coursesRelations).toBeDefined();
  expect(schema.ratingThresholdsRelations).toBeDefined();
  expect(schema.announcementsRelations).toBeDefined();
  expect(schema.topicRatingsRelations).toBeDefined();
  expect(schema.userRelations).toBeDefined();
  expect(schema.sessionRelations).toBeDefined();
  expect(schema.accountRelations).toBeDefined();
});

test("db client is initialized with bun:sql", () => {
  expect(db).toBeDefined();
  expect(db.query).toBeDefined();
  expect(db.query.courses).toBeDefined();
  expect(db.query.users).toBeDefined();
});
