/**
 * Real-time speech transcription via Volcengine BigASR Streaming WebSocket API.
 *
 * Architecture:
 * - One persistent client WS per recording session
 * - Volcengine sessions are long-lived (no 60s limit unlike Xfyun)
 * - Audio frames are buffered in pendingFrames when volcengine is not ready
 * - On reconnect, buffered frames are flushed to the new volcengine session
 * - Connection failures are retried up to MAX_RETRIES times (exponential backoff)
 *
 * Protocol:
 * - Binary protocol with 4-byte header + 4-byte payload size + gzip-compressed JSON/PCM
 * - Auth via HTTP headers on WebSocket upgrade: X-Api-App-Key, X-Api-Access-Key, X-Api-Resource-Id
 * - First message: full client request (JSON with audio config)
 * - Subsequent messages: audio-only requests (raw PCM)
 * - Server responses: full server response (JSON with recognition results)
 *
 * Message format to client (same as xfyun for compatibility):
 * - { type: "ready" }
 * - { type: "partial", text: string }  (current sentence being recognized)
 * - { type: "final", text: string }    (confirmed sentence)
 * - { type: "warning", message: string }
 * - { type: "error", message: string }
 */
import zlib from "zlib";
import WebSocket from "ws";

const VOLC_HOST = "openspeech.bytedance.com";
const VOLC_PATH = "/api/v3/sauc/bigmodel";
const FRAME_SIZE = 1280;        // 40ms @ 16kHz 16bit mono
const FRAME_INTERVAL_MS = 40;   // 40ms between frames
const FLUSH_FRAMES_PER_TICK = 4;
const MAX_RETRIES = 5;
const MAX_PENDING_FRAMES = 500;

// ── Binary protocol helpers ───────────────────────────────────────────────────
// Header byte layout (4 bytes total):
// Byte 0: version(4b) | header_size(4b)
// Byte 1: message_type(4b) | message_type_specific_flags(4b)
// Byte 2: serialization_method(4b) | message_compression(4b)
// Byte 3: reserved(8b)
//
// message_type:
//   0x1 = Full client request
//   0x2 = Audio only client request
//   0x9 = Full server response
//   0xf = Error message from server
//
// serialization_method: 0x1 = JSON
// message_compression: 0x1 = Gzip, 0x0 = None

function buildFullClientRequest(appId: string): Buffer {
  const payload: Record<string, unknown> = {
    user: { uid: appId },
    audio: {
      format: "pcm",
      codec: "raw",
      rate: 16000,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      result_type: "full",   // full = cumulative text in each response
      enable_nonstream: true, // enable 2-pass for better accuracy
    },
  };

  const jsonStr = JSON.stringify(payload);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, "utf-8"));

  // Header: version=1, header_size=1, msg_type=0x1 (full client), flags=0x0, serial=0x1 (JSON), compress=0x1 (gzip), reserved=0x0
  const header = Buffer.from([0x11, 0x10, 0x11, 0x00]);
  const payloadSize = Buffer.allocUnsafe(4);
  payloadSize.writeUInt32BE(compressed.length, 0);

  return Buffer.concat([header, payloadSize, compressed]);
}

function buildAudioOnlyRequest(pcm: Buffer): Buffer {
  // Header: version=1, header_size=1, msg_type=0x2 (audio only), flags=0x0, serial=0x1 (JSON), compress=0x0 (none), reserved=0x0
  const header = Buffer.from([0x11, 0x20, 0x10, 0x00]);
  const payloadSize = Buffer.allocUnsafe(4);
  payloadSize.writeUInt32BE(pcm.length, 0);
  return Buffer.concat([header, payloadSize, pcm]);
}

function buildAudioLastRequest(pcm: Buffer): Buffer {
  // message_type_specific_flags = 0x2 means last audio frame
  // Header: version=1, header_size=1, msg_type=0x2 (audio only), flags=0x2 (last), serial=0x1, compress=0x0, reserved=0x0
  const header = Buffer.from([0x11, 0x22, 0x10, 0x00]);
  const payloadSize = Buffer.allocUnsafe(4);
  payloadSize.writeUInt32BE(pcm.length, 0);
  return Buffer.concat([header, payloadSize, pcm]);
}

interface VolcServerResponse {
  result?: {
    text?: string;
    utterances?: Array<{
      text: string;
      definite: boolean;
      start_time?: number;
      end_time?: number;
    }>;
  };
  audio_info?: { duration?: number };
  error?: { code?: number; message?: string };
}

