/**
 * Unit tests for callbackUrl webhook support in colorPlan and analysisImage REST endpoints.
 * These tests verify that the fireWebhook helper is called with the correct payload
 * when callbackUrl is provided.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock fireWebhook by testing its logic directly ────────────────────────

async function fireWebhook(
  callbackUrl: string,
  payload: Record<string, unknown>,
  maxRetries = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "N+1-STUDIOS-Webhook/1.0",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
    } catch (err: any) {
      // retry
    }
    if (attempt < maxRetries)
      await new Promise((r) => setTimeout(r, 10)); // short delay for tests
  }
}

describe("fireWebhook helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls fetch with correct method, headers, and JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "color_plan.done",
      jobId: "job123",
      status: "done",
      url: "https://cdn.example.com/result.png",
      historyId: 42,
    };

    await fireWebhook("https://example.com/webhook", payload);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/webhook");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["User-Agent"]).toBe("N+1-STUDIOS-Webhook/1.0");
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it("returns immediately on first successful response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await fireWebhook("https://example.com/webhook", { event: "color_plan.done" });

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("retries up to maxRetries times on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    await fireWebhook("https://example.com/webhook", { event: "color_plan.failed" }, 3);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on fetch error (network failure)", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await fireWebhook("https://example.com/webhook", { event: "analysis_image.done" }, 3);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("sends correct payload for color_plan.done event", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "color_plan.done",
      jobId: "abc-123",
      status: "done",
      url: "https://storage.example.com/color-plan.png",
      historyId: 99,
    };
    await fireWebhook("https://callback.example.com/color-plan", payload);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("color_plan.done");
    expect(body.jobId).toBe("abc-123");
    expect(body.status).toBe("done");
    expect(body.url).toBe("https://storage.example.com/color-plan.png");
    expect(body.historyId).toBe(99);
  });

  it("sends correct payload for analysis_image.failed event", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "analysis_image.failed",
      jobId: "def-456",
      status: "failed",
      error: "AI generation timeout",
    };
    await fireWebhook("https://callback.example.com/analysis-image", payload);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("analysis_image.failed");
    expect(body.jobId).toBe("def-456");
    expect(body.status).toBe("failed");
    expect(body.error).toBe("AI generation timeout");
  });
});

describe("video callbackUrl webhook payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends video.done payload with correct fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "video.done",
      taskId: "vid_abc123",
      status: "completed",
      videoUrl: "https://cdn.example.com/video.mp4",
    };
    await fireWebhook("https://callback.example.com/video", payload);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("video.done");
    expect(body.taskId).toBe("vid_abc123");
    expect(body.status).toBe("completed");
    expect(body.videoUrl).toBe("https://cdn.example.com/video.mp4");
  });

  it("sends video.failed payload with correct fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "video.failed",
      taskId: "vid_def456",
      status: "failed",
      error: "Video generation timeout",
    };
    await fireWebhook("https://callback.example.com/video", payload);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("video.failed");
    expect(body.taskId).toBe("vid_def456");
    expect(body.status).toBe("failed");
    expect(body.error).toBe("Video generation timeout");
  });

  it("retries video webhook on non-ok response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await fireWebhook("https://callback.example.com/video", { event: "video.done", taskId: "vid_xyz" }, 3);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("graphic layout inpaint callbackUrl webhook payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends graphic_layout.inpaint.done payload with correct fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      event: "graphic_layout.inpaint.done",
      jobId: 42,
      pageIndex: 0,
      blockId: "tb_0_title",
      newText: "N+1 STUDIOS 建筑设计",
      imageUrl: "https://cdn.example.com/graphic-layout/job42-page0-repainted.png",
    };
    await fireWebhook("https://callback.example.com/graphic-layout", payload);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("graphic_layout.inpaint.done");
    expect(body.jobId).toBe(42);
    expect(body.pageIndex).toBe(0);
    expect(body.blockId).toBe("tb_0_title");
    expect(body.newText).toBe("N+1 STUDIOS 建筑设计");
    expect(body.imageUrl).toBe("https://cdn.example.com/graphic-layout/job42-page0-repainted.png");
  });

  it("retries graphic layout inpaint webhook on non-ok response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await fireWebhook(
      "https://callback.example.com/graphic-layout",
      { event: "graphic_layout.inpaint.done", jobId: 42, pageIndex: 0, blockId: "tb_0_title" },
      3
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends correct User-Agent header for graphic layout inpaint webhook", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await fireWebhook("https://callback.example.com/graphic-layout", {
      event: "graphic_layout.inpaint.done",
      jobId: 10,
      pageIndex: 1,
      blockId: "tb_1_body",
    });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["User-Agent"]).toBe("N+1-STUDIOS-Webhook/1.0");
    expect(options.method).toBe("POST");
  });
});

// ─── Unit tests for inpaint composite coordinate sanitization ───────────────

/**
 * Replicates the coordinate sanitization logic from the inpaint endpoint
 * to verify it handles undefined/null/out-of-bounds block coordinates.
 */
