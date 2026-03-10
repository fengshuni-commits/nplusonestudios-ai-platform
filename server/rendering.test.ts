import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-001",
    email: "test@nplus1.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createContext(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("rendering router input validation", () => {
  it("rendering.generate rejects empty prompt", async () => {
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rendering.generate({ prompt: "" })
    ).rejects.toThrow();
  });

  it("rendering.generate requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rendering.generate({ prompt: "test scene" })
    ).rejects.toThrow();
  });

  it("rendering.generate accepts new optional parameters in schema", async () => {
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.rendering.generate({
        prompt: "test scene",
        style: "architectural-rendering",
        materialImageUrl: "https://example.com/material.png",
        maskImageData: "data:image/png;base64,iVBORw0KGgo=",
        aspectRatio: "16:9",
        resolution: "hd",
      });
    } catch (err: any) {
      // Should fail at image generation, not input validation
      expect(err.code).not.toBe("BAD_REQUEST");
      expect(err.message).not.toContain("Expected");
    }
  });

  it("rendering.edit rejects empty prompt", async () => {
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rendering.edit({ prompt: "", imageUrl: "https://example.com/img.png" })
    ).rejects.toThrow();
  });

  it("rendering.edit requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rendering.edit({ prompt: "test", imageUrl: "https://example.com/img.png" })
    ).rejects.toThrow();
  });
});

describe("aspect ratio and resolution size calculation", () => {
  // Test the size calculation logic that mirrors the server-side implementation
  function calculateImageSize(aspectRatio?: string, resolution?: string): string | undefined {
    const resolutionMap: Record<string, number> = {
      standard: 1024,
      hd: 1536,
      ultra: 2048,
    };
    const baseSize = resolutionMap[resolution || "standard"] || 1024;

    const aspectRatioMap: Record<string, [number, number]> = {
      "1:1": [1, 1],
      "4:3": [4, 3],
      "3:2": [3, 2],
      "16:9": [16, 9],
      "9:16": [9, 16],
      "3:4": [3, 4],
    };

    const ratioEntry = aspectRatio ? aspectRatioMap[aspectRatio] : undefined;
    if (ratioEntry) {
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
    } else if (resolution && resolution !== "standard") {
      return `${baseSize}x${baseSize}`;
    }
    return undefined;
  }

  it("returns undefined for auto ratio and standard resolution", () => {
    expect(calculateImageSize(undefined, undefined)).toBeUndefined();
    expect(calculateImageSize(undefined, "standard")).toBeUndefined();
  });

  it("calculates 1:1 square correctly", () => {
    const size = calculateImageSize("1:1", "standard");
    expect(size).toBe("1024x1024");
  });

  it("calculates 16:9 widescreen correctly", () => {
    const size = calculateImageSize("16:9", "standard");
    expect(size).toBeDefined();
    const [w, h] = size!.split("x").map(Number);
    expect(w).toBe(1024);
    // 1024 / (16/9) ≈ 576, rounded to nearest 64 = 576
    expect(h).toBe(576);
    expect(w).toBeGreaterThan(h);
  });

  it("calculates 9:16 portrait correctly", () => {
    const size = calculateImageSize("9:16", "standard");
    expect(size).toBeDefined();
    const [w, h] = size!.split("x").map(Number);
    expect(h).toBe(1024);
    expect(w).toBeLessThan(h);
  });

  it("calculates 4:3 standard correctly", () => {
    const size = calculateImageSize("4:3", "standard");
    expect(size).toBeDefined();
    const [w, h] = size!.split("x").map(Number);
    expect(w).toBe(1024);
    expect(h).toBe(768);
  });

  it("applies HD resolution to aspect ratio", () => {
    const size = calculateImageSize("1:1", "hd");
    expect(size).toBe("1536x1536");
  });

  it("applies ultra resolution to aspect ratio", () => {
    const size = calculateImageSize("1:1", "ultra");
    expect(size).toBe("2048x2048");
  });

  it("applies HD resolution without aspect ratio", () => {
    const size = calculateImageSize(undefined, "hd");
    expect(size).toBe("1536x1536");
  });

  it("all dimensions are multiples of 64", () => {
    const ratios = ["1:1", "4:3", "3:2", "16:9", "9:16", "3:4"];
    const resolutions = ["standard", "hd", "ultra"];
    for (const ratio of ratios) {
      for (const res of resolutions) {
        const size = calculateImageSize(ratio, res);
        expect(size).toBeDefined();
        const [w, h] = size!.split("x").map(Number);
        expect(w % 64).toBe(0);
        expect(h % 64).toBe(0);
      }
    }
  });
});
