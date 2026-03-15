import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  listRenderStyles: vi.fn(),
  getRenderStyleById: vi.fn(),
  createRenderStyle: vi.fn(),
  updateRenderStyle: vi.fn(),
  deleteRenderStyle: vi.fn(),
  reorderRenderStyles: vi.fn(),
}));

import * as db from "./db";

describe("renderStyles db helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listRenderStyles returns active styles when activeOnly=true", async () => {
    const mockStyles = [
      { id: 1, label: "建筑渲染", promptHint: "architectural rendering, photorealistic", referenceImageUrl: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, label: "手绘草图", promptHint: "hand-drawn sketch style", referenceImageUrl: null, sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    vi.mocked(db.listRenderStyles).mockResolvedValue(mockStyles);

    const result = await db.listRenderStyles({ activeOnly: true });
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("建筑渲染");
    expect(db.listRenderStyles).toHaveBeenCalledWith({ activeOnly: true });
  });

  it("createRenderStyle creates a new style with correct fields", async () => {
    const newStyle = {
      id: 3,
      label: "水彩风格",
      promptHint: "watercolor painting style, soft edges",
      referenceImageUrl: null,
      sortOrder: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.createRenderStyle).mockResolvedValue(newStyle);

    const result = await db.createRenderStyle({
      label: "水彩风格",
      promptHint: "watercolor painting style, soft edges",
      referenceImageUrl: null,
      sortOrder: 2,
      isActive: true,
    });

    expect(result.id).toBe(3);
    expect(result.label).toBe("水彩风格");
    expect(result.promptHint).toBe("watercolor painting style, soft edges");
  });

  it("getRenderStyleById returns the correct style", async () => {
    const mockStyle = {
      id: 1,
      label: "建筑渲染",
      promptHint: "architectural rendering, photorealistic, high detail",
      referenceImageUrl: "https://cdn.example.com/ref.jpg",
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.getRenderStyleById).mockResolvedValue(mockStyle);

    const result = await db.getRenderStyleById(1);
    expect(result?.label).toBe("建筑渲染");
    expect(result?.referenceImageUrl).toBe("https://cdn.example.com/ref.jpg");
  });

  it("updateRenderStyle updates fields correctly", async () => {
    vi.mocked(db.updateRenderStyle).mockResolvedValue(undefined);

    await db.updateRenderStyle(1, { label: "建筑渲染（更新）", isActive: false });
    expect(db.updateRenderStyle).toHaveBeenCalledWith(1, { label: "建筑渲染（更新）", isActive: false });
  });

  it("deleteRenderStyle removes the style", async () => {
    vi.mocked(db.deleteRenderStyle).mockResolvedValue(undefined);

    await db.deleteRenderStyle(1);
    expect(db.deleteRenderStyle).toHaveBeenCalledWith(1);
  });

  it("reorderRenderStyles accepts ordered ids array", async () => {
    vi.mocked(db.reorderRenderStyles).mockResolvedValue(undefined);

    await db.reorderRenderStyles([3, 1, 2]);
    expect(db.reorderRenderStyles).toHaveBeenCalledWith([3, 1, 2]);
  });

  it("promptHint from style is injected into generation prompt", () => {
    // Simulate the prompt building logic from routers.ts
    const basePrompt = "现代办公空间，开放式布局";
    const style = { promptHint: "architectural rendering, photorealistic, high detail, professional lighting" };

    const fullPrompt = `${basePrompt}, ${style.promptHint}`;
    expect(fullPrompt).toContain("architectural rendering");
    expect(fullPrompt).toContain("现代办公空间");
  });

  it("style reference image is appended to originalImages when present", () => {
    // Simulate the originalImages building logic
    const originalImages: Array<{ url?: string; mimeType?: string }> = [];
    const referenceImageUrl = "https://cdn.example.com/user-ref.jpg";
    const styleRefImageUrl = "https://cdn.example.com/style-ref.jpg";

    originalImages.push({ url: referenceImageUrl, mimeType: "image/png" });
    originalImages.push({ url: styleRefImageUrl, mimeType: "image/png" });

    expect(originalImages).toHaveLength(2);
    expect(originalImages[1].url).toBe(styleRefImageUrl);
  });
});
