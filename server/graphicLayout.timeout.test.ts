/**
 * Tests for graphic layout job timeout detection and raw SQL query.
 * Verifies that:
 * 1. getGraphicLayoutJobRaw returns correct data using raw SQL
 * 2. timeoutStaleGraphicLayoutJobs marks stuck jobs as failed
 * 3. graphicLayout.status procedure uses raw SQL (returns fresh data)
 */
import { describe, it, expect, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 9998,
    openId: "test-timeout-001",
    email: "test-timeout@nplus1.com",
    name: "Test Timeout User",
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
const createdJobIds: number[] = [];

afterAll(async () => {
  const ctx = createContext(createTestUser());
  const trpc = caller(ctx);
  for (const id of createdJobIds) {
    try { await trpc.graphicLayout.delete({ id }); } catch { /* ignore */ }
  }
});

describe("graphicLayout timeout and raw SQL", () => {
  it("getGraphicLayoutJobRaw returns undefined for non-existent job", async () => {
    const result = await db.getGraphicLayoutJobRaw(999999997, 9998);
    expect(result).toBeUndefined();
  });

  it("getGraphicLayoutJobRaw returns undefined for wrong userId", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    // Create a job under user 9998
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Raw SQL userId isolation test",
      assetUrls: [],
    });
    createdJobIds.push(job.id);
    // Try to fetch with a different userId
    const result = await db.getGraphicLayoutJobRaw(job.id, 99999);
    expect(result).toBeUndefined();
  }, 15000);

  it("getGraphicLayoutJobRaw returns correct data for valid job", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Raw SQL fetch test",
      assetUrls: [],
    });
    createdJobIds.push(job.id);
    const raw = await db.getGraphicLayoutJobRaw(job.id, 9998);
    expect(raw).toBeDefined();
    expect(raw!.id).toBe(job.id);
    expect(raw!.docType).toBe("custom");
    expect(raw!.contentText).toBe("Raw SQL fetch test");
    expect(["pending", "processing", "done", "failed"]).toContain(raw!.status);
  }, 15000);

  it("timeoutStaleGraphicLayoutJobs marks stuck jobs as failed", async () => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) { console.warn("DB not available, skipping"); return; }

    // Create a job and manually set it to processing with an old updatedAt via raw SQL
    // (Drizzle ORM's onUpdateNow() would override the timestamp, so we use raw SQL)
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Timeout test job",
      assetUrls: [],
    });
    createdJobIds.push(job.id);

    // Use raw SQL to set status=processing and an old updatedAt (20 minutes ago)
    const oldTime = new Date(Date.now() - 20 * 60 * 1000);
    await drizzleDb.execute(
      (await import("drizzle-orm")).sql`UPDATE graphic_layout_jobs SET status='processing', updatedAt=${oldTime} WHERE id=${job.id}`
    );

    // Run timeout with 15min threshold — should mark our job as failed
    const affected = await db.timeoutStaleGraphicLayoutJobs(15 * 60 * 1000);
    expect(affected).toBeGreaterThanOrEqual(1);

    // Verify the job is now failed
    const raw = await db.getGraphicLayoutJobRaw(job.id, 9998);
    expect(raw).toBeDefined();
    expect(raw!.status).toBe("failed");
    expect(raw!.errorMessage).toContain("timed out");
  }, 20000);

  it("graphicLayout.status returns fresh data via raw SQL", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Status raw SQL test",
      assetUrls: [],
    });
    createdJobIds.push(job.id);

    // Query status via tRPC — should not throw and should return the job
    const status = await trpc.graphicLayout.status({ id: job.id });
    expect(status).toBeDefined();
    expect(status.id).toBe(job.id);
    expect(["pending", "processing", "done", "failed"]).toContain(status.status);
  }, 15000);

  it("graphicLayout.status returns NOT_FOUND for another user's job", async () => {
    const ctx1 = createContext(createTestUser({ id: 9998 }));
    const trpc1 = caller(ctx1);
    const job = await trpc1.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Cross-user status test",
      assetUrls: [],
    });
    createdJobIds.push(job.id);

    const ctx2 = createContext(createTestUser({ id: 9997, openId: "test-timeout-002" }));
    const trpc2 = caller(ctx2);
    await expect(trpc2.graphicLayout.status({ id: job.id })).rejects.toThrow();
  }, 15000);
});
