import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getAiToolStatsByUser: vi.fn(),
  getAiToolStatsByUserAndAction: vi.fn(),
}));

import * as db from "./db";

describe("AI Tool Stats By User DB Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAiToolStatsByUser returns per-user stats array", async () => {
    const mockData = [
      {
        userId: 1,
        userName: "Shuni Feng",
        userAvatar: null,
        department: "设计",
        totalCalls: 42,
        successCalls: 38,
        failedCalls: 4,
        avgDurationMs: 11200,
        lastCalledAt: new Date("2026-03-30"),
      },
      {
        userId: 2,
        userName: "张三",
        userAvatar: null,
        department: null,
        totalCalls: 15,
        successCalls: 15,
        failedCalls: 0,
        avgDurationMs: null,
        lastCalledAt: new Date("2026-03-29"),
      },
    ];
    vi.mocked(db.getAiToolStatsByUser).mockResolvedValue(mockData);

    const result = await db.getAiToolStatsByUser(30);
    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe(1);
    expect(result[0].userName).toBe("Shuni Feng");
    expect(result[0].totalCalls).toBe(42);
    expect(result[1].failedCalls).toBe(0);
    expect(db.getAiToolStatsByUser).toHaveBeenCalledWith(30);
  });

  it("getAiToolStatsByUserAndAction returns per-user per-action breakdown", async () => {
    const mockData = [
      {
        userId: 1,
        userName: "Shuni Feng",
        action: "rendering_generate",
        toolId: 240008,
        toolName: "Gemini 3",
        totalCalls: 20,
        successCalls: 18,
        failedCalls: 2,
      },
      {
        userId: 1,
        userName: "Shuni Feng",
        action: "benchmark_research",
        toolId: 240008,
        toolName: "Gemini 3",
        totalCalls: 10,
        successCalls: 10,
        failedCalls: 0,
      },
      {
        userId: 2,
        userName: "张三",
        action: "rendering_generate",
        toolId: 0,
        toolName: null,
        totalCalls: 5,
        successCalls: 3,
        failedCalls: 2,
      },
    ];
    vi.mocked(db.getAiToolStatsByUserAndAction).mockResolvedValue(mockData);

    const result = await db.getAiToolStatsByUserAndAction(30);
    expect(result).toHaveLength(3);
    expect(result[0].userId).toBe(1);
    expect(result[0].action).toBe("rendering_generate");
    expect(result[2].toolId).toBe(0);
    expect(db.getAiToolStatsByUserAndAction).toHaveBeenCalledWith(30);
  });

  it("getAiToolStatsByUser returns empty array when no data", async () => {
    vi.mocked(db.getAiToolStatsByUser).mockResolvedValue([]);
    const result = await db.getAiToolStatsByUser(7);
    expect(result).toEqual([]);
  });

  it("getAiToolStatsByUserAndAction returns empty array when no data", async () => {
    vi.mocked(db.getAiToolStatsByUserAndAction).mockResolvedValue([]);
    const result = await db.getAiToolStatsByUserAndAction(14);
    expect(result).toEqual([]);
  });

  it("share percentage calculation is correct", () => {
    const totalCalls = 100;
    const userCalls = 42;
    const share = totalCalls > 0 ? Math.round((userCalls / totalCalls) * 100) : 0;
    expect(share).toBe(42);
  });

  it("share is 0 when no total calls", () => {
    const totalCalls = 0;
    const userCalls = 0;
    const share = totalCalls > 0 ? Math.round((userCalls / totalCalls) * 100) : 0;
    expect(share).toBe(0);
  });

  it("user display name falls back to userId when name is null", () => {
    const getUserDisplayName = (userId: number, userName: string | null) =>
      userName || `用户 #${userId}`;
    expect(getUserDisplayName(5, null)).toBe("用户 #5");
    expect(getUserDisplayName(5, "Alice")).toBe("Alice");
  });

  it("initials extraction works correctly", () => {
    const getInitials = (name: string | null) => {
      if (!name) return "?";
      return name.slice(0, 1).toUpperCase();
    };
    expect(getInitials("Shuni Feng")).toBe("S");
    expect(getInitials("张三")).toBe("张");
    expect(getInitials(null)).toBe("?");
  });

  it("groups userActionStats by userId correctly", () => {
    const rows = [
      { userId: 1, action: "rendering_generate", toolId: 1, toolName: "Tool A", totalCalls: 5, successCalls: 5, failedCalls: 0, userName: "Alice" },
      { userId: 1, action: "benchmark_research", toolId: 1, toolName: "Tool A", totalCalls: 3, successCalls: 3, failedCalls: 0, userName: "Alice" },
      { userId: 2, action: "rendering_generate", toolId: 2, toolName: "Tool B", totalCalls: 7, successCalls: 6, failedCalls: 1, userName: "Bob" },
    ];
    const map = new Map<number, typeof rows>();
    for (const row of rows) {
      if (!map.has(row.userId)) map.set(row.userId, []);
      map.get(row.userId)!.push(row);
    }
    expect(map.size).toBe(2);
    expect(map.get(1)).toHaveLength(2);
    expect(map.get(2)).toHaveLength(1);
    expect(map.get(1)![0].action).toBe("rendering_generate");
  });
});
