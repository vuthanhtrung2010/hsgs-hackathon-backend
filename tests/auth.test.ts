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

test("auth allows requests with cookies and without origin header (no CSRF rejection)", async () => {
  const req = new Request("http://localhost:3005/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "better-auth.session_token=test-token",
    },
    body: JSON.stringify({ email: "nonexistent@test.com", password: "pwd" }),
  });
  const res = await auth.handler(req);
  expect(res.status).not.toBe(403);
});
