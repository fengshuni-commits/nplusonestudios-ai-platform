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

async function convertToPcm(audioBuffer: Buffer, inputMime: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // 推断输入格式
    const mimeToFormat: Record<string, string> = {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "mp4",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/x-m4a": "m4a",
    };
    const inputFormat = mimeToFormat[inputMime] || "webm";

    const chunks: Buffer[] = [];
    const inputStream = Readable.from(audioBuffer);

    // 使用 ffmpeg 转换
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
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else if (chunks.length > 0) {
        // 即使退出码非 0，只要有数据也尝试使用
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
  } catch (e) {
    return { error: "下载音频失败", code: "DOWNLOAD_FAILED", details: String(e) };
  }

  // 2. 转换为 PCM
  let pcmBuffer: Buffer;
  try {
    pcmBuffer = await convertToPcm(audioBuffer, contentType);
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
    const resultParts: string[] = [];
    let resolved = false;
    let frameIndex = 0;
    const FRAME_SIZE = 1280; // 每帧 1280 字节（40ms @ 16kHz 16bit mono）
    const FRAME_INTERVAL_MS = 40;
    let sendTimer: ReturnType<typeof setInterval> | null = null;

    const finish = (result: XfyunResult) => {
      if (resolved) return;
      resolved = true;
      if (sendTimer) clearInterval(sendTimer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(result);
    };

    // 超时保护：60 秒
    const timeout = setTimeout(() => {
      finish({ error: "讯飞转写超时", code: "TIMEOUT" });
    }, 120_000); // 120s timeout for file transcription

    ws.on("open", () => {
      // 发送第一帧（包含业务参数）
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
          ws.send(JSON.stringify({
            data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" },
          }));
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

        // 提取识别文字
        const ws_result = msg.data?.result?.ws;
        if (ws_result) {
          const text = ws_result
            .flatMap((item) => item.cw.map((cw) => cw.w))
            .join("");
          if (text) resultParts.push(text);
        }

        // status=2 表示识别结束
        if (msg.data?.status === 2) {
          clearTimeout(timeout);
          finish({ text: resultParts.join(""), language: "zh" });
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
        finish({ text: resultParts.join(""), language: "zh" });
      }
    });
  });
}
