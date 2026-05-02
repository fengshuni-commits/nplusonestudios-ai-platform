/**
 * useStreamTranscribe
 *
 * 封装实时流式转写逻辑：
 * - 通过 AudioWorklet 采集麦克风 PCM 帧
 * - 通过 WebSocket 发送到后端 /api/transcribe-stream
 * - 实时接收识别结果并回调
 * - 支持预连接（toolId 设置后提前建立 WS 连接，减少录音开始时的延迟）
 *
 * 使用方式：
 *   const { start, stop, pause, resume, isReady, streamingText } = useStreamTranscribe({
 *     toolId,
 *     onPartial: (text) => ...,
 *     onFinal: (text) => ...,
 *     onError: (msg) => ...,
 *   });
 */

import { useRef, useState, useCallback, useEffect } from "react";

export interface StreamTranscribeOptions {
  toolId?: number;
  onPartial?: (text: string, sn: number, pgs: "apd" | "rpl", rg?: [number, number]) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
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
  const { toolId, onPartial, onFinal, onError, onReady } = options;

  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(false);
  const preConnectedRef = useRef(false);  // WS pre-connected before recording starts
  const recordingActiveRef = useRef(false); // recording is active

  // Callbacks refs to avoid stale closures in pre-connected WS handlers
  const onPartialRef = useRef(onPartial);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onPartialRef.current = onPartial; }, [onPartial]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  // Build WebSocket URL
  const buildWsUrl = useCallback((tid?: number) => {
    const loc = window.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    const id = tid ?? toolId;
    if (id) params.set("toolId", String(id));
    return `${proto}//${loc.host}/api/transcribe-stream?${params.toString()}`;
  }, [toolId]);

  // ── Pre-connect WS when toolId is set ─────────────────────────────────
  // This reduces the initial delay when user clicks record
  const preConnectRef = useRef<WebSocket | null>(null);
  const preConnectToolIdRef = useRef<number | undefined>(undefined);
  const preConnectSentencesRef = useRef<Map<number, string>>(new Map());

  const closePreConnect = useCallback(() => {
    if (preConnectRef.current) {
      preConnectRef.current.close();
      preConnectRef.current = null;
    }
    preConnectedRef.current = false;
    preConnectSentencesRef.current.clear();
  }, []);

  useEffect(() => {
    if (!toolId) {
      closePreConnect();
      return;
    }
    // Don't pre-connect if already recording
    if (recordingActiveRef.current) return;
    // Don't re-connect if same toolId
    if (preConnectToolIdRef.current === toolId && preConnectRef.current?.readyState === WebSocket.OPEN) return;

    closePreConnect();
    preConnectToolIdRef.current = toolId;

    const wsUrl = buildWsUrl(toolId);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    preConnectRef.current = ws;

    ws.onopen = () => {
      // WS connected but not yet recording - wait for start() to attach audio
    };

    ws.onmessage = (e) => {
      if (!recordingActiveRef.current) return; // ignore messages before recording starts
      try {
        const msg = JSON.parse(e.data as string) as {
          type: "ready" | "partial" | "final" | "error";
          text?: string;
          message?: string;
          sn?: number;
          pgs?: "apd" | "rpl";
          rg?: [number, number];
        };

        if (msg.type === "ready") {
          setIsReady(true);
          setIsConnecting(false);
          onReadyRef.current?.();
        } else if (msg.type === "partial") {
          const sn = msg.sn ?? 0;
          const text = msg.text ?? "";
          const pgs = msg.pgs ?? "apd";
          const sentences = preConnectSentencesRef.current;

          if (pgs === "rpl" && msg.rg) {
            const [from, to] = msg.rg;
            for (let i = from; i <= to; i++) sentences.delete(i);
          }
          sentences.set(sn, text);
          setStreamingText(text);
          onPartialRef.current?.(text, sn, pgs, msg.rg);
        } else if (msg.type === "final") {
          const finalText = msg.text ?? Array.from(preConnectSentencesRef.current.values()).join("");
          preConnectSentencesRef.current.clear();
          setStreamingText("");
          onFinalRef.current?.(finalText);
        } else if (msg.type === "error") {
          onErrorRef.current?.(msg.message ?? "转写错误");
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      preConnectedRef.current = false;
    };

    ws.onclose = () => {
      if (preConnectRef.current === ws) {
        preConnectRef.current = null;
        preConnectedRef.current = false;
      }
      if (recordingActiveRef.current) {
        setIsReady(false);
        setIsConnecting(false);
      }
    };

    preConnectedRef.current = true;

    return () => {
      if (!recordingActiveRef.current) {
        ws.close();
        if (preConnectRef.current === ws) preConnectRef.current = null;
      }
    };
  }, [toolId, buildWsUrl, closePreConnect]);

  const stop = useCallback(() => {
    recordingActiveRef.current = false;

    // Send END signal to server
    const ws = wsRef.current ?? preConnectRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send("END");
    }

    // Stop AudioWorklet
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
    setStreamingText("");
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  const start = useCallback(async () => {
    // Clean up any previous session
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    recordingActiveRef.current = true;
    setIsConnecting(true);
    setStreamingText("");

    // 1. Get microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      setIsConnecting(false);
      recordingActiveRef.current = false;
      onError?.("无法访问麦克风，请检查浏览器权限");
      return;
    }
    streamRef.current = stream;

    // 2. Create AudioContext + AudioWorklet
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;

    try {
      await audioCtx.audioWorklet.addModule("/pcm-processor.js");
    } catch (e) {
      setIsConnecting(false);
      recordingActiveRef.current = false;
      onError?.("AudioWorklet 加载失败，请刷新页面重试");
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
    if (preConnectRef.current && preConnectRef.current.readyState === WebSocket.OPEN) {
      ws = preConnectRef.current;
      preConnectRef.current = null;
      // Already connected - signal ready immediately
      setIsReady(true);
      setIsConnecting(false);
      onReady?.();
    } else if (preConnectRef.current && preConnectRef.current.readyState === WebSocket.CONNECTING) {
      // Still connecting - wait for it
      ws = preConnectRef.current;
      preConnectRef.current = null;
      ws.onopen = () => {
        // ready will come from server's "ready" message
      };
    } else {
      // No pre-connection - create fresh WS
      closePreConnect();
      const wsUrl = buildWsUrl();
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
    }

    wsRef.current = ws;

    // Re-attach message handler to use current callbacks
    const sentences = preConnectSentencesRef.current;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: "ready" | "partial" | "final" | "error";
          text?: string;
          message?: string;
          sn?: number;
          pgs?: "apd" | "rpl";
          rg?: [number, number];
        };

        if (msg.type === "ready") {
          setIsReady(true);
          setIsConnecting(false);
          onReady?.();
        } else if (msg.type === "partial") {
          const sn = msg.sn ?? 0;
          const text = msg.text ?? "";
          const pgs = msg.pgs ?? "apd";

          if (pgs === "rpl" && msg.rg) {
            const [from, to] = msg.rg;
            for (let i = from; i <= to; i++) sentences.delete(i);
          }
          sentences.set(sn, text);
          setStreamingText(text);
          onPartial?.(text, sn, pgs, msg.rg);
        } else if (msg.type === "final") {
          const finalText = msg.text ?? Array.from(sentences.values()).join("");
          sentences.clear();
          setStreamingText("");
          onFinal?.(finalText);
        } else if (msg.type === "error") {
          onError?.(msg.message ?? "转写错误");
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setIsConnecting(false);
      setIsReady(false);
      onError?.("WebSocket 连接失败，请检查网络");
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
  }, [toolId, buildWsUrl, stop, closePreConnect, onPartial, onFinal, onError, onReady]);

  return { start, stop, pause, resume, isReady, isConnecting, streamingText };
}
