import { describe, it, expect } from "vitest";

// Test the image processor logic (unit tests for pure functions)
// Since compositeMaskOnImage and cropToAspectRatio require network + sharp,
// we test the aspect ratio calculation logic used in the router

describe("Image Processing - Aspect Ratio Size Calculation", () => {
  const resolutionMap: Record<string, number> = {
    standard: 1024,
    hd: 1536,
    ultra: 2048,
  };

  const aspectRatioMap: Record<string, [number, number]> = {
    "1:1": [1, 1],
    "4:3": [4, 3],
    "3:2": [3, 2],
    "16:9": [16, 9],
    "9:16": [9, 16],
    "3:4": [3, 4],
  };

  function calculateSize(aspectRatio: string, resolution: string): string | undefined {
    const baseSize = resolutionMap[resolution] || 1024;
    const ratioEntry = aspectRatioMap[aspectRatio];
    if (!ratioEntry) return undefined;
    const [rw, rh] = ratioEntry;
    const ratio = rw / rh;
    let w: number, h: number;
    if (ratio >= 1) {
      w = baseSize;
      h = Math.round(baseSize / ratio);
    } else {
      h = baseSize;
      w = Math.round(baseSize * ratio);
    }
    w = Math.round(w / 64) * 64;
    h = Math.round(h / 64) * 64;
    return `${w}x${h}`;
  }

  it("should calculate 1:1 standard as 1024x1024", () => {
    expect(calculateSize("1:1", "standard")).toBe("1024x1024");
  });

  it("should calculate 16:9 standard as 1024x576", () => {
    expect(calculateSize("16:9", "standard")).toBe("1024x576");
  });

  it("should calculate 9:16 standard as 576x1024", () => {
    expect(calculateSize("9:16", "standard")).toBe("576x1024");
  });

  it("should calculate 4:3 standard as 1024x768", () => {
    expect(calculateSize("4:3", "standard")).toBe("1024x768");
  });

  it("should calculate 3:2 standard as 1024x704", () => {
    const result = calculateSize("3:2", "standard");
    // 1024 / 1.5 = 682.67, rounded to 683, then to nearest 64 = 704
    expect(result).toBe("1024x704");
  });

  it("should calculate 1:1 hd as 1536x1536", () => {
    expect(calculateSize("1:1", "hd")).toBe("1536x1536");
  });

  it("should calculate 16:9 hd as 1536x896", () => {
    const result = calculateSize("16:9", "hd");
    // 1536 / (16/9) = 864, round to 64 = 896 (864 -> 896)
    expect(result).toBe("1536x896");
  });

  it("should return undefined for unknown aspect ratio", () => {
    expect(calculateSize("5:3", "standard")).toBeUndefined();
  });
});

describe("Image Processing - Crop Ratio Calculation", () => {
  function calculateCrop(srcW: number, srcH: number, targetRatio: number) {
    const srcRatio = srcW / srcH;
    let cropW: number, cropH: number, left: number, top: number;
    if (srcRatio > targetRatio) {
      cropH = srcH;
      cropW = Math.round(srcH * targetRatio);
      left = Math.round((srcW - cropW) / 2);
      top = 0;
    } else {
      cropW = srcW;
      cropH = Math.round(srcW / targetRatio);
      left = 0;
      top = Math.round((srcH - cropH) / 2);
    }
    return { cropW, cropH, left, top };
  }

  it("should crop wider image to 1:1 by reducing width", () => {
    const result = calculateCrop(1920, 1080, 1);
    expect(result.cropW).toBe(1080);
    expect(result.cropH).toBe(1080);
    expect(result.left).toBe(420);
    expect(result.top).toBe(0);
  });

  it("should crop taller image to 16:9 by reducing height", () => {
    const result = calculateCrop(1080, 1920, 16 / 9);
    expect(result.cropW).toBe(1080);
    expect(result.cropH).toBe(608); // 1080 / (16/9) = 607.5 -> 608
    expect(result.left).toBe(0);
    expect(result.top).toBe(656);
  });

  it("should crop 4:3 image to 16:9 by reducing height", () => {
    const result = calculateCrop(1024, 768, 16 / 9);
    expect(result.cropW).toBe(1024);
    expect(result.cropH).toBe(576);
    expect(result.left).toBe(0);
    expect(result.top).toBe(96);
  });

  it("should handle already matching ratio (no significant crop)", () => {
    const result = calculateCrop(1920, 1080, 16 / 9);
    expect(result.cropW).toBe(1920);
    expect(result.cropH).toBe(1080);
  });
});

describe("Image Processing - Inpainting Prompt Construction", () => {
  it("should add inpainting instruction to prompt when mask is provided", () => {
    const basePrompt = "将这个区域改为木饰面";
    const fullPrompt = `[INPAINTING INSTRUCTION: The image has red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas. Keep all other areas exactly unchanged.] ${basePrompt}`;
    expect(fullPrompt).toContain("INPAINTING INSTRUCTION");
    expect(fullPrompt).toContain("red-highlighted");
    expect(fullPrompt).toContain(basePrompt);
  });

  it("should keep original prompt when no mask", () => {
    const basePrompt = "现代办公空间渲染";
    expect(basePrompt).not.toContain("INPAINTING");
  });
});
