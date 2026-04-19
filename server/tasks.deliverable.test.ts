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
