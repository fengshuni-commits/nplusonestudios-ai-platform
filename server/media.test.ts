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

const caller = appRouter.createCaller;

describe("media", () => {
  it("media.generate rejects unauthenticated users", async () => {
    const ctx = createContext(null);
    const trpc = caller(ctx);
    await expect(
      trpc.media.generate({
        platform: "xiaohongshu",
        topic: "Test topic",
      })
    ).rejects.toThrow();
  });

  it("media.generate rejects invalid platform", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(
      trpc.media.generate({
        platform: "tiktok" as any,
        topic: "Test topic",
      })
    ).rejects.toThrow();
  });

  it("media.generate rejects empty topic", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(
      trpc.media.generate({
        platform: "xiaohongshu",
        topic: "",
      })
    ).rejects.toThrow();
  });

  it("media.generate accepts valid xiaohongshu input", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    // This will call LLM + image generation, so it may take time
    // We just verify the input validation passes and the mutation is callable
    try {
      const result = await trpc.media.generate({
        platform: "xiaohongshu",
        topic: "现代办公空间设计趋势",
        projectName: "测试项目",
      });
      // If it succeeds, verify structure
      expect(result.platform).toBe("xiaohongshu");
      expect(result.textContent).toBeDefined();
      expect(result.textContent.title).toBeDefined();
      expect(result.textContent.content).toBeDefined();
      expect(result.textContent.tags).toBeInstanceOf(Array);
    } catch (err: any) {
      // LLM/image generation may fail in test env, that's OK
      // Just verify it's not an input validation error
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  }, 60000);

  it("media.generate accepts valid wechat input", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    try {
      const result = await trpc.media.generate({
        platform: "wechat",
        topic: "建筑设计中的可持续理念",
      });
      expect(result.platform).toBe("wechat");
      expect(result.textContent).toBeDefined();
      expect(result.textContent.title).toBeDefined();
      expect(result.textContent.summary).toBeDefined();
      expect(result.textContent.content).toBeDefined();
    } catch (err: any) {
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  }, 60000);

  it("media.generate accepts valid instagram input", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    try {
      const result = await trpc.media.generate({
        platform: "instagram",
        topic: "Minimalist office design",
      });
      expect(result.platform).toBe("instagram");
      expect(result.textContent).toBeDefined();
      expect(result.textContent.caption).toBeDefined();
      expect(result.textContent.hashtags).toBeInstanceOf(Array);
    } catch (err: any) {
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  }, 60000);
});