function parseServerResponse(data: Buffer): VolcServerResponse | null {
  try {
    // Parse header
    const headerSize = (data[0] & 0x0f) * 4; // header_size field * 4 bytes
    const msgType = (data[1] >> 4) & 0x0f;
    const compression = data[2] & 0x0f;

    if (msgType === 0xf) {
      // Error message: 4-byte header + 4-byte error code + 4-byte msg size + msg
      const errorCode = data.readUInt32BE(headerSize);
      const msgSize = data.readUInt32BE(headerSize + 4);
      const errorMsg = data.slice(headerSize + 8, headerSize + 8 + msgSize).toString("utf-8");
      return { error: { code: errorCode, message: errorMsg } };
    }

    if (msgType !== 0x9) return null; // not a full server response

    // Skip header + 4-byte sequence number
    const payloadStart = headerSize + 4;
    const payloadSize = data.readUInt32BE(payloadStart);
    const rawPayload = data.slice(payloadStart + 4, payloadStart + 4 + payloadSize);
    const payload = compression === 0x1 ? zlib.gunzipSync(rawPayload) : rawPayload;

    return JSON.parse(payload.toString("utf-8")) as VolcServerResponse;
  } catch (e) {
    console.error("[volcStreamTranscribe] Failed to parse server response:", e);
    return null;
  }
}

export interface VolcengineStreamCredentials {
  appId: string;
  accessToken: string;
}

