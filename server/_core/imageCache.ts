/**
 * In-memory cache for image generation results.
 *
 * Cache key: SHA-256 hash of (toolId + prompt + sorted reference image URLs/hashes)
 * TTL: 1 hour (configurable)
 * Max entries: 200 (LRU eviction)
 *
 * This avoids redundant Gemini API calls when the same prompt + reference images
 * are submitted multiple times within a short window (e.g. repeated testing).
 */

import { createHash } from "crypto";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;

interface CacheEntry {
  url: string;
  modelName?: string;
  createdAt: number;
}

// LRU-style Map: insertion order = access order (we re-insert on hit)
const cache = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key from the generation inputs.
 * Reference images are identified by their URL (or first 64 chars of b64Json as a fingerprint).
 */
export function buildCacheKey(opts: {
  toolId: number | null | undefined;
  prompt: string;
  originalImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }>;
  size?: string;
}): string {
  const parts: string[] = [
    `tool:${opts.toolId ?? "builtin"}`,
    `prompt:${opts.prompt}`,
    `size:${opts.size ?? "default"}`,
  ];

  if (opts.originalImages && opts.originalImages.length > 0) {
    const imgFingerprints = opts.originalImages.map((img) => {
      if (img.url) return `url:${img.url}`;
      if (img.b64Json) return `b64:${img.b64Json.substring(0, 64)}`;
      return "img:unknown";
    });
    parts.push(`imgs:${imgFingerprints.join("|")}`);
  }

  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/**
 * Look up a cached result. Returns null if not found or expired.
 */
export function getCached(key: string): { url: string; modelName?: string } | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.createdAt;
  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  // Re-insert to update LRU order
  cache.delete(key);
  cache.set(key, entry);

  console.log(`[imageCache] HIT key=${key.substring(0, 16)}… age=${Math.round(age / 1000)}s`);
  return { url: entry.url, modelName: entry.modelName };
}

/**
 * Store a generation result in the cache.
 */
export function setCached(
  key: string,
  value: { url: string; modelName?: string }
): void {
  // Evict oldest entries if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, {
    url: value.url,
    modelName: value.modelName,
    createdAt: Date.now(),
  });

  console.log(`[imageCache] SET key=${key.substring(0, 16)}… entries=${cache.size}`);
}

/**
 * Invalidate all cache entries (for testing or manual reset).
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Return current cache stats for monitoring.
 */
export function getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return { size: cache.size, maxSize: MAX_ENTRIES, ttlMs: CACHE_TTL_MS };
}
