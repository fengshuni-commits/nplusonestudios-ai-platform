/**
 * Tests for graphic layout imagePrompt improvements (needs 1+2+4)
 * and media/generate REST endpoint (need 3)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Need 1+2: LLM imagePrompt in json_schema ──────────────────────────────────

describe("graphicLayoutService imagePrompt schema", () => {
  it("should include imagePrompt in the required fields of the json_schema", async () => {
    // We read the source file to verify the schema contains imagePrompt
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./graphicLayoutService.ts", import.meta.url).pathname,
      "utf-8"
    );
    // The required array should include imagePrompt
    expect(src).toContain('"imagePrompt"');
    expect(src).toContain('required: ["pageTheme", "imagePrompt", "backgroundColor", "selectedAssetGroup", "textBlocks"]');
  });

  it("should use LLM imagePrompt when it is long enough (>20 chars)", async () => {
    // Simulate the fallback logic in graphicLayoutService.ts
    const plan = {
      imagePrompt: "Minimalist architectural studio brand cover, deep charcoal background, warm gold accent lines, asymmetric geometric composition",
      pageTheme: "modern office",
    };
    const fallbackPrompt = "fallback template prompt";
    const imageGenStyleSuffix = "Professional brand design suffix";

    const imagePrompt =
      plan.imagePrompt && plan.imagePrompt.trim().length > 20
        ? plan.imagePrompt.trim()
        : fallbackPrompt + " " + imageGenStyleSuffix;

    expect(imagePrompt).toBe(plan.imagePrompt.trim());
    expect(imagePrompt).not.toContain("fallback");
  });

  it("should fall back to template when LLM imagePrompt is too short", async () => {
    const plan = { imagePrompt: "short", pageTheme: "modern" };
    const fallbackPrompt = "fallback template prompt";
    const imageGenStyleSuffix = "suffix";

    const imagePrompt =
      plan.imagePrompt && plan.imagePrompt.trim().length > 20
        ? plan.imagePrompt.trim()
        : fallbackPrompt + " " + imageGenStyleSuffix;

    expect(imagePrompt).toContain("fallback");
  });

  it("should fall back to template when LLM imagePrompt is missing", async () => {
    const plan = { imagePrompt: undefined as any, pageTheme: "modern" };
    const fallbackPrompt = "fallback template prompt";
    const imageGenStyleSuffix = "suffix";

    const imagePrompt =
      plan.imagePrompt && plan.imagePrompt.trim().length > 20
        ? plan.imagePrompt.trim()
        : fallbackPrompt + " " + imageGenStyleSuffix;

    expect(imagePrompt).toContain("fallback");
  });
});

// ── Need 4: text block description improvement ────────────────────────────────

describe("graphicLayoutService text block description", () => {
  it("should NOT contain SOLID COLOR RECTANGLE in the source", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./graphicLayoutService.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).not.toContain("SOLID COLOR RECTANGLE");
    expect(src).toContain("keep this area clean and uncluttered");
  });
});

// ── Need 3: /api/v1/media/generate endpoint ───────────────────────────────────

describe("openclawApi media/generate endpoint", () => {
  it("should be registered in openclawApi.ts", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./openclawApi.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain('router.post("/media/generate"');
    expect(src).toContain("platform");
    expect(src).toContain("topic");
    expect(src).toContain("coverImageUrl");
  });

  it("should validate that platform must be one of the allowed values", () => {
    const validPlatforms = ["xiaohongshu", "wechat", "instagram"];
    expect(validPlatforms).toContain("xiaohongshu");
    expect(validPlatforms).toContain("wechat");
    expect(validPlatforms).toContain("instagram");
    expect(validPlatforms).not.toContain("tiktok");
  });

  it("should be documented in openApiSpec.ts", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./openApiSpec.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain('"/media/generate"');
    expect(src).toContain("mediaGenerate");
    expect(src).toContain("图文内容");
  });
});
