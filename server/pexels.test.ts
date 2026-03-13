import { describe, expect, it } from "vitest";

describe("Pexels API Key", () => {
  it("should be configured in environment", () => {
    // PEXELS_API_KEY is set via webdev_request_secrets
    const key = process.env.PEXELS_API_KEY;
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(5);
  });

  it("should be able to search photos", { timeout: 15000 }, async () => {
    const key = process.env.PEXELS_API_KEY;
    if (!key) {
      console.warn("PEXELS_API_KEY not set, skipping live test");
      return;
    }

    const response = await fetch(
      "https://api.pexels.com/v1/search?query=architecture&per_page=1",
      {
        headers: { Authorization: key },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.photos).toBeDefined();
    expect(Array.isArray(data.photos)).toBe(true);
  });
});
