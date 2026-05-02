/**
 * Tests for speech_transcription capability type and default tool auto-resolution
 */
import { describe, it, expect } from "vitest";
import { inferCapabilities, CAPABILITY_LABELS, ALL_CAPABILITIES } from "../shared/toolCapabilities";

describe("speech_transcription capability", () => {
  it("should include speech_transcription in ALL_CAPABILITIES", () => {
    expect(ALL_CAPABILITIES).toContain("speech_transcription");
  });

  it("should have a Chinese label for speech_transcription", () => {
    expect(CAPABILITY_LABELS["speech_transcription"]).toBe("语音转录");
  });

  it("should infer speech_transcription for xfyun tools", () => {
    const caps = inferCapabilities("讯飞语音转录 IAT", "https://iat-api.xfyun.cn");
    expect(caps).toContain("speech_transcription");
  });

  it("should infer speech_transcription for iflytek keyword", () => {
    const caps = inferCapabilities("iflytek ASR", "https://api.iflytek.com/asr");
    expect(caps).toContain("speech_transcription");
  });

  it("should infer speech_transcription for whisper keyword", () => {
    const caps = inferCapabilities("Whisper Large V3", "https://api.openai.com/v1/audio/transcriptions");
    expect(caps).toContain("speech_transcription");
  });

  it("should infer speech_transcription for paraformer keyword", () => {
    const caps = inferCapabilities("Paraformer FunASR", "https://dashscope.aliyuncs.com/api/v1/services/audio");
    expect(caps).toContain("speech_transcription");
  });

  it("should NOT infer speech_transcription for regular LLM tools", () => {
    const caps = inferCapabilities("GPT-4o", "https://api.openai.com/v1/chat/completions");
    expect(caps).not.toContain("speech_transcription");
  });

  it("should NOT infer speech_transcription for image generation tools", () => {
    const caps = inferCapabilities("Stable Diffusion XL", "https://api.stability.ai/v1/generation");
    expect(caps).not.toContain("speech_transcription");
  });
});
