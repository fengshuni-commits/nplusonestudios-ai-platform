/**
 * useStreamTranscribe
 *
 * 封装实时流式转写逻辑：
 * - 通过 AudioWorklet 采集麦克风 PCM 帧
 * - 通过 WebSocket 发送到后端 /api/transcribe-stream
 * - 实时接收识别结果并回调
 *
 * 使用方式：
 *   const { start, stop, pause, resume, isReady, streamingText } = useStreamTranscribe({
 *     toolId,
 *     onPartial: (text) => ...,
 *     onFinal: (text) => ...,
 *     onError: (msg) => ...,
 *   });
 */

import { useRef, useState, useCallback } from "react";

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

  // Build WebSocket URL
  const buildWsUrl = useCallback(() => {
    const loc = window.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    if (toolId) params.set("toolId", String(toolId));
    return `${proto}//${loc.host}/api/transcribe-stream?${params.toString()}`;
  }, [toolId]);

  const stop = useCallback(() => {
    // Send END signal to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send("END");
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
    if (wsRef.current) {
      // Already running, clean up first
      stop();
    }

    setIsConnecting(true);
    setStreamingText("");

    // 1. Get microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      setIsConnecting(false);
      onError?.("无法访问麦克风，请检查浏览器权限");
      return;
    }
    streamRef.current = stream;

    // 2. Create AudioContext + AudioWorklet
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;

    try {
      await audioCtx.audioWorklet.addModule("/pcm-processor.js");
    } catch (e) {
      setIsConnecting(false);
      onError?.("AudioWorklet 加载失败，请刷新页面重试");
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletNodeRef.current = workletNode;
    // 将实际采样率发给 AudioWorklet（Chrome 可能忽略 AudioContext sampleRate 参数）
    console.log("[streamTranscribe] AudioContext sampleRate:", audioCtx.sampleRate);
    workletNode.port.postMessage({ type: 'init', sampleRate: audioCtx.sampleRate });

    // 3. Connect WebSocket
    const wsUrl = buildWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    // Sentence accumulator for wpgs dynamic correction
    const sentences = new Map<number, string>();

    ws.onopen = () => {
      // Start piping PCM frames from worklet to WS
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (pausedRef.current) return;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };
      source.connect(workletNode);
      workletNode.connect(audioCtx.destination); // needed to keep worklet running (silent)
    };

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

          // Show current streaming sentence
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
  }, [toolId, buildWsUrl, stop, onPartial, onFinal, onError, onReady]);

  return { start, stop, pause, resume, isReady, isConnecting, streamingText };
}
