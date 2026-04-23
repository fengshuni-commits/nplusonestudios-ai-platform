/**
 * keyPool.test.ts
 * Unit tests for the multi-API-key rotation pool.
 *
 * Key design decisions:
 * - Each test uses a unique toolId to avoid round-robin counter interference
 * - getDb mock is set per-test (not cleared globally) to prevent state leakage
 * - drizzle-orm is NOT mocked; instead getDb returns a plain JS spy object
 *   whose methods resolve before drizzle can build SQL
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

// keyPool.ts is at server/_core/keyPool.ts, importing from "../db" = server/db
// This test is at server/keyPool.test.ts, so "./db" = server/db (same module)
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../drizzle/schema", () => ({
  aiToolKeys: {
    id: "id",
    toolId: "toolId",
    isActive: "isActive",
    sortOrder: "sortOrder",
    apiKeyEncrypted: "apiKeyEncrypted",
    label: "label",
    failCount: "failCount",
    cooldownUntil: "cooldownUntil",
    lastSuccessAt: "lastSuccessAt",
    lastFailAt: "lastFailAt",
    successCount: "successCount",
    weight: "weight",
    createdAt: "createdAt",
  },
}));

// Mock drizzle-orm operators to return plain objects (not Symbols)
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ _type: "eq", col, val })),
  and: vi.fn((...args: any[]) => ({ _type: "and", args })),
}));

// keyPool.ts imports from "./crypto" = server/_core/crypto
// From test file at server/keyPool.test.ts, that's "./_core/crypto"
vi.mock("./_core/crypto", () => ({
  decryptApiKey: vi.fn((enc: string | null) => {
    if (!enc) return null;
    return enc.startsWith("enc:") ? enc.slice(4) : enc;
  }),
  encryptApiKey: vi.fn((plain: string) => `enc:${plain}`),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { getDb } from "./db";
import { pickKey, reportSuccess, reportFailure, addToolKey, deleteToolKey } from "./_core/keyPool";

const getDbMock = getDb as ReturnType<typeof vi.fn>;

// ─── Helper: build a fake DB ──────────────────────────────────────────────────
function makeFakeDb(selectRows: any[] = []) {
  // Build a chainable thenable: supports .from().where().limit() and also await directly
  function makeChainable(rows: any[]): any {
    const obj: any = {
      from: vi.fn(() => obj),
      where: vi.fn(() => obj),
      orderBy: vi.fn(() => Promise.resolve(rows)),
      limit: vi.fn(() => Promise.resolve(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return obj;
  }
  const chain = makeChainable(selectRows);

  const updateSetChain = { where: vi.fn().mockResolvedValue(undefined) };
  const updateChain = { set: vi.fn().mockReturnValue(updateSetChain) };
  const insertChain = { values: vi.fn().mockResolvedValue([{ insertId: 99 }]) };
  const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };

  return {
    select: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    _chain: chain,
    _updateChain: updateChain,
    _updateSetChain: updateSetChain,
    _insertChain: insertChain,
    _deleteChain: deleteChain,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
// Use unique toolIds (1000+) to avoid counter collisions with other tests
let tid = 1000;
function nextTid() { return ++tid; }

describe("keyPool", () => {
  beforeEach(() => {
    // Only reset call counts, not implementations
    vi.clearAllMocks();
  });

  // ─── pickKey ───────────────────────────────────────────────────────────────
  describe("pickKey", () => {
    it("returns a key when primary key exists and no extra keys", async () => {
      const id = nextTid();
      getDbMock.mockResolvedValue(makeFakeDb([]));
      const result = await pickKey(id, "enc:sk-primary");
      expect(result).not.toBeNull();
      expect(result?.apiKey).toBe("sk-primary");
      expect(result?.id).toBe(0);
    });

    it("returns null when primary key is null and no extra keys", async () => {
      const id = nextTid();
      getDbMock.mockResolvedValue(makeFakeDb([]));
      const result = await pickKey(id, null);
      expect(result).toBeNull();
    });

    it("returns a valid key when extra active keys exist", async () => {
      const id = nextTid();
      const extraKeys = [
        { id: 10, apiKeyEncrypted: "enc:sk-extra1", label: "E1", sortOrder: 0, cooldownUntil: null, isActive: true, weight: 1 },
      ];
      getDbMock.mockResolvedValue(makeFakeDb(extraKeys));
      const result = await pickKey(id, "enc:sk-primary");
      expect(result?.apiKey).toBeTruthy();
    });

    it("returns weight on the picked primary key", async () => {
      const id = nextTid();
      getDbMock.mockResolvedValue(makeFakeDb([]));
      const result = await pickKey(id, "enc:sk-primary", 5);
      expect(result?.weight).toBe(5);
    });

    it("selects primary key when Math.random returns 0 (first item wins)", async () => {
      const id = nextTid();
      // primary weight=1, extra weight=9 → total=10
      // rand = 0*10 = 0 → primary: rand-=1 → -1 ≤ 0 → primary selected
      const extraKeys = [
        { id: 50, apiKeyEncrypted: "enc:sk-heavy", label: "Heavy", sortOrder: 0, cooldownUntil: null, isActive: true, weight: 9 },
      ];
      getDbMock.mockResolvedValue(makeFakeDb(extraKeys));
      const spy = vi.spyOn(Math, "random").mockReturnValue(0);
      const result = await pickKey(id, "enc:sk-primary", 1);
      spy.mockRestore();
      expect(result?.id).toBe(0);
    });

    it("selects heavy-weight pool key when Math.random returns 0.15", async () => {
      const id = nextTid();
      // primary weight=1, extra weight=9 → total=10
      // rand = 0.15*10 = 1.5 → primary: rand-=1 → 0.5 > 0 → extra: rand-=9 → -8.5 ≤ 0 → extra selected
      const extraKeys = [
        { id: 51, apiKeyEncrypted: "enc:sk-heavy2", label: "Heavy2", sortOrder: 0, cooldownUntil: null, isActive: true, weight: 9 },
      ];
      getDbMock.mockResolvedValue(makeFakeDb(extraKeys));
      const spy = vi.spyOn(Math, "random").mockReturnValue(0.15);
      const result = await pickKey(id, "enc:sk-primary", 1);
      spy.mockRestore();
      expect(result?.id).toBe(51);
      expect(result?.apiKey).toBe("sk-heavy2");
    });

    it("skips extra keys in cooldown, falls back to primary", async () => {
      const id = nextTid();
      const futureTs = Math.floor(Date.now() / 1000) + 3600;
      const extraKeys = [
        { id: 20, apiKeyEncrypted: "enc:sk-cool", label: "C", sortOrder: 0, cooldownUntil: futureTs, isActive: true, weight: 1 },
      ];
      getDbMock.mockResolvedValue(makeFakeDb(extraKeys));
      const result = await pickKey(id, "enc:sk-primary");
      // Cooled extra key is excluded → only primary available
      expect(result?.id).toBe(0);
      expect(result?.apiKey).toBe("sk-primary");
    });

    it("returns null when all keys are in cooldown and no primary", async () => {
      const id = nextTid();
      const futureTs = Math.floor(Date.now() / 1000) + 3600;
      const extraKeys = [
        { id: 30, apiKeyEncrypted: "enc:sk-cool", label: "C", sortOrder: 0, cooldownUntil: futureTs, isActive: true, weight: 1 },
      ];
      getDbMock.mockResolvedValue(makeFakeDb(extraKeys));
      const result = await pickKey(id, null);
      expect(result).toBeNull();
    });
  });

  // ─── reportSuccess ─────────────────────────────────────────────────────────
  describe("reportSuccess", () => {
    it("does NOT call DB for primary key (id=0)", async () => {
      const db = makeFakeDb();
      getDbMock.mockResolvedValue(db);
      await reportSuccess(nextTid(), 0);
      expect(db.update).not.toHaveBeenCalled();
    });

    it("calls DB update for pool key", async () => {
      const db = makeFakeDb();
      getDbMock.mockResolvedValue(db);
      await reportSuccess(nextTid(), 5);
      expect(db.update).toHaveBeenCalled();
    });
  });

  // ─── reportFailure ─────────────────────────────────────────────────────────
  describe("reportFailure", () => {
    it("does NOT call DB for primary key (id=0)", async () => {
      const db = makeFakeDb();
      getDbMock.mockResolvedValue(db);
      await reportFailure(nextTid(), 0);
      expect(db.update).not.toHaveBeenCalled();
    });

    it("increments failCount and sets cooldown for pool key", async () => {
      let capturedSetData: any = null;
      const db = makeFakeDb([{ failCount: 2 }]);
      db.update = vi.fn().mockReturnValue({
        set: vi.fn((data: any) => {
          capturedSetData = data;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      });
      getDbMock.mockResolvedValue(db);

      await reportFailure(nextTid(), 7);
      expect(capturedSetData).not.toBeNull();
      expect(capturedSetData.failCount).toBe(3);
      expect(capturedSetData.cooldownUntil).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("disables key after MAX_FAIL_COUNT (5) failures", async () => {
      let capturedSetData: any = null;
      const db = makeFakeDb([{ failCount: 4 }]);
      db.update = vi.fn().mockReturnValue({
        set: vi.fn((data: any) => {
          capturedSetData = data;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      });
      getDbMock.mockResolvedValue(db);

      await reportFailure(nextTid(), 8);
      expect(capturedSetData?.isActive).toBe(false);
    });
  });

  // ─── addToolKey ────────────────────────────────────────────────────────────
  describe("addToolKey", () => {
    it("encrypts the key and returns insertId", async () => {
      let capturedValues: any = null;
      const db = makeFakeDb();
      db.insert = vi.fn().mockReturnValue({
        values: vi.fn((data: any) => {
          capturedValues = data;
          return Promise.resolve([{ insertId: 42 }]);
        }),
      });
      getDbMock.mockResolvedValue(db);

      const result = await addToolKey(nextTid(), "sk-newkey", "My Key");
      expect(capturedValues?.apiKeyEncrypted).toBe("enc:sk-newkey");
      expect(capturedValues?.label).toBe("My Key");
      expect(result.id).toBe(42);
    });
  });

  // ─── deleteToolKey ─────────────────────────────────────────────────────────
  describe("deleteToolKey", () => {
    it("calls DB delete", async () => {
      const db = makeFakeDb();
      getDbMock.mockResolvedValue(db);
      await deleteToolKey(55);
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