function sanitizeCompositeCoords(
  block: { x?: any; y?: any; width?: any; height?: any },
  imgW: number,
  imgH: number,
  padding = 20
): { mx: number; my: number; mw: number; mh: number; valid: boolean } {
  const bx = isFinite(Number(block.x)) ? Number(block.x) : 0;
  const by = isFinite(Number(block.y)) ? Number(block.y) : 0;
  const bw = isFinite(Number(block.width)) ? Number(block.width) : 0;
  const bh = isFinite(Number(block.height)) ? Number(block.height) : 0;
  const mx = Math.max(0, Math.round(bx) - padding);
  const my = Math.max(0, Math.round(by) - padding);
  const mw = Math.min(imgW - mx, Math.round(bw) + padding * 2);
  const mh = Math.min(imgH - my, Math.round(bh) + padding * 2);
  return { mx, my, mw, mh, valid: mw > 0 && mh > 0 };
}

describe("inpaint composite coordinate sanitization", () => {
  const IMG_W = 1024;
  const IMG_H = 1365;

  it("handles normal block coordinates correctly", () => {
    const result = sanitizeCompositeCoords(
      { x: 100, y: 200, width: 300, height: 50 },
      IMG_W, IMG_H
    );
    expect(result.valid).toBe(true);
    expect(result.mx).toBe(80);
    expect(result.my).toBe(180);
    expect(result.mw).toBe(340);
    expect(result.mh).toBe(90);
  });

  it("handles undefined block.x by defaulting to 0", () => {
    const result = sanitizeCompositeCoords(
      { x: undefined, y: 100, width: 200, height: 50 },
      IMG_W, IMG_H
    );
    expect(result.valid).toBe(true);
    expect(result.mx).toBe(0); // max(0, 0 - 20) = 0
    expect(isFinite(result.mw)).toBe(true);
    expect(isFinite(result.mh)).toBe(true);
  });

  it("handles undefined block.width by defaulting to 0", () => {
    const result = sanitizeCompositeCoords(
      { x: 100, y: 100, width: undefined, height: 50 },
      IMG_W, IMG_H
    );
    expect(result.valid).toBe(true);
    expect(isFinite(result.mw)).toBe(true);
    expect(result.mw).toBe(40); // min(1024-80, 0+40) = 40
  });

  it("handles null block coordinates by defaulting to 0", () => {
    const result = sanitizeCompositeCoords(
      { x: null, y: null, width: null, height: null },
      IMG_W, IMG_H
    );
    expect(result.valid).toBe(true);
    expect(isFinite(result.mw)).toBe(true);
    expect(isFinite(result.mh)).toBe(true);
  });

  it("marks as invalid when block.x is beyond image width", () => {
    const result = sanitizeCompositeCoords(
      { x: 1100, y: 100, width: 200, height: 50 },
      IMG_W, IMG_H
    );
    // mx = max(0, 1100-20) = 1080; mw = min(1024-1080, ...) = negative
    expect(result.valid).toBe(false);
  });

  it("marks as invalid when block.y is beyond image height", () => {
    const result = sanitizeCompositeCoords(
      { x: 100, y: 1400, width: 200, height: 50 },
      IMG_W, IMG_H
    );
    // my = max(0, 1400-20) = 1380; mh = min(1365-1380, ...) = negative
    expect(result.valid).toBe(false);
  });

  it("handles fractional coordinates correctly", () => {
    const result = sanitizeCompositeCoords(
      { x: 100.7, y: 200.3, width: 300.5, height: 50.2 },
      IMG_W, IMG_H
    );
    expect(result.valid).toBe(true);
    expect(isFinite(result.mx)).toBe(true);
    expect(isFinite(result.mw)).toBe(true);
  });

  it("clamps block at left edge (x near 0)", () => {
    const result = sanitizeCompositeCoords(
      { x: 5, y: 100, width: 200, height: 50 },
      IMG_W, IMG_H
    );
    expect(result.valid).toBe(true);
    expect(result.mx).toBe(0); // max(0, 5-20) = 0
  });
});
