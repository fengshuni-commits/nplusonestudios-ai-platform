import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiToolSelector } from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Upload, Mic, MicOff, Copy, Square, Pause, Play, MapPin, Users, FileText } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import ImportProjectInfo, { type ProjectContext } from "@/components/ImportProjectInfo";

type RecordingState = "idle" | "recording" | "paused" | "processing";

export default function MeetingMinutes() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [transcript, setTranscript] = useState("");
  const [projectName, setProjectName] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split("T")[0]);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingAttendees, setMeetingAttendees] = useState("");
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
  const [inputMode, setInputMode] = useState<"upload" | "live">("upload");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
      setIsGenerating(false);
      toast.success("会议纪要生成完成");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "生成失败");
    },
  });

  // Process a chunk of audio: upload → transcribe → append
  const processAudioChunk = useCallback(async (chunks: Blob[], mimeType: string) => {
    if (chunks.length === 0) return;
    setIsProcessingSegment(true);
    try {
      const blob = new Blob(chunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
      const uploadResult = await uploadAudio.mutateAsync({
        fileName: `live-segment-${Date.now()}.${ext}`,
        fileData: base64,
        contentType: mimeType,
      });
      const transcribeResult = await transcribeMutation.mutateAsync({
        audioUrl: uploadResult.url,
        language: "zh",
      });
      if (transcribeResult.text?.trim()) {
        const newText = transcribeResult.text.trim();
        setTranscript(prev => prev ? `${prev} ${newText}` : newText);
        setLiveSegmentCount(c => c + 1);
      }
    } catch {
      // silently skip failed segment
    } finally {
      setIsProcessingSegment(false);
    }
  }, [uploadAudio, transcribeMutation]);

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

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const chunks = [e.data];
          audioChunksRef.current = [];
          processAudioChunk(chunks, mimeType);
        }
      };

      recorder.start(15000); // timeslice: collect data every 15s
      setRecordingState("recording");
      setRecordingDuration(0);
      setLiveSegmentCount(0);
      startDurationTimer();
      startSegmentTimer(recorder, mimeType);
      toast.success("开始录音");
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限");
    }
  }, [processAudioChunk, startDurationTimer, startSegmentTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      clearTimers();
      setRecordingState("paused");
    }
  }, [clearTimers]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startDurationTimer();
      const mimeType = mediaRecorderRef.current.mimeType;
      startSegmentTimer(mediaRecorderRef.current, mimeType);
      setRecordingState("recording");
    }
  }, [startDurationTimer, startSegmentTimer]);

  const stopRecording = useCallback(() => {
    clearTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      // Request final data before stopping
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setRecordingState("idle");
    toast.success("录音已停止");
  }, [clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
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
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const uploadResult = await uploadAudio.mutateAsync({
          fileName: file.name,
          fileData: base64,
          contentType: file.type,
        });
        const transcribeResult = await transcribeMutation.mutateAsync({
          audioUrl: uploadResult.url,
          language: "zh",
        });
        if (transcribeResult.text) {
          setTranscript(transcribeResult.text);
          toast.success("音频转写完成");
        }
        setIsTranscribing(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIsTranscribing(false);
      toast.error("音频处理失败");
    }
  };

  const handleGenerate = () => {
    if (!transcript.trim()) {
      toast.error("请先录音或上传音频，或手动输入会议内容");
      return;
    }
    setIsGenerating(true);
    generateMutation.mutate({ transcript, projectName, meetingDate, meetingTitle, meetingLocation, meetingAttendees, toolId, projectId: importedProjectId || undefined });
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
        <AiToolSelector category="document" value={toolId} onChange={setToolId} label="AI 工具" />
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
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  参会人员
                </Label>
                <Input
                  value={meetingAttendees}
                  onChange={(e) => setMeetingAttendees(e.target.value)}
                  placeholder="例：张三、李四（甲方）、王五（结构顾问）…"
                />
              </div>

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
                            {liveSegmentCount > 0 && ` · 已转录 ${liveSegmentCount} 段`}
                            {isProcessingSegment && " · 转录中…"}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">点击开始录音，每 15 秒自动转录一次</p>
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
                    <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 max-h-24 overflow-y-auto">
                      {transcript
                        ? <span className="text-foreground/70">{transcript.slice(-200)}{transcript.length > 200 ? "…" : ""}</span>
                        : <span className="italic">转录文字将实时显示在这里…</span>
                      }
                    </div>
                  )}
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
              <Button onClick={handleGenerate} disabled={isGenerating || !transcript.trim() || isRecordingActive} className="w-full">
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中…</>
                ) : isRecordingActive ? (
                  <><Mic className="h-4 w-4 mr-2" />录音结束后可生成纪要</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />生成会议纪要</>
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
                  <div className="mt-6 pt-4 border-t">
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