export function createVolcengineStreamSession(
  creds: VolcengineStreamCredentials,
  onMessage: (msg: object) => void,
  onClose: () => void
) {
  let ended = false;
  let clientClosed = false;
  const pendingFrames: Buffer[] = [];
  let retryCount = 0;
  let volcWs: WebSocket | null = null;
  let volcReady = false;
  let flushGeneration = 0;
  let flushing = false;
  let confirmedText = "";  // accumulates all definite sentences
  let currentPartialText = ""; // current non-definite sentence

  function send(msg: object) {
    if (!clientClosed) onMessage(msg);
  }

  function flushPending(ws: WebSocket) {
    if (flushing) return;
    const frames = [...pendingFrames];
    pendingFrames.length = 0;
    if (frames.length === 0) {
      if (ended) {
        console.log(`[volcStreamTranscribe] no pending frames, sending last audio frame`);
        ws.send(buildAudioLastRequest(Buffer.alloc(0)));
      }
      return;
    }
    flushing = true;
    const myGeneration = flushGeneration;
    let i = 0;
    console.log(`[volcStreamTranscribe] flushPending: ${frames.length} frames, gen=${myGeneration}`);

    function sendNext() {
      if (myGeneration !== flushGeneration) {
        flushing = false;
        return;
      }
      if (clientClosed || ws.readyState !== WebSocket.OPEN) {
        flushing = false;
        return;
      }
      if (i >= frames.length) {
        flushing = false;
        if (pendingFrames.length > 0) {
          const extra = [...pendingFrames];
          pendingFrames.length = 0;
          for (const f of extra) ws.send(buildAudioOnlyRequest(f));
        }
        if (ended) {
          ws.send(buildAudioLastRequest(Buffer.alloc(0)));
        }
        return;
      }
      const batchEnd = Math.min(i + FLUSH_FRAMES_PER_TICK, frames.length);
      while (i < batchEnd) {
        ws.send(buildAudioOnlyRequest(frames[i++]));
      }
      setTimeout(sendNext, FRAME_INTERVAL_MS);
    }
    sendNext();
  }

  function connectVolcengine(isRetry = false) {
    if (clientClosed) return;

    flushGeneration++;
    volcReady = false;
    flushing = false;

    // Rescue any partial text from interrupted session
    if (currentPartialText.trim()) {
      console.log(`[volcStreamTranscribe] rescuing partial text: "${currentPartialText}"`);
      send({ type: "final", text: currentPartialText });
      confirmedText += currentPartialText;
      currentPartialText = "";
    }

    const myGeneration = flushGeneration;
    const wsUrl = `wss://${VOLC_HOST}${VOLC_PATH}`;
    const ws = new WebSocket(wsUrl, {
      headers: {
        "X-Api-App-Key": creds.appId,
        "X-Api-Access-Key": creds.accessToken,
        "X-Api-Resource-Id": "volc.bigasr.sauc.duration",
        "X-Api-Connect-Id": `${creds.appId}-${Date.now()}`,
      },
    });
    volcWs = ws;

    ws.on("open", () => {
      if (clientClosed) { ws.close(); return; }
      if (myGeneration !== flushGeneration) { ws.close(); return; }
      console.log(`[volcStreamTranscribe] WS open, sending full client request`);
      retryCount = 0;
      ws.send(buildFullClientRequest(creds.appId));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      if (clientClosed) return;
      if (myGeneration !== flushGeneration) return;

      let buf: Buffer;
      if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (Array.isArray(data)) {
        buf = Buffer.concat(data as Buffer[]);
      } else {
        buf = Buffer.from(new Uint8Array(data as ArrayBuffer));
      }
      const parsed = parseServerResponse(buf);
      if (!parsed) return;

      if (parsed.error && parsed.error.code && parsed.error.code !== 0) {
        console.error(`[volcStreamTranscribe] server error ${parsed.error.code}: ${parsed.error.message}`);
        if (retryCount < MAX_RETRIES && !ended && !clientClosed) {
          retryCount++;
          const delay = Math.pow(2, retryCount - 1) * 1500;
          send({ type: "warning", message: `火山引擎连接重试中 (${retryCount}/${MAX_RETRIES})...` });
          ws.close();
          setTimeout(() => connectVolcengine(true), delay);
        } else {
          send({ type: "error", message: `火山引擎识别错误 (${parsed.error.code}): ${parsed.error.message}` });
        }
        return;
      }

      // First response after full client request = ready signal
      if (!volcReady) {
        volcReady = true;
        console.log(`[volcStreamTranscribe] received first response, session ready`);
        send({ type: "ready" });
        flushPending(ws);
        return;
      }

      // Process recognition results
      const result = parsed.result;
      if (!result) return;

      const utterances = result.utterances || [];
      const newDefinite = utterances.filter(u => u.definite);
      const nonDefinite = utterances.filter(u => !u.definite);

      // Send final for each newly confirmed sentence
      for (const utt of newDefinite) {
        if (utt.text && utt.text.trim()) {
          console.log(`[volcStreamTranscribe] definite: "${utt.text}"`);
          send({ type: "final", text: utt.text });
          confirmedText += utt.text;
        }
      }

      // Send partial for the current non-definite sentence
      const partialText = nonDefinite.map(u => u.text).join("");
      if (partialText !== currentPartialText) {
        currentPartialText = partialText;
        if (partialText) {
          // Use sn=1 pgs=apd to be compatible with the existing useStreamTranscribe hook
          send({ type: "partial", text: partialText, sn: 1, pgs: "apd" });
        }
      }
    });

    ws.on("error", (err) => {
      console.error(`[volcStreamTranscribe] WS ERROR: ${err.message}`);
      if (myGeneration !== flushGeneration) return;
      if (retryCount < MAX_RETRIES && !ended && !clientClosed) {
        retryCount++;
        const delay = Math.pow(2, retryCount - 1) * 1500;
        send({ type: "warning", message: `火山引擎连接失败，重试中 (${retryCount}/${MAX_RETRIES})...` });
        setTimeout(() => connectVolcengine(true), delay);
      } else {
        send({ type: "warning", message: `火山引擎连接暂时不可用，将在30秒后自动重试...` });
        pendingFrames.length = 0;
        if (!ended && !clientClosed) {
          retryCount = 0;
          setTimeout(() => {
            if (!ended && !clientClosed) connectVolcengine();
          }, 30000);
        }
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[volcStreamTranscribe] WS closed: code=${code} reason=${reason?.toString()}`);
      if (volcWs === ws) {
        volcWs = null;
        volcReady = false;
      }
      // If session closed normally and recording not ended, reconnect
      if (!ended && !clientClosed && myGeneration === flushGeneration) {
        console.log(`[volcStreamTranscribe] session closed, auto-reconnecting in 1500ms`);
        // Send final for any remaining partial text
        if (currentPartialText.trim()) {
          send({ type: "final", text: currentPartialText });
          confirmedText += currentPartialText;
          currentPartialText = "";
        }
        retryCount = 0;
        setTimeout(() => connectVolcengine(), 1500);
      } else if (ended && myGeneration === flushGeneration) {
        // Session ended cleanly after END signal
        if (currentPartialText.trim()) {
          send({ type: "final", text: currentPartialText });
          currentPartialText = "";
        }
        onClose();
      }
    });
  }

  // Start the session
  connectVolcengine();

  return {
    sendPcm(pcm: Buffer) {
      if (ended || clientClosed) return;
      let offset = 0;
      while (offset < pcm.length) {
        const chunk = pcm.subarray(offset, offset + FRAME_SIZE);
        offset += FRAME_SIZE;
        if (volcReady && volcWs && !flushing) {
          volcWs.send(buildAudioOnlyRequest(chunk));
        } else {
          pendingFrames.push(chunk);
          if (pendingFrames.length > MAX_PENDING_FRAMES) {
            pendingFrames.shift();
          }
        }
      }
    },

    end() {
      ended = true;
      console.log(`[volcStreamTranscribe] END: volcReady=${volcReady}, flushing=${flushing}, pending=${pendingFrames.length}`);
      if (volcReady && volcWs && !flushing) {
        if (pendingFrames.length > 0) {
          flushPending(volcWs);
        } else {
          volcWs.send(buildAudioLastRequest(Buffer.alloc(0)));
        }
      } else if (volcReady && volcWs && flushing) {
        // flush will send last frame when done
      } else if (!volcWs) {
        pendingFrames.length = 0;
        if (!clientClosed) {
          send({ type: "final", text: currentPartialText || "" });
          currentPartialText = "";
          onClose();
        }
      }
    },

    close() {
      clientClosed = true;
      if (volcWs && (volcWs.readyState === WebSocket.OPEN || volcWs.readyState === WebSocket.CONNECTING)) {
        volcWs.close();
      }
    },
  };
}
