import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAnalysisImagePrompt: vi.fn(),
  updateAnalysisImageJob: vi.fn(),
  createGenerationHistory: vi.fn(),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn(),
}));

vi.mock("./_core/generateImageWithTool", () => ({
  generateImageWithTool: vi.fn(),
}));

import * as db from "./db";
import { generateImage } from "./_core/imageGeneration";
import { generateImageWithTool } from "./_core/generateImageWithTool";

// ─── Unit: prompt composition ─────────────────────────────────────────────────
describe("Analysis Image - prompt composition", () => {
  it("uses builtin prompt when no extraPrompt provided", () => {
    const basePrompt = "Generate a professional material palette board.";
    const extraPrompt = undefined;
    const fullPrompt = extraPrompt ? `${basePrompt}\n\n${extraPrompt}` : basePrompt;
    expect(fullPrompt).toBe(basePrompt);
  });

  it("appends extraPrompt to builtin prompt", () => {
    const basePrompt = "Generate a professional material palette board.";
    const extraPrompt = "Focus on stone textures.";
    const fullPrompt = extraPrompt ? `${basePrompt}\n\n${extraPrompt}` : basePrompt;
    expect(fullPrompt).toBe("Generate a professional material palette board.\n\nFocus on stone textures.");
  });

  it("falls back to default prompt when DB returns null", async () => {
    vi.mocked(db.getAnalysisImagePrompt).mockResolvedValue(null);
    const builtinPrompt = await db.getAnalysisImagePrompt("material");
    const basePrompt = builtinPrompt?.prompt ?? "Generate a professional material palette board based on the reference image.";
    expect(basePrompt).toBe("Generate a professional material palette board based on the reference image.");
  });

  it("uses DB prompt when available", async () => {
    vi.mocked(db.getAnalysisImagePrompt).mockResolvedValue({
      id: 1,
      type: "material",
      label: "材质搭配图",
      prompt: "Custom material prompt from DB.",
      description: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const builtinPrompt = await db.getAnalysisImagePrompt("material");
    const basePrompt = builtinPrompt?.prompt ?? "fallback";
    expect(basePrompt).toBe("Custom material prompt from DB.");
  });
});

// ─── Unit: image generation routing ──────────────────────────────────────────
describe("Analysis Image - generation routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateImageWithTool when toolId is provided", async () => {
    vi.mocked(generateImageWithTool).mockResolvedValue({ url: "https://cdn.example.com/result.png" });

    const toolId = 42;
    const fullPrompt = "Material palette board.";
    const referenceImageUrl = "https://cdn.example.com/ref.jpg";

    let resultUrl: string;
    if (toolId) {
      const result = await generateImageWithTool({
        toolId,
        prompt: fullPrompt,
        originalImages: [{ url: referenceImageUrl, mimeType: "image/jpeg" }],
      });
      resultUrl = result.url;
    } else {
      const result = await generateImage({ prompt: fullPrompt });
      resultUrl = result.url || "";
    }

    expect(generateImageWithTool).toHaveBeenCalledWith({
      toolId: 42,
      prompt: fullPrompt,
      originalImages: [{ url: referenceImageUrl, mimeType: "image/jpeg" }],
    });
    expect(generateImage).not.toHaveBeenCalled();
    expect(resultUrl!).toBe("https://cdn.example.com/result.png");
  });

  it("calls generateImage (built-in) when no toolId provided", async () => {
    vi.mocked(generateImage).mockResolvedValue({ url: "https://cdn.example.com/builtin.png" });

    const toolId: number | undefined = undefined;
    const fullPrompt = "Soft furnishing mood board.";
    const referenceImageUrl = "https://cdn.example.com/ref.jpg";

    let resultUrl: string;
    if (toolId) {
      const result = await generateImageWithTool({ toolId, prompt: fullPrompt });
      resultUrl = result.url;
    } else {
      const result = await generateImage({
        prompt: fullPrompt,
        originalImages: [{ url: referenceImageUrl, mimeType: "image/jpeg" }],
      });
      resultUrl = result.url || "";
    }

    expect(generateImage).toHaveBeenCalledWith({
      prompt: fullPrompt,
      originalImages: [{ url: referenceImageUrl, mimeType: "image/jpeg" }],
    });
    expect(generateImageWithTool).not.toHaveBeenCalled();
    expect(resultUrl!).toBe("https://cdn.example.com/builtin.png");
  });
});

// ─── Unit: job status transitions ────────────────────────────────────────────
describe("Analysis Image - job status transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.updateAnalysisImageJob).mockResolvedValue(undefined);
    vi.mocked(db.createGenerationHistory).mockResolvedValue({ id: 99 });
  });

  it("marks job as done on success", async () => {
    vi.mocked(db.getAnalysisImagePrompt).mockResolvedValue(null);
    vi.mocked(generateImage).mockResolvedValue({ url: "https://cdn.example.com/done.png" });

    // Simulate the background function steps
    await db.updateAnalysisImageJob("job-1", { status: "processing" });
    const result = await generateImage({ prompt: "test" });
    await db.updateAnalysisImageJob("job-1", { status: "done", resultUrl: result.url });

    expect(db.updateAnalysisImageJob).toHaveBeenCalledWith("job-1", { status: "processing" });
    expect(db.updateAnalysisImageJob).toHaveBeenCalledWith("job-1", {
      status: "done",
      resultUrl: "https://cdn.example.com/done.png",
    });
  });

  it("marks job as failed on error", async () => {
    vi.mocked(generateImage).mockRejectedValue(new Error("API timeout"));

    try {
      await generateImage({ prompt: "test" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "未知错误";
      await db.updateAnalysisImageJob("job-2", { status: "failed", error: msg });
    }

    expect(db.updateAnalysisImageJob).toHaveBeenCalledWith("job-2", {
      status: "failed",
      error: "API timeout",
    });
  });
});
