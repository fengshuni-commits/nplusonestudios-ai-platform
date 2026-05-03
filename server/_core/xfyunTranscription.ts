/**
 * 讯飞语音听写（iat）WebSocket 接口封装
 * 文档：https://www.xfyun.cn/doc/asr/voicedictation/API.html
 *
 * 流程：
 * 1. 从 S3 下载音频文件
 * 2. 直接将原始音频字节分帧发送给讯飞（无需 ffmpeg 转换）
 *    - PCM/WAV：format="audio/L16;rate=16000"
 *    - 其他格式（m4a/mp3/webm等）：format 对应 MIME，讯飞服务端解码
 * 3. 收集识别结果，处理 wpgs 动态修正
 */

import crypto from "crypto";
import WebSocket from "ws";

export interface XfyunCredentials {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

export interface XfyunTranscribeResult {
  text: string;
  language: string;
}

export interface XfyunTranscribeError {
  error: string;
  code?: string | number;
  details?: string;
}

type XfyunResult = XfyunTranscribeResult | XfyunTranscribeError;

// ─── URL 签名 ──────────────────────────────────────────────────────────────

function buildXfyunUrl(credentials: XfyunCredentials): string {
  const host = "iat-api.xfyun.cn";
  const path = "/v2/iat";
  const date = new Date().toUTCString();

  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto
    .createHmac("sha256", credentials.apiSecret)
    .update(signatureOrigin)
    .digest("base64");

  const authorizationOrigin = `api_key="${credentials.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");

  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
}

// ─── MIME → 讯飞 format 参数映射 ──────────────────────────────────────────

function getXfyunFormat(contentType: string): string {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/mp4": "audio/mp4",
    "video/mp4": "audio/mp4",
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mpeg",
    "audio/webm": "audio/webm;codecs=opus",
    "audio/ogg": "audio/ogg;codecs=opus",
    "audio/wav": "audio/L16;rate=16000",
    "audio/x-wav": "audio/L16;rate=16000",
    "audio/flac": "audio/flac",
  };
  return map[mime] ?? "audio/mp4";
}

// ─── 主转写函数 ────────────────────────────────────────────────────────────

export async function xfyunTranscribe(
  audioUrl: string,
  credentials: XfyunCredentials,
  language = "zh_cn"
): Promise<XfyunResult> {
  // 1. 下载音频
  let audioBuffer: Buffer;
  let contentType = "audio/x-m4a";
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      return { error: `下载音频失败: HTTP ${response.status}`, code: "DOWNLOAD_FAILED" };
    }
    contentType = response.headers.get("content-type") || "audio/x-m4a";
    contentType = contentType.split(";")[0].trim();
    audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`[xfyunTranscribe] downloaded ${audioBuffer.length} bytes, contentType=${contentType}`);
  } catch (e) {
    return { error: "下载音频失败", code: "DOWNLOAD_FAILED", details: String(e) };
  }

  if (audioBuffer.length < 1000) {
    return { error: "音频太短，无法识别", code: "AUDIO_TOO_SHORT" };
  }

  const xfyunFormat = getXfyunFormat(contentType);
  console.log(`[xfyunTranscribe] using format: ${xfyunFormat}`);

  // 2. WebSocket 连接讯飞（自动重试，最多 3 次）
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  // Frame size: 40ms of audio at 16kHz 16bit mono = 1280 bytes for PCM.
  // For compressed formats, use a larger chunk (~4KB) to avoid too many frames.
  const isPcm = xfyunFormat.startsWith("audio/L16");
  const FRAME_SIZE = isPcm ? 1280 : 4096;
  const FRAME_INTERVAL_MS = isPcm ? 10 : 20;

  async function attemptConnect(attempt: number): Promise<XfyunResult> {
    console.log(`[xfyunTranscribe] attempt ${attempt}/${MAX_RETRIES}...`);
    const result = await new Promise<XfyunResult>((resolve) => {
      const url = buildXfyunUrl(credentials);
      const ws = new WebSocket(url);
      // Use a Map keyed by sn to handle wpgs dynamic correction:
      // pgs="apd" → append new sentence at sn
      // pgs="rpl" → replace sentences in range [rg[0]..rg[1]] with new text at sn
      const sentenceMap = new Map<number, string>();
      let resolved = false;
      let frameIndex = 0;
      let sendTimer: ReturnType<typeof setInterval> | null = null;
      let allFramesSent = false;

      const finish = (res: XfyunResult) => {
        if (resolved) return;
        resolved = true;
        if (sendTimer) clearInterval(sendTimer);
        try { ws.close(); } catch { /* ignore */ }
        resolve(res);
      };

      // 超时保护：120 秒
      const timeout = setTimeout(() => {
        finish({ error: "讯飞转写超时", code: "TIMEOUT" });
      }, 120_000);

      ws.on("open", () => {
        const sendFrame = () => {
          if (resolved) {
            if (sendTimer) clearInterval(sendTimer);
            return;
          }

          const start = frameIndex * FRAME_SIZE;
          if (start >= audioBuffer.length) {
            if (sendTimer) clearInterval(sendTimer);
            sendTimer = null;
            if (!allFramesSent) {
              allFramesSent = true;
              console.log(`[xfyunTranscribe] all ${frameIndex} frames sent, waiting for result...`);
              ws.send(JSON.stringify({
                data: { status: 2, format: xfyunFormat, encoding: "raw", audio: "" },
              }));
            }
            return;
          }

          const chunk = audioBuffer.subarray(start, start + FRAME_SIZE);
          const audio = chunk.toString("base64");
          const status = frameIndex === 0 ? 0 : 1;

          const payload: Record<string, unknown> = {
            data: { status, format: xfyunFormat, encoding: "raw", audio },
          };

          if (frameIndex === 0) {
            payload.common = { app_id: credentials.appId };
            payload.business = {
              language,
              domain: "iat",
              accent: "mandarin",
              vad_eos: 3000,
              dwa: "wpgs",
            };
          }

          ws.send(JSON.stringify(payload));
          frameIndex++;
        };

        sendFrame();
        sendTimer = setInterval(sendFrame, FRAME_INTERVAL_MS);
      });

      ws.on("message", (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as {
            code: number;
            message: string;
            data?: {
              result?: {
                ws?: Array<{ cw: Array<{ w: string }> }>;
              };
              status?: number;
            };
          };

          if (msg.code !== 0) {
            clearTimeout(timeout);
            finish({ error: `讯飞识别错误: ${msg.message}`, code: msg.code });
            return;
          }

          // 提取识别文字（处理 wpgs 动态修正）
          const result = msg.data?.result;
          if (result) {
            const sn: number = (result as { sn?: number }).sn ?? sentenceMap.size;
            const pgs: string = (result as { pgs?: string }).pgs ?? "apd";
            const rg: [number, number] | undefined = (result as { rg?: [number, number] }).rg;
            const text = (result.ws || [])
              .flatMap((item) => item.cw.map((cw) => cw.w))
              .join("");
            if (pgs === "rpl" && rg) {
              for (let i = rg[0]; i <= rg[1]; i++) sentenceMap.delete(i);
            }
            if (text) sentenceMap.set(sn, text);
          }

          if (msg.data?.status === 2) {
            clearTimeout(timeout);
            const finalText = Array.from(sentenceMap.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([, v]) => v)
              .join("");
            finish({ text: finalText, language: "zh" });
          }
        } catch (e) {
          console.error("[xfyunTranscribe] parse error:", e);
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        finish({ error: "讯飞 WebSocket 连接失败", code: "WS_ERROR", details: err.message });
      });

      ws.on("close", () => {
        clearTimeout(timeout);
        if (!resolved) {
          const fallbackText = Array.from(sentenceMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v)
            .join("");
          finish({ text: fallbackText, language: "zh" });
        }
      });
    }); // end inner Promise

    // 如果是可重试的错误（WS 连接失败或超时），自动重试
    const isRetryable = "error" in result &&
      (result.code === "WS_ERROR" || result.code === "TIMEOUT");
    if (isRetryable && attempt < MAX_RETRIES) {
      console.log(`[xfyunTranscribe] retrying in ${RETRY_DELAY_MS}ms (${(result as XfyunTranscribeError).error})...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return attemptConnect(attempt + 1);
    }
    return result;
  }

  return attemptConnect(1);
}
