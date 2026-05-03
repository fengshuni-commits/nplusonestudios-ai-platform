/**
 * 讯飞语音听写（iat）WebSocket 接口封装
 * 文档：https://www.xfyun.cn/doc/asr/voicedictation/API.html
 *
 * 流程：
 * 1. 从 S3 下载音频文件
 * 2. 用 ffmpeg 转换为 16kHz 单声道 PCM（16bit）
 * 3. 通过 WebSocket 分帧发送给讯飞，收集识别结果
 */

import crypto from "crypto";
import WebSocket from "ws";
import { spawn } from "child_process";
import { Readable } from "stream";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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

// ─── 音频转换：任意格式 → 16kHz 单声道 PCM ────────────────────────────────

// m4a/mp4 containers store the moov atom at the end of the file.
// ffmpeg cannot seek when reading from stdin pipe, so these formats
// must be written to a temp file first.
const SEEKABLE_FORMATS = new Set(["m4a", "mp4", "3gp", "mov"]);

async function convertToPcm(audioBuffer: Buffer, inputMime: string): Promise<Buffer> {
  // 推断输入格式
  const mimeToFormat: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",    // audio/mp4 is m4a container
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "video/mp4": "mp4",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
  };
  const inputFormat = mimeToFormat[inputMime] || "webm";
  const needsTempFile = SEEKABLE_FORMATS.has(inputFormat);

  if (needsTempFile) {
    // Write to temp file so ffmpeg can seek for moov atom
    const id = crypto.randomBytes(8).toString("hex");
    const tmpIn = join(tmpdir(), `xfyun-in-${id}.${inputFormat}`);
    const tmpOut = join(tmpdir(), `xfyun-out-${id}.pcm`);
    try {
      writeFileSync(tmpIn, audioBuffer);
      await new Promise<void>((resolve, reject) => {
        const ff = spawn("ffmpeg", [
          "-y",
          "-i", tmpIn,
          "-ar", "16000",
          "-ac", "1",
          "-f", "s16le",
          tmpOut,
        ]);
        const errChunks: Buffer[] = [];
        ff.stderr.on("data", (c: Buffer) => errChunks.push(c));
        ff.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            const errMsg = Buffer.concat(errChunks).toString().slice(-300);
            reject(new Error(`ffmpeg exited with code ${code}: ${errMsg}`));
          }
        });
        ff.on("error", reject);
      });
      return readFileSync(tmpOut);
    } finally {
      try { unlinkSync(tmpIn); } catch { /* ignore */ }
      try { unlinkSync(tmpOut); } catch { /* ignore */ }
    }
  }

  // Streaming formats (webm, ogg, mp3, wav, flac) work fine with pipe
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const inputStream = Readable.from(audioBuffer);

    const ffmpeg = spawn("ffmpeg", [
      "-f", inputFormat,
      "-i", "pipe:0",
      "-ar", "16000",   // 16kHz 采样率
      "-ac", "1",       // 单声道
      "-f", "s16le",    // 16bit PCM little-endian
      "pipe:1",
    ]);

    inputStream.pipe(ffmpeg.stdin);

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {}); // 忽略 ffmpeg 日志

    ffmpeg.on("close", (code) => {
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}, no PCM output`));
      }
    });

    ffmpeg.on("error", reject);
    ffmpeg.stdin.on("error", () => {}); // 忽略 stdin 关闭错误
  });
}

// ─── 主转写函数 ────────────────────────────────────────────────────────────

export async function xfyunTranscribe(
  audioUrl: string,
  credentials: XfyunCredentials,
  language = "zh_cn"
): Promise<XfyunResult> {
  // 1. 下载音频
  let audioBuffer: Buffer;
  let contentType = "audio/webm";
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      return { error: `下载音频失败: HTTP ${response.status}`, code: "DOWNLOAD_FAILED" };
    }
    contentType = response.headers.get("content-type") || "audio/webm";
    // 只取 MIME 主体，去掉 codec 参数
    contentType = contentType.split(";")[0].trim();
    audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`[xfyunTranscribe] downloaded ${audioBuffer.length} bytes, contentType=${contentType}`);
  } catch (e) {
    return { error: "下载音频失败", code: "DOWNLOAD_FAILED", details: String(e) };
  }

  // 2. 转换为 PCM
  let pcmBuffer: Buffer;
  try {
    pcmBuffer = await convertToPcm(audioBuffer, contentType);
    console.log(`[xfyunTranscribe] converted to PCM: ${pcmBuffer.length} bytes`);
  } catch (e) {
    return { error: "音频格式转换失败", code: "CONVERT_FAILED", details: String(e) };
  }

  if (pcmBuffer.length < 3200) {
    return { error: "音频太短，无法识别", code: "AUDIO_TOO_SHORT" };
  }

  // 3. WebSocket 连接讯飞
  return new Promise((resolve) => {
    const url = buildXfyunUrl(credentials);
    const ws = new WebSocket(url);
    // Use a Map keyed by sn to handle wpgs dynamic correction:
    // pgs="apd" → append new sentence at sn
    // pgs="rpl" → replace sentences in range [rg[0]..rg[1]] with new text at sn
    // Final text = Map values joined in sn order
    const sentenceMap = new Map<number, string>();
    let resolved = false;
    let frameIndex = 0;
    const FRAME_SIZE = 1280; // 每帧 1280 字节（40ms @ 16kHz 16bit mono）
    // For file transcription, send frames as fast as possible (10ms intervals)
    // Real-time rate would be 40ms, but for files we can go faster
    const FRAME_INTERVAL_MS = 10;
    let sendTimer: ReturnType<typeof setInterval> | null = null;
    let allFramesSent = false;

    const finish = (result: XfyunResult) => {
      if (resolved) return;
      resolved = true;
      if (sendTimer) clearInterval(sendTimer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(result);
    };

    // 超时保护：120 秒（文件转写比实时流慢）
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
        if (start >= pcmBuffer.length) {
          // 所有帧已发完，发送结束帧
          if (sendTimer) clearInterval(sendTimer);
          sendTimer = null;
          if (!allFramesSent) {
            allFramesSent = true;
            console.log(`[xfyunTranscribe] all ${frameIndex} frames sent, waiting for result...`);
            ws.send(JSON.stringify({
              data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" },
            }));
          }
          return;
        }

        const chunk = pcmBuffer.subarray(start, start + FRAME_SIZE);
        const audio = chunk.toString("base64");
        const status = frameIndex === 0 ? 0 : 1; // 0=first, 1=continue, 2=last

        const payload: Record<string, unknown> = {
          data: { status, format: "audio/L16;rate=16000", encoding: "raw", audio },
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

      sendFrame(); // 发送第一帧
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
            // Replace range [rg[0]..rg[1]] with new text at sn
            for (let i = rg[0]; i <= rg[1]; i++) sentenceMap.delete(i);
          }
          if (text) sentenceMap.set(sn, text);
        }

        // status=2 表示识别结束
        if (msg.data?.status === 2) {
          clearTimeout(timeout);
          // Sort by sn to get correct order
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
        // 连接关闭但未收到 status=2，用已收集的结果
        const fallbackText = Array.from(sentenceMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, v]) => v)
          .join("");
        finish({ text: fallbackText, language: "zh" });
      }
    });
  });
}
