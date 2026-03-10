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
    // Verify the input schema accepts the new fields without throwing validation errors
    // We can't actually call the API (it would try to generate an image),
    // so we verify the schema accepts the shape by checking the router definition
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);

    // This should fail at the image generation step, NOT at input validation
    // If the schema didn't accept these fields, it would throw a ZodError
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
      // The error should be INTERNAL_SERVER_ERROR (from generateImage failing)
      // or UNAUTHORIZED, but NOT a Zod validation error
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
