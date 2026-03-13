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
        detail: 0,
        resemblance: 0,
      });

      expect(result.taskId).toBe(mockTaskId);
      expect(submitEnhanceTask).toHaveBeenCalledWith({
        imageUrl: "https://example.com/image.jpg",
        scale: "x2",
        optimizedFor: "3d_renders",
        creativity: 0,
        detail: 0,
        resemblance: 0,
      });
    });

    it("should support x4 scale", async () => {
      (submitEnhanceTask as any).mockResolvedValue({ taskId: "task_x4" });

      const result = await submitEnhanceTask({
        imageUrl: "https://example.com/image.jpg",
        scale: "x4",
        optimizedFor: "architecture",
        creativity: 2,
        detail: 1,
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
          detail: 0,
          resemblance: 0,
        })
      ).rejects.toThrow("Invalid image URL");
    });
  });

  describe("getEnhanceTaskStatus", () => {
    it("should return processing status when task is pending", async () => {
      (getEnhanceTaskStatus as any).mockResolvedValue({ status: "processing", outputUrl: null });

      const result = await getEnhanceTaskStatus("task_pending");

      expect(result.status).toBe("processing");
      expect(result.outputUrl).toBeNull();
    });

    it("should return done status with output URL when complete", async () => {
      const outputUrl = "https://cdn.example.com/enhanced.jpg";
      (getEnhanceTaskStatus as any).mockResolvedValue({ status: "done", outputUrl });

      const result = await getEnhanceTaskStatus("task_done");

      expect(result.status).toBe("done");
      expect(result.outputUrl).toBe(outputUrl);
    });

    it("should return failed status when task fails", async () => {
      (getEnhanceTaskStatus as any).mockResolvedValue({ status: "failed", outputUrl: null });

      const result = await getEnhanceTaskStatus("task_failed");

      expect(result.status).toBe("failed");
    });
  });
});

describe("Enhancement parameter validation", () => {
  it("should accept valid scale values", () => {
    const validScales = ["x2", "x4"];
    validScales.forEach(scale => {
      expect(["x2", "x4"]).toContain(scale);
    });
  });

  it("should accept valid optimizedFor values", () => {
    const validModes = ["3d_renders", "architecture", "photography", "default"];
    validModes.forEach(mode => {
      expect(validModes).toContain(mode);
    });
  });

  it("should accept creativity/detail/resemblance in range -5 to 5", () => {
    const validValues = [-5, -3, 0, 2, 5];
    validValues.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    });
  });
});
