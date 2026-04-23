/**
 * keyPool.ts
 *
 * Multi-API-Key rotation pool for AI tools.
 *
 * Strategy:
 *   1. Collect all active keys for a tool: the primary key (ai_tools.apiKeyEncrypted)
 *      plus any extra keys from ai_tool_keys table.
 *   2. Filter out keys that are in cooldown (cooldownUntil > now).
 *   3. Pick the next key in round-robin order (sorted by sortOrder then id).
 *   4. On success: update lastSuccessAt + increment successCount.
 *   5. On failure (429 / 403 / network error): increment failCount, set
 *      cooldownUntil = now + COOLDOWN_SECONDS.  After MAX_FAIL_COUNT
 *      consecutive failures, mark isActive = false.
 *
 * The primary key (stored in ai_tools itself) is represented with id = 0
 * internally and is never written back to ai_tool_keys.
 */

import { getDb } from "../db";
import { aiToolKeys } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { decryptApiKey, encryptApiKey } from "./crypto";

/** Cooldown duration after a failure (seconds) */
const COOLDOWN_SECONDS = 60;
/** After this many consecutive failures, disable the key */
const MAX_FAIL_COUNT = 5;

export type PoolKey = {
  /** 0 = primary key stored in ai_tools; >0 = id in ai_tool_keys */
  id: number;
  apiKey: string;
  label?: string | null;
};

/**
 * Pick the next available key from the pool for a given tool.
 * Returns null if no keys are available (caller should fall back to built-in AI).
 *
 * @param toolId  - The ai_tools.id
 * @param primaryKeyEncrypted - The ai_tools.apiKeyEncrypted value (may be null)
 */
export async function pickKey(
  toolId: number,
  primaryKeyEncrypted: string | null | undefined
): Promise<PoolKey | null> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  // Collect extra keys from pool table
  let extraKeys: Array<{
    id: number;
    apiKeyEncrypted: string;
    label: string | null;
    sortOrder: number;
    cooldownUntil: number | null;
    isActive: boolean;
  }> = [];

  if (db) {
    const rows = await db
      .select()
      .from(aiToolKeys)
      .where(and(eq(aiToolKeys.toolId, toolId), eq(aiToolKeys.isActive, true)))
      .orderBy(aiToolKeys.sortOrder, aiToolKeys.id);
    extraKeys = rows as typeof extraKeys;
  }

  // Build candidate list: primary key first (id=0), then extra keys
  type Candidate = { id: number; encrypted: string; label?: string | null; cooldownUntil?: number | null };
  const candidates: Candidate[] = [];

  if (primaryKeyEncrypted) {
    candidates.push({ id: 0, encrypted: primaryKeyEncrypted, label: "主 Key" });
  }

  for (const k of extraKeys) {
    // Skip if in cooldown
    if (k.cooldownUntil && k.cooldownUntil > now) continue;
    candidates.push({ id: k.id, encrypted: k.apiKeyEncrypted, label: k.label });
  }

  if (candidates.length === 0) return null;

  // Simple round-robin: use a per-process in-memory counter per toolId
  const idx = getNextIndex(toolId, candidates.length);
  const chosen = candidates[idx];

  const apiKey = decryptApiKey(chosen.encrypted);
  if (!apiKey) return null;

  return { id: chosen.id, apiKey, label: chosen.label };
}

/**
 * Report a successful call for a pool key.
 * @param toolId - The ai_tools.id (used for logging only)
 * @param keyId  - The ai_tool_keys.id (0 = primary key, skip DB update)
 */
export async function reportSuccess(toolId: number, keyId: number): Promise<void> {
  if (keyId === 0) return; // primary key not tracked in pool table
  const db = await getDb();
  if (!db) return;
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(aiToolKeys)
    .set({
      lastSuccessAt: now,
      failCount: 0,
      cooldownUntil: null,
    })
    .where(eq(aiToolKeys.id, keyId));
}

/**
 * Report a failed call for a pool key.
 * Applies cooldown and disables the key after MAX_FAIL_COUNT failures.
 * @param toolId - The ai_tools.id (used for logging only)
 * @param keyId  - The ai_tool_keys.id (0 = primary key, skip DB update)
 */
export async function reportFailure(toolId: number, keyId: number): Promise<void> {
  if (keyId === 0) return; // primary key not tracked in pool table
  const db = await getDb();
  if (!db) return;
  const now = Math.floor(Date.now() / 1000);
  const cooldownUntil = now + COOLDOWN_SECONDS;

  // Fetch current failCount
  const rows = await db
    .select({ failCount: aiToolKeys.failCount })
    .from(aiToolKeys)
    .where(eq(aiToolKeys.id, keyId))
    .limit(1);

  const currentFail = rows[0]?.failCount ?? 0;
  const newFail = currentFail + 1;

  await db
    .update(aiToolKeys)
    .set({
      failCount: newFail,
      lastFailAt: now,
      cooldownUntil,
      isActive: newFail < MAX_FAIL_COUNT,
    })
    .where(eq(aiToolKeys.id, keyId));
}

// ─── In-memory round-robin counter ───────────────────────────────────────────
const _counters = new Map<number, number>();

function getNextIndex(toolId: number, total: number): number {
  if (total === 0) return 0;
  const current = _counters.get(toolId) ?? 0;
  const next = (current + 1) % total;
  _counters.set(toolId, next);
  return next;
}

// ─── DB helpers for CRUD (used by routers) ───────────────────────────────────

export async function listToolKeys(toolId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(aiToolKeys)
    .where(eq(aiToolKeys.toolId, toolId))
    .orderBy(aiToolKeys.sortOrder, aiToolKeys.id);
  return rows.map((k) => ({
    id: k.id,
    toolId: k.toolId,
    label: k.label,
    isActive: k.isActive,
    failCount: k.failCount,
    successCount: k.successCount,
    lastSuccessAt: k.lastSuccessAt,
    lastFailAt: k.lastFailAt,
    cooldownUntil: k.cooldownUntil,
    sortOrder: k.sortOrder,
    createdAt: k.createdAt,
    // Mask the key for display
    apiKeyMasked: maskKey(decryptApiKey(k.apiKeyEncrypted)),
  }));
}

export async function addToolKey(
  toolId: number,
  plainApiKey: string,
  label?: string,
  sortOrder?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encrypted = encryptApiKey(plainApiKey);
  const result = await db.insert(aiToolKeys).values({
    toolId,
    apiKeyEncrypted: encrypted,
    label: label ?? null,
    sortOrder: sortOrder ?? 0,
  });
  return { id: result[0].insertId };
}

export async function updateToolKey(
  id: number,
  data: {
    label?: string;
    isActive?: boolean;
    sortOrder?: number;
    plainApiKey?: string;
  }
) {
  const db = await getDb();
  if (!db) return;
  const update: Record<string, unknown> = {};
  if (data.label !== undefined) update.label = data.label;
  if (data.isActive !== undefined) {
    update.isActive = data.isActive;
    // Reset fail count when re-enabling
    if (data.isActive) {
      update.failCount = 0;
      update.cooldownUntil = null;
    }
  }
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.plainApiKey) {
    update.apiKeyEncrypted = encryptApiKey(data.plainApiKey);
    update.failCount = 0;
    update.cooldownUntil = null;
  }
  await db.update(aiToolKeys).set(update).where(eq(aiToolKeys.id, id));
}

export async function deleteToolKey(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(aiToolKeys).where(eq(aiToolKeys.id, id));
}

function maskKey(key: string | null): string {
  if (!key) return "（解密失败）";
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(Math.max(4, key.length - 8)) + key.slice(-4);
}
