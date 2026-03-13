import { describe, it, expect } from "vitest";

describe("Freepik API Key validation", () => {
  it("should have FREEPIK_API_KEY set", () => {
    expect(process.env.FREEPIK_API_KEY).toBeTruthy();
    expect(process.env.FREEPIK_API_KEY!.length).toBeGreaterThan(10);
  });

  it("should be able to reach Freepik API with the key", async () => {
    const apiKey = process.env.FREEPIK_API_KEY;
    // Use a lightweight endpoint to validate the key - list tasks
    const response = await fetch(
      "https://api.freepik.com/v1/ai/image-upscaler?per_page=1",
      {
        headers: {
          "x-freepik-api-key": apiKey!,
          Accept: "application/json",
        },
      }
    );
    // 200 = valid key, 401 = invalid key
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 15000);
});
