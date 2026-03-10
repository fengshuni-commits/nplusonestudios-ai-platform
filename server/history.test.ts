import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

describe("history", () => {
  it("history.list returns items and total for authenticated user", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.list({ limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("history.list supports module filter", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.list({ module: "benchmark_report", limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    // All items should be of the filtered module
    for (const item of result.items) {
      expect(item.module).toBe("benchmark_report");
    }
  });

  it("history.list works without input (default params)", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.list();
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("history.getById returns undefined for non-existent id", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.getById({ id: 999999 });
    expect(result).toBeUndefined();
  });

  it("history.list requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.list()).rejects.toThrow();
  });

  // New tests for grouped history and edit chain

  it("history.listGrouped returns items and total", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.listGrouped({ limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("history.listGrouped works without input", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.listGrouped();
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
  });

  it("history.listGrouped supports module filter for ai_render", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.listGrouped({ module: "ai_render", limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    // All items should be ai_render
    for (const item of result.items) {
      expect(item.module).toBe("ai_render");
    }
  });

  it("history.listGrouped supports module filter for non-render modules", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.listGrouped({ module: "benchmark_report", limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    for (const item of result.items) {
      expect(item.module).toBe("benchmark_report");
    }
  });

  it("history.listGrouped items have chainLength and latestOutputUrl fields", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.listGrouped({ limit: 10, offset: 0 });
    for (const item of result.items) {
      expect(item).toHaveProperty("chainLength");
      expect(item).toHaveProperty("latestOutputUrl");
      expect(item).toHaveProperty("latestTitle");
      expect(typeof item.chainLength).toBe("number");
      expect(item.chainLength).toBeGreaterThanOrEqual(1);
    }
  });

  it("history.getEditChain returns array for non-existent root", async () => {
    const caller = createAuthCaller();
    const result = await caller.history.getEditChain({ rootId: 999999 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("history.getEditChain requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.getEditChain({ rootId: 1 })).rejects.toThrow();
  });

  it("history.listGrouped requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.listGrouped()).rejects.toThrow();
  });
});
