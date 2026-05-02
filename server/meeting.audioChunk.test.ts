/**
 * Tests for meeting audio chunk transcription dedup logic.
 *
 * The fix: when sending full accumulated audio (fallback mode, WebSocket not ready),
 * Whisper returns the entire transcript from the beginning.
 * We must only append the NEW portion after what was already confirmed.
 */
import { describe, it, expect } from "vitest";

/**
 * Mirrors the dedup logic in MeetingMinutes.tsx processAudioChunk
 */
function deduplicateTranscript(prevConfirmed: string, fullText: string): string {
  const prev = prevConfirmed.trim();
  const full = fullText.trim();
  // If Whisper returned empty, preserve previous confirmed text
  if (!full) return prev;
  if (!prev) return full;
  if (full.startsWith(prev)) {
    const suffix = full.slice(prev.length).trim();
    return suffix ? `${prev} ${suffix}` : prev;
  }
  // Whisper corrected earlier text — use full replacement
  return full;
}

describe("meeting audio chunk dedup logic", () => {
  it("returns full text when there is no previous confirmed text", () => {
    const result = deduplicateTranscript("", "大家好，欢迎参加今天的会议");
    expect(result).toBe("大家好，欢迎参加今天的会议");
  });

  it("appends only new suffix when full text starts with previous confirmed", () => {
    const prev = "大家好，欢迎参加今天的会议";
    const full = "大家好，欢迎参加今天的会议 今天主要讨论项目进展";
    const result = deduplicateTranscript(prev, full);
    expect(result).toBe("大家好，欢迎参加今天的会议 今天主要讨论项目进展");
  });

  it("returns previous text unchanged when Whisper returns same content", () => {
    const prev = "大家好，欢迎参加今天的会议";
    const full = "大家好，欢迎参加今天的会议";
    const result = deduplicateTranscript(prev, full);
    expect(result).toBe("大家好，欢迎参加今天的会议");
  });

  it("replaces with full text when Whisper corrects earlier content", () => {
    const prev = "大家好欢迎参加今天会议";
    const full = "大家好，欢迎参加今天的会议 今天主要讨论项目进展";
    const result = deduplicateTranscript(prev, full);
    // full doesn't start with prev, so use full replacement
    expect(result).toBe("大家好，欢迎参加今天的会议 今天主要讨论项目进展");
  });

  it("handles empty full text gracefully", () => {
    const result = deduplicateTranscript("已有文字", "");
    expect(result).toBe("已有文字");
  });

  it("handles multi-segment accumulation correctly", () => {
    // Simulate 3 rounds of full-recording transcription
    let confirmed = "";
    const rounds = [
      "第一段内容",
      "第一段内容 第二段内容",
      "第一段内容 第二段内容 第三段内容",
    ];
    for (const round of rounds) {
      confirmed = deduplicateTranscript(confirmed, round);
    }
    expect(confirmed).toBe("第一段内容 第二段内容 第三段内容");
  });
});
