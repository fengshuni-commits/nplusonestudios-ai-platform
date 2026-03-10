import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ───────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-001",
    email: "test@nplus1.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createContext(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthCaller() {
  const user = createTestUser();
  const ctx = createContext(user);
  return appRouter.createCaller(ctx);
}

// ─── Async PPT Export Tests ─────────────────────────────────

describe("benchmark.startExportPpt", () => {
  it("should return a jobId immediately without blocking", async () => {
    const caller = createAuthCaller();
    const result = await caller.benchmark.startExportPpt({
      content: "# Test Report\n\nThis is a test benchmark report with case studies.",
      title: "Test Project",
      projectType: "office",
    });

    expect(result).toHaveProperty("jobId");
    expect(typeof result.jobId).toBe("string");
    expect(result.jobId.length).toBeGreaterThan(0);
  });

  it("should create a job that can be polled via exportPptStatus", async () => {
    const caller = createAuthCaller();
    const { jobId } = await caller.benchmark.startExportPpt({
      content: "# Test Report\n\nSome content for PPT generation.",
      title: "Poll Test",
    });

    // Immediately check status - should be processing
    const status = await caller.benchmark.exportPptStatus({ jobId });
    expect(["processing", "done"]).toContain(status.status);
    if (status.status === "processing") {
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.stage).toBeTruthy();
    }
  });

  it("should return not_found for unknown jobId", async () => {
    const caller = createAuthCaller();
    const status = await caller.benchmark.exportPptStatus({ jobId: "nonexistent-job-id" });
    expect(status.status).toBe("not_found");
    expect(status.progress).toBe(0);
  });
});

describe("benchmark.exportPptStatus polling", () => {
  it("should eventually complete or stay in processing state", async () => {
    const caller = createAuthCaller();
    const { jobId } = await caller.benchmark.startExportPpt({
      content: "# Minimal Report\n\nA brief report.",
      title: "Quick Test",
    });

    // Poll a few times with short delays
    let lastStatus: any = null;
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      lastStatus = await caller.benchmark.exportPptStatus({ jobId });
      if (lastStatus.status === "done" || lastStatus.status === "failed") break;
    }

    // After a few polls, it should still be a valid status
    expect(["processing", "done", "failed"]).toContain(lastStatus.status);
  }, 15000);
});
