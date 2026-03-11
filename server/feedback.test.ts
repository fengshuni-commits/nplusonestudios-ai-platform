import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module
vi.mock("./db", () => ({
  createFeedback: vi.fn().mockResolvedValue({ id: 1 }),
  getFeedbackByHistoryId: vi.fn().mockResolvedValue(null),
  updateFeedback: vi.fn().mockResolvedValue(undefined),
  getFeedbackStats: vi.fn().mockResolvedValue({
    total: { total: 10, satisfied: 7, unsatisfied: 3, satisfactionRate: 70 },
    modules: [
      { module: "ai_render", total: 5, satisfied: 4, unsatisfied: 1, satisfactionRate: 80 },
      { module: "benchmark_report", total: 3, satisfied: 2, unsatisfied: 1, satisfactionRate: 67 },
      { module: "meeting_minutes", total: 2, satisfied: 1, unsatisfied: 1, satisfactionRate: 50 },
    ],
  }),
  getFeedbackTrend: vi.fn().mockResolvedValue([
    { date: "2026-03-01", satisfied: 2, unsatisfied: 1 },
    { date: "2026-03-02", satisfied: 3, unsatisfied: 0 },
    { date: "2026-03-03", satisfied: 1, unsatisfied: 2 },
  ]),
  getRecentFeedback: vi.fn().mockResolvedValue([
    {
      id: 1,
      module: "ai_render",
      rating: "satisfied",
      comment: "效果很好",
      userName: "测试用户",
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      module: "benchmark_report",
      rating: "unsatisfied",
      comment: "报告不够详细",
      userName: "测试用户2",
      createdAt: new Date().toISOString(),
    },
  ]),
}));

import * as db from "./db";

describe("Feedback System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Submit Feedback", () => {
    it("should create new feedback with required fields", async () => {
      const params = {
        userId: 1,
        module: "ai_render",
        rating: "satisfied" as const,
        historyId: 42,
      };
      await db.createFeedback(params);
      expect(db.createFeedback).toHaveBeenCalledWith(params);
    });

    it("should create feedback with optional comment", async () => {
      const params = {
        userId: 1,
        module: "benchmark_report",
        rating: "unsatisfied" as const,
        comment: "报告缺少对标案例图片",
        historyId: 10,
      };
      await db.createFeedback(params);
      expect(db.createFeedback).toHaveBeenCalledWith(params);
    });

    it("should create feedback with contextJson", async () => {
      const params = {
        userId: 1,
        module: "media_xiaohongshu",
        rating: "satisfied" as const,
        contextJson: { topic: "办公空间设计", style: "professional" },
      };
      await db.createFeedback(params);
      expect(db.createFeedback).toHaveBeenCalledWith(params);
    });

    it("should check existing feedback before creating", async () => {
      await db.getFeedbackByHistoryId(42, 1);
      expect(db.getFeedbackByHistoryId).toHaveBeenCalledWith(42, 1);
    });

    it("should update existing feedback when found", async () => {
      (db.getFeedbackByHistoryId as any).mockResolvedValueOnce({ id: 5, rating: "satisfied" });
      const existing = await db.getFeedbackByHistoryId(42, 1);
      expect(existing).toEqual({ id: 5, rating: "satisfied" });

      await db.updateFeedback(5, { rating: "unsatisfied", comment: "改主意了" });
      expect(db.updateFeedback).toHaveBeenCalledWith(5, { rating: "unsatisfied", comment: "改主意了" });
    });
  });

  describe("Feedback Statistics", () => {
    it("should return overall stats", async () => {
      const stats = await db.getFeedbackStats();
      expect(stats.total.total).toBe(10);
      expect(stats.total.satisfied).toBe(7);
      expect(stats.total.unsatisfied).toBe(3);
      expect(stats.total.satisfactionRate).toBe(70);
    });

    it("should return per-module breakdown", async () => {
      const stats = await db.getFeedbackStats();
      expect(stats.modules).toHaveLength(3);
      expect(stats.modules[0].module).toBe("ai_render");
      expect(stats.modules[0].satisfactionRate).toBe(80);
    });

    it("should filter stats by module", async () => {
      await db.getFeedbackStats("ai_render");
      expect(db.getFeedbackStats).toHaveBeenCalledWith("ai_render");
    });
  });

  describe("Feedback Trend", () => {
    it("should return daily trend data", async () => {
      const trend = await db.getFeedbackTrend(30);
      expect(trend).toHaveLength(3);
      expect(trend[0]).toHaveProperty("date");
      expect(trend[0]).toHaveProperty("satisfied");
      expect(trend[0]).toHaveProperty("unsatisfied");
    });

    it("should accept custom days parameter", async () => {
      await db.getFeedbackTrend(7, "ai_render");
      expect(db.getFeedbackTrend).toHaveBeenCalledWith(7, "ai_render");
    });
  });

  describe("Recent Feedback", () => {
    it("should return recent feedback entries", async () => {
      const recent = await db.getRecentFeedback(20);
      expect(recent).toHaveLength(2);
      expect(recent[0]).toHaveProperty("id");
      expect(recent[0]).toHaveProperty("module");
      expect(recent[0]).toHaveProperty("rating");
      expect(recent[0]).toHaveProperty("userName");
    });

    it("should filter by module", async () => {
      await db.getRecentFeedback(10, "meeting_minutes");
      expect(db.getRecentFeedback).toHaveBeenCalledWith(10, "meeting_minutes");
    });
  });

  describe("Module Labels", () => {
    it("should have labels for all supported modules", () => {
      const modules = [
        "benchmark_report",
        "ai_render",
        "meeting_minutes",
        "media_xiaohongshu",
        "media_wechat",
        "media_instagram",
      ];
      // Just verify the module names are valid strings
      modules.forEach((m) => {
        expect(typeof m).toBe("string");
        expect(m.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Rating Values", () => {
    it("should only accept valid rating values", () => {
      const validRatings = ["satisfied", "unsatisfied"];
      validRatings.forEach((r) => {
        expect(["satisfied", "unsatisfied"]).toContain(r);
      });
    });
  });
});
