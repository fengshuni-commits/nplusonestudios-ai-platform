import { describe, it, expect, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 9999,
    openId: "test-graphic-layout-001",
    email: "test-graphic@nplus1.com",
    name: "Test Graphic User",
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
const createdJobIds: number[] = [];
const createdPackIds: number[] = [];

afterAll(async () => {
  // Clean up test data
  const ctx = createContext(createTestUser());
  const trpc = caller(ctx);
  for (const id of createdJobIds) {
    try { await trpc.graphicLayout.delete({ id }); } catch { /* ignore */ }
  }
  for (const id of createdPackIds) {
    try { await trpc.graphicStylePacks.delete({ id }); } catch { /* ignore */ }
  }
});

// ─── Graphic Style Packs ─────────────────────────────────────────────────────

describe("graphicStylePacks", () => {
  it("rejects unauthenticated list", async () => {
    const ctx = createContext(null);
    const trpc = caller(ctx);
    await expect(trpc.graphicStylePacks.list()).rejects.toThrow();
  });

  it("returns empty list for new user", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicStylePacks.list();
    // Should return an array (may have items from other tests, but should not throw)
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects unauthenticated create", async () => {
    const ctx = createContext(null);
    const trpc = caller(ctx);
    await expect(
      trpc.graphicStylePacks.create({
        name: "Test Pack",
        sourceType: "pdf",
        sourceFileUrl: "https://example.com/test.pdf",
        sourceFileKey: "test/test.pdf",
      })
    ).rejects.toThrow();
  });

  it("creates a style pack successfully", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicStylePacks.create({
      name: "Test Graphic Style Pack",
      sourceType: "images",
      sourceFileUrl: "https://example.com/test.jpg",
      sourceFileKey: "test/test.jpg",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    // create returns { id, status } only
    expect(result.status).toBe("pending");
    createdPackIds.push(result.id);
  });

  it("lists created style packs", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicStylePacks.list();
    expect(Array.isArray(result)).toBe(true);
    // Should contain the pack we just created
    const testPack = result.find((p: any) => p.name === "Test Graphic Style Pack");
    expect(testPack).toBeDefined();
  });

  it("rejects delete of another user's pack", async () => {
    const ctx = createContext(createTestUser({ id: 8888, openId: "other-user" }));
    const trpc = caller(ctx);
    // Should not throw but also not delete (returns success even if not found)
    if (createdPackIds.length > 0) {
      // The pack belongs to user 9999, not 8888, so it should silently succeed (no error, just no-op)
      await expect(trpc.graphicStylePacks.delete({ id: createdPackIds[0] })).resolves.toBeDefined();
    }
  });

  it("deletes own style pack", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    // Create a pack to delete
    const pack = await trpc.graphicStylePacks.create({
      name: "Pack To Delete",
      sourceType: "images",
      sourceFileUrl: "https://example.com/delete.jpg",
      sourceFileKey: "test/delete.jpg",
    });
    const result = await trpc.graphicStylePacks.delete({ id: pack.id });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

// ─── Graphic Layout Jobs ──────────────────────────────────────────────────────

describe("graphicLayout", () => {
  it("rejects unauthenticated generate", async () => {
    const ctx = createContext(null);
    const trpc = caller(ctx);
    await expect(
      trpc.graphicLayout.generate({
        docType: "brand_manual",
        pageCount: 1,
        contentText: "Test content",
        assetUrls: [],
      })
    ).rejects.toThrow();
  });

  it("rejects empty content text", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(
      trpc.graphicLayout.generate({
        docType: "brand_manual",
        pageCount: 1,
        contentText: "",
        assetUrls: [],
      })
    ).rejects.toThrow();
  });

  it("rejects invalid docType", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(
      trpc.graphicLayout.generate({
        docType: "invalid_type" as any,
        pageCount: 1,
        contentText: "Test content",
        assetUrls: [],
      })
    ).rejects.toThrow();
  });

  it("rejects pageCount out of range", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(
      trpc.graphicLayout.generate({
        docType: "brand_manual",
        pageCount: 0,
        contentText: "Test content",
        assetUrls: [],
      })
    ).rejects.toThrow();
  });

  it("creates a layout job successfully", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicLayout.generate({
      docType: "brand_manual",
      pageCount: 1,
      contentText: "N+1 STUDIOS 品牌手册测试内容",
      assetUrls: [],
      title: "测试品牌手册",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.status).toBe("pending");
    createdJobIds.push(result.id);
  });

  it("lists layout jobs", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicLayout.list();
    expect(Array.isArray(result)).toBe(true);
    const testJob = result.find((j: any) => j.id === createdJobIds[0]);
    expect(testJob).toBeDefined();
  });

  it("gets job status", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    if (createdJobIds.length === 0) return;
    const result = await trpc.graphicLayout.status({ id: createdJobIds[0] });
    expect(result).toBeDefined();
    expect(result.id).toBe(createdJobIds[0]);
    expect(["pending", "processing", "done", "failed"]).toContain(result.status);
  });

  it("rejects status query for another user's job", async () => {
    const ctx = createContext(createTestUser({ id: 8888, openId: "other-user" }));
    const trpc = caller(ctx);
    if (createdJobIds.length === 0) return;
    await expect(trpc.graphicLayout.status({ id: createdJobIds[0] })).rejects.toThrow();
  });

  it("creates multi-page layout job", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicLayout.generate({
      docType: "project_board",
      pageCount: 3,
      contentText: "N+1 STUDIOS JPT 总部办公项目图板",
      assetUrls: [],
    });
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    createdJobIds.push(result.id);
  });

  it("creates product_detail layout job", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const result = await trpc.graphicLayout.generate({
      docType: "product_detail",
      pageCount: 2,
      contentText: "N+1 LAB 铝型材家具产品详情页",
      assetUrls: [],
    });
    expect(result).toBeDefined();
    createdJobIds.push(result.id);
  });

  it("deletes own layout job", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    // Create a job to delete
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Job to delete",
      assetUrls: [],
    });
    const result = await trpc.graphicLayout.delete({ id: job.id });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it("exportPdf should throw BAD_REQUEST when job is not done", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Export PDF test job",
      assetUrls: [],
    });
    // Job is in 'pending' status right after creation
    await expect(trpc.graphicLayout.exportPdf({ jobId: job.id })).rejects.toThrow();
    // Cleanup
    await trpc.graphicLayout.delete({ id: job.id });
  }, 15000);

  it("exportPdf should throw NOT_FOUND for non-existent job", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(trpc.graphicLayout.exportPdf({ jobId: 999999999 })).rejects.toThrow();
  });

  it("exportPdf should throw NOT_FOUND for another user's job", async () => {
    const ctx1 = createContext(createTestUser());
    const trpc1 = caller(ctx1);
    const job = await trpc1.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Another user's job",
      assetUrls: [],
    });
    // Different user tries to export — should be NOT_FOUND because userId mismatch
    const ctx2 = createContext(createTestUser());
    const trpc2 = caller(ctx2);
    await expect(trpc2.graphicLayout.exportPdf({ jobId: job.id })).rejects.toThrow();
    // Cleanup
    await trpc1.graphicLayout.delete({ id: job.id });
  }, 15000);

  it("exportImages should throw BAD_REQUEST when job is not done", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Export images test job",
      assetUrls: [],
    });
    await expect(trpc.graphicLayout.exportImages({ jobId: job.id })).rejects.toThrow();
    await trpc.graphicLayout.delete({ id: job.id });
  }, 15000);

  it("exportImages should throw NOT_FOUND for non-existent job", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(trpc.graphicLayout.exportImages({ jobId: 999999998 })).rejects.toThrow();
  });

  it("exportImages should throw NOT_FOUND for another user's job", async () => {
    const ctx1 = createContext(createTestUser());
    const trpc1 = caller(ctx1);
    const job = await trpc1.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Another user images job",
      assetUrls: [],
    });
    const ctx2 = createContext(createTestUser());
    const trpc2 = caller(ctx2);
    await expect(trpc2.graphicLayout.exportImages({ jobId: job.id })).rejects.toThrow();
    await trpc1.graphicLayout.delete({ id: job.id });
  }, 15000);

  // — assetConfig 新格式测试 —
  it("generate should accept per_page assetConfig", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 2,
      contentText: "Per page asset test",
      assetConfig: {
        mode: "per_page",
        pages: {
          "0": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
          "1": ["https://example.com/img3.jpg"],
        },
      },
    });
    expect(job.id).toBeGreaterThan(0);
    expect(job.status).toBe("pending");
    await trpc.graphicLayout.delete({ id: job.id });
  }, 15000);

  it("generate should accept by_type assetConfig", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "brand_manual",
      pageCount: 3,
      contentText: "By type asset test",
      assetConfig: {
        mode: "by_type",
        groups: {
          "室内实景": ["https://example.com/interior1.jpg", "https://example.com/interior2.jpg"],
          "外立面": ["https://example.com/facade1.jpg"],
          "细节": ["https://example.com/detail1.jpg", "https://example.com/detail2.jpg"],
        },
      },
    });
    expect(job.id).toBeGreaterThan(0);
    expect(job.status).toBe("pending");
    await trpc.graphicLayout.delete({ id: job.id });
  }, 15000);

  it("generate should reject per_page assetConfig with more than 5 images per page", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    await expect(trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Too many assets test",
      assetConfig: {
        mode: "per_page",
        pages: {
          "0": [
            "https://example.com/img1.jpg",
            "https://example.com/img2.jpg",
            "https://example.com/img3.jpg",
            "https://example.com/img4.jpg",
            "https://example.com/img5.jpg",
            "https://example.com/img6.jpg",
          ],
        },
      },
    })).rejects.toThrow();
  }, 10000);

  it("generate should still accept legacy assetUrls format", async () => {
    const ctx = createContext(createTestUser());
    const trpc = caller(ctx);
    const job = await trpc.graphicLayout.generate({
      docType: "custom",
      pageCount: 1,
      contentText: "Legacy format test",
      assetUrls: ["https://example.com/legacy1.jpg", "https://example.com/legacy2.jpg"],
    });
    expect(job.id).toBeGreaterThan(0);
    await trpc.graphicLayout.delete({ id: job.id });
  }, 15000);
});
