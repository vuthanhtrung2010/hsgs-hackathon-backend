import { describe, expect, it } from "bun:test";
import * as schema from "../src/db/schema.js";

describe("Sub-leaderboards Schema", () => {
  it("exports subLeaderboards and subLeaderboardMembers tables", () => {
    expect((schema as any).subLeaderboards).toBeDefined();
    expect((schema as any).subLeaderboardMembers).toBeDefined();
  });

  it("subLeaderboards has expected column configuration", () => {
    const table = (schema as any).subLeaderboards;
    expect(table.id).toBeDefined();
    expect(table.name).toBeDefined();
    expect(table.courseId).toBeDefined();
    expect(table.createdAt).toBeDefined();
    expect(table.updatedAt).toBeDefined();
  });

  it("subLeaderboardMembers has expected column configuration", () => {
    const table = (schema as any).subLeaderboardMembers;
    expect(table.id).toBeDefined();
    expect(table.subLeaderboardId).toBeDefined();
    expect(table.studentId).toBeDefined();
    expect(table.createdAt).toBeDefined();
  });

  it("subLeaderboards.id generates valid CUID default", () => {
    const defaultVal = (schema as any).subLeaderboards.id.defaultFn?.();
    expect(typeof defaultVal).toBe("string");
    expect((defaultVal as string).length).toBeGreaterThan(15);
  });

  it("exports relations for subLeaderboards and subLeaderboardMembers", () => {
    expect((schema as any).subLeaderboardsRelations).toBeDefined();
    expect((schema as any).subLeaderboardMembersRelations).toBeDefined();
  });
});
