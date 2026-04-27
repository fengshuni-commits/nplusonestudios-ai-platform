/**
 * Tests for task completion tracking logic.
 * Covers completedAt auto-set, clear-on-revert, and completion status calculation.
 */
import { describe, it, expect } from "vitest";

// ─── Business rule helpers (mirrors db.ts updateTask logic) ───────────────────

type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";

interface TaskUpdate {
  status?: TaskStatus;
  completedAt?: Date | null;
  [key: string]: unknown;
}

function applyCompletionTracking(
  existing: { completedAt: Date | null },
  data: TaskUpdate
): TaskUpdate {
  const updateData = { ...data } as TaskUpdate;
  if (data.status === "done" && !updateData.completedAt) {
    if (!existing.completedAt) {
      updateData.completedAt = new Date();
    }
  } else if (data.status && data.status !== "done") {
    updateData.completedAt = null;
  }
  return updateData;
}

// ─── Completion status label calculation ─────────────────────────────────────

function getCompletionLabel(dueDate: Date, completedAt: Date): string {
  const diff = Math.ceil((completedAt.getTime() - dueDate.getTime()) / 86400000);
  if (diff < 0) return `提前 ${Math.abs(diff)} 天`;
  if (diff === 0) return "准时完成";
  return `超期 ${diff} 天完成`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Task completedAt auto-tracking", () => {
  it("sets completedAt when status changes to done and no existing completedAt", () => {
    const before = Date.now();
    const result = applyCompletionTracking(
      { completedAt: null },
      { status: "done" }
    );
    const after = Date.now();
    expect(result.completedAt).toBeInstanceOf(Date);
    expect((result.completedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((result.completedAt as Date).getTime()).toBeLessThanOrEqual(after);
  });

  it("does NOT overwrite completedAt if already set (preserves original completion time)", () => {
    const original = new Date("2026-01-01T10:00:00Z");
    const result = applyCompletionTracking(
      { completedAt: original },
      { status: "done" }
    );
    // completedAt should not be changed (no override in updateData)
    expect(result.completedAt).toBeUndefined();
  });

  it("clears completedAt when status reverts from done to in_progress", () => {
    const result = applyCompletionTracking(
      { completedAt: new Date("2026-01-01T10:00:00Z") },
      { status: "in_progress" }
    );
    expect(result.completedAt).toBeNull();
  });

  it("clears completedAt when status reverts to review", () => {
    const result = applyCompletionTracking(
      { completedAt: new Date("2026-01-01T10:00:00Z") },
      { status: "review" }
    );
    expect(result.completedAt).toBeNull();
  });

  it("does not touch completedAt when updating non-status fields", () => {
    const result = applyCompletionTracking(
      { completedAt: null },
      { progress: 50 } as TaskUpdate
    );
    expect(result.completedAt).toBeUndefined();
  });
});

describe("Completion status label", () => {
  it("returns 提前 N 天 when completed before due date", () => {
    const dueDate = new Date("2026-04-30");
    const completedAt = new Date("2026-04-27"); // 3 days early
    expect(getCompletionLabel(dueDate, completedAt)).toBe("提前 3 天");
  });

  it("returns 准时完成 when completed on the due date", () => {
    // diff = ceil((completedAt - dueDate) / 86400000) === 0
    const dueDate = new Date("2026-04-27T00:00:00Z");
    const completedAt = new Date("2026-04-27T00:00:00Z"); // exactly same time
    expect(getCompletionLabel(dueDate, completedAt)).toBe("准时完成");
  });

  it("returns 超期 N 天完成 when completed after due date", () => {
    const dueDate = new Date("2026-04-20");
    const completedAt = new Date("2026-04-27"); // 7 days late
    expect(getCompletionLabel(dueDate, completedAt)).toBe("超期 7 天完成");
  });

  it("returns 提前 1 天 when completed exactly one day early", () => {
    const dueDate = new Date("2026-04-28T00:00:00Z");
    const completedAt = new Date("2026-04-27T00:00:00Z");
    expect(getCompletionLabel(dueDate, completedAt)).toBe("提前 1 天");
  });
});
