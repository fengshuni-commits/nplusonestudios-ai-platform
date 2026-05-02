/**
 * 实时流式转写 WebSocket 服务
 *
 * 架构：Browser WS → 本服务 → 讯飞 IAT WS
 *
 * 协议（Browser → Server）：
 *   - 连接时 URL 携带 ?toolId=<number>
 *   - 二进制帧：原始 PCM 16kHz 16bit mono 音频数据（来自 AudioWorklet）
 *   - 文本帧 "END"：通知服务器录音结束，发送最后一帧给讯飞
 *
 * 协议（Server → Browser）：
 *   - { type: "partial", text: "..." }  识别中（可能被后续更新覆盖）
 *   - { type: "final",   text: "..." }  已确认的识别结果
 *   - { type: "error",   message: "..." }
 *   - { type: "ready" }  连接讯飞成功，可以开始发送音频
 *
 * 关键设计：
 *   - 讯飞 WS 连接可能需要 3-5 秒（服务器在境外），期间 PCM 帧缓存在 pendingFrames
 *   - 连接建立后，按 40ms 间隔 flush 缓存帧（模拟实时流速率）
 *   - flush 期间若收到 END 信号，等 flush 完成后再发结束帧
 */

import crypto from "crypto";
import WebSocket, { WebSocketServer } from "ws";
import type { Server as HttpServer } from "http";
import { sdk } from "./_core/sdk";
import type { XfyunCredentials } from "./_core/xfyunTranscription";

const XFYUN_HOST = "iat-api.xfyun.cn";
const XFYUN_PATH = "/v2/iat";
const FRAME_SIZE = 1280; // 40ms @ 16kHz 16bit mono
const FRAME_INTERVAL_MS = 40; // 40ms between frames
const SESSION_TIMEOUT_MS = 120_000; // 2 minutes max

