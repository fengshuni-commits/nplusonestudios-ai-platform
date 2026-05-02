/**
 * useStreamTranscribe
 *
 * 封装实时流式转写逻辑：
 * - 通过 AudioWorklet 采集麦克风 PCM 帧
 * - 通过 WebSocket 发送到后端 /api/transcribe-stream
 * - 实时接收识别结果并回调
 * - 支持预连接（toolId 设置后提前建立 WS 连接，减少录音开始时的延迟）
 *
 * 关键设计原则：
 * - 所有回调（onPartial/onFinal/onError/onReady）通过 ref 访问，避免闭包过期问题
 * - 只有一套 WS 消息处理函数（handleWsMessage），同时用于预连接和活跃连接
 * - recordingActiveRef 仅控制是否向 WS 发送音频数据，不控制是否接收消息
 */

import { useRef, useState, useCallback, useEffect } from "react";

export interface StreamTranscribeOptions {
  toolId?: number;
  onPartial?: (text: string, sn: number, pgs: "apd" | "rpl", rg?: [number, number]) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onWarning?: (message: string) => void;
  onReady?: () => void;
}

export interface StreamTranscribeHandle {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isReady: boolean;
  isConnecting: boolean;
  streamingText: string; // current partial text being recognized
}

export function useStreamTranscribe(options: StreamTranscribeOptions): StreamTranscribeHandle {
  const { toolId } = options;

  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(false);
  const recordingActiveRef = useRef(false); // true when recording is in progress

  // Sentence accumulator for wpgs (dynamic correction) mode
  const sentencesRef = useRef<Map<number, string>>(new Map());

  // Always-fresh callback refs — never stale in closures
  const onPartialRef = useRef(options.onPartial);
  const onFinalRef = useRef(options.onFinal);
  const onErrorRef = useRef(options.onError);
  const onWarningRef = useRef(options.onWarning);
  const onReadyRef = useRef(options.onReady);
  useEffect(() => { onPartialRef.current = options.onPartial; }, [options.onPartial]);
  useEffect(() => { onFinalRef.current = options.onFinal; }, [options.onFinal]);
  useEffect(() => { onErrorRef.current = options.onError; }, [options.onError]);
  useEffect(() => { onWarningRef.current = options.onWarning; }, [options.onWarning]);
  useEffect(() => { onReadyRef.current = options.onReady; }, [options.onReady]);

  // Build WebSocket URL
  const buildWsUrl = useCallback((tid?: number) => {
    const loc = window.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    const id = tid ?? toolId;
    if (id) params.set("toolId", String(id));
    return `${proto}//${loc.host}/api/transcribe-stream?${params.toString()}`;
  }, [toolId]);

  // ── Unified WS message handler (used for both pre-connect and active WS) ──
  // Uses refs for all callbacks to avoid stale closure issues.
  const handleWsMessage = useCallback((e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        type: "ready" | "partial" | "final" | "error" | "warning";
        text?: string;
        message?: string;
        sn?: number;
        pgs?: "apd" | "rpl";
        rg?: [number, number];
      };

      if (msg.type === "ready") {
        // New xfyun session started - clear any stale sentence state from previous session
        sentencesRef.current.clear();
        setStreamingText("");
        setIsReady(true);
        setIsConnecting(false);
        onReadyRef.current?.();
      } else if (msg.type === "partial") {
        const sn = msg.sn ?? 0;
        const text = msg.text ?? "";
        const pgs = msg.pgs ?? "apd";

        if (pgs === "rpl" && msg.rg) {
          const [from, to] = msg.rg;
          for (let i = from; i <= to; i++) sentencesRef.current.delete(i);
        }
        sentencesRef.current.set(sn, text);
        setStreamingText(text);
        onPartialRef.current?.(text, sn, pgs, msg.rg);
      } else if (msg.type === "final") {
        const finalText = msg.text ?? Array.from(sentencesRef.current.values()).join("");
        sentencesRef.current.clear();
        setStreamingText("");
        onFinalRef.current?.(finalText);
      } else if (msg.type === "warning") {
        // Transient warning — do NOT stop recording, just notify
        onWarningRef.current?.(msg.message ?? "转写警告");
      } else if (msg.type === "error") {
        onErrorRef.current?.(msg.message ?? "转写错误");
      }
    } catch {
      // ignore parse errors
    }
  }, []); // no deps needed - all callbacks accessed via refs

  // ── Pre-connect WS when toolId is set ─────────────────────────────────
  const preConnectRef = useRef<WebSocket | null>(null);
  const preConnectToolIdRef = useRef<number | undefined>(undefined);

  const closePreConnect = useCallback(() => {
    if (preConnectRef.current) {
      preConnectRef.current.onmessage = null;
      preConnectRef.current.onerror = null;
      preConnectRef.current.onclose = null;
      preConnectRef.current.close();
      preConnectRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!toolId) {
      closePreConnect();
      return;
    }
    // Don't pre-connect if already recording
    if (recordingActiveRef.current) return;
    // Don't re-connect if same toolId and already open
    if (preConnectToolIdRef.current === toolId && preConnectRef.current?.readyState === WebSocket.OPEN) return;

    closePreConnect();
    preConnectToolIdRef.current = toolId;

    const wsUrl = buildWsUrl(toolId);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    preConnectRef.current = ws;

    // Use the unified handler - it will call onReady/onPartial/etc. via refs
    ws.onmessage = handleWsMessage;

    ws.onerror = () => {
      // Pre-connect error is non-fatal; start() will create a fresh WS if needed
    };

    ws.onclose = () => {
      if (preConnectRef.current === ws) {
        preConnectRef.current = null;
      }
      if (recordingActiveRef.current) {
        setIsReady(false);
        setIsConnecting(false);
      }
    };

    return () => {
      if (!recordingActiveRef.current) {
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        if (preConnectRef.current === ws) preConnectRef.current = null;
      }
    };
  }, [toolId, buildWsUrl, closePreConnect, handleWsMessage]);

  const stop = useCallback(() => {
    recordingActiveRef.current = false;

    // Send END signal to server
    const ws = wsRef.current ?? preConnectRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send("END");
    }

    // Stop AudioWorklet immediately (no more audio to send)
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    // Stop AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Move the pre-connected WS to wsRef so it can finish receiving results
    if (wsRef.current === null && preConnectRef.current) {
      wsRef.current = preConnectRef.current;
      preConnectRef.current = null;
    }

    setIsReady(false);
    setIsConnecting(false);
    // NOTE: Do NOT clear streamingText here.
    // Keep the WS alive so the server can send the final transcription result.
    // The WS will be closed by the server after sending the final message.
    // Safety timeout: force-close WS after 15s if no final message arrives.
    const finalWs = wsRef.current;
    if (finalWs) {
      setTimeout(() => {
        if (finalWs.readyState === WebSocket.OPEN || finalWs.readyState === WebSocket.CONNECTING) {
          finalWs.close();
        }
      }, 15000);
    }
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  const start = useCallback(async () => {
    // Clean up any previous active session WS
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    recordingActiveRef.current = true;
    sentencesRef.current.clear();
    setIsConnecting(true);
    setStreamingText("");

    // 1. Get microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setIsConnecting(false);
      recordingActiveRef.current = false;
      onErrorRef.current?.("无法访问麦克风，请检查浏览器权限");
      return;
    }
    streamRef.current = stream;

    // 2. Create AudioContext + AudioWorklet
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;

    try {
      await audioCtx.audioWorklet.addModule("/pcm-processor.js");
    } catch {
      setIsConnecting(false);
      recordingActiveRef.current = false;
      onErrorRef.current?.("AudioWorklet 加载失败，请刷新页面重试");
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletNodeRef.current = workletNode;
    workletNode.port.postMessage({ type: 'init', sampleRate: audioCtx.sampleRate });

    // 3. Use pre-connected WS if available, otherwise create new one
    let ws: WebSocket;
    if (preConnectRef.current &&
        (preConnectRef.current.readyState === WebSocket.OPEN ||
         preConnectRef.current.readyState === WebSocket.CONNECTING)) {
      // Reuse the pre-connected WS - it already has handleWsMessage attached
      ws = preConnectRef.current;
      preConnectRef.current = null;
      // If xfyun already sent "ready" before recording started, signal now
      if (isReady) {
        // already set, no-op
      }
    } else {
      // No usable pre-connection - create fresh WS
      closePreConnect();
      const wsUrl = buildWsUrl();
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      // Attach the unified handler
      ws.onmessage = handleWsMessage;
    }

    wsRef.current = ws;

    ws.onerror = () => {
      setIsConnecting(false);
      setIsReady(false);
      onErrorRef.current?.("WebSocket 连接失败，请检查网络");
    };

    ws.onclose = () => {
      setIsReady(false);
      setIsConnecting(false);
    };

    // 4. Connect audio graph immediately (parallel with WS connection)
    source.connect(workletNode);
    workletNode.connect(audioCtx.destination);

    workletNode.port.onmessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === 'object' && e.data.type === 'debug') return;
      if (pausedRef.current) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(e.data as ArrayBuffer);
      }
    };
  }, [toolId, buildWsUrl, closePreConnect, handleWsMessage, isReady]);

  return { start, stop, pause, resume, isReady, isConnecting, streamingText };
}
