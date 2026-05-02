/**
 * 实时语音转写 WebSocket 服务
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
 *   - 讯飞单次会话约 60 秒后自动结束（status=2），自动开启新会话续接
 *   - 讯飞连接失败时，自动重试最多 3 次（指数退避：1.5s, 3s, 6s）
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
// When flushing buffered frames, send multiple frames per tick to catch up faster.
// Sending 4 frames per 40ms = 160ms of audio per tick = 4x real-time catch-up speed.
const FLUSH_FRAMES_PER_TICK = 4;
const MAX_XFYUN_RETRIES = 3; // max retries on connection failure

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

    // ── Session state ─────────────────────────────────────────────────────
    let ended = false;           // client sent END signal
    let clientClosed = false;    // client WS closed
    const pendingFrames: Buffer[] = [];  // frames buffered before xfyun ready
    let xfyunRetryCount = 0;     // number of xfyun connection retries

    // No hard session timeout - recording can run as long as needed.
    // The client is responsible for calling stop() to end the session.
    const sessionTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

    // ── Xfyun sub-session (auto-reconnects when status=2 or on error) ──────
    let xfWs: WebSocket | null = null;
    let xfReady = false;
    let frameIndex = 0;
    let flushing = false;
    const partialTexts: Map<number, string> = new Map();

    function connectXfyun(isRetry = false) {
      if (clientClosed) return;
      xfReady = false;
      flushing = false;
      frameIndex = 0;
      partialTexts.clear();

      const xfUrl = buildXfyunUrl(creds!);
      const ws = new WebSocket(xfUrl);
      xfWs = ws;

      ws.on("open", () => {
        if (clientClosed) { ws.close(); return; }
        xfyunRetryCount = 0; // reset retry count on successful connection
        xfReady = true;
        send(clientWs, { type: "ready" });
        flushPending(ws);
      });

      ws.on("message", (data: WebSocket.RawData) => {
        if (clientClosed) return;
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
            console.error(`[streamTranscribe] xfyun error code ${msg.code}: ${msg.message}`);
            // code 10008 = service instance invalid (concurrent limit)
            // code 10160 = request timeout
            // code 10165 = invalid handle (session frequency limit - wait and retry)
            // code 10313 = app_id not found
            // These are potentially recoverable - retry
            const recoverableCodes = [10008, 10160, 10165];
            if (recoverableCodes.includes(msg.code) && xfyunRetryCount < MAX_XFYUN_RETRIES && !ended) {
              xfyunRetryCount++;
              // Use longer delay for frequency limit errors (10165)
              const baseDelay = msg.code === 10165 ? 3000 : 1000;
              const delay = Math.pow(2, xfyunRetryCount - 1) * baseDelay; // 3s, 6s, 12s for 10165
              console.log(`[streamTranscribe] retrying xfyun connection (attempt ${xfyunRetryCount}/${MAX_XFYUN_RETRIES}) in ${delay}ms`);
              send(clientWs, { type: "error", message: `讯飞连接重试中 (${xfyunRetryCount}/${MAX_XFYUN_RETRIES})...` });
              ws.close();
              setTimeout(() => connectXfyun(true), delay);
            } else {
              send(clientWs, { type: "error", message: `讯飞识别错误 (${msg.code}): ${msg.message}` });
            }
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
            // Session ended by xfyun (60s limit or silence)
            const finalText = Array.from(partialTexts.values()).join("");
            console.log(`[streamTranscribe] xfyun status=2, ended=${ended}, textLen=${finalText.length}`);
            if (finalText.trim()) {
              send(clientWs, { type: "final", text: finalText });
            }
            ws.close();
            // Auto-reconnect if client hasn't ended recording
            // Use 1.5s delay to avoid triggering xfyun frequency limits (10165)
            if (!ended && !clientClosed) {
              console.log(`[streamTranscribe] auto-reconnecting xfyun in 1500ms`);
              setTimeout(() => connectXfyun(), 1500);
            } else {
              console.log(`[streamTranscribe] session ended, not reconnecting (ended=${ended})`);
            }
          }
        } catch (e) {
          console.error("[streamTranscribe] xfyun message parse error:", e);
        }
      });

      ws.on("error", (err) => {
        console.error(`[streamTranscribe] xfyun WS ERROR: ${err.message}`);
        // Retry on connection failure
        if (xfyunRetryCount < MAX_XFYUN_RETRIES && !ended && !clientClosed) {
          xfyunRetryCount++;
          const delay = Math.pow(2, xfyunRetryCount - 1) * 1500; // 1.5s, 3s, 6s
          console.log(`[streamTranscribe] retrying xfyun WS (attempt ${xfyunRetryCount}/${MAX_XFYUN_RETRIES}) in ${delay}ms`);
          send(clientWs, { type: "error", message: `讯飞连接失败，重试中 (${xfyunRetryCount}/${MAX_XFYUN_RETRIES})...` });
          setTimeout(() => connectXfyun(true), delay);
        } else {
          // All retries exhausted - notify client but DON'T close the client WS
          // The client can still use Whisper fallback
          console.error(`[streamTranscribe] xfyun all retries exhausted`);
          send(clientWs, { type: "error", message: `讯飞连接失败（已重试 ${MAX_XFYUN_RETRIES} 次）: ${err.message}` });
          // Don't call clientWs.close() here - let client decide what to do
        }
      });

      ws.on("close", () => {
        if (xfWs === ws) {
          xfWs = null;
          xfReady = false; // reset so new frames go to pendingFrames until reconnect
        }
      });
    }

    // ── Send PCM frame to Xfyun ───────────────────────────────────────────
    function sendPcmFrame(ws: WebSocket, pcmChunk: Buffer, isLast = false) {
      if (ws.readyState !== WebSocket.OPEN) return;
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
          vad_eos: 5000, // 5s silence to end session (reduces reconnect frequency)
          dwa: "wpgs",
        };
      }
      ws.send(JSON.stringify(payload));
      frameIndex++;
    }

    // ── Flush pending frames with rate limiting ───────────────────────────
    function flushPending(ws: WebSocket) {
      if (flushing) return;
      const frames = [...pendingFrames];
      pendingFrames.length = 0;
      if (frames.length === 0) {
        if (ended) sendPcmFrame(ws, Buffer.alloc(0), true);
        return;
      }
      flushing = true;
      let i = 0;
      function sendNext() {
        if (clientClosed || ws.readyState !== WebSocket.OPEN) { flushing = false; return; }
        if (i >= frames.length) {
          flushing = false;
          // Drain any new frames that arrived during flush
          if (pendingFrames.length > 0) {
            const extra = [...pendingFrames];
            pendingFrames.length = 0;
            for (const f of extra) sendPcmFrame(ws, f);
          }
          if (ended) {
            console.log(`[streamTranscribe] flushPending done, sending final frame`);
            sendPcmFrame(ws, Buffer.alloc(0), true);
          }
          return;
        }
        // Send multiple frames per tick to flush buffered audio faster
        const batchEnd = Math.min(i + FLUSH_FRAMES_PER_TICK, frames.length);
        while (i < batchEnd) {
          sendPcmFrame(ws, frames[i++]);
        }
        setTimeout(sendNext, FRAME_INTERVAL_MS);
      }
      sendNext();
    }

    // ── Start first xfyun connection ──────────────────────────────────────
    connectXfyun();

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
        console.log(`[streamTranscribe] END received: xfReady=${xfReady}, flushing=${flushing}, pending=${pendingFrames.length}`);
        if (xfReady && xfWs && !flushing) {
          if (pendingFrames.length > 0) {
            // Flush buffered frames first, then send final frame when done
            console.log(`[streamTranscribe] flushing ${pendingFrames.length} pending frames before final`);
            flushPending(xfWs);
          } else {
            sendPcmFrame(xfWs, Buffer.alloc(0), true);
            console.log(`[streamTranscribe] sent final frame immediately`);
          }
        } else {
          console.log(`[streamTranscribe] deferred final frame (xfReady=${xfReady}, flushing=${flushing}, xfWs=${xfWs ? 'set' : 'null'})`);
        }
        // If still flushing or connecting, the flush/reconnect handler will send the final frame
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
        if (xfReady && xfWs && !flushing) {
          sendPcmFrame(xfWs, chunk);
        } else {
          pendingFrames.push(chunk);
        }
      }
    });

    clientWs.on("close", () => {
      clientClosed = true;
      clearTimeout(sessionTimeout);
      if (xfWs && (xfWs.readyState === WebSocket.OPEN || xfWs.readyState === WebSocket.CONNECTING)) {
        xfWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[streamTranscribe] client WS error:", err.message);
      clientClosed = true;
      clearTimeout(sessionTimeout);
      if (xfWs) xfWs.close();
    });
  });

  console.log("[streamTranscribe] WebSocket endpoint registered at /api/transcribe-stream");
}
