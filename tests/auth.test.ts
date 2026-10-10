import { expect, test } from "bun:test";
import { auth } from "../src/auth.js";

test("auth is initialized with drizzle adapter", () => {
  expect(auth).toBeDefined();
  expect(auth.handler).toBeDefined();
  expect(auth.api).toBeDefined();
  expect(auth.api.getSession).toBeDefined();
});
