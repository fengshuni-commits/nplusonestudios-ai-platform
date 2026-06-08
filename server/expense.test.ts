import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

// ── Test helpers ──────────────────────────────────────────────────────────────
async function createTestUser(suffix: string) {
  const openId = `test-expense-user-${suffix}-${Date.now()}`;
  const email = `expense-test-${suffix}-${Date.now()}@test.local`;
  const result = await db.createEmailUser({
    email,
    name: `Test User ${suffix}`,
    passwordHash: "hashed",
  });
  return { id: result.id, openId: `email:${email}`, email, name: `Test User ${suffix}` };
}

async function createAdminUser(suffix: string) {
  const openId = `test-expense-admin-${suffix}-${Date.now()}`;
  const email = `expense-admin-${suffix}-${Date.now()}@test.local`;
  const result = await db.createEmailUser({
    email,
    name: `Admin ${suffix}`,
    passwordHash: "hashed",
  });
  // Promote to admin
  const dbConn = await db.getDb();
  if (dbConn) {
    const { users } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    await dbConn.update(users).set({ role: "admin", approved: true }).where(eq(users.id, result.id));
  }
  return { id: result.id, openId: `email:${email}`, email, name: `Admin ${suffix}`, role: "admin" as const };
}

function createContext(user: { id: number; openId: string; name: string; role?: string }) {
  return {
    user: {
      id: user.id,
      openId: user.openId,
      name: user.name,
      email: null,
      role: (user.role ?? "user") as "admin" | "user",
      approved: true,
    },
    req: {} as any,
    res: { cookie: () => {}, clearCookie: () => {} } as any,
  };
}

let testUser: Awaited<ReturnType<typeof createTestUser>>;
let adminUser: Awaited<ReturnType<typeof createAdminUser>>;
let createdReportId: number;

beforeAll(async () => {
  testUser = await createTestUser("main");
  adminUser = await createAdminUser("main");
});

afterAll(async () => {
  // Cleanup: delete test users
  const dbConn = await db.getDb();
  if (dbConn && testUser && adminUser) {
    const { users } = await import("../drizzle/schema");
    const { inArray } = await import("drizzle-orm");
    await dbConn.delete(users).where(inArray(users.id, [testUser.id, adminUser.id]));
  }
});

describe("expense router", () => {
  it("should submit an expense report", async () => {
    const caller = appRouter.createCaller(createContext(testUser));
    const result = await caller.expense.submit({
      purpose: "2026年1月日常交通费",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      items: [
        {
          expenseDate: "2026-01-10",
          category: "transport_local",
          description: "打车去甲方现场",
          amount: 58.5,
        },
        {
          expenseDate: "2026-01-15",
          category: "meals",
          description: "工作餐",
          amount: 120,
        },
      ],
    });
    expect(result.id).toBeTypeOf("number");
    expect(result.totalAmount).toBe(17850); // (58.5 + 120) * 100
    createdReportId = result.id;
  });

  it("should list my expense reports", async () => {
    const caller = appRouter.createCaller(createContext(testUser));
    const result = await caller.expense.list({ mine: true });
    expect(result.reports.length).toBeGreaterThan(0);
    const myReport = result.reports.find((r: any) => r.id === createdReportId);
    expect(myReport).toBeDefined();
    expect(myReport?.status).toBe("submitted");
  });

  it("should get report detail with items", async () => {
    const caller = appRouter.createCaller(createContext(testUser));
    const result = await caller.expense.getById({ id: createdReportId });
    expect(result).toBeDefined();
    expect(result?.items.length).toBe(2);
    expect(result?.purpose).toBe("2026年1月日常交通费");
  });

  it("should deny access to another user's report", async () => {
    const otherUser = await createTestUser("other");
    const caller = appRouter.createCaller(createContext(otherUser));
    await expect(caller.expense.getById({ id: createdReportId })).rejects.toThrow();
    // Cleanup
    const dbConn = await db.getDb();
    if (dbConn) {
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await dbConn.delete(users).where(eq(users.id, otherUser.id));
    }
  });

  it("admin should see all reports", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.expense.list({});
    expect(result.reports.length).toBeGreaterThan(0);
  });

  it("admin should approve an expense report", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    await caller.expense.review({
      id: createdReportId,
      action: "approved",
      reviewNote: "费用合理，予以批准",
    });
    // Verify status changed
    const userCaller = appRouter.createCaller(createContext(testUser));
    const report = await userCaller.expense.getById({ id: createdReportId });
    expect(report?.status).toBe("approved");
  });

  it("admin should get project stats", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.expense.projectStats({ year: 2026 });
    expect(result.byProject).toBeInstanceOf(Array);
    expect(result.byCategory).toBeInstanceOf(Array);
  });

  it("non-admin should not access review procedure", async () => {
    const caller = appRouter.createCaller(createContext(testUser));
    await expect(
      caller.expense.review({ id: createdReportId, action: "approved" })
    ).rejects.toThrow();
  });
});
