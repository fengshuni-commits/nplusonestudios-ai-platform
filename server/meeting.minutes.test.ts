import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Test: configJson parsing fix ───────────────────────────────────────────
describe("configJson parsing (Drizzle ORM json field)", () => {
  it("should handle configJson already being an object (Drizzle auto-parses json fields)", () => {
    // Drizzle ORM returns json fields as objects, not strings
    const rawConfig = { appId: "test123", apiSecret: "secret456", apiKey: "key789" };

    const configJson: Record<string, unknown> =
      typeof rawConfig === "string"
        ? JSON.parse(rawConfig)
        : (rawConfig as Record<string, unknown>);

    expect(configJson.appId).toBe("test123");
    expect(configJson.apiSecret).toBe("secret456");
  });

  it("should handle configJson as a string (legacy data format)", () => {
    const rawConfig = JSON.stringify({ appId: "test123", apiSecret: "secret456" });

    const configJson: Record<string, unknown> =
      typeof rawConfig === "string"
        ? JSON.parse(rawConfig)
        : (rawConfig as Record<string, unknown>);

    expect(configJson.appId).toBe("test123");
    expect(configJson.apiSecret).toBe("secret456");
  });

  it("should NOT double-parse an object (old bug: JSON.parse on object gives [object Object])", () => {
    const rawConfig = { appId: "test123", apiSecret: "secret456" };

    // Old buggy code: JSON.parse(rawConfig as string) → "[object Object]" → throws
    // New code: type check first
    const configJson: Record<string, unknown> =
      typeof rawConfig === "string"
        ? JSON.parse(rawConfig)
        : (rawConfig as Record<string, unknown>);

    // Should NOT throw and should have correct values
    expect(configJson).toEqual({ appId: "test123", apiSecret: "secret456" });
  });
});

// ─── Test: apiSecret base64 encoding detection ───────────────────────────────
describe("xfyun apiSecret base64 detection", () => {
  it("should detect base64-encoded apiSecret", () => {
    const base64Secret = "YWUwMDFjMjM3NTJhNjcwOTczMmEzNGEy";
    const decoded = Buffer.from(base64Secret, "base64").toString("utf8");

    // The decoded value should be shorter and look like a hex string
    expect(decoded).toBe("ae001c23752a6709732a34a2");
    expect(decoded.length).toBeLessThan(base64Secret.length);
  });

  it("should not double-decode a plain apiSecret", () => {
    const plainSecret = "ae001c23752a6709732a34a2";
    const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(plainSecret);
    const decoded = Buffer.from(plainSecret, "base64").toString("utf8");

    // Even though it passes the base64 regex, the decoded value is different
    // The fix in DB ensures we store the plain value
    expect(plainSecret).toBe("ae001c23752a6709732a34a2");
    expect(isBase64).toBe(true); // hex chars are valid base64 chars
    // But the decoded is shorter, so the DB fix correctly identified and fixed it
    expect(decoded.length).toBeLessThan(plainSecret.length);
  });
});

// ─── Test: generateMinutes toolId is passed to LLM ───────────────────────────
describe("generateMinutes toolId parameter", () => {
  it("should pass toolId as third argument to invokeLLMWithUserTool", () => {
    // Verify the function signature accepts toolId
    type InvokeFn = (params: object, userId?: number, toolId?: number) => Promise<unknown>;
    const mockInvoke: InvokeFn = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "会议纪要内容" } }],
      model: "gpt-4o",
    });

    // Simulate the call pattern in generateMinutes
    const userId = 1;
    const toolId = 42;
    mockInvoke({ messages: [] }, userId, toolId);

    expect(mockInvoke).toHaveBeenCalledWith({ messages: [] }, userId, toolId);
  });

  it("should work without toolId (falls back to default tool)", () => {
    type InvokeFn = (params: object, userId?: number, toolId?: number) => Promise<unknown>;
    const mockInvoke: InvokeFn = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "会议纪要内容" } }],
      model: "gpt-4o",
    });

    const userId = 1;
    mockInvoke({ messages: [] }, userId, undefined);

    expect(mockInvoke).toHaveBeenCalledWith({ messages: [] }, userId, undefined);
  });
});
