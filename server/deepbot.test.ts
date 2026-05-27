/**
 * Test: DeepBot provider detection in generateImageWithTool
 * Validates that the deepbot provider is correctly identified from the API endpoint.
 */
import { describe, it, expect } from "vitest";

// Mirror the provider detection logic from generateImageWithTool.ts
function detectProvider(apiEndpoint: string, explicitProvider?: string): string {
  if (explicitProvider) return explicitProvider.toLowerCase();
  const ep = apiEndpoint || "";
  if (ep.includes("dashscope.aliyuncs.com")) return "qwen";
  if (ep.includes("generativelanguage.googleapis.com")) return "gemini";
  if (ep.includes("deepbot.plus")) return "deepbot";
  if (ep.includes("api.openai.com")) return "openai";
  return "unknown";
}

// Mirror the DeepBot size validation logic
const DEEPBOT_VALID_SIZES = ["1024x1024", "1024x768", "768x1024", "1672x941", "941x1672"];
function resolveDeepbotSize(size?: string): string {
  return size && DEEPBOT_VALID_SIZES.includes(size) ? size : "1024x1024";
}

describe("DeepBot provider detection", () => {
  it("detects deepbot from endpoint URL", () => {
    expect(detectProvider("https://deepbot.plus/tool/gpt4/v1/images/generations")).toBe("deepbot");
  });

  it("does not detect deepbot for openai endpoint", () => {
    expect(detectProvider("https://api.openai.com/v1/images/generations")).toBe("openai");
  });

  it("does not detect deepbot for gemini endpoint", () => {
    expect(detectProvider("https://generativelanguage.googleapis.com/v1beta")).toBe("gemini");
  });

  it("respects explicit provider override", () => {
    expect(detectProvider("https://deepbot.plus/tool/gpt4/v1/images/generations", "openai")).toBe("openai");
  });
});

describe("DeepBot size validation", () => {
  it("accepts valid 1:1 size", () => {
    expect(resolveDeepbotSize("1024x1024")).toBe("1024x1024");
  });

  it("accepts valid 4:3 size", () => {
    expect(resolveDeepbotSize("1024x768")).toBe("1024x768");
  });

  it("accepts valid 3:4 size", () => {
    expect(resolveDeepbotSize("768x1024")).toBe("768x1024");
  });

  it("accepts valid 16:9 size", () => {
    expect(resolveDeepbotSize("1672x941")).toBe("1672x941");
  });

  it("accepts valid 9:16 size", () => {
    expect(resolveDeepbotSize("941x1672")).toBe("941x1672");
  });

  it("falls back to 1024x1024 for invalid size", () => {
    expect(resolveDeepbotSize("2048x2048")).toBe("1024x1024");
  });

  it("falls back to 1024x1024 for undefined size", () => {
    expect(resolveDeepbotSize(undefined)).toBe("1024x1024");
  });
});
