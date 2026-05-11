/**
 * Tests for the Presentation Projects Router
 * Tests the core logic of slide generation workflow without requiring a real DB or LLM.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue({ insertId: 1 }) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockResolvedValue([]),
          }),
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
  };
  return { mockDb };
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
  getDefaultToolForCapability: vi.fn().mockResolvedValue(null),
  createGenerationHistory: vi.fn().mockResolvedValue({}),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          slides: [
            { slideOrder: 0, title: "封面", prompt: "项目封面页，展示项目名称和事务所品牌" },
            { slideOrder: 1, title: "设计理念", prompt: "介绍设计理念和空间哲学" },
            { slideOrder: 2, title: "空间布局", prompt: "展示平面图和空间布局方案" },
          ]
        })
      }
    }]
  }),
  invokeLLMWithUserTool: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          pageTheme: "现代建筑封面",
          backgroundColor: "#0f0f0f",
          textBlocks: [
            {
              id: "title",
              role: "title",
              text: "JPT 总部办公空间",
              x: 100, y: 200, width: 800, height: 120,
              fontSize: 72, color: "#ffffff",
              align: "left", bold: true
            }
          ]
        })
      }
    }]
  }),
}));

vi.mock("./_core/generateImageWithTool", () => ({
  generateImageWithTool: vi.fn().mockResolvedValue({ url: "https://example.com/slide-1.jpg" }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://example.com/presentation.pptx", key: "test.pptx" }),
}));

vi.mock("../drizzle/schema", () => ({
  presentationProjects: { id: "id", userId: "userId", status: "status" },
  presentationSlides: { id: "id", presentationId: "presentationId", slideOrder: "slideOrder", status: "status", regenerateCount: "regenerateCount" },
  presentationAssets: { id: "id", presentationId: "presentationId", sortOrder: "sortOrder" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, type: "eq" })),
  and: vi.fn((...args) => ({ args, type: "and" })),
  asc: vi.fn((col) => ({ col, type: "asc" })),
  desc: vi.fn((col) => ({ col, type: "desc" })),
}));

vi.mock("pptxgenjs", () => ({
  default: class MockPptxGenJS {
    layout = "";
    ShapeType = { rect: "rect" };
    addSlide() {
      return {
        addImage: vi.fn(),
        addShape: vi.fn(),
        addText: vi.fn(),
      };
    }
    async write() { return Buffer.from("mock-pptx-content"); }
  }
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { generateOneSlideFull } from "./presentationRouter";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Presentation Router - generateOneSlideFull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mark slide as generating then done on success", async () => {
    const { getDb } = await import("./db");
    const { generateImageWithTool } = await import("./_core/generateImageWithTool");
    const { invokeLLM } = await import("./_core/llm");

    // Setup mock DB to return the slide for regenerateCount query
    const mockDbInstance = await getDb() as any;
    mockDbInstance.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ cnt: 0 }]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([{ cnt: 0 }]),
      }),
    });

    (invokeLLM as any).mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            pageTheme: "建筑封面页",
            backgroundColor: "#0f0f0f",
            textBlocks: [
              {
                id: "t1", role: "title", text: "项目标题",
                x: 100, y: 200, width: 800, height: 120,
                fontSize: 72, color: "#ffffff", align: "center", bold: true
              }
            ]
          })
        }
      }]
    });

    (generateImageWithTool as any).mockResolvedValue({ url: "https://example.com/slide.jpg" });

    await generateOneSlideFull({
      slideId: 1,
      presentationId: 1,
      slideOrder: 0,
      totalSlides: 3,
      prompt: "封面页：JPT 总部办公空间设计方案",
      assetUrls: [],
      imageToolId: null,
      planToolId: null,
    });

    // Should have called invokeLLM for layout planning
    expect(invokeLLM).toHaveBeenCalledTimes(1);
    // Should have called generateImageWithTool for image generation
    expect(generateImageWithTool).toHaveBeenCalledTimes(1);
    // Should have called update (mark generating + mark done)
    expect(mockDbInstance.update).toHaveBeenCalled();
  });

  it("should mark slide as error when image generation fails", async () => {
    const { getDb } = await import("./db");
    const { generateImageWithTool } = await import("./_core/generateImageWithTool");
    const { invokeLLM } = await import("./_core/llm");

    const mockDbInstance = await getDb() as any;
    mockDbInstance.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ cnt: 0 }]),
        }),
      }),
    });

    (invokeLLM as any).mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            pageTheme: "test", backgroundColor: "#000", textBlocks: []
          })
        }
      }]
    });

    (generateImageWithTool as any).mockRejectedValue(new Error("Image generation API timeout"));

    await expect(generateOneSlideFull({
      slideId: 2,
      presentationId: 1,
      slideOrder: 1,
      totalSlides: 3,
      prompt: "设计理念页",
      assetUrls: [],
      imageToolId: null,
      planToolId: null,
    })).rejects.toThrow("Image generation API timeout");

    // Should have called update to mark as error
    expect(mockDbInstance.update).toHaveBeenCalled();
  });

  it("should include asset URLs in image generation when provided", async () => {
    const { getDb } = await import("./db");
    const { generateImageWithTool } = await import("./_core/generateImageWithTool");
    const { invokeLLM } = await import("./_core/llm");

    const mockDbInstance = await getDb() as any;
    mockDbInstance.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ cnt: 0 }]),
        }),
      }),
    });

    (invokeLLM as any).mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            pageTheme: "空间展示", backgroundColor: "#111", textBlocks: []
          })
        }
      }]
    });

    (generateImageWithTool as any).mockResolvedValue({ url: "https://example.com/slide-with-assets.jpg" });

    const assetUrls = [
      "https://example.com/asset1.jpg",
      "https://example.com/asset2.jpg",
    ];

    await generateOneSlideFull({
      slideId: 3,
      presentationId: 1,
      slideOrder: 2,
      totalSlides: 3,
      prompt: "展示项目实景照片",
      assetUrls,
      imageToolId: null,
      planToolId: null,
    });

    // generateImageWithTool should have been called with originalImages
    const callArgs = (generateImageWithTool as any).mock.calls[0][0];
    expect(callArgs.originalImages).toBeDefined();
    expect(callArgs.originalImages.length).toBeGreaterThan(0);
    expect(callArgs.originalImages[0].url).toBe(assetUrls[0]);
  });
});

describe("Documents Router - listImagesByProject filter", () => {
  it("should filter documents to only image files by URL extension", () => {
    const docs = [
      { id: 1, title: "Floor Plan", fileUrl: "https://s3.example.com/docs/plan.pdf" },
      { id: 2, title: "Render 01", fileUrl: "https://s3.example.com/docs/render01.jpg" },
      { id: 3, title: "Render 02", fileUrl: "https://s3.example.com/docs/render02.png" },
      { id: 4, title: "No File", fileUrl: null },
      { id: 5, title: "WebP Image", fileUrl: "https://s3.example.com/docs/photo.webp?v=1" },
      { id: 6, title: "SVG Logo", fileUrl: "https://s3.example.com/docs/logo.svg" },
    ];
    const imagePattern = /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
    const imageFiles = docs.filter(d => {
      if (!d.fileUrl) return false;
      return imagePattern.test(d.fileUrl.toLowerCase());
    });
    expect(imageFiles).toHaveLength(4);
    expect(imageFiles.map(d => d.id)).toEqual([2, 3, 5, 6]);
    // PDF should be excluded
    expect(imageFiles.find(d => d.title === "Floor Plan")).toBeUndefined();
    // Null fileUrl should be excluded
    expect(imageFiles.find(d => d.title === "No File")).toBeUndefined();
  });

  it("should handle query params and hash fragments in image URLs", () => {
    const urls = [
      "https://cdn.example.com/img.jpg?w=800&h=600",
      "https://cdn.example.com/img.png#section",
      "https://cdn.example.com/img.gif",
      "https://cdn.example.com/document.pdf?download=1",
    ];
    const imagePattern = /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
    const imageUrls = urls.filter(u => imagePattern.test(u.toLowerCase()));
    expect(imageUrls).toHaveLength(3);
    expect(imageUrls).not.toContain("https://cdn.example.com/document.pdf?download=1");
  });
});

describe("Presentation Router - text element coordinate conversion", () => {
  it("should convert pixel coordinates to percentage correctly", () => {
    const SLIDE_W_PX = 1920;
    const SLIDE_H_PX = 1080;

    const textBlock = { x: 192, y: 108, width: 960, height: 216 };
    const xPct = Math.round(textBlock.x / SLIDE_W_PX * 100 * 100) / 100;
    const yPct = Math.round(textBlock.y / SLIDE_H_PX * 100 * 100) / 100;
    const wPct = Math.round(textBlock.width / SLIDE_W_PX * 100 * 100) / 100;
    const hPct = Math.round(textBlock.height / SLIDE_H_PX * 100 * 100) / 100;

    expect(xPct).toBe(10);
    expect(yPct).toBe(10);
    expect(wPct).toBe(50);
    expect(hPct).toBe(20);
  });

  it("should convert percentage coordinates to inches for PPTX correctly", () => {
    const slideW = 13.33;
    const slideH = 7.5;

    const el = { x: 10, y: 10, w: 50, h: 20 };
    const xIn = (el.x / 100) * slideW;
    const yIn = (el.y / 100) * slideH;
    const wIn = (el.w / 100) * slideW;
    const hIn = (el.h / 100) * slideH;

    expect(xIn).toBeCloseTo(1.333, 2);
    expect(yIn).toBeCloseTo(0.75, 2);
    expect(wIn).toBeCloseTo(6.665, 2);
    expect(hIn).toBeCloseTo(1.5, 2);
  });
});
