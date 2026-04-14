import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiToolSelector } from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Upload, Mic, MicOff, Copy, Square, Pause, Play, MapPin, Users, FileText, Download } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useStreamTranscribe } from "@/hooks/useStreamTranscribe";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import ImportProjectInfo, { type ProjectContext } from "@/components/ImportProjectInfo";
import AttendeeSelector, { type Attendee } from "@/components/AttendeeSelector";

type RecordingState = "idle" | "recording" | "paused" | "processing";

export default function MeetingMinutes() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [speechToolId, setSpeechToolId] = useState<number | undefined>(undefined);
  const [transcript, setTranscript] = useState("");
  const [projectName, setProjectName] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split("T")[0]);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [minutes, setMinutes] = useState("");
  const [minutesHistoryId, setMinutesHistoryId] = useState<number | undefined>(undefined);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioFileName, setAudioFileName] = useState("");
  const [importedProjectId, setImportedProjectId] = useState<number | null>(null);

  // Live recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveSegmentCount, setLiveSegmentCount] = useState(0);
  const [isProcessingSegment, setIsProcessingSegment] = useState(false);
  const [pendingSegments, setPendingSegments] = useState(0);
  const [inputMode, setInputMode] = useState<"upload" | "live">("upload");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadMime, setDownloadMime] = useState<string>("audio/webm");
  const [isArchiving, setIsArchiving] = useState(false);
  const [archivedDocId, setArchivedDocId] = useState<number | undefined>(undefined);

  // Streaming transcription state
  const [streamingPartial, setStreamingPartial] = useState(""); // current partial text being recognized
  const confirmedTranscriptRef = useRef(""); // confirmed transcript text
  const sentenceMapRef = useRef<Map<number, string>>(new Map()); // sentence accumulator for wpgs

  const streamTranscribe = useStreamTranscribe({
    toolId: speechToolId,
    onPartial: (text, sn, pgs, rg) => {
      if (pgs === "rpl" && rg) {
        const [from, to] = rg;
        for (let i = from; i <= to; i++) sentenceMapRef.current.delete(i);
      }
      sentenceMapRef.current.set(sn, text);
      setStreamingPartial(text);
    },
    onFinal: (text) => {
      if (text.trim()) {
        const newConfirmed = confirmedTranscriptRef.current
          ? `${confirmedTranscriptRef.current} ${text.trim()}`
          : text.trim();
        confirmedTranscriptRef.current = newConfirmed;
        setTranscript(newConfirmed);
        setLiveSegmentCount(c => c + 1);
      }
      sentenceMapRef.current.clear();
      setStreamingPartial("");
    },
    onError: (msg) => {
      console.warn("[streamTranscribe] error:", msg);
      // Fall back silently - the old 15s segment method continues in parallel
    },
    onReady: () => {
      console.log("[streamTranscribe] ready");
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Accumulate ALL chunks for full-recording download
  const fullRecordingChunksRef = useRef<Blob[]>([]);
  const downloadUrlRef = useRef<string | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef(transcript);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const uploadAudio = trpc.meeting.uploadAudio.useMutation();
  const transcribeMutation = trpc.meeting.transcribe.useMutation();
  const generateMutation = trpc.meeting.generateMinutes.useMutation({
    onSuccess: (data) => {
      setMinutes(data.content);
      setMinutesHistoryId(data.historyId || undefined);
      setArchivedDocId(data.documentId);
      setIsGenerating(false);
      setIsArchiving(false);
      if (data.documentId) {
        toast.success("会议纪要已生成并存入项目文档库");
      } else {
        toast.success("会议纪要生成完成");
      }
    },
    onError: (err) => {
      setIsGenerating(false);
      setIsArchiving(false);
      toast.error(err.message || "生成失败");
    },
  });

  // Helper: convert Blob to base64 string safely (avoids btoa RangeError on binary data)
  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result is "data:<mime>;base64,<data>"
        const base64 = result.split(",")[1];
        if (base64) resolve(base64);
        else reject(new Error("Failed to read blob as base64"));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }, []);

  // Process a chunk of audio: upload → transcribe → append
  const processAudioChunk = useCallback(async (chunks: Blob[], rawMimeType: string) => {
    if (chunks.length === 0) return;
    // Normalize mimeType: strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
    const mimeType = rawMimeType.split(";")[0].trim();
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
    };
    const ext = extMap[mimeType] ?? "webm";

    setIsProcessingSegment(true);
    setPendingSegments(c => c + 1);
    try {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        // Too small to be meaningful audio, skip silently
        setPendingSegments(c => Math.max(0, c - 1));
        setIsProcessingSegment(false);
        return;
      }
      const base64 = await blobToBase64(blob);
      const uploadResult = await uploadAudio.mutateAsync({
        fileName: `live-segment-${Date.now()}.${ext}`,
        fileData: base64,
        contentType: mimeType,
      });
      const transcribeResult = await transcribeMutation.mutateAsync({
        audioUrl: uploadResult.url,
        language: "zh",
        toolId: speechToolId,
      });
      if (transcribeResult.text?.trim()) {
        const newText = transcribeResult.text.trim();
        setTranscript(prev => prev ? `${prev} ${newText}` : newText);
        setLiveSegmentCount(c => c + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "转录失败";
      toast.error(`音频转录失败：${msg}`);
      console.error("[processAudioChunk] error:", err);
    } finally {
      setIsProcessingSegment(false);
      setPendingSegments(c => Math.max(0, c - 1));
    }
  }, [uploadAudio, transcribeMutation, blobToBase64]);

  const startSegmentTimer = useCallback((recorder: MediaRecorder, mimeType: string) => {
    segmentTimerRef.current = setInterval(() => {
      if (recorder.state === "recording") {
        recorder.requestData(); // triggers ondataavailable
      }
    }, 15000); // every 15s
  }, []);

  const startDurationTimer = useCallback(() => {
    durationTimerRef.current = setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  }, []);

  const clearTimers = useCallback(() => {
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    segmentTimerRef.current = null;
    durationTimerRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      // Reset full recording buffer and revoke any previous download URL
      fullRecordingChunksRef.current = [];
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
      setDownloadUrl(null);
      setDownloadMime(mimeType.split(";")[0].trim());

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          // Accumulate for full download
          fullRecordingChunksRef.current.push(e.data);
          // Also process this segment for real-time transcription
          const chunks = [e.data];
          audioChunksRef.current = [];
          processAudioChunk(chunks, mimeType);
        }
      };

      recorder.start(15000); // timeslice: collect data every 15s
      setRecordingState("recording");
      setRecordingDuration(0);
      setLiveSegmentCount(0);
      confirmedTranscriptRef.current = "";
      sentenceMapRef.current.clear();
      setStreamingPartial("");
      startDurationTimer();
      startSegmentTimer(recorder, mimeType);
      // Start streaming transcription via WebSocket
      streamTranscribe.start().catch(err => {
        console.warn("[streamTranscribe] start failed:", err);
        // Non-fatal: fall back to 15s segment method
      });
      toast.success("开始录音");
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限");
    }
  }, [processAudioChunk, startDurationTimer, startSegmentTimer, streamTranscribe]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      clearTimers();
      streamTranscribe.pause();
      setRecordingState("paused");
    }
  }, [clearTimers, streamTranscribe]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startDurationTimer();
      const mimeType = mediaRecorderRef.current.mimeType;
      startSegmentTimer(mediaRecorderRef.current, mimeType);
      streamTranscribe.resume();
      setRecordingState("recording");
    }
  }, [startDurationTimer, startSegmentTimer, streamTranscribe]);

  const stopRecording = useCallback(() => {
    clearTimers();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      const rawMime = recorder.mimeType;
      const mime = rawMime.split(";")[0].trim() || "audio/webm";

      // When stop fires, ondataavailable delivers the final chunk first
      recorder.addEventListener("stop", () => {
        const allChunks = fullRecordingChunksRef.current;
        if (allChunks.length > 0) {
          const blob = new Blob(allChunks, { type: mime });
          const url = URL.createObjectURL(blob);
          downloadUrlRef.current = url;
          setDownloadUrl(url);
        }
      }, { once: true });

      recorder.requestData(); // triggers final ondataavailable
      recorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Stop streaming transcription
    streamTranscribe.stop();
    setStreamingPartial("");
    setRecordingState("idle");
    toast.success("录音已停止，正在转录最后一段音频…");
  }, [clearTimers]);

  // Cleanup on unmount: stop timers, release mic, revoke Blob URL
  useEffect(() => {
    return () => {
      clearTimers();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, [clearTimers]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("音频文件不能超过 16MB");
      return;
    }
    setAudioFileName(file.name);
    setIsTranscribing(true);
    try {
      // Read file as base64 using Promise to properly propagate errors
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const b64 = result.split(",")[1];
          if (b64) resolve(b64);
          else reject(new Error("Failed to read file as base64"));
        };
        reader.onerror = () => reject(reader.error || new Error("FileReader error"));
        reader.readAsDataURL(file);
      });

      // Infer content type from file extension if browser doesn't provide it
      let contentType = file.type;
      if (!contentType) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const extMap: Record<string, string> = {
          webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg",
          mp4: "audio/mp4", m4a: "audio/mp4", wav: "audio/wav",
        };
        contentType = extMap[ext] || "audio/webm";
      }

      const uploadResult = await uploadAudio.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType,
      });
      const transcribeResult = await transcribeMutation.mutateAsync({
        audioUrl: uploadResult.url,
        language: "zh",
        toolId: speechToolId,
      });
      if (transcribeResult.text) {
        setTranscript(transcribeResult.text);
        toast.success("音频转写完成");
      } else {
        toast.warning("转写完成，但未识别到有效内容");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      toast.error(`音频处理失败：${msg}`);
      console.error("[handleFileUpload] error:", err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerate = async () => {
    if (!transcript.trim()) {
      toast.error("请先录音或上传音频，或手动输入会议内容");
      return;
    }
    setIsGenerating(true);
    setArchivedDocId(undefined);

    // Serialize attendees to a readable string for the AI prompt
    const meetingAttendees = attendees.length > 0
      ? attendees.map(a => a.label ? `${a.name}（${a.label}）` : a.name).join("、")
      : undefined;

    // If there is a local recording, upload it to S3 first for archiving
    let audioUrl: string | undefined;
    let audioKey: string | undefined;
    if (downloadUrl && importedProjectId) {
      try {
        setIsArchiving(true);
        // Re-fetch the blob from the local Blob URL
        const response = await fetch(downloadUrl);
        const blob = await response.blob();
        const base64 = await blobToBase64(blob);
        const ext = downloadMime.includes("ogg") ? "ogg" : downloadMime.includes("mp4") ? "mp4" : "webm";
        const dateStr = new Date().toISOString().slice(0, 10);
        const uploadResult = await uploadAudio.mutateAsync({
          fileName: `会议录音_${meetingTitle || dateStr}.${ext}`,
          fileData: base64,
          contentType: downloadMime,
        });
        audioUrl = uploadResult.url;
        audioKey = uploadResult.key;
      } catch {
        // Non-fatal: proceed without audio archive
        setIsArchiving(false);
        toast.error("录音上传失败，将仅存档纪要文本");
      }
    }

    generateMutation.mutate({
      transcript, projectName, meetingDate, meetingTitle, meetingLocation,
      meetingAttendees, toolId,
      projectId: importedProjectId || undefined,
      audioUrl,
      audioKey,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(minutes);
    toast.success("已复制到剪贴板");
  };

  const isRecordingActive = recordingState === "recording" || recordingState === "paused";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">会议纪要</h1>
          <p className="text-sm text-muted-foreground mt-1">实时录音转录，或上传录音文件，AI 自动生成结构化会议纪要</p>
        </div>
        <div className="flex items-center gap-3">
          <AiToolSelector capability="speech_to_text" value={speechToolId} onChange={setSpeechToolId} label="语音转写" showBuiltIn={false} />
          <AiToolSelector category="document" value={toolId} onChange={setToolId} label="AI 工具" />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">会议信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImportProjectInfo
                selectedProjectId={importedProjectId}
                onImport={(ctx: ProjectContext) => {
                  setImportedProjectId(ctx.project.id);
                  if (ctx.project.name) setProjectName(ctx.project.name);
                }}
              />
              {/* Meeting title */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  会议名称
                </Label>
                <Input
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="例：方案汇报会、施工协调会…"
                />
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  会议地点
                </Label>
                <Input
                  value={meetingLocation}
                  onChange={(e) => setMeetingLocation(e.target.value)}
                  placeholder="例：N+1 STUDIOS 会议室、腾讯会议…"
                />
              </div>

              {/* Attendees */}
              <AttendeeSelector value={attendees} onChange={setAttendees} />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>项目名称</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="关联项目" />
                </div>
                <div className="space-y-2">
                  <Label>会议日期</Label>
                  <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audio Input Mode Switcher */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">录音输入</CardTitle>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    onClick={() => { if (!isRecordingActive) setInputMode("live"); }}
                    disabled={isRecordingActive}
                    className={`px-3 py-1.5 transition-colors ${inputMode === "live" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                  >
                    <Mic className="h-3 w-3 inline mr-1" />实时录音
                  </button>
                  <button
                    onClick={() => { if (!isRecordingActive) setInputMode("upload"); }}
                    disabled={isRecordingActive}
                    className={`px-3 py-1.5 transition-colors ${inputMode === "upload" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                  >
                    <Upload className="h-3 w-3 inline mr-1" />上传文件
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {inputMode === "live" ? (
                <div className="space-y-4">
                  {/* Recording status display */}
                  <div className={`rounded-lg border-2 p-6 flex flex-col items-center gap-4 transition-colors ${
                    recordingState === "recording"
                      ? "border-red-400 bg-red-50 dark:bg-red-950/20"
                      : recordingState === "paused"
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                      : "border-border bg-muted/30"
                  }`}>
                    {/* Mic icon with pulse animation */}
                    <div className="relative">
                      <div className={`h-14 w-14 rounded-full flex items-center justify-center ${
                        recordingState === "recording"
                          ? "bg-red-500 text-white"
                          : recordingState === "paused"
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {recordingState === "recording" ? (
                          <Mic className="h-6 w-6" />
                        ) : recordingState === "paused" ? (
                          <Pause className="h-6 w-6" />
                        ) : (
                          <MicOff className="h-6 w-6" />
                        )}
                      </div>
                      {recordingState === "recording" && (
                        <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
                      )}
                    </div>

                    {/* Duration & status */}
                    <div className="text-center">
                      {isRecordingActive ? (
                        <>
                          <div className="text-2xl font-mono font-semibold tabular-nums">
                            {formatDuration(recordingDuration)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {recordingState === "recording" ? "录音中" : "已暂停"}
                            {streamTranscribe.isConnecting && " · 连接中…"}
                            {streamTranscribe.isReady && " · 实时转写"}
                            {!streamTranscribe.isReady && !streamTranscribe.isConnecting && liveSegmentCount > 0 && ` · 已转录 ${liveSegmentCount} 段`}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">点击开始录音，文字实时出现</p>
                      )}
                    </div>

                    {/* Control buttons */}
                    <div className="flex gap-2">
                      {recordingState === "idle" && (
                        <Button onClick={startRecording} className="bg-red-500 hover:bg-red-600 text-white">
                          <Mic className="h-4 w-4 mr-2" />开始录音
                        </Button>
                      )}
                      {recordingState === "recording" && (
                        <>
                          <Button variant="outline" onClick={pauseRecording}>
                            <Pause className="h-4 w-4 mr-2" />暂停
                          </Button>
                          <Button variant="destructive" onClick={stopRecording}>
                            <Square className="h-4 w-4 mr-2" />停止
                          </Button>
                        </>
                      )}
                      {recordingState === "paused" && (
                        <>
                          <Button onClick={resumeRecording} className="bg-green-600 hover:bg-green-700 text-white">
                            <Play className="h-4 w-4 mr-2" />继续
                          </Button>
                          <Button variant="destructive" onClick={stopRecording}>
                            <Square className="h-4 w-4 mr-2" />停止
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Live transcript preview */}
                  {isRecordingActive && (
                    <div className="text-xs bg-muted/40 rounded-md p-3 max-h-28 overflow-y-auto">
                      {transcript || streamingPartial ? (
                        <>
                          {transcript && (
                            <span className="text-foreground/70">
                              {transcript.slice(-300)}{transcript.length > 300 ? "…" : ""}
                            </span>
                          )}
                          {streamingPartial && (
                            <span className="text-muted-foreground/60 italic ml-1">{streamingPartial}…</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">转录文字将实时显示在这里…</span>
                      )}
                    </div>
                  )}

                  {/* Download button: shown after recording stops */}
                  {!isRecordingActive && downloadUrl && (() => {
                    const ext = downloadMime.includes("ogg") ? "ogg" : downloadMime.includes("mp4") ? "mp4" : "webm";
                    const dateStr = new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "-");
                    const fileName = `会议录音_${meetingTitle || meetingDate || dateStr}.${ext}`;
                    return (
                      <a
                        href={downloadUrl}
                        download={fileName}
                        className="flex items-center justify-center gap-2 w-full rounded-md border border-border bg-muted/30 hover:bg-accent/40 transition-colors px-4 py-2.5 text-sm text-foreground/80 hover:text-foreground"
                      >
                        <Download className="h-4 w-4 text-primary" />
                        <span>下载录音文件</span>
                        <span className="text-xs text-muted-foreground ml-1">({fileName})</span>
                      </a>
                    );
                  })()}
                </div>
              ) : (
                /* Upload mode */
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTranscribing}
                    className="w-full border-2 border-dashed border-border rounded-lg p-8 hover:border-primary/50 hover:bg-accent/30 transition-all flex flex-col items-center gap-3"
                  >
                    {isTranscribing ? (
                      <>
                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">正在转写 {audioFileName}…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground/40" />
                        <span className="text-sm text-muted-foreground">
                          {audioFileName ? `已上传：${audioFileName}` : "点击上传音频文件（MP3, WAV, M4A，最大 16MB）"}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">会议内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="录音转写结果将实时显示在此处，您也可以手动输入或编辑会议内容…"
                rows={10}
              />
              <Button onClick={handleGenerate} disabled={isGenerating || !transcript.trim() || isRecordingActive || pendingSegments > 0} className="w-full">
                {isArchiving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />上传录音文件…</>
                ) : isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中…</>
                ) : isRecordingActive ? (
                  <><Mic className="h-4 w-4 mr-2" />录音结束后可生成纪要</>
                ) : pendingSegments > 0 ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />正在转录最后一段音频…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />{importedProjectId ? "生成并存入文档库" : "生成会议纪要"}</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output Panel */}
        <Card className="h-fit">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">会议纪要</CardTitle>
            {minutes && (
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-3 w-3 mr-1.5" />复制
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {minutes ? (
              <>
                <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                  <Streamdown>{minutes}</Streamdown>
                </div>
                {!isGenerating && (
                  <div className="mt-6 pt-4 border-t space-y-3">
                    {archivedDocId && importedProjectId && (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <span>已存入项目文档库</span>
                        <a href={`/projects/${importedProjectId}?tab=documents`} className="ml-auto underline underline-offset-2 hover:text-emerald-900 font-medium">查看文档库 →</a>
                      </div>
                    )}
                    <FeedbackButtons module="meeting_minutes" historyId={minutesHistoryId} />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Mic className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">实时录音或上传会议录音</p>
                <p className="text-xs mt-1 opacity-60">AI 将自动整理为结构化会议纪要</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
