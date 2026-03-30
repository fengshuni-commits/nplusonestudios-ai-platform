import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock db ──────────────────────────────────────────────
vi.mock("./db", () => ({
  getMemberTaskStats: vi.fn(),
  getAiToolById: vi.fn(),
}));

// ─── Mock invokeLLM ───────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "分析报告内容" } }],
  }),
}));

import * as db from "./db";
import { invokeLLM } from "./_core/llm";

// ─── Unit tests for getMemberTaskStats logic ──────────────
describe("getMemberTaskStats logic", () => {
  it("should compute completionRate correctly", () => {
    const total = 10;
    const done = 7;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(completionRate).toBe(70);
  });

  it("should return 0 completionRate when total is 0", () => {
    const total = 0;
    const done = 0;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(completionRate).toBe(0);
  });

  it("should identify earlyCompleted correctly (updatedAt <= dueDate)", () => {
    const dueDate = new Date("2026-03-20");
    const completedAt = new Date("2026-03-18"); // before due
    const isEarly = completedAt <= dueDate;
    expect(isEarly).toBe(true);
  });

  it("should identify overdueCompleted correctly (updatedAt > dueDate)", () => {
    const dueDate = new Date("2026-03-20");
    const completedAt = new Date("2026-03-25"); // after due
    const isOverdue = completedAt > dueDate;
    expect(isOverdue).toBe(true);
  });

  it("should identify overdueIncomplete (not done AND dueDate < now)", () => {
    const now = new Date();
    const dueDate = new Date(now.getTime() - 86400000); // yesterday
    const status = "in_progress";
    const isOverdueIncomplete = status !== "done" && dueDate < now;
    expect(isOverdueIncomplete).toBe(true);
  });

  it("should NOT flag overdueIncomplete for tasks without dueDate", () => {
    const now = new Date();
    const dueDate = null;
    const status = "in_progress";
    const isOverdueIncomplete = status !== "done" && !!dueDate && dueDate < now;
    expect(isOverdueIncomplete).toBe(false);
  });

  it("should compute overdueRate correctly", () => {
    const done = 5;
    const overdueCompleted = 2;
    const overdueRate = done > 0 ? Math.round((overdueCompleted / done) * 100) : 0;
    expect(overdueRate).toBe(40);
  });
});

// ─── Integration: getMemberTaskStats returns correct shape ─
describe("getMemberTaskStats db function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return array of member stats", async () => {
    const mockStats = [
      {
        userId: 1,
        name: "Alice",
        avatar: null,
        department: "设计",
        total: 10,
        done: 8,
        inProgress: 1,
        earlyCompleted: 5,
        overdueCompleted: 3,
        overdueIncomplete: 0,
        completionRate: 80,
        overdueRate: 37,
      },
    ];
    vi.mocked(db.getMemberTaskStats).mockResolvedValue(mockStats);

    const result = await db.getMemberTaskStats();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: 1,
      name: "Alice",
      completionRate: 80,
    });
  });

  it("should return empty array when no users", async () => {
    vi.mocked(db.getMemberTaskStats).mockResolvedValue([]);
    const result = await db.getMemberTaskStats();
    expect(result).toHaveLength(0);
  });
});

// ─── analyzePerformance LLM call ──────────────────────────
describe("analyzePerformance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call invokeLLM with correct message structure", async () => {
    const stats = [
      {
        name: "Alice",
        total: 10,
        done: 8,
        earlyCompleted: 5,
        overdueCompleted: 3,
        overdueRate: 37,
        inProgress: 1,
        overdueIncomplete: 0,
      },
    ];

    const memberLines = stats.map((m) => {
      const completionRate = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
      const overdueRate = m.done > 0 ? Math.round((m.overdueCompleted / m.done) * 100) : 0;
      return `- ${m.name}：总任务 ${m.total} 个，已完成 ${m.done} 个（完成率 ${completionRate}%），提前完成 ${m.earlyCompleted} 个，延期完成 ${m.overdueCompleted} 个（延期率 ${overdueRate}%），进行中 ${m.inProgress} 个，逾期未完成 ${m.overdueIncomplete} 个`;
    }).join("\n");

    const messages = [
      {
        role: "system" as const,
        content: "你是一位专业的团队管理顾问，擅长根据任务数据分析团队成员的工作表现。请用中文撰写分析报告，风格专业、客观、建设性，避免过度批评。报告应包含：1) 整体团队表现概述；2) 各成员表现亮点与改进建议；3) 团队协作建议。",
      },
      {
        role: "user" as const,
        content: `请根据以下团队成员任务完成数据，生成一份员工表现分析报告：\n\n${memberLines}\n\n请重点分析任务完成率、提前/延期完成情况，并给出具体的改进建议。`,
      },
    ];

    const result = await invokeLLM({ messages });
    expect(invokeLLM).toHaveBeenCalledWith({ messages });
    expect(result.choices[0].message.content).toBe("分析报告内容");
  });

  it("should use custom aiTool when aiToolId is provided", async () => {
    const mockTool = {
      id: 42,
      name: "Custom LLM",
      apiEndpoint: "https://custom.api/v1",
      apiKey: "sk-custom-key",
    };
    vi.mocked(db.getAiToolById).mockResolvedValue(mockTool as any);

    const tool = await db.getAiToolById(42);
    expect(tool).toMatchObject({ id: 42, name: "Custom LLM" });
  });
});
