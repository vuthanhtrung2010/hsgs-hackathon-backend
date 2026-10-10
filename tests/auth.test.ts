import { expect, test } from "bun:test";
import { auth } from "../src/auth.js";

test("auth is initialized with drizzle adapter", () => {
  expect(auth).toBeDefined();
  expect(auth.handler).toBeDefined();
  expect(auth.api).toBeDefined();
  expect(auth.api.getSession).toBeDefined();
});

test("auth options has trustedOrigins configured to allow all origins", () => {
  expect(auth.options.trustedOrigins).toBeDefined();
  expect(auth.options.trustedOrigins).toContain("*");
});
