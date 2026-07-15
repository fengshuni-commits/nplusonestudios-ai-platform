import { describe, it, expect } from "vitest";

const API_URL = process.env.BUILDING_CODES_API_URL ?? "http://140.143.202.172:8965";

describe("Building Codes API", () => {
  it("should return stats from /stats endpoint", async () => {
    const resp = await fetch(`${API_URL}/stats`, {
      signal: AbortSignal.timeout(10000),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json() as Record<string, unknown>;
    // The API should return some stats info
    expect(data).toBeDefined();
  }, 15000);

  it("should return search results from /search endpoint", async () => {
    const resp = await fetch(`${API_URL}/search?q=${encodeURIComponent("办公室净高")}&top_k=3`, {
      signal: AbortSignal.timeout(10000),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json() as { results?: unknown[] };
    expect(Array.isArray(data.results)).toBe(true);
    expect((data.results ?? []).length).toBeGreaterThan(0);
  }, 15000);

  it("should return RAG answer from /ask endpoint", async () => {
    const resp = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "办公室净高要求", top_k: 3 }),
      signal: AbortSignal.timeout(20000),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json() as { sources?: unknown[]; total_results?: number };
    expect(Array.isArray(data.sources)).toBe(true);
    expect((data.sources ?? []).length).toBeGreaterThan(0);
  }, 25000);
});
