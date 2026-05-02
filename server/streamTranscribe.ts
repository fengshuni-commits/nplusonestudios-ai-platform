/**
 * Real-time speech transcription via Xfyun IAT WebSocket API.
 *
 * Architecture:
 * - One persistent client WS per recording session
 * - Xfyun IAT sessions are limited to 60s; auto-reconnects on status=2
 * - Audio frames are buffered in pendingFrames when xfyun is not ready
 * - On reconnect, buffered frames are flushed to the new xfyun session
 * - Connection failures are retried up to MAX_XFYUN_RETRIES times (exponential backoff)
 *
 * Key design:
 * - flushGeneration: incremented on every new xfyun connection to invalidate stale flush timers
 * - xfyunRetryCount: reset to 0 on every successful connection (not just on open)
 * - pendingFrames: never cleared on reconnect, only drained by flushPending
 */
import crypto from "crypto";
import WebSocket, { WebSocketServer } from "ws";
import type { Server as HttpServer } from "http";
import { sdk } from "./_core/sdk";
import type { XfyunCredentials } from "./_core/xfyunTranscription";

const XFYUN_HOST = "iat-api.xfyun.cn";
const XFYUN_PATH = "/v2/iat";
const FRAME_SIZE = 1280;        // 40ms @ 16kHz 16bit mono
const FRAME_INTERVAL_MS = 40;   // 40ms between frames
// Send 4 frames per tick when flushing = 4x real-time catch-up speed
const FLUSH_FRAMES_PER_TICK = 4;
const MAX_XFYUN_RETRIES = 5;    // max retries on connection failure (increased from 3)
const MAX_PENDING_FRAMES = 500;  // max buffered frames (~20s audio); older frames dropped to prevent OOM

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
    let ended = false;
    let clientClosed = false;
    const pendingFrames: Buffer[] = [];   // frames buffered while xfyun is not ready
    let xfyunRetryCount = 0;

    // ── Xfyun sub-session state ───────────────────────────────────────────
    let xfWs: WebSocket | null = null;
    let xfReady = false;
    let frameIndex = 0;
    let flushGeneration = 0;   // incremented on each new connection to invalidate stale timers
    let flushing = false;
    const partialTexts: Map<number, string> = new Map();

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
          vad_eos: 5000,  // 5s silence to end session
          dwa: "wpgs",    // dynamic correction mode
        };
      }
      ws.send(JSON.stringify(payload));
      frameIndex++;
    }

    // ── Flush pending frames with rate limiting ───────────────────────────
    // Uses flushGeneration to ensure stale timers from previous connections
    // don't interfere with the current flush.
    function flushPending(ws: WebSocket) {
      if (flushing) return;
      const frames = [...pendingFrames];
      pendingFrames.length = 0;
      if (frames.length === 0) {
        if (ended) {
          console.log(`[streamTranscribe] no pending frames, sending final frame immediately`);
          sendPcmFrame(ws, Buffer.alloc(0), true);
        }
        return;
      }
      flushing = true;
      const myGeneration = flushGeneration;
      let i = 0;
      console.log(`[streamTranscribe] flushPending: ${frames.length} frames, generation=${myGeneration}`);

      function sendNext() {
        // If a new xfyun connection was established, this flush is stale - abort
        if (myGeneration !== flushGeneration) {
          console.log(`[streamTranscribe] flush gen ${myGeneration} superseded by gen ${flushGeneration}, aborting`);
          flushing = false;
          return;
        }
        if (clientClosed || ws.readyState !== WebSocket.OPEN) {
          flushing = false;
          return;
        }
        if (i >= frames.length) {
          flushing = false;
          // Drain any new frames that arrived during flush
          if (pendingFrames.length > 0) {
            const extra = [...pendingFrames];
            pendingFrames.length = 0;
            console.log(`[streamTranscribe] draining ${extra.length} extra frames after flush`);
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

    // ── Connect to Xfyun IAT ──────────────────────────────────────────────
    function connectXfyun(isRetry = false) {
      if (clientClosed) return;

      // Invalidate any in-progress flush from the previous connection
      flushGeneration++;
      xfReady = false;
      flushing = false;
      frameIndex = 0;
      partialTexts.clear();

      const myGeneration = flushGeneration;
      const xfUrl = buildXfyunUrl(creds!);
      const ws = new WebSocket(xfUrl);
      xfWs = ws;

      ws.on("open", () => {
        if (clientClosed) { ws.close(); return; }
        // Verify this is still the current connection
        if (myGeneration !== flushGeneration) { ws.close(); return; }
        xfyunRetryCount = 0;  // reset on successful connection
        xfReady = true;
        send(clientWs, { type: "ready" });
        flushPending(ws);
      });

      ws.on("message", (data: WebSocket.RawData) => {
        if (clientClosed) return;
        // Ignore messages from stale connections
        if (myGeneration !== flushGeneration) return;
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
            // Recoverable error codes - retry with backoff
            // 10008 = service instance invalid (concurrent limit)
            // 10160 = request timeout
            // 10165 = invalid handle (session frequency limit)
            const recoverableCodes = [10008, 10160, 10165];
            if (recoverableCodes.includes(msg.code) && xfyunRetryCount < MAX_XFYUN_RETRIES && !ended) {
              xfyunRetryCount++;
              const baseDelay = msg.code === 10165 ? 3000 : 1500;
              const delay = Math.pow(2, xfyunRetryCount - 1) * baseDelay;
              console.log(`[streamTranscribe] retrying xfyun (attempt ${xfyunRetryCount}/${MAX_XFYUN_RETRIES}) in ${delay}ms`);
              send(clientWs, { type: "warning", message: `讯飞连接重试中 (${xfyunRetryCount}/${MAX_XFYUN_RETRIES})...` });
              ws.close();
              setTimeout(() => connectXfyun(true), delay);
            } else {
              send(clientWs, { type: "error", message: `讯飞识别错误 (${msg.code}): ${msg.message}` }); // fatal - not recoverable
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
            if (!ended && !clientClosed) {
              // Reset retry count on normal session end (not an error)
              xfyunRetryCount = 0;
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
        if (myGeneration !== flushGeneration) return; // stale connection
        if (xfyunRetryCount < MAX_XFYUN_RETRIES && !ended && !clientClosed) {
          xfyunRetryCount++;
          const delay = Math.pow(2, xfyunRetryCount - 1) * 1500; // 1.5s, 3s, 6s, 12s, 24s
          console.log(`[streamTranscribe] retrying xfyun WS (attempt ${xfyunRetryCount}/${MAX_XFYUN_RETRIES}) in ${delay}ms`);
          send(clientWs, { type: "warning", message: `讯飞连接失败，重试中 (${xfyunRetryCount}/${MAX_XFYUN_RETRIES})...` });
          setTimeout(() => connectXfyun(true), delay);
        } else {
          console.error(`[streamTranscribe] xfyun all retries exhausted`);
          send(clientWs, { type: "warning", message: `讯飞连接暂时不可用，将在30秒后自动重试...` });
          // Clear pending buffer to prevent OOM
          pendingFrames.length = 0;
          // Schedule a full reconnect attempt after 30s cooldown
          if (!ended && !clientClosed) {
            xfyunRetryCount = 0; // reset for fresh retry sequence
            console.log(`[streamTranscribe] scheduling reconnect after 30s cooldown`);
            setTimeout(() => {
              if (!ended && !clientClosed) {
                console.log(`[streamTranscribe] attempting reconnect after cooldown`);
                connectXfyun();
              }
            }, 30000);
          }
        }
      });

      ws.on("close", () => {
        if (xfWs === ws) {
          xfWs = null;
          xfReady = false;  // ensure new frames go to pendingFrames until reconnect
        }
      });
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
            console.log(`[streamTranscribe] flushing ${pendingFrames.length} pending frames before final`);
            flushPending(xfWs);
          } else {
            sendPcmFrame(xfWs, Buffer.alloc(0), true);
            console.log(`[streamTranscribe] sent final frame immediately`);
          }
        } else if (xfReady && xfWs && flushing) {
          // Already flushing - the flush will send the final frame when done
          console.log(`[streamTranscribe] already flushing, final frame will be sent when flush completes`);
        } else if (!xfWs) {
          // xfWs is null - connection is down, can't send final frame
          // Send empty final to let client know recording has ended
          console.log(`[streamTranscribe] deferred final frame (xfReady=${xfReady}, flushing=${flushing}, xfWs=null) - sending empty final`);
          pendingFrames.length = 0; // clear buffer since we can't send it
          if (!clientClosed) {
            send(clientWs, { type: "final", text: Array.from(partialTexts.values()).join("") });
          }
        } else {
          // Not ready yet (connecting) - the reconnect handler will send the final frame
          console.log(`[streamTranscribe] deferred final frame (xfReady=${xfReady}, flushing=${flushing}, xfWs=${xfWs ? 'set' : 'null'})`);
        }
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
          // Cap buffer to prevent OOM when xfyun is down for extended period
          if (pendingFrames.length > MAX_PENDING_FRAMES) {
            pendingFrames.shift(); // drop oldest frame
          }
        }
      }
    });

    clientWs.on("close", () => {
      clientClosed = true;
      // NOTE: Do NOT increment flushGeneration here.
      // If the client closes while xfyun is still processing the final frames,
      // we still want to receive and log the final status=2 message.
      // The clientClosed flag prevents sending results back to the closed WS.
      if (xfWs && (xfWs.readyState === WebSocket.OPEN || xfWs.readyState === WebSocket.CONNECTING)) {
        xfWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[streamTranscribe] client WS error:", err.message);
      clientClosed = true;
      if (xfWs) xfWs.close();
    });
  });

  console.log("[streamTranscribe] WebSocket endpoint registered at /api/transcribe-stream");
}
