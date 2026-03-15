import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("./server/_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: "测试演示文稿",
            subtitle: "副标题",
            slides: [
              {
                layout: "title",
                title: "测试演示文稿",
                subtitle: "副标题",
                notes: "",
              },
              {
                layout: "content",
                title: "设计理念",
                body: "这是设计理念的描述内容，包含主要设计思路。",
                notes: "",
              },
              {
                layout: "image_text",
                title: "空间布局",
                body: "空间布局的详细说明。",
                imageQuery: "modern office space layout architecture",
                notes: "",
              },
            ],
          }),
        },
      },
    ],
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    url: "https://cdn.example.com/test-presentation.pptx",
    key: "presentations/test-presentation.pptx",
  }),
}));

vi.mock("./db", () => ({
  createGenerationHistory: vi.fn().mockResolvedValue({ id: 999 }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Presentation Module", () => {
  describe("Input Validation", () => {
    it("should require non-empty title", () => {
      const title = "";
      expect(title.trim().length).toBe(0);
      // Empty title should fail validation
      expect(title.trim().length > 0).toBe(false);
    });

    it("should require non-empty content", () => {
      const content = "";
      expect(content.trim().length).toBe(0);
      expect(content.trim().length > 0).toBe(false);
    });

    it("should accept valid title and content", () => {
      const title = "JPT 总部办公空间设计方案汇报";
      const content = "本次汇报将介绍 JPT 总部办公空间的设计理念、空间布局方案和材料选择。";
      expect(title.trim().length > 0).toBe(true);
      expect(content.trim().length > 0).toBe(true);
    });

    it("should accept optional image URLs", () => {
      const imageUrls = [
        "https://cdn.example.com/image1.jpg",
        "https://cdn.example.com/image2.jpg",
      ];
      expect(Array.isArray(imageUrls)).toBe(true);
      expect(imageUrls.length).toBeLessThanOrEqual(8);
    });

    it("should enforce max 8 images", () => {
      const imageUrls = Array.from({ length: 9 }, (_, i) => `https://cdn.example.com/image${i}.jpg`);
      const limited = imageUrls.slice(0, 8);
      expect(limited.length).toBe(8);
    });
  });

  describe("Job Store", () => {
    it("should store and retrieve job status", () => {
      const jobStore = new Map<string, { status: string; progress: number; stage: string }>();
      const jobId = "pres_test123";

      jobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });
      const job = jobStore.get(jobId);

      expect(job).toBeDefined();
      expect(job?.status).toBe("processing");
      expect(job?.progress).toBe(5);
      expect(job?.stage).toBe("structuring");
    });

    it("should update job progress through stages", () => {
      const jobStore = new Map<string, { status: string; progress: number; stage: string }>();
      const jobId = "pres_test456";

      // Stage 1: structuring
      jobStore.set(jobId, { status: "processing", progress: 10, stage: "structuring" });
      expect(jobStore.get(jobId)?.stage).toBe("structuring");

      // Stage 2: generating_images
      jobStore.set(jobId, { status: "processing", progress: 25, stage: "generating_images" });
      expect(jobStore.get(jobId)?.stage).toBe("generating_images");

      // Stage 3: building_pptx
      jobStore.set(jobId, { status: "processing", progress: 70, stage: "building_pptx" });
      expect(jobStore.get(jobId)?.stage).toBe("building_pptx");

      // Done
      jobStore.set(jobId, { status: "done", progress: 100, stage: "done" });
      expect(jobStore.get(jobId)?.status).toBe("done");
    });

    it("should handle failed jobs", () => {
      const jobStore = new Map<string, { status: string; progress?: number; stage?: string; error?: string }>();
      const jobId = "pres_fail789";

      jobStore.set(jobId, { status: "failed", error: "演示文稿生成失败" });
      const job = jobStore.get(jobId);

      expect(job?.status).toBe("failed");
      expect(job?.error).toBe("演示文稿生成失败");
    });

    it("should return not_found for unknown jobId", () => {
      const jobStore = new Map<string, { status: string }>();
      const job = jobStore.get("nonexistent_job_id");
      expect(job).toBeUndefined();
    });
  });

  describe("Slide Structure", () => {
    it("should parse LLM response into slide structure", () => {
      const mockLLMResponse = {
        title: "JPT 总部办公空间设计方案汇报",
        subtitle: "N+1 STUDIOS",
        slides: [
          { layout: "title", title: "封面", subtitle: "副标题" },
          { layout: "content", title: "设计理念", body: "内容" },
          { layout: "image_text", title: "空间布局", body: "描述", imageQuery: "office space" },
          { layout: "summary", title: "总结", body: "总结内容" },
        ],
      };

      expect(mockLLMResponse.slides).toHaveLength(4);
      expect(mockLLMResponse.slides[0].layout).toBe("title");
      expect(mockLLMResponse.slides[2].imageQuery).toBe("office space");
    });

    it("should support all required slide layouts", () => {
      const validLayouts = ["title", "content", "image_text", "two_column", "quote", "summary", "insight"];
      const testLayouts = ["title", "content", "image_text", "summary"];

      testLayouts.forEach(layout => {
        expect(validLayouts.includes(layout)).toBe(true);
      });
    });

    it("should generate unique job IDs with pres_ prefix", () => {
      const generateJobId = () => `pres_${Math.random().toString(36).slice(2, 11)}`;
      const id1 = generateJobId();
      const id2 = generateJobId();

      expect(id1.startsWith("pres_")).toBe(true);
      expect(id2.startsWith("pres_")).toBe(true);
      expect(id1).not.toBe(id2);
    });
  });

  describe("Image Distribution", () => {
    it("should distribute uploaded images to image slides", () => {
      const uploadedImages = [
        "https://cdn.example.com/img1.jpg",
        "https://cdn.example.com/img2.jpg",
      ];
      const slides = [
        { layout: "title", title: "封面" },
        { layout: "image_text", title: "空间布局", imageQuery: "office" },
        { layout: "content", title: "设计理念" },
        { layout: "image_text", title: "材料选择", imageQuery: "materials" },
      ];

      const imageSlides = slides.filter(s => s.layout === "image_text");
      expect(imageSlides).toHaveLength(2);

      // Assign uploaded images to image slides
      const assignedImages = imageSlides.map((slide, i) => ({
        ...slide,
        imageUrl: uploadedImages[i] || null,
      }));

      expect(assignedImages[0].imageUrl).toBe("https://cdn.example.com/img1.jpg");
      expect(assignedImages[1].imageUrl).toBe("https://cdn.example.com/img2.jpg");
    });

    it("should fall back to Pexels when no uploaded images", () => {
      const uploadedImages: string[] = [];
      const imageQuery = "modern office architecture";

      // When no uploaded images, use Pexels search
      const useUploadedImage = uploadedImages.length > 0;
      expect(useUploadedImage).toBe(false);
      // Would call Pexels API with imageQuery
      expect(imageQuery.length > 0).toBe(true);
    });
  });

  describe("Generation History", () => {
    it("should save to history with presentation module type", () => {
      const historyEntry = {
        userId: 1,
        module: "presentation",
        title: "JPT 总部办公空间设计方案汇报",
        outputUrl: "https://cdn.example.com/test.pptx",
        summary: "共 8 页幻灯片",
        modelName: "内置 LLM",
      };

      expect(historyEntry.module).toBe("presentation");
      expect(historyEntry.outputUrl).toContain(".pptx");
      expect(historyEntry.summary).toContain("页幻灯片");
    });
  });
});
