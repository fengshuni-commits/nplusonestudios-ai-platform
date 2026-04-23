/**
 * keyPool.ts — Weighted Key Pool Manager
 *
 * Strategy:
 *   1. Collect all active, non-cooldown keys (primary + pool keys).
 *   2. Each key has a `weight` (1-10). The primary key defaults to weight 3.
 *      Pool keys default to weight 1.
 *   3. Weighted Random Sampling: pick a key proportional to its weight.
 *      e.g. primary(weight=3) + backup(weight=1) → primary selected 75% of the time.
 *   4. On success: update lastSuccessAt + increment successCount + reset failCount.
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
/** Default weight for the primary key (higher = more likely to be selected) */
const PRIMARY_KEY_DEFAULT_WEIGHT = 3;

export type PoolKey = {
  /** 0 = primary key stored in ai_tools; >0 = id in ai_tool_keys */
  id: number;
  apiKey: string;
  label?: string | null;
  weight: number;
};

/**
 * Pick the next available key using Weighted Random Sampling.
 * Returns null if no keys are available.
 *
 * @param toolId               - The ai_tools.id
 * @param primaryKeyEncrypted  - The ai_tools.apiKeyEncrypted value (may be null)
 * @param primaryWeight        - Weight for the primary key (default 3)
 */
export async function pickKey(
  toolId: number,
  primaryKeyEncrypted: string | null | undefined,
  primaryWeight = PRIMARY_KEY_DEFAULT_WEIGHT
): Promise<PoolKey | null> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  // Collect extra keys from pool table (active only)
  let extraKeys: Array<{
    id: number;
    apiKeyEncrypted: string;
    label: string | null;
    weight: number;
    cooldownUntil: number | null;
    isActive: boolean;
  }> = [];

  if (db) {
    const rows = await db
      .select({
        id: aiToolKeys.id,
        apiKeyEncrypted: aiToolKeys.apiKeyEncrypted,
        label: aiToolKeys.label,
        weight: aiToolKeys.weight,
        cooldownUntil: aiToolKeys.cooldownUntil,
        isActive: aiToolKeys.isActive,
      })
      .from(aiToolKeys)
      .where(and(eq(aiToolKeys.toolId, toolId), eq(aiToolKeys.isActive, true)));
    extraKeys = rows;
  }

  // Build candidate list with weights
  type Candidate = {
    id: number;
    encrypted: string;
    label?: string | null;
    weight: number;
  };
  const candidates: Candidate[] = [];

  // Primary key (id = 0)
  if (primaryKeyEncrypted) {
    candidates.push({
      id: 0,
      encrypted: primaryKeyEncrypted,
      label: "主 Key",
      weight: Math.max(1, primaryWeight),
    });
  }

  // Pool keys (skip if in cooldown)
  for (const k of extraKeys) {
    if (k.cooldownUntil && k.cooldownUntil > now) continue;
    candidates.push({
      id: k.id,
      encrypted: k.apiKeyEncrypted,
      label: k.label,
      weight: Math.max(1, k.weight ?? 1),
    });
  }

  if (candidates.length === 0) return null;

  // Weighted Random Sampling
  const chosen = weightedRandom(candidates);
  if (!chosen) return null;

  const apiKey = decryptApiKey(chosen.encrypted);
  if (!apiKey) return null;

  return { id: chosen.id, apiKey, label: chosen.label, weight: chosen.weight };
}

/**
 * Weighted random selection.
 * Each item's probability = item.weight / totalWeight.
 */
function weightedRandom<T extends { weight: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  // Fallback (floating-point edge case)
  return items[items.length - 1];
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

  // Fetch current successCount to increment atomically
  const rows = await db
    .select({ successCount: aiToolKeys.successCount })
    .from(aiToolKeys)
    .where(eq(aiToolKeys.id, keyId))
    .limit(1);
  const currentSuccess = rows[0]?.successCount ?? 0;

  await db
    .update(aiToolKeys)
    .set({
      lastSuccessAt: now,
      successCount: currentSuccess + 1,
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
    weight: k.weight,
    createdAt: k.createdAt,
    // Mask the key for display
    apiKeyMasked: maskKey(decryptApiKey(k.apiKeyEncrypted)),
  }));
}

export async function addToolKey(
  toolId: number,
  plainApiKey: string,
  label?: string,
  sortOrder?: number,
  weight?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encrypted = encryptApiKey(plainApiKey);
  const result = await db.insert(aiToolKeys).values({
    toolId,
    apiKeyEncrypted: encrypted,
    label: label ?? null,
    sortOrder: sortOrder ?? 0,
    weight: weight !== undefined ? Math.min(10, Math.max(1, weight)) : 1,
  });
  return { id: result[0].insertId };
}

export async function updateToolKey(
  id: number,
  data: {
    label?: string;
    isActive?: boolean;
    sortOrder?: number;
    weight?: number;
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
  if (data.weight !== undefined) update.weight = Math.min(10, Math.max(1, data.weight));
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
