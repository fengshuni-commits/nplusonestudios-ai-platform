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
      // 不指定 sampleRate 约束，避免浏览器返回静音虚拟流
      // 实际采样率将由 AudioWorklet 内部降采样处理
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      setIsConnecting(false);
      onError?.("无法访问麦克风，请检查浏览器权限");
      return;
    }
    streamRef.current = stream;

    // 2. Create AudioContext + AudioWorklet
    // 不强制 16000Hz，使用系统默认采样率（通常 48000Hz）
    // 强制 16000Hz 会导致浏览器重采样 bug，使得 AudioWorklet 收到静音数据
    // AudioWorklet 内部会根据实际采样率做降采样到 16kHz
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;

    try {
      await audioCtx.audioWorklet.addModule("/pcm-processor.js");
    } catch (e) {
      setIsConnecting(false);
      onError?.("AudioWorklet 加载失败，请刷新页面重试");
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    // 确保 AudioContext 处于运行状态（浏览器自动播放策略可能导致 suspended）
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletNodeRef.current = workletNode;
    // 将实际采样率发给 AudioWorklet
    workletNode.port.postMessage({ type: 'init', sampleRate: audioCtx.sampleRate });

    // 3. Connect WebSocket
    const wsUrl = buildWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    // Sentence accumulator for wpgs dynamic correction
    const sentences = new Map<number, string>();

    // 立即连接音频图，不等待 WS 连接成功
    // 这样音频采集和 WS 连接并行，避免 WS 失败导致音频采集不工作
    source.connect(workletNode);
    workletNode.connect(audioCtx.destination); // needed to keep worklet running (silent)

    // 处理 AudioWorklet 发来的消息（PCM 帧）
    workletNode.port.onmessage = (e: MessageEvent) => {
      // Ignore debug messages from worklet
      if (e.data && typeof e.data === 'object' && e.data.type === 'debug') return;
      // PCM ArrayBuffer frame
      if (pausedRef.current) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(e.data as ArrayBuffer);
      }
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
