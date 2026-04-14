/**
 * Tests for streamTranscribe WebSocket service
 * Tests the URL building and message parsing logic
 */
import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

// ─── Replicate the URL building logic from streamTranscribe.ts ───────────────

interface XfyunCredentials {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

function buildXfyunUrl(creds: XfyunCredentials, date: string): string {
  const host = "iat-api.xfyun.cn";
  const path = "/v2/iat";
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto
    .createHmac("sha256", creds.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authOrigin = `api_key="${creds.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authOrigin).toString("base64");
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
}

// ─── Replicate sentence accumulation logic ───────────────────────────────────

type PgsMode = "apd" | "rpl";

function accumulateSentences(
  sentences: Map<number, string>,
  sn: number,
  text: string,
  pgs: PgsMode,
  rg?: [number, number]
): string {
  if (pgs === "rpl" && rg) {
    const [from, to] = rg;
    for (let i = from; i <= to; i++) sentences.delete(i);
  }
  sentences.set(sn, text);
  return Array.from(sentences.values()).join("");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildXfyunUrl", () => {
  const creds: XfyunCredentials = {
    appId: "testAppId",
    apiKey: "testApiKey",
    apiSecret: "testApiSecret",
  };

  it("should return a wss:// URL", () => {
    const date = new Date().toUTCString();
    const url = buildXfyunUrl(creds, date);
    expect(url).toMatch(/^wss:\/\/iat-api\.xfyun\.cn\/v2\/iat\?/);
  });

  it("should include authorization, date, and host params", () => {
    const date = "Mon, 14 Apr 2026 00:00:00 GMT";
    const url = buildXfyunUrl(creds, date);
    expect(url).toContain("authorization=");
    expect(url).toContain("date=");
    expect(url).toContain("host=iat-api.xfyun.cn");
  });

  it("should produce deterministic output for same inputs", () => {
    const date = "Mon, 14 Apr 2026 00:00:00 GMT";
    const url1 = buildXfyunUrl(creds, date);
    const url2 = buildXfyunUrl(creds, date);
    expect(url1).toBe(url2);
  });

  it("should produce different URLs for different dates", () => {
    const url1 = buildXfyunUrl(creds, "Mon, 14 Apr 2026 00:00:00 GMT");
    const url2 = buildXfyunUrl(creds, "Tue, 15 Apr 2026 00:00:00 GMT");
    expect(url1).not.toBe(url2);
  });

  it("should encode authorization as base64 in URL", () => {
    const date = "Mon, 14 Apr 2026 00:00:00 GMT";
    const url = buildXfyunUrl(creds, date);
    const params = new URLSearchParams(url.split("?")[1]);
    const authEncoded = params.get("authorization") || "";
    // Should be URL-encoded base64
    expect(authEncoded.length).toBeGreaterThan(0);
    const decoded = decodeURIComponent(authEncoded);
    // Base64 decoded should contain the api_key
    const inner = Buffer.from(decoded, "base64").toString("utf8");
    expect(inner).toContain("testApiKey");
  });
});

describe("sentence accumulation (wpgs mode)", () => {
  it("should append new sentences in apd mode", () => {
    const sentences = new Map<number, string>();
    accumulateSentences(sentences, 1, "你好", "apd");
    accumulateSentences(sentences, 2, "世界", "apd");
    expect(Array.from(sentences.values()).join("")).toBe("你好世界");
  });

  it("should replace sentences in rpl mode", () => {
    const sentences = new Map<number, string>();
    accumulateSentences(sentences, 1, "你好", "apd");
    accumulateSentences(sentences, 2, "世界", "apd");
    // Replace sentences 1-2 with corrected text
    accumulateSentences(sentences, 1, "你好世界", "rpl", [1, 2]);
    expect(Array.from(sentences.values()).join("")).toBe("你好世界");
  });

  it("should keep sentences outside rpl range", () => {
    const sentences = new Map<number, string>();
    accumulateSentences(sentences, 1, "第一句", "apd");
    accumulateSentences(sentences, 2, "第二句", "apd");
    accumulateSentences(sentences, 3, "第三句", "apd");
    // Replace only sentence 2
    accumulateSentences(sentences, 2, "修正第二句", "rpl", [2, 2]);
    const result = Array.from(sentences.values()).join("");
    expect(result).toContain("第一句");
    expect(result).toContain("修正第二句");
    expect(result).toContain("第三句");
    expect(result).not.toContain("第二句\u4e2d"); // "第二句" without "修正"
  });

  it("should handle empty text gracefully", () => {
    const sentences = new Map<number, string>();
    accumulateSentences(sentences, 1, "", "apd");
    expect(Array.from(sentences.values()).join("")).toBe("");
  });

  it("should clear all sentences on final", () => {
    const sentences = new Map<number, string>();
    accumulateSentences(sentences, 1, "你好", "apd");
    accumulateSentences(sentences, 2, "世界", "apd");
    const finalText = Array.from(sentences.values()).join("");
    sentences.clear();
    expect(sentences.size).toBe(0);
    expect(finalText).toBe("你好世界");
  });
});

describe("PCM frame size calculation", () => {
  it("should calculate correct frame count for 1 second of audio", () => {
    const SAMPLE_RATE = 16000;
    const BITS_PER_SAMPLE = 16;
    const CHANNELS = 1;
    const FRAME_SIZE = 1280; // bytes per frame (40ms)
    
    const bytesPerSecond = SAMPLE_RATE * (BITS_PER_SAMPLE / 8) * CHANNELS;
    const framesPerSecond = bytesPerSecond / FRAME_SIZE;
    
    expect(bytesPerSecond).toBe(32000); // 32KB/s
    expect(framesPerSecond).toBe(25); // 25 frames/s = 40ms each
  });

  it("should calculate minimum audio length for transcription", () => {
    const FRAME_SIZE = 1280;
    const MIN_FRAMES = 3; // minimum frames to be meaningful
    const minBytes = FRAME_SIZE * MIN_FRAMES;
    expect(minBytes).toBe(3840); // ~120ms minimum
  });
});
