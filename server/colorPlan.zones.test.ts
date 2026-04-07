/**
 * colorPlan.zones.test.ts
 * Tests for functional zone prompt injection in colorPlan.generate
 */
import { describe, it, expect } from "vitest";

// ─── Replicate the zone prompt injection logic from routers.ts ────────────────
type Zone = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
};

function buildZonePrompt(basePrompt: string, zones: Zone[]): string {
  if (!zones || zones.length === 0) return basePrompt;

  const zoneDescriptions = zones.map((z, i) => {
    const xPct = Math.round(z.x * 100);
    const yPct = Math.round(z.y * 100);
    const wPct = Math.round(z.w * 100);
    const hPct = Math.round(z.h * 100);
    return `Zone ${i + 1}: "${z.name}" — located at approximately ${xPct}% from left, ${yPct}% from top, spanning ${wPct}% wide and ${hPct}% tall. Furnish and decorate this area as a ${z.name} with appropriate furniture, fixtures, and materials.`;
  }).join(" ");

  return basePrompt + ` FUNCTIONAL ZONES (MUST follow exactly): The floor plan has been divided into ${zones.length} labeled functional zones. ${zoneDescriptions} Each zone must be clearly identifiable by its function through appropriate furniture placement, material selection, and spatial treatment. Label each zone with its function name in the rendered output.`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("colorPlan zone prompt injection", () => {
  const BASE_PROMPT = "Architectural colored floor plan.";

  it("returns base prompt unchanged when no zones provided", () => {
    expect(buildZonePrompt(BASE_PROMPT, [])).toBe(BASE_PROMPT);
  });

  it("appends FUNCTIONAL ZONES section when zones are provided", () => {
    const zones: Zone[] = [
      { name: "客厅", x: 0, y: 0, w: 0.5, h: 0.6 },
    ];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    expect(result).toContain("FUNCTIONAL ZONES (MUST follow exactly)");
    expect(result).toContain("客厅");
    expect(result).toContain("Zone 1");
  });

  it("correctly converts relative coordinates to percentages", () => {
    const zones: Zone[] = [
      { name: "主卧", x: 0.5, y: 0.25, w: 0.4, h: 0.35 },
    ];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    expect(result).toContain("50% from left");
    expect(result).toContain("25% from top");
    expect(result).toContain("40% wide");
    expect(result).toContain("35% tall");
  });

  it("handles multiple zones with correct numbering", () => {
    const zones: Zone[] = [
      { name: "客厅", x: 0, y: 0, w: 0.5, h: 0.5 },
      { name: "主卧", x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { name: "厨房", x: 0, y: 0.5, w: 0.3, h: 0.5 },
    ];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    expect(result).toContain("Zone 1");
    expect(result).toContain("Zone 2");
    expect(result).toContain("Zone 3");
    expect(result).toContain("3 labeled functional zones");
    expect(result).toContain("客厅");
    expect(result).toContain("主卧");
    expect(result).toContain("厨房");
  });

  it("includes furnish instruction for each zone name", () => {
    const zones: Zone[] = [
      { name: "卫生间", x: 0.7, y: 0.7, w: 0.3, h: 0.3 },
    ];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    expect(result).toContain("Furnish and decorate this area as a 卫生间");
  });

  it("instructs AI to label zone names in rendered output", () => {
    const zones: Zone[] = [
      { name: "餐厅", x: 0.3, y: 0.3, w: 0.3, h: 0.3 },
    ];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    expect(result).toContain("Label each zone with its function name in the rendered output");
  });

  it("rounds percentage values correctly", () => {
    const zones: Zone[] = [
      { name: "书房", x: 0.333, y: 0.667, w: 0.111, h: 0.222 },
    ];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    // 0.333 * 100 = 33.3 → round to 33
    expect(result).toContain("33% from left");
    // 0.667 * 100 = 66.7 → round to 67
    expect(result).toContain("67% from top");
    // 0.111 * 100 = 11.1 → round to 11
    expect(result).toContain("11% wide");
    // 0.222 * 100 = 22.2 → round to 22
    expect(result).toContain("22% tall");
  });

  it("preserves base prompt at the start", () => {
    const zones: Zone[] = [{ name: "走廊", x: 0.4, y: 0.4, w: 0.2, h: 0.2 }];
    const result = buildZonePrompt(BASE_PROMPT, zones);
    expect(result.startsWith(BASE_PROMPT)).toBe(true);
  });
});