function buildXfyunUrl(creds: XfyunCredentials): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;
  const signature = crypto
    .createHmac("sha256", creds.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authOrigin = `api_key="${creds.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authOrigin).toString("base64");
  return `wss://${XFYUN_HOST}${XFYUN_PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${XFYUN_HOST}`;
}

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function registerStreamTranscribeWS(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname !== "/api/transcribe-stream") return;

    // ── Auth: validate session cookie / token ──────────────────────────────
    let user: any = null;
    try {
      user = await sdk.authenticateRequest(req as any);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit("connection", clientWs, req, user, url);
    });
  });

  wss.on("connection", async (clientWs: WebSocket, req: any, user: any, url: URL) => {
    const toolIdParam = url.searchParams.get("toolId");
    const toolIdFromParam = toolIdParam ? parseInt(toolIdParam, 10) : null;

    // ── Load Xfyun credentials ─────────────────────────────────────────────
    let creds: XfyunCredentials | null = null;
    try {
      const { getDb, getDefaultToolForCapability } = await import("./db");
      const { decryptApiKey } = await import("./_core/crypto");
      const db = await getDb();
      const toolId = toolIdFromParam ?? (db ? await getDefaultToolForCapability("speech_transcription") : null);
      if (db && toolId) {
        const { aiTools } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await db.select().from(aiTools).where(eq(aiTools.id, toolId)).limit(1);
        if (rows.length > 0) {
          const tool = rows[0];
          const rawConfig = tool.configJson;
          const configJson: Record<string, unknown> = rawConfig
            ? (typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig as Record<string, unknown>)
            : {};
          const apiKeyEncrypted = (tool as any).apiKeyEncrypted;
          const apiKey = apiKeyEncrypted ? (decryptApiKey(apiKeyEncrypted) || "") : "";
          creds = {
            appId: (configJson.appId as string) || "",
            apiKey,
            apiSecret: (configJson.apiSecret as string) || "",
          };
        }
      }
    } catch (e) {
      console.error("[streamTranscribe] Failed to load credentials:", e);
    }

    if (!creds || !creds.appId || !creds.apiKey || !creds.apiSecret) {
      send(clientWs, { type: "error", message: "未找到讯飞凭证，请在 AI 工具管理中配置讯飞语音工具" });
      clientWs.close();
      return;
    }

    // ── State ─────────────────────────────────────────────────────────────
    let xfReady = false;
    let frameIndex = 0;
    let ended = false;           // client sent END signal
    let flushing = false;        // currently flushing pending frames
    let flushDone = false;       // flush completed
    const pendingFrames: Buffer[] = [];
    const partialTexts: Map<number, string> = new Map();

    const sessionTimeout = setTimeout(() => {
      send(clientWs, { type: "error", message: "转写会话超时（最长 2 分钟）" });
      clientWs.close();
      xfWs.close();
    }, SESSION_TIMEOUT_MS);

    // ── Connect to Xfyun ──────────────────────────────────────────────────
    const xfUrl = buildXfyunUrl(creds);
    const xfWs = new WebSocket(xfUrl);


    // ── Send PCM frame to Xfyun ───────────────────────────────────────────
    function sendPcmFrame(pcmChunk: Buffer, isLast = false) {
      if (xfWs.readyState !== WebSocket.OPEN) return;

      const audio = pcmChunk.toString("base64");
      const status = isLast ? 2 : (frameIndex === 0 ? 0 : 1);

      const payload: Record<string, unknown> = {
        data: { status, format: "audio/L16;rate=16000", encoding: "raw", audio },
      };

      if (frameIndex === 0) {
        payload.common = { app_id: creds!.appId };
        payload.business = {
          language: "zh_cn",
          domain: "iat",
          accent: "mandarin",
          vad_eos: 5000,
          dwa: "wpgs",
        };
      }

      xfWs.send(JSON.stringify(payload));
      frameIndex++;
    }

    // ── Flush pending frames with rate limiting ───────────────────────────
    // 按 40ms 间隔发送缓存帧，模拟实时流速率
    // flush 完成后，若 END 信号已到达，自动发送结束帧
    function flushPending() {
      if (flushing) return;
      const frames = [...pendingFrames];
      pendingFrames.length = 0;
      if (frames.length === 0) {
        flushDone = true;
        if (ended) sendPcmFrame(Buffer.alloc(0), true);
        return;
      }
      flushing = true;
      let i = 0;
      function sendNext() {
        if (i >= frames.length) {
          flushing = false;
          flushDone = true;
          // If END arrived during flush, send final frame now
          if (ended) {
            sendPcmFrame(Buffer.alloc(0), true);
          }
          return;
        }
        sendPcmFrame(frames[i++]);
        setTimeout(sendNext, FRAME_INTERVAL_MS);
      }
      sendNext();
    }

    // ── Xfyun events ──────────────────────────────────────────────────────
    xfWs.on("open", () => {
      xfReady = true;
      send(clientWs, { type: "ready" });
      flushPending();
    });

    xfWs.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          code: number;
          message: string;
          sid?: string;
          data?: {
            result?: {
              ws?: Array<{ cw: Array<{ w: string; wp?: string }> }>;
              pgs?: "apd" | "rpl";
              rg?: [number, number];
              sn?: number;
            };
            status?: number;
          };
        };

        if (msg.code !== 0) {
            send(clientWs, { type: "error", message: `讯飞识别错误 (${msg.code}): ${msg.message}` });
          return;
        }

        const result = msg.data?.result;
        if (result) {
          const sn = result.sn ?? frameIndex;
          const text = (result.ws || [])
            .flatMap((item) => item.cw.map((cw) => cw.w))
            .join("");

          if (result.pgs === "rpl" && result.rg) {
            const [from, to] = result.rg;
            for (let i = from; i <= to; i++) partialTexts.delete(i);
            partialTexts.set(sn, text);
            send(clientWs, { type: "partial", text, sn, pgs: "rpl", rg: result.rg });
          } else {
            partialTexts.set(sn, text);
            send(clientWs, { type: "partial", text, sn, pgs: "apd" });
          }
            }

        if (msg.data?.status === 2) {
          const finalText = Array.from(partialTexts.values()).join("");
          send(clientWs, { type: "final", text: finalText });
          clearTimeout(sessionTimeout);
          xfWs.close();
        }
      } catch (e) {
        console.error("[streamTranscribe] xfyun message parse error:", e);
      }
    });

    xfWs.on("error", (err) => {
      console.error(`[streamTranscribe] xfyun WS ERROR: ${err.message}`);
      send(clientWs, { type: "error", message: `讯飞连接错误: ${err.message}` });
      clearTimeout(sessionTimeout);
      clientWs.close();
    });

    xfWs.on("close", () => {
      clearTimeout(sessionTimeout);
    });

    // ── Client events ─────────────────────────────────────────────────────
    clientWs.on("message", (data: WebSocket.RawData) => {
      // Detect END signal
      const isString = typeof data === "string";
      const isBuffer = data instanceof Buffer;
      const isSmall = isBuffer && (data as Buffer).length < 20;
      const isEnd = isString
        ? (data as string).trim() === "END"
        : (isSmall && (data as Buffer).toString().trim() === "END");

      if (isEnd) {
        ended = true;
        // Only send final frame if flush is already done (or never started)
        if (xfReady && !flushing) {
          sendPcmFrame(Buffer.alloc(0), true);
        }
        // If still flushing, the flush completion handler will send the final frame
        return;
      }

      // Binary PCM data
      let pcm: Buffer;
      if (isBuffer) {
        pcm = data as Buffer;
      } else if (data instanceof ArrayBuffer) {
        pcm = Buffer.from(data);
      } else {
        pcm = Buffer.concat(data as Buffer[]);
      }

      // Split into FRAME_SIZE chunks and forward
      let offset = 0;
      while (offset < pcm.length) {
        const chunk = pcm.subarray(offset, offset + FRAME_SIZE);
        offset += FRAME_SIZE;
        if (xfReady && !flushing) {
          // Flush done, send directly in real-time
          sendPcmFrame(chunk);
        } else {
          // Still connecting or flushing, buffer the frame
          pendingFrames.push(chunk);
        }
      }
    });

    clientWs.on("close", () => {
      clearTimeout(sessionTimeout);
      if (xfWs.readyState === WebSocket.OPEN || xfWs.readyState === WebSocket.CONNECTING) {
        xfWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[streamTranscribe] client WS error:", err.message);
      clearTimeout(sessionTimeout);
      xfWs.close();
    });
  });

  console.log("[streamTranscribe] WebSocket endpoint registered at /api/transcribe-stream");
}
