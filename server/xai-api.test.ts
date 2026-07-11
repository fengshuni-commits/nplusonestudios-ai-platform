import { describe, it, expect } from "vitest";

describe("xAI API Integration", () => {
  it("should validate xAI API key by making a test request", async () => {
    const apiKey = process.env.XAI_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).toMatch(/^xai-/);

    // Test the API key by making a simple request to xAI API
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4.5",
        input: "Hello",
      }),
    });

    // API key validation: should not return 401 Unauthorized
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);

    // Log response for debugging
    const data = await response.json();
    console.log("xAI API Response:", {
      status: response.status,
      hasOutput: !!data.output_text || !!data.data,
    });
  });
});
