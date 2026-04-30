/**
 * Tests that apiTokens.list returns the callCount field.
 * Previously callCount was omitted from the return value, causing it to always show 0 in the UI.
 */
import { describe, it, expect, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 9996,
    openId: "test-token-callcount-001",
    email: "test-token@nplus1.com",
    name: "Test Token User",
    loginMethod: "manus",
    role: "user",
    avatar: null,
    department: null,
    approved: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createContext(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller;

describe("apiTokens.list callCount", () => {
  let tokenId: number | undefined;

  afterAll(async () => {
    if (tokenId !== undefined) {
      const ctx = createContext(createTestUser());
      const trpc = caller(ctx);
      try { await trpc.apiTokens.revoke({ tokenId }); } catch { /* ignore */ }
    }
  });

  it("list returns callCount field (not undefined)", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);

    // Generate a token first
    const { tokenPreview } = await trpc.apiTokens.generateOpenClaw({
      name: "callCount test token",
      expiresInDays: 1,
    });

    // List tokens and find our new one
    const tokens = await trpc.apiTokens.list();
    const found = tokens.find(t => t.tokenPreview === tokenPreview);
    expect(found).toBeDefined();

    // callCount should be a number (0 for a brand-new token), NOT undefined
    expect(found!.callCount).toBeDefined();
    expect(typeof found!.callCount).toBe("number");
    expect(found!.callCount).toBe(0);

    tokenId = found!.id;
  }, 15000);

  it("list returns correct callCount after DB update", async () => {
    if (tokenId === undefined) return;

    // Manually bump callCount in DB to simulate API calls
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(process.env.DATABASE_URL!);
    await conn.execute("UPDATE api_tokens SET callCount = 42 WHERE id = ?", [tokenId]);
    await conn.end();

    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const tokens = await trpc.apiTokens.list();
    const found = tokens.find(t => t.id === tokenId);
    expect(found).toBeDefined();
    expect(found!.callCount).toBe(42);
  }, 15000);
});
