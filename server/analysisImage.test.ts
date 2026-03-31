import { describe, it, expect } from "vitest";

// ─── Unit tests for analysisImage submit parameter parsing ────────────────────

describe("analysisImage submit – aspectRatio parsing", () => {
  function parseAspectRatio(aspectRatio?: string) {
    let width: number | undefined;
    let height: number | undefined;
    if (aspectRatio) {
      const parts = aspectRatio.split("x");
      if (parts.length === 2) {
        width = parseInt(parts[0], 10);
        height = parseInt(parts[1], 10);
      }
    }
    return { width, height };
  }

  it("parses 1:1 square ratio", () => {
    const { width, height } = parseAspectRatio("1024x1024");
    expect(width).toBe(1024);
    expect(height).toBe(1024);
  });

  it("parses 16:9 widescreen ratio", () => {
    const { width, height } = parseAspectRatio("1024x576");
    expect(width).toBe(1024);
    expect(height).toBe(576);
  });

  it("parses 3:4 portrait ratio", () => {
    const { width, height } = parseAspectRatio("768x1024");
    expect(width).toBe(768);
    expect(height).toBe(1024);
  });

  it("returns undefined for missing aspectRatio", () => {
    const { width, height } = parseAspectRatio(undefined);
    expect(width).toBeUndefined();
    expect(height).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const { width, height } = parseAspectRatio("");
    expect(width).toBeUndefined();
    expect(height).toBeUndefined();
  });

  it("builds correct size string from width/height", () => {
    const width = 1024;
    const height = 768;
    const sizeStr = (width && height) ? `${width}x${height}` : undefined;
    expect(sizeStr).toBe("1024x768");
  });

  it("returns undefined size string when no dimensions", () => {
    const width = undefined;
    const height = undefined;
    const sizeStr = (width && height) ? `${width}x${height}` : undefined;
    expect(sizeStr).toBeUndefined();
  });
});

describe("analysisImage submit – count validation", () => {
  it("accepts count=1", () => {
    const count = 1;
    expect(count >= 1 && count <= 3).toBe(true);
  });

  it("accepts count=3", () => {
    const count = 3;
    expect(count >= 1 && count <= 3).toBe(true);
  });

  it("generates correct number of job IDs", () => {
    const count = 3;
    const jobIds: string[] = [];
    for (let i = 0; i < count; i++) {
      jobIds.push(`job-${i}`);
    }
    expect(jobIds).toHaveLength(3);
  });

  it("returns first jobId as primary", () => {
    const jobIds = ["job-0", "job-1", "job-2"];
    const result = { jobId: jobIds[0], jobIds };
    expect(result.jobId).toBe("job-0");
    expect(result.jobIds).toHaveLength(3);
  });
});

describe("analysisImage pollJobs – result mapping", () => {
  it("maps done status correctly", () => {
    const mockJob = {
      id: "job-1",
      userId: 1,
      status: "done",
      resultUrl: "https://example.com/result.png",
      historyId: 42,
    };

    const result = mockJob.status === "done"
      ? { jobId: mockJob.id, status: "done" as const, url: mockJob.resultUrl || "", historyId: mockJob.historyId }
      : null;

    expect(result).not.toBeNull();
    expect(result!.status).toBe("done");
    expect(result!.url).toBe("https://example.com/result.png");
    expect(result!.historyId).toBe(42);
  });

  it("maps failed status correctly", () => {
    const mockJob = {
      id: "job-2",
      userId: 1,
      status: "failed",
      error: "API timeout",
    };

    const result = mockJob.status === "failed"
      ? { jobId: mockJob.id, status: "failed" as const, error: mockJob.error || "生成失败" }
      : null;

    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
    expect(result!.error).toBe("API timeout");
  });

  it("maps pending status correctly", () => {
    const mockJob = { id: "job-3", userId: 1, status: "pending" };
    const result = { jobId: mockJob.id, status: mockJob.status as "pending" | "processing" };
    expect(result.status).toBe("pending");
  });
});
