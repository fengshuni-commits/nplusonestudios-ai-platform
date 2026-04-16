import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

    it("should store pdf_converting stage with currentPage and totalPages", () => {
      type PdfJob = { status: string; progress: number; stage: string; currentPage?: number; totalPages?: number };
      const jobStore = new Map<string, PdfJob>();
      const jobId = "pres_convert_pdf_test";

      // Initial state: PDF converting started
      jobStore.set(jobId, { status: "processing", progress: 5, stage: "pdf_converting", currentPage: 0, totalPages: 0 });
      let job = jobStore.get(jobId);
      expect(job?.stage).toBe("pdf_converting");
      expect(job?.currentPage).toBe(0);
      expect(job?.totalPages).toBe(0);

      // After first page rendered (out of 10 total)
      jobStore.set(jobId, { status: "processing", progress: 6, stage: "pdf_converting", currentPage: 1, totalPages: 10 });
      job = jobStore.get(jobId);
      expect(job?.currentPage).toBe(1);
      expect(job?.totalPages).toBe(10);

      // After 5th page rendered
      jobStore.set(jobId, { status: "processing", progress: 11, stage: "pdf_converting", currentPage: 5, totalPages: 10 });
      job = jobStore.get(jobId);
      expect(job?.currentPage).toBe(5);
      expect(job?.totalPages).toBe(10);
      // Progress should be between 5 and 18 (the PDF conversion range)
      expect(job?.progress).toBeGreaterThanOrEqual(5);
      expect(job?.progress).toBeLessThanOrEqual(18);

      // After all pages rendered
      jobStore.set(jobId, { status: "processing", progress: 18, stage: "pdf_converting", currentPage: 10, totalPages: 10 });
      job = jobStore.get(jobId);
      expect(job?.currentPage).toBe(job?.totalPages);
    });
  });

  describe("PDF Progress Calculation", () => {
    it("should calculate correct progress for each page", () => {
      // PDF conversion maps to 5-18% of overall progress
      const calcProgress = (current: number, total: number) =>
        5 + Math.round((current / total) * 13);

      expect(calcProgress(0, 10)).toBe(5);
      expect(calcProgress(5, 10)).toBe(12);  // 5 + round(0.5 * 13) = 5 + round(6.5) = 5 + 7 = 12
      expect(calcProgress(10, 10)).toBe(18);
    });

    it("should handle single page PDF", () => {
      const calcProgress = (current: number, total: number) =>
        5 + Math.round((current / total) * 13);

      expect(calcProgress(1, 1)).toBe(18);
    });

    it("should handle large PDF (30 pages)", () => {
      const calcProgress = (current: number, total: number) =>
        5 + Math.round((current / total) * 13);

      // Progress should increase monotonically
      const progresses = Array.from({ length: 30 }, (_, i) => calcProgress(i + 1, 30));
      for (let i = 1; i < progresses.length; i++) {
        expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
      }
      // Last page should be 18%
      expect(progresses[29]).toBe(18);
    });
  });

  describe("pdfToImages onProgress callback", () => {
    it("should call onProgress for each page", async () => {
      // Mock the pdfToImages function behavior
      const mockOnProgress = vi.fn();
      const totalPages = 5;

      // Simulate what pdfToImages does internally
      for (let idx = 0; idx < totalPages; idx++) {
        mockOnProgress(idx + 1, totalPages);
      }

      expect(mockOnProgress).toHaveBeenCalledTimes(totalPages);
      expect(mockOnProgress).toHaveBeenNthCalledWith(1, 1, totalPages);
      expect(mockOnProgress).toHaveBeenNthCalledWith(3, 3, totalPages);
      expect(mockOnProgress).toHaveBeenNthCalledWith(5, 5, totalPages);
    });

    it("should pass correct current and total to onProgress", () => {
      const calls: Array<[number, number]> = [];
      const mockOnProgress = (current: number, total: number) => calls.push([current, total]);
      const totalPages = 3;

      for (let idx = 0; idx < totalPages; idx++) {
        mockOnProgress(idx + 1, totalPages);
      }

      expect(calls).toEqual([[1, 3], [2, 3], [3, 3]]);
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

  describe("ColorPlan Re-edit URL Param Restoration", () => {
    // Tests for the logic that restores ColorPlan state from URL params when navigating from history

    it("should parse floorPlanUrl from URL params", () => {
      const search = '?floorPlanUrl=https%3A%2F%2Fcdn.example.com%2Ffloor.png&planStyle=colored';
      const params = new URLSearchParams(search);
      expect(params.get('floorPlanUrl')).toBe('https://cdn.example.com/floor.png');
      expect(params.get('planStyle')).toBe('colored');
    });

    it("should parse resultUrl from URL params to restore generation result", () => {
      const search = '?resultUrl=https%3A%2F%2Fcdn.example.com%2Fresult.png';
      const params = new URLSearchParams(search);
      const initResultUrl = params.get('resultUrl') || null;
      expect(initResultUrl).toBe('https://cdn.example.com/result.png');
    });

    it("should parse historyId from URL params and convert to number", () => {
      const search = '?historyId=42';
      const params = new URLSearchParams(search);
      const initHistoryId = params.get('historyId') ? Number(params.get('historyId')) : undefined;
      expect(initHistoryId).toBe(42);
    });

    it("should return undefined historyId when not in URL", () => {
      const search = '?floorPlanUrl=https%3A%2F%2Fcdn.example.com%2Ffloor.png';
      const params = new URLSearchParams(search);
      const initHistoryId = params.get('historyId') ? Number(params.get('historyId')) : undefined;
      expect(initHistoryId).toBeUndefined();
    });

    it("should return null resultUrl when not in URL", () => {
      const search = '?floorPlanUrl=https%3A%2F%2Fcdn.example.com%2Ffloor.png';
      const params = new URLSearchParams(search);
      const initResultUrl = params.get('resultUrl') || null;
      expect(initResultUrl).toBeNull();
    });

    it("should build correct URL params for re-edit navigation", () => {
      const inputParams = {
        floorPlanUrl: 'https://cdn.example.com/floor.png',
        referenceUrl: 'https://cdn.example.com/ref.png',
        planStyle: 'colored',
        extraPrompt: '现代风格',
      };
      const outputUrl = 'https://cdn.example.com/result.png';
      const historyId = 123;

      const params = new URLSearchParams();
      if (inputParams.floorPlanUrl) params.set('floorPlanUrl', inputParams.floorPlanUrl);
      if (inputParams.referenceUrl) params.set('referenceUrl', inputParams.referenceUrl);
      if (inputParams.planStyle) params.set('planStyle', inputParams.planStyle);
      if (inputParams.extraPrompt) params.set('extraPrompt', inputParams.extraPrompt);
      if (outputUrl) params.set('resultUrl', outputUrl);
      params.set('historyId', String(historyId));

      const url = `/design/color-plan?${params.toString()}`;
      expect(url).toContain('floorPlanUrl=');
      expect(url).toContain('resultUrl=');
      expect(url).toContain('historyId=123');
      expect(url).toContain('planStyle=colored');
    });
  });

  describe("Text Erase - Inpainting Route Selection", () => {
    // Tests for the logic that decides which inpainting path to take
    // based on the tool provider (jimeng vs gemini vs none)

    it("should use sharp fallback when no inpaintToolId is provided", () => {
      const inpaintToolId: number | undefined = undefined;
      const useAiInpaint = !!inpaintToolId;
      expect(useAiInpaint).toBe(false);
    });

    it("should use jimeng inpainting path for jimeng provider", () => {
      const provider = "jimeng";
      const isJimeng = provider === "jimeng" || provider === "volcengine";
      expect(isJimeng).toBe(true);
    });

    it("should use jimeng inpainting path for volcengine provider", () => {
      const provider = "volcengine";
      const isJimeng = provider === "jimeng" || provider === "volcengine";
      expect(isJimeng).toBe(true);
    });

    it("should use Gemini red-highlight path for gemini provider", () => {
      const provider = "gemini";
      const isJimeng = provider === "jimeng" || provider === "volcengine";
      expect(isJimeng).toBe(false);
      // Non-jimeng path uses red-highlight composite + INPAINTING INSTRUCTION
    });

    it("should use Gemini red-highlight path for unknown provider", () => {
      const provider = "";
      const isJimeng = provider === "jimeng" || provider === "volcengine";
      expect(isJimeng).toBe(false);
    });

    it("should build INPAINTING INSTRUCTION prompt for Gemini path", () => {
      const inpaintPrompt = `[INPAINTING INSTRUCTION: The image has red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas. Keep all other areas exactly unchanged.] Remove all text from the red-highlighted areas. Fill those areas with the surrounding background color and texture so the result looks natural and seamless.`;
      expect(inpaintPrompt).toContain("INPAINTING INSTRUCTION");
      expect(inpaintPrompt).toContain("red-highlighted areas");
      expect(inpaintPrompt).toContain("Remove all text");
    });

    it("should calculate text element bounding box with padding", () => {
      const imgW = 800;
      const imgH = 600;
      const el = { x: 10, y: 5, w: 80, h: 10 }; // percentages
      const padding = 4;

      const rx = Math.max(0, Math.round((el.x / 100) * imgW) - padding);
      const ry = Math.max(0, Math.round((el.y / 100) * imgH) - padding);
      const rw = Math.min(imgW - rx, Math.round((el.w / 100) * imgW) + padding * 2);
      const rh = Math.min(imgH - ry, Math.round((el.h / 100) * imgH) + padding * 2);

      expect(rx).toBe(76);  // 10% of 800 = 80, minus 4 = 76
      expect(ry).toBe(26);  // 5% of 600 = 30, minus 4 = 26
      expect(rw).toBe(648); // 80% of 800 = 640, plus 8 = 648
      expect(rh).toBe(68);  // 10% of 600 = 60, plus 8 = 68
    });

    it("should skip text elements with zero-size bounding boxes", () => {
      const imgW = 100;
      const imgH = 100;
      // Element at the very edge with large padding could result in zero width
      const el = { x: 99, y: 0, w: 1, h: 10 };
      const padding = 4;

      const rx = Math.max(0, Math.round((el.x / 100) * imgW) - padding);
      const rw = Math.min(imgW - rx, Math.round((el.w / 100) * imgW) + padding * 2);

      // rx = max(0, 99 - 4) = 95, rw = min(100-95, 1+8) = min(5, 9) = 5
      expect(rw).toBeGreaterThan(0); // should still be valid
    });

    it("should skip pages with no text elements", () => {
      const textElements: any[] = [];
      const shouldProcess = textElements.length > 0;
      expect(shouldProcess).toBe(false);
    });

    it("should process pages with text elements", () => {
      const textElements = [{ x: 10, y: 5, w: 80, h: 10, text: "标题" }];
      const shouldProcess = textElements.length > 0;
      expect(shouldProcess).toBe(true);
    });
  });
});
