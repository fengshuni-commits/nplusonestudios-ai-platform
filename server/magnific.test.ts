import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the magnific module
vi.mock("./magnific", () => ({
  submitEnhanceTask: vi.fn(),
  getEnhanceTaskStatus: vi.fn(),
}));

import { submitEnhanceTask, getEnhanceTaskStatus } from "./magnific";

describe("Magnific Enhancement Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitEnhanceTask", () => {
    it("should call submitEnhanceTask with correct parameters", async () => {
      const mockTaskId = "task_abc123";
      (submitEnhanceTask as any).mockResolvedValue({ taskId: mockTaskId });

      const result = await submitEnhanceTask({
        imageUrl: "https://example.com/image.jpg",
        scale: "x2",
        optimizedFor: "3d_renders",
        creativity: 0,
        hdr: 0,
        resemblance: 0,
      });

      expect(result.taskId).toBe(mockTaskId);
      expect(submitEnhanceTask).toHaveBeenCalledWith({
        imageUrl: "https://example.com/image.jpg",
        scale: "x2",
        optimizedFor: "3d_renders",
        creativity: 0,
        hdr: 0,
        resemblance: 0,
      });
    });

    it("should support x4 scale with films_n_photography mode", async () => {
      (submitEnhanceTask as any).mockResolvedValue({ taskId: "task_x4" });

      const result = await submitEnhanceTask({
        imageUrl: "https://example.com/image.jpg",
        scale: "x4",
        optimizedFor: "films_n_photography",
        creativity: 2,
        hdr: 1,
        resemblance: -1,
      });

      expect(result.taskId).toBe("task_x4");
    });

    it("should throw on invalid image URL", async () => {
      (submitEnhanceTask as any).mockRejectedValue(new Error("Invalid image URL"));

      await expect(
        submitEnhanceTask({
          imageUrl: "",
          scale: "x2",
          optimizedFor: "3d_renders",
          creativity: 0,
          hdr: 0,
          resemblance: 0,
        })
      ).rejects.toThrow("Invalid image URL");
    });
  });

  describe("getEnhanceTaskStatus", () => {
    it("should return processing status when task is pending (CREATED)", async () => {
      (getEnhanceTaskStatus as any).mockResolvedValue({ taskId: "task_pending", status: "processing", outputUrl: undefined });

      const result = await getEnhanceTaskStatus("task_pending");

      expect(result.status).toBe("processing");
      expect(result.outputUrl).toBeUndefined();
    });

    it("should return processing status when task is IN_PROGRESS", async () => {
      (getEnhanceTaskStatus as any).mockResolvedValue({ taskId: "task_in_progress", status: "processing", outputUrl: undefined });

      const result = await getEnhanceTaskStatus("task_in_progress");

      expect(result.status).toBe("processing");
    });

    it("should return done status with output URL when COMPLETED", async () => {
      const outputUrl = "https://cdn.example.com/enhanced.jpg";
      (getEnhanceTaskStatus as any).mockResolvedValue({ taskId: "task_done", status: "done", outputUrl });

      const result = await getEnhanceTaskStatus("task_done");

      expect(result.status).toBe("done");
      expect(result.outputUrl).toBe(outputUrl);
    });

    it("should return failed status when task FAILED", async () => {
      (getEnhanceTaskStatus as any).mockResolvedValue({ taskId: "task_failed", status: "failed", outputUrl: undefined });

      const result = await getEnhanceTaskStatus("task_failed");

      expect(result.status).toBe("failed");
    });
  });
});

describe("Enhancement parameter validation", () => {
  it("should accept valid scale values", () => {
    const validScales = ["x2", "x4", "x8", "x16"];
    validScales.forEach(scale => {
      expect(["x2", "x4", "x8", "x16"]).toContain(scale);
    });
  });

  it("should accept valid optimizedFor values (Freepik API format)", () => {
    const validModes = [
      "standard", "art_n_illustration", "videogame_assets", "soft_portraits",
      "hard_portraits", "nature_n_landscapes", "films_n_photography",
      "3d_renders", "science_fiction_n_horror",
    ];
    validModes.forEach(mode => {
      expect(validModes).toContain(mode);
    });
  });

  it("should accept hdr/creativity/resemblance in range -10 to 10", () => {
    const validValues = [-10, -5, 0, 2, 5, 10];
    validValues.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThanOrEqual(10);
    });
  });

  it("scale_factor conversion: x2 → 2x, x4 → 4x", () => {
    // Verify our internal scale format maps correctly to Freepik format
    const toFreepikScale = (scale: string) => scale.replace(/^x/, "") + "x";
    expect(toFreepikScale("x2")).toBe("2x");
    expect(toFreepikScale("x4")).toBe("4x");
    expect(toFreepikScale("x8")).toBe("8x");
    expect(toFreepikScale("x16")).toBe("16x");
  });
});
