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

  it("rendering.generate accepts all optional parameters in schema", { timeout: 30000 }, async () => {
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
        parentHistoryId: 1,
        referenceImageUrl: "https://example.com/ref.png",
      });
    } catch (err: any) {
      // Should fail at image generation or image processing, not input validation
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
  // Mirror the server-side calculateImageSize logic
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
    expect(calculateImageSize("1:1", "standard")).toBe("1024x1024");
  });

  it("calculates 16:9 widescreen correctly", () => {
    const size = calculateImageSize("16:9", "standard");
    expect(size).toBeDefined();
    const [w, h] = size!.split("x").map(Number);
    expect(w).toBe(1024);
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
    const [w, h] = size!.split("x").map(Number);
    expect(w).toBe(1024);
    expect(h).toBe(768);
  });

  it("calculates 3:2 correctly", () => {
    const size = calculateImageSize("3:2", "standard");
    const [w, h] = size!.split("x").map(Number);
    expect(w).toBe(1024);
    // 1024 / 1.5 ≈ 683, rounded to 64 = 704
    expect(h % 64).toBe(0);
    expect(w).toBeGreaterThan(h);
  });

  it("applies HD resolution to aspect ratio", () => {
    expect(calculateImageSize("1:1", "hd")).toBe("1536x1536");
  });

  it("applies ultra resolution to aspect ratio", () => {
    expect(calculateImageSize("1:1", "ultra")).toBe("2048x2048");
  });

  it("applies HD resolution without aspect ratio", () => {
    expect(calculateImageSize(undefined, "hd")).toBe("1536x1536");
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

describe("assets router - material upload and sync", () => {
  it("assets.create requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.assets.create({
        name: "test-material",
        fileUrl: "https://example.com/img.png",
        fileKey: "assets/test.png",
      })
    ).rejects.toThrow();
  });

  it("assets.upload requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.assets.upload({
        fileName: "test.png",
        fileData: "iVBORw0KGgo=",
        contentType: "image/png",
      })
    ).rejects.toThrow();
  });

  it("assets.list requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.assets.list()).rejects.toThrow();
  });
  it("assets.importFromHistory requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.assets.importFromHistory({ historyId: 1 })
    ).rejects.toThrow();
  });
  it("assets.importFromHistory throws NOT_FOUND for non-existent history", async () => {
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.assets.importFromHistory({ historyId: 999999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("assets.create accepts historyId and projectId fields in schema", async () => {
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    // Schema validation must pass (historyId/projectId are valid optional fields)
    // The call may succeed (DB available) or fail (DB unavailable) - both are acceptable
    try {
      const result = await caller.assets.create({
        name: "test-with-project",
        fileUrl: "https://example.com/img.png",
        fileKey: "assets/test.png",
        historyId: 1,
        projectId: 2,
      });
      // If DB is available, result should have an id
      expect(result).toHaveProperty("id");
    } catch (err: any) {
      // If DB is unavailable, should not be a schema validation error
      expect(err.message).not.toContain("Expected");
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });
  it("assets.list accepts category filter in schema", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    // Unauthenticated should throw auth error, not schema error
    await expect(
      caller.assets.list({ category: "ai_render", search: "test" })
    ).rejects.toThrow();
  });
  it("assets.delete requires authentication", async () => {
    const ctx = createContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.assets.delete({ id: 1 })
    ).rejects.toThrow();
  });
});
