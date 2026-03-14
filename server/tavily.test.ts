import { describe, it, expect } from "vitest";

describe("Tavily API Key validation", () => {
  it("should have TAVILY_API_KEY set", () => {
    const key = process.env.TAVILY_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key?.startsWith("tvly-")).toBe(true);
  });

  it("should successfully call Tavily search API", async () => {
    const key = process.env.TAVILY_API_KEY;
    if (!key) {
      throw new Error("TAVILY_API_KEY not set");
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: "ArchDaily office design",
        max_results: 1,
        search_depth: "basic",
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as { results: unknown[] };
    expect(Array.isArray(data.results)).toBe(true);
  }, 20000);
});
