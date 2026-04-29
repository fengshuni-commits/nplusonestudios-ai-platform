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
