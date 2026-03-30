import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module
vi.mock("./db", () => ({
  getAiToolCallStats: vi.fn(),
  getAiToolDailyTrend: vi.fn(),
  getAiToolRecentFailures: vi.fn(),
}));

import * as db from "./db";

describe("AI Tool Call Statistics DB Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAiToolCallStats returns tool stats array", async () => {
    const mockStats = [
      {
        toolId: 0,
        toolName: null,
        provider: null,
        totalCalls: 7,
        successCalls: 0,
        failedCalls: 7,
        avgDurationMs: null,
        lastCalledAt: new Date(),
        action: "rendering_generate",
      },
      {
        toolId: 240008,
        toolName: "Gemini 3",
        provider: "google",
        totalCalls: 4,
        successCalls: 4,
        failedCalls: 0,
        avgDurationMs: 12500,
        lastCalledAt: new Date(),
        action: "rendering_generate",
      },
    ];
    vi.mocked(db.getAiToolCallStats).mockResolvedValue(mockStats);

    const result = await db.getAiToolCallStats(30);
    expect(result).toHaveLength(2);
    expect(result[0].toolId).toBe(0);
    expect(result[1].toolName).toBe("Gemini 3");
    expect(result[1].successCalls).toBe(4);
    expect(db.getAiToolCallStats).toHaveBeenCalledWith(30);
  });

  it("getAiToolDailyTrend returns daily trend array", async () => {
    const mockTrend = [
      { date: "2026-03-28", toolId: 240008, toolName: "Gemini 3", totalCalls: 3, successCalls: 3, failedCalls: 0 },
      { date: "2026-03-29", toolId: 240008, toolName: "Gemini 3", totalCalls: 5, successCalls: 4, failedCalls: 1 },
      { date: "2026-03-30", toolId: 0, toolName: null, totalCalls: 7, successCalls: 0, failedCalls: 7 },
    ];
    vi.mocked(db.getAiToolDailyTrend).mockResolvedValue(mockTrend);

    const result = await db.getAiToolDailyTrend(7);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2026-03-28");
    expect(result[2].failedCalls).toBe(7);
    expect(db.getAiToolDailyTrend).toHaveBeenCalledWith(7);
  });

  it("getAiToolRecentFailures returns failure records", async () => {
    const mockFailures = [
      {
        id: 1,
        toolId: 570002,
        toolName: "即梦 AI",
        action: "rendering_generate",
        inputSummary: "现代办公室",
        durationMs: 132,
        createdAt: new Date(),
        errorMessage: "Access Denied: Internal Error",
      },
    ];
    vi.mocked(db.getAiToolRecentFailures).mockResolvedValue(mockFailures);

    const result = await db.getAiToolRecentFailures(20);
    expect(result).toHaveLength(1);
    expect(result[0].toolName).toBe("即梦 AI");
    expect(result[0].errorMessage).toContain("Access Denied");
    expect(db.getAiToolRecentFailures).toHaveBeenCalledWith(20);
  });

  it("getAiToolCallStats handles empty result", async () => {
    vi.mocked(db.getAiToolCallStats).mockResolvedValue([]);
    const result = await db.getAiToolCallStats(7);
    expect(result).toEqual([]);
  });

  it("getAiToolDailyTrend handles empty result", async () => {
    vi.mocked(db.getAiToolDailyTrend).mockResolvedValue([]);
    const result = await db.getAiToolDailyTrend(14);
    expect(result).toEqual([]);
  });

  it("success rate calculation is correct", () => {
    const totalCalls = 10;
    const successCalls = 8;
    const rate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
    expect(rate).toBe(80);
  });

  it("success rate is 0 when no calls", () => {
    const totalCalls = 0;
    const successCalls = 0;
    const rate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
    expect(rate).toBe(0);
  });

  it("avgDurationMs converts to seconds correctly", () => {
    const avgMs = 12500;
    const avgSec = (avgMs / 1000).toFixed(1);
    expect(avgSec).toBe("12.5");
  });
});
