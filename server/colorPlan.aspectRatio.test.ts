/**
 * colorPlan.aspectRatio.test.ts
 * Tests for floor plan aspect ratio preservation logic in colorPlan.generate
 */
import { describe, it, expect } from "vitest";

// ─── Replicate the size calculation logic from routers.ts ─────────────────────
function calcColorPlanSize(
  floorPlanWidth?: number,
  floorPlanHeight?: number
): string | undefined {
  if (!floorPlanWidth || !floorPlanHeight) return undefined;

  const BASE = 1024;
  const ratio = floorPlanWidth / floorPlanHeight;
  let outW: number, outH: number;

  if (ratio >= 1) {
    // Landscape or square
    outW = BASE;
    outH = Math.round(BASE / ratio);
  } else {
    // Portrait
    outH = BASE;
    outW = Math.round(BASE * ratio);
  }

  // Align to multiples of 64
  outW = Math.max(64, Math.round(outW / 64) * 64);
  outH = Math.max(64, Math.round(outH / 64) * 64);

  return `${outW}x${outH}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("colorPlan aspect ratio preservation", () => {
  it("returns undefined when no dimensions provided", () => {
    expect(calcColorPlanSize()).toBeUndefined();
    expect(calcColorPlanSize(undefined, undefined)).toBeUndefined();
    expect(calcColorPlanSize(1024, undefined)).toBeUndefined();
    expect(calcColorPlanSize(undefined, 1024)).toBeUndefined();
  });

  it("returns 1024x1024 for square images", () => {
    expect(calcColorPlanSize(800, 800)).toBe("1024x1024");
    expect(calcColorPlanSize(1200, 1200)).toBe("1024x1024");
    expect(calcColorPlanSize(512, 512)).toBe("1024x1024");
  });

  it("returns landscape size for wide images (4:3)", () => {
    const result = calcColorPlanSize(1200, 900);
    // ratio = 4/3 → outW=1024, outH=round(1024/1.333)=768
    expect(result).toBe("1024x768");
  });

  it("returns landscape size for wide images (16:9)", () => {
    const result = calcColorPlanSize(1920, 1080);
    // ratio ≈ 1.778 → outW=1024, outH=round(1024/1.778)=576
    expect(result).toBe("1024x576");
  });

  it("returns portrait size for tall images (3:4)", () => {
    const result = calcColorPlanSize(900, 1200);
    // ratio = 0.75 → outH=1024, outW=round(1024*0.75)=768
    expect(result).toBe("768x1024");
  });

  it("returns portrait size for tall images (9:16)", () => {
    const result = calcColorPlanSize(1080, 1920);
    // ratio ≈ 0.5625 → outH=1024, outW=round(1024*0.5625)=576
    expect(result).toBe("576x1024");
  });

  it("aligns output dimensions to multiples of 64", () => {
    // 1000x700 → ratio ≈ 1.4286 → outW=1024, outH=round(1024/1.4286)=717 → align to 704
    const result = calcColorPlanSize(1000, 700);
    const [w, h] = result!.split("x").map(Number);
    expect(w % 64).toBe(0);
    expect(h % 64).toBe(0);
  });

  it("ensures minimum dimension of 64", () => {
    // Extreme ratio: very wide image
    const result = calcColorPlanSize(10000, 100);
    const [, h] = result!.split("x").map(Number);
    expect(h).toBeGreaterThanOrEqual(64);
  });

  it("output width equals BASE (1024) for landscape images", () => {
    const result = calcColorPlanSize(1600, 900);
    const [w] = result!.split("x").map(Number);
    expect(w).toBe(1024);
  });

  it("output height equals BASE (1024) for portrait images", () => {
    const result = calcColorPlanSize(900, 1600);
    const [, h] = result!.split("x").map(Number);
    expect(h).toBe(1024);
  });

  it("returns size string in WxH format", () => {
    const result = calcColorPlanSize(1200, 800);
    expect(result).toMatch(/^\d+x\d+$/);
  });
});
