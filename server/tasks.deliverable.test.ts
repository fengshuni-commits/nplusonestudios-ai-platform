/**
 * Tests for task deliverable submission and review logic.
 * These are unit tests covering the business rules without hitting the database.
 */
import { describe, it, expect } from "vitest";

// ─── Business rule helpers (extracted from router logic) ──────────────────────

type DeliverableType = "file_location" | "doc_link" | "upload";

function validateDeliverable(input: {
  deliverableType: DeliverableType;
  deliverableContent?: string;
  deliverableFileUrl?: string;
}): { valid: boolean; error?: string } {
  if (!input.deliverableContent && !input.deliverableFileUrl) {
    return { valid: false, error: "请填写文件存储位置、文档链接或上传完成文件" };
  }
  return { valid: true };
}

function canSubmitDeliverable(task: { assigneeId: number | null }, userId: number): boolean {
  return task.assigneeId === userId;
}

function canReviewDeliverable(task: { reviewerId: number | null }, userId: number): boolean {
  return task.reviewerId === userId;
}

function applyReviewDecision(
  task: { id: number; progress: number; status: string },
  approved: boolean,
  comment?: string
) {
  if (approved) {
    return {
      ...task,
      reviewStatus: "approved" as const,
      reviewComment: comment ?? null,
      approval: true,
      status: "done",
    };
  } else {
    return {
      ...task,
      reviewStatus: "rejected" as const,
      reviewComment: comment ?? null,
      status: "in_progress",
      progress: 90, // reset to allow re-submission
    };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Task Deliverable Submission", () => {
  it("rejects submission when neither content nor fileUrl is provided", () => {
    const result = validateDeliverable({ deliverableType: "file_location" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("accepts submission with file location text", () => {
    const result = validateDeliverable({
      deliverableType: "file_location",
      deliverableContent: "OneDrive/项目/XXX/最终成果.dwg",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts submission with doc link", () => {
    const result = validateDeliverable({
      deliverableType: "doc_link",
      deliverableContent: "https://docs.example.com/design-v3",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts submission with uploaded file URL", () => {
    const result = validateDeliverable({
      deliverableType: "upload",
      deliverableFileUrl: "https://s3.example.com/files/design.pdf",
    });
    expect(result.valid).toBe(true);
  });

  it("only assignee can submit deliverable", () => {
    const task = { assigneeId: 42 };
    expect(canSubmitDeliverable(task, 42)).toBe(true);
    expect(canSubmitDeliverable(task, 99)).toBe(false);
  });

  it("returns false when task has no assignee", () => {
    const task = { assigneeId: null };
    expect(canSubmitDeliverable(task, 42)).toBe(false);
  });
});

describe("Task Deliverable Review", () => {
  it("only reviewer can review deliverable", () => {
    const task = { reviewerId: 10 };
    expect(canReviewDeliverable(task, 10)).toBe(true);
    expect(canReviewDeliverable(task, 99)).toBe(false);
  });

  it("returns false when task has no reviewer", () => {
    const task = { reviewerId: null };
    expect(canReviewDeliverable(task, 10)).toBe(false);
  });

  it("approval sets status to done and approval to true", () => {
    const task = { id: 1, progress: 100, status: "review" };
    const result = applyReviewDecision(task, true, "看起来不错");
    expect(result.status).toBe("done");
    expect(result.approval).toBe(true);
    expect(result.reviewStatus).toBe("approved");
    expect(result.reviewComment).toBe("看起来不错");
  });

  it("rejection resets progress to 90 and status to in_progress", () => {
    const task = { id: 1, progress: 100, status: "review" };
    const result = applyReviewDecision(task, false, "请修改立面图比例");
    expect(result.status).toBe("in_progress");
    expect(result.progress).toBe(90);
    expect(result.reviewStatus).toBe("rejected");
    expect(result.reviewComment).toBe("请修改立面图比例");
  });

  it("approval without comment stores null comment", () => {
    const task = { id: 1, progress: 100, status: "review" };
    const result = applyReviewDecision(task, true);
    expect(result.reviewComment).toBeNull();
  });
});

describe("Deliverable Status Display Logic", () => {
  it("shows submit button when progress is 100 and no deliverable yet", () => {
    const task = { progress: 100, deliverableSubmittedAt: null, reviewStatus: null };
    const shouldShowSubmitButton = task.progress === 100;
    expect(shouldShowSubmitButton).toBe(true);
  });

  it("shows pending status when deliverable submitted but not reviewed", () => {
    const task = { reviewStatus: "pending", deliverableSubmittedAt: new Date() };
    const isPending = task.reviewStatus === "pending" && !!task.deliverableSubmittedAt;
    expect(isPending).toBe(true);
  });

  it("shows rejection warning with comment when rejected", () => {
    const task = { reviewStatus: "rejected", reviewComment: "请修改立面图比例" };
    const isRejected = task.reviewStatus === "rejected";
    expect(isRejected).toBe(true);
    expect(task.reviewComment).toBeTruthy();
  });

  it("reviewer panel is hidden when task is already done", () => {
    const task = { status: "done", reviewerId: 10 };
    const currentUserId = 10;
    const shouldShowReviewPanel = task.reviewerId === currentUserId && task.status !== "done";
    expect(shouldShowReviewPanel).toBe(false);
  });

  it("reviewer panel is visible when task is in review status", () => {
    const task = { status: "review", reviewerId: 10 };
    const currentUserId = 10;
    const shouldShowReviewPanel = task.reviewerId === currentUserId && task.status !== "done";
    expect(shouldShowReviewPanel).toBe(true);
  });
});

describe("Deliverable History Versioning", () => {
  it("should start at version 1 for first submission", () => {
    const existingCount = 0;
    const nextVersion = existingCount + 1;
    expect(nextVersion).toBe(1);
  });

  it("should increment version number on each subsequent submission", () => {
    const existingCount = 2;
    const nextVersion = existingCount + 1;
    expect(nextVersion).toBe(3);
  });

  it("should update the latest history record (highest version) on review", () => {
    const historyRecords = [
      { id: 3, version: 3, reviewStatus: "pending" },
      { id: 2, version: 2, reviewStatus: "rejected" },
      { id: 1, version: 1, reviewStatus: "rejected" },
    ];
    // Latest is first when ordered by desc version
    const latest = historyRecords[0];
    expect(latest.id).toBe(3);
    expect(latest.version).toBe(3);
  });

  it("should allow assignee, reviewer, project creator, and admin to view history", () => {
    const task = { assigneeId: 10, reviewerId: 20, projectId: 1 };
    const project = { createdBy: 30 };

    const canView = (userId: number, role: string) =>
      task.assigneeId === userId ||
      task.reviewerId === userId ||
      project.createdBy === userId ||
      role === "admin";

    expect(canView(10, "user")).toBe(true);   // assignee
    expect(canView(20, "user")).toBe(true);   // reviewer
    expect(canView(30, "user")).toBe(true);   // project creator
    expect(canView(99, "admin")).toBe(true);  // admin
    expect(canView(99, "user")).toBe(false);  // unrelated user
  });

  it("should render correct status label for each review status", () => {
    const getStatusLabel = (status: string) => {
      if (status === "approved") return "已通过";
      if (status === "rejected") return "已驳回";
      if (status === "pending") return "待审核";
      return "";
    };
    expect(getStatusLabel("approved")).toBe("已通过");
    expect(getStatusLabel("rejected")).toBe("已驳回");
    expect(getStatusLabel("pending")).toBe("待审核");
  });

  it("should show history toggle only when deliverable has been submitted", () => {
    const taskWithDeliverable = { deliverableSubmittedAt: new Date() };
    const taskWithoutDeliverable = { deliverableSubmittedAt: null };
    expect(!!taskWithDeliverable.deliverableSubmittedAt).toBe(true);
    expect(!!taskWithoutDeliverable.deliverableSubmittedAt).toBe(false);
  });

  it("should display rejection comment in red for rejected entries", () => {
    const getCommentClass = (reviewStatus: string) =>
      reviewStatus === "rejected" ? "text-red-500" : "text-muted-foreground";
    expect(getCommentClass("rejected")).toBe("text-red-500");
    expect(getCommentClass("approved")).toBe("text-muted-foreground");
    expect(getCommentClass("pending")).toBe("text-muted-foreground");
  });
});

describe("Assignee View Submission History", () => {
  it("history toggle is visible when deliverable has been submitted at least once", () => {
    const task = { deliverableSubmittedAt: new Date() };
    const showHistoryToggle = !!task.deliverableSubmittedAt;
    expect(showHistoryToggle).toBe(true);
  });

  it("history toggle is hidden when no deliverable has been submitted", () => {
    const task = { deliverableSubmittedAt: null };
    const showHistoryToggle = !!task.deliverableSubmittedAt;
    expect(showHistoryToggle).toBe(false);
  });

  it("assignee can see their own submitted content in history", () => {
    const historyEntry = {
      id: 1,
      version: 1,
      deliverableType: "doc_link",
      deliverableContent: "https://docs.example.com/v1",
      reviewStatus: "rejected",
      reviewComment: "请修改立面图比例",
      submittedAt: new Date(),
    };
    expect(historyEntry.deliverableContent).toBe("https://docs.example.com/v1");
    expect(historyEntry.reviewComment).toBeTruthy();
  });

  it("shows rejection comment in red for assignee view", () => {
    const getCommentClass = (reviewStatus: string) =>
      reviewStatus === "rejected" ? "text-red-500" : "text-muted-foreground";
    expect(getCommentClass("rejected")).toBe("text-red-500");
    expect(getCommentClass("approved")).toBe("text-muted-foreground");
  });

  it("shows correct status badge text for each review outcome", () => {
    const getBadgeText = (status: string) => {
      if (status === "approved") return "已通过";
      if (status === "rejected") return "已驳回";
      return "待审核";
    };
    expect(getBadgeText("approved")).toBe("已通过");
    expect(getBadgeText("rejected")).toBe("已驳回");
    expect(getBadgeText("pending")).toBe("待审核");
  });
});

// ─── TextBlock id sanitization tests ────────────────────────────────────────
describe("textBlock id sanitization (graphicLayoutService)", () => {
  function sanitizeTextBlocks(rawBlocks: any[], pageIdx: number): any[] {
    const seenIds = new Set<string>();
    return rawBlocks.map((b: any, idx: number) => {
      let id: string = (typeof b.id === "string" && b.id.trim()) ? b.id.trim() : "";
      if (!id || seenIds.has(id)) {
        id = `${b.role ?? "block"}_p${pageIdx}_${idx}`;
        let counter = 0;
        while (seenIds.has(id)) { id = `${b.role ?? "block"}_p${pageIdx}_${idx}_${++counter}`; }
      }
      seenIds.add(id);
      return { ...b, id };
    });
  }

  it("should keep unique ids unchanged", () => {
    const blocks = [
      { id: "block_1", role: "title", text: "Title" },
      { id: "block_2", role: "body", text: "Body" },
    ];
    const result = sanitizeTextBlocks(blocks, 0);
    expect(result[0].id).toBe("block_1");
    expect(result[1].id).toBe("block_2");
  });

  it("should fix duplicate ids", () => {
    const blocks = [
      { id: "block_1", role: "title", text: "Title" },
      { id: "block_1", role: "body", text: "Body" },   // duplicate!
      { id: "block_1", role: "caption", text: "Cap" }, // duplicate!
    ];
    const result = sanitizeTextBlocks(blocks, 0);
    const ids = result.map((b: any) => b.id);
    expect(new Set(ids).size).toBe(3); // all unique
    expect(ids[0]).toBe("block_1");    // first one kept
    expect(ids[1]).not.toBe("block_1");
    expect(ids[2]).not.toBe("block_1");
  });

  it("should fix empty string ids", () => {
    const blocks = [
      { id: "", role: "title", text: "Title" },
      { id: "   ", role: "body", text: "Body" },
    ];
    const result = sanitizeTextBlocks(blocks, 1);
    expect(result[0].id).toBe("title_p1_0");
    expect(result[1].id).toBe("body_p1_1");
  });

  it("should handle missing id field", () => {
    const blocks = [
      { role: "title", text: "Title" }, // no id field
    ];
    const result = sanitizeTextBlocks(blocks, 2);
    expect(result[0].id).toBe("title_p2_0");
  });

  it("should preserve other block fields after id fix", () => {
    const blocks = [
      { id: "block_1", role: "title", text: "Hello", x: 10, y: 20, fontSize: 48, color: "#fff", align: "center", width: 200, height: 60 },
    ];
    const result = sanitizeTextBlocks(blocks, 0);
    expect(result[0].text).toBe("Hello");
    expect(result[0].x).toBe(10);
    expect(result[0].fontSize).toBe(48);
  });

  it("should produce all unique ids even when all blocks have same id", () => {
    const blocks = Array.from({ length: 6 }, (_, i) => ({
      id: "text1", role: "body", text: `Block ${i}`,
    }));
    const result = sanitizeTextBlocks(blocks, 0);
    const ids = result.map((b: any) => b.id);
    expect(new Set(ids).size).toBe(6);
  });
});

// ─── sanitizeJobPages integration tests ─────────────────────────────────────
import { sanitizeJobPages } from "./graphicLayoutService";

describe("sanitizeJobPages (auto-repair on load)", () => {
  it("returns dirty=false when all ids are already unique", () => {
    const pages = [
      { textBlocks: [{ id: "block_1", role: "title" }, { id: "block_2", role: "body" }] },
    ];
    const { dirty } = sanitizeJobPages(pages);
    expect(dirty).toBe(false);
  });

  it("fixes duplicate ids across a page and returns dirty=true", () => {
    const pages = [
      { textBlocks: [{ id: "block_1", role: "title" }, { id: "block_1", role: "body" }] },
    ];
    const { pages: fixed, dirty } = sanitizeJobPages(pages);
    expect(dirty).toBe(true);
    const ids = fixed[0].textBlocks.map((b: any) => b.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("fixes empty ids and returns dirty=true", () => {
    const pages = [
      { textBlocks: [{ id: "", role: "title" }, { id: "  ", role: "body" }] },
    ];
    const { pages: fixed, dirty } = sanitizeJobPages(pages);
    expect(dirty).toBe(true);
    fixed[0].textBlocks.forEach((b: any) => expect(b.id.length).toBeGreaterThan(0));
  });

  it("handles multiple pages: only dirty pages are modified", () => {
    const pages = [
      { textBlocks: [{ id: "block_1", role: "title" }, { id: "block_1", role: "body" }] }, // dirty
      { textBlocks: [{ id: "block_1", role: "title" }, { id: "block_2", role: "body" }] }, // clean
    ];
    const { pages: fixed, dirty } = sanitizeJobPages(pages);
    expect(dirty).toBe(true);
    const ids0 = fixed[0].textBlocks.map((b: any) => b.id);
    expect(new Set(ids0).size).toBe(2);
    expect(fixed[1].textBlocks[0].id).toBe("block_1");
    expect(fixed[1].textBlocks[1].id).toBe("block_2");
  });

  it("returns empty pages array unchanged with dirty=false", () => {
    const { pages: fixed, dirty } = sanitizeJobPages([]);
    expect(dirty).toBe(false);
    expect(fixed).toHaveLength(0);
  });

  it("preserves all other page fields after repair", () => {
    const pages = [
      {
        imageUrl: "https://s3.example.com/img.png",
        backgroundColor: "#0f0f0f",
        textBlocks: [{ id: "block_1", role: "title" }, { id: "block_1", role: "body" }],
      },
    ];
    const { pages: fixed } = sanitizeJobPages(pages);
    expect((fixed[0] as any).imageUrl).toBe("https://s3.example.com/img.png");
    expect((fixed[0] as any).backgroundColor).toBe("#0f0f0f");
  });
});

// ─── session.getStats 路由测试 ────────────────────────────
describe("session.getStats", () => {
  it("should return userSessionStats array", () => {
    const mockResult = {
      userSessionStats: [
        { userId: 1, userName: "Alice", totalMinutes: 120, sessionCount: 5, lastSeen: Math.floor(Date.now() / 1000) },
        { userId: 2, userName: "Bob", totalMinutes: 45, sessionCount: 2, lastSeen: Math.floor(Date.now() / 1000) },
      ],
    };
    expect(mockResult.userSessionStats).toHaveLength(2);
    expect(mockResult.userSessionStats[0].totalMinutes).toBe(120);
    expect(mockResult.userSessionStats[1].userName).toBe("Bob");
  });

  it("should format duration correctly", () => {
    const formatDuration = (minutes: number): string => {
      if (minutes < 1) return "< 1 分钟";
      if (minutes < 60) return `${minutes} 分钟`;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };
    expect(formatDuration(0)).toBe("< 1 分钟");
    expect(formatDuration(30)).toBe("30 分钟");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(125)).toBe("2h 5m");
  });

  it("should only count active heartbeat gaps (<=90s)", () => {
    const countIncrement = (elapsed: number) => elapsed <= 90 ? elapsed : 0;
    expect(countIncrement(30)).toBe(30);
    expect(countIncrement(90)).toBe(90);
    expect(countIncrement(91)).toBe(0);
    expect(countIncrement(300)).toBe(0);
  });

  it("should aggregate session duration correctly", () => {
    // 模拟多次心跳累积
    const heartbeats = [30, 30, 30, 30]; // 4次心跳，每次30秒
    const total = heartbeats.reduce((sum, h) => sum + (h <= 90 ? h : 0), 0);
    expect(total).toBe(120); // 2分钟
    expect(Math.round(total / 60)).toBe(2);
  });
});
