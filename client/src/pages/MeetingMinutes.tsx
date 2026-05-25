import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiToolSelector } from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Upload, Mic, MicOff, Copy, Square, Pause, Play, MapPin, Users, FileText, Download, Edit2, Save, X, CheckSquare, ListTodo, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useEffect, useCallback } from "react";
import { useStreamTranscribe } from "@/hooks/useStreamTranscribe";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import ImportProjectInfo, { type ProjectContext } from "@/components/ImportProjectInfo";
import AttendeeSelector, { type Attendee } from "@/components/AttendeeSelector";

type RecordingState = "idle" | "recording" | "paused" | "processing";

export default function MeetingMinutes() {
  const [llmToolId, setLlmToolId] = useState<number | undefined>(undefined);
  const [streamToolId, setStreamToolId] = useState<number | undefined>(undefined);  // 实时录音识别引擎
  const [fileToolId, setFileToolId] = useState<number | undefined>(undefined);    // 录音文件转写引擎
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
  // Multi-file transcription queue
  type FileTranscribeStatus = "pending" | "uploading" | "transcribing" | "done" | "error";
  const [fileQueue, setFileQueue] = useState<{ name: string; status: FileTranscribeStatus; error?: string }[]>([]);
  const [importedProjectId, setImportedProjectId] = useState<number | null>(null);

  // Live recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const recordingStateRef = useRef<RecordingState>("idle"); // ref for use inside callbacks
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [inputMode, setInputMode] = useState<"upload" | "live">("upload");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadMime, setDownloadMime] = useState<string>("audio/webm");
  const [isArchiving, setIsArchiving] = useState(false);
  const [archivedDocId, setArchivedDocId] = useState<number | undefined>(undefined);

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedMinutes, setEditedMinutes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // Task extraction state
  type ExtractedTask = { title: string; description: string; priority: string; category: string; dueDate: string; selected: boolean };
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [isExtractingTasks, setIsExtractingTasks] = useState(false);
  const [showExtractedTasks, setShowExtractedTasks] = useState(false);
  const [isSavingTasks, setIsSavingTasks] = useState(false);
  const [tasksSavedProjectId, setTasksSavedProjectId] = useState<number | null>(null);
  const [tasksSavedCount, setTasksSavedCount] = useState(0);

  // Auto-save draft state
  const [draftId, setDraftId] = useState<number | undefined>(undefined);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const draftIdRef = useRef<number | undefined>(undefined);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meetingTitleRef = useRef(meetingTitle);
  const meetingDateRef = useRef(meetingDate);
  const importedProjectIdRef = useRef(importedProjectId);

  // Streaming transcription state
  const [streamingPartial, setStreamingPartial] = useState(""); // current partial text being recognized
  const confirmedTranscriptRef = useRef(""); // confirmed transcript text
  const sentenceMapRef = useRef<Map<number, string>>(new Map()); // sentence accumulator for wpgs

  const streamTranscribe = useStreamTranscribe({
    toolId: streamToolId,
    onPartial: (text, sn, pgs, rg) => {
      if (pgs === "rpl" && rg) {
        const [from, to] = rg;
        for (let i = from; i <= to; i++) sentenceMapRef.current.delete(i);
      }
      sentenceMapRef.current.set(sn, text);
      setStreamingPartial(text);
      // 实时更新会议内容文本框：已确认文字 + 当前正在识别的内容
      const allSentences = Array.from(sentenceMapRef.current.values()).join("");
      const liveText = confirmedTranscriptRef.current
        ? `${confirmedTranscriptRef.current}${allSentences ? " " + allSentences : ""}`
        : allSentences;
      if (liveText) setTranscript(liveText);
    },
    onFinal: (text) => {
      if (text.trim()) {
        const newConfirmed = confirmedTranscriptRef.current
          ? `${confirmedTranscriptRef.current} ${text.trim()}`
          : text.trim();
        confirmedTranscriptRef.current = newConfirmed;
      }
      sentenceMapRef.current.clear();
      setStreamingPartial("");
      // Always sync transcript state after clearing sentenceMap
      // so the display stays consistent with confirmedTranscriptRef
      setTranscript(confirmedTranscriptRef.current);
      // If recording has already stopped, show a toast to confirm final result arrived
      if (recordingStateRef.current === "idle") {
        toast.success("转写完成！");
      }
    },
    onWarning: (msg) => {
      // Transient warning (e.g. 10165/10008 retry) — show brief toast, do NOT stop recording
      console.warn("[streamTranscribe] warning:", msg);
      toast.warning(msg, { id: "xfyun-warn", duration: 3000 });
    },
    onError: (msg) => {
      // Fatal error — stop recording
      console.error("[streamTranscribe] fatal error:", msg);
      toast.error(`讯飞实时转写失败：${msg}。请检查讯飞配置后重试。`, { id: "xfyun-fail", duration: 8000 });
      stopRecordingRef.current?.();
    },
    onReady: () => {
      console.log("[streamTranscribe] ready");
      // New xfyun session started - clear stale sentence state from previous session
      sentenceMapRef.current.clear();
      setStreamingPartial("");
      // Sync transcript to confirmed-only text (remove any stale partial display)
      setTranscript(confirmedTranscriptRef.current);
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
  // Ref to stopRecording so onError callback (defined before stopRecording) can call it
  const stopRecordingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => { meetingTitleRef.current = meetingTitle; }, [meetingTitle]);
  useEffect(() => { meetingDateRef.current = meetingDate; }, [meetingDate]);
  useEffect(() => { importedProjectIdRef.current = importedProjectId; }, [importedProjectId]);
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // Auto-import project from URL ?projectId= param
  const [location] = useLocation();
  const utils = trpc.useUtils();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("projectId");
    if (!pid) return;
    const id = parseInt(pid, 10);
    if (isNaN(id) || importedProjectId === id) return;
    utils.projects.getProjectContext.fetch({ id }).then((ctx: any) => {
      setImportedProjectId(ctx.project.id);
      if (ctx.project.name) setProjectName(ctx.project.name);
      toast.success(`已自动关联项目：${ctx.project.name}`);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  // Listen for load-meeting-draft event dispatched from History page
  useEffect(() => {
    const handler = (e: Event) => {
      const draft = (e as CustomEvent).detail as { id: number; title: string; content: string | null };
      if (!draft) return;
      const text = draft.content || "";
      setTranscript(text);
      confirmedTranscriptRef.current = text;
      sentenceMapRef.current.clear();
      setStreamingPartial("");
      // Parse title: "[草稿] 会议名称 · 日期"
      const cleaned = draft.title.replace(/^\[草稿\]\s*/, "");
      const parts = cleaned.split(" · ");
      if (parts[0]) setMeetingTitle(parts[0]);
      if (parts[1]) setMeetingDate(parts[1]);
      setDraftId(draft.id);
      toast.success("草稿已加载");
    };
    window.addEventListener("load-meeting-draft", handler);
    return () => window.removeEventListener("load-meeting-draft", handler);
  }, []);

  const uploadAudio = trpc.meeting.uploadAudio.useMutation();
  const submitTranscribeMutation = trpc.meeting.submitTranscribeTask.useMutation();
  const pollTranscribeMutation = trpc.meeting.pollTranscribeTask.useMutation();
  const saveDraftMutation = trpc.meeting.saveDraft.useMutation();
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

  const extractTasksMutation = trpc.meeting.extractTasks.useMutation({
    onSuccess: (data) => {
      const tasks = data.tasks.map((t: any) => ({ ...t, selected: true }));
      setExtractedTasks(tasks);
      setShowExtractedTasks(true);
      setIsExtractingTasks(false);
      if (tasks.length === 0) {
        toast.info("未从纪要中识别到明确的待办事项");
      } else {
        toast.success(`识别到 ${tasks.length} 个待办事项`);
      }
    },
    onError: (err) => {
      setIsExtractingTasks(false);
      toast.error(err.message || "任务提取失败");
    },
  });

  const saveExtractedTasksMutation = trpc.meeting.saveExtractedTasks.useMutation({
    onSuccess: (data) => {
      setIsSavingTasks(false);
      setTasksSavedCount(data.count);
      setTasksSavedProjectId(importedProjectId);
      setShowExtractedTasks(false);
      setExtractedTasks([]);
      toast.success(`${data.count} 个任务已写入项目看板`);
    },
    onError: (err) => {
      setIsSavingTasks(false);
      toast.error(err.message || "保存任务失败");
    },
  });

  const handleExtractTasks = () => {
    if (!minutes.trim()) return;
    setIsExtractingTasks(true);
    setExtractedTasks([]);
    setShowExtractedTasks(false);
    extractTasksMutation.mutate({
      minutesContent: minutes,
      projectId: importedProjectId || undefined,
      toolId: llmToolId,
    });
  };

  const handleSaveTasksToKanban = () => {
    if (!importedProjectId) {
      toast.error("请先关联项目，才能写入任务看板");
      return;
    }
    const selected = extractedTasks.filter(t => t.selected);
    if (selected.length === 0) {
      toast.error("请至少选择一个任务");
      return;
    }
    setIsSavingTasks(true);
    saveExtractedTasksMutation.mutate({
      projectId: importedProjectId,
      tasks: selected.map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority as any,
        category: t.category as any,
        dueDate: t.dueDate || undefined,
      })),
    });
  };

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

  const startDurationTimer = useCallback(() => {
    durationTimerRef.current = setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  }, []);

  const clearTimers = useCallback(() => {
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    segmentTimerRef.current = null;
    durationTimerRef.current = null;
    autoSaveTimerRef.current = null;
  }, []);

  // Perform one auto-save: create draft on first save, update on subsequent saves
  const performAutoSave = useCallback(async () => {
    const currentTranscript = transcriptRef.current.trim();
    if (!currentTranscript) return; // nothing to save
    setIsAutoSaving(true);
    try {
      const result = await saveDraftMutation.mutateAsync({
        transcript: currentTranscript,
        meetingTitle: meetingTitleRef.current || undefined,
        meetingDate: meetingDateRef.current || undefined,
        projectId: importedProjectIdRef.current ?? undefined,
        draftId: draftIdRef.current,
      });
      draftIdRef.current = result.draftId;
      setDraftId(result.draftId);
      setLastAutoSavedAt(new Date());
    } catch (err) {
      console.warn("[autoSave] failed:", err);
    } finally {
      setIsAutoSaving(false);
    }
  }, [saveDraftMutation]);

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

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Accumulate for full download only (no Whisper fallback)
          fullRecordingChunksRef.current.push(e.data);
          audioChunksRef.current = [];
        }
      };

      recorder.start(15000); // timeslice: collect data every 15s for download accumulation
      recordingStateRef.current = "recording";
      setRecordingState("recording");
      setRecordingDuration(0);
      confirmedTranscriptRef.current = "";
      sentenceMapRef.current.clear();
      setStreamingPartial("");
      setTranscript(""); // Clear previous transcript for new session
      // Reset draft state for new recording session
      draftIdRef.current = undefined;
      setDraftId(undefined);
      setLastAutoSavedAt(null);
      startDurationTimer();
      // Start auto-save timer: save every 5 minutes
      autoSaveTimerRef.current = setInterval(() => {
        performAutoSave();
      }, 5 * 60 * 1000);
      // Start streaming transcription via WebSocket (required - no fallback)
      streamTranscribe.start().catch(err => {
        console.warn("[streamTranscribe] start failed:", err);
        toast.error(`讯飞实时转写启动失败：${err instanceof Error ? err.message : err}。请检查讯飞配置。`, { duration: 8000 });
        stopRecordingRef.current?.();
      });
      toast.success("开始录音，实时转写连接中…");
    } catch {
      toast.error("无法访问麦克风，请检查浏览器权限");
    }
  }, [startDurationTimer, streamTranscribe, performAutoSave]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      clearTimers();
      streamTranscribe.pause();
      recordingStateRef.current = "paused";
      setRecordingState("paused");
    }
  }, [clearTimers, streamTranscribe]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startDurationTimer();
      streamTranscribe.resume();
      recordingStateRef.current = "recording";
      setRecordingState("recording");
    }
  }, [startDurationTimer, streamTranscribe]);

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
    // Stop streaming transcription (keeps WS alive to receive final result)
    streamTranscribe.stop();
    // Don't clear streamingPartial here - wait for onFinal callback
    // so the last few seconds of transcription are not lost
    recordingStateRef.current = "idle";
    setRecordingState("idle");
    toast.success("录音已停止，等待最后识别结果…");
    // Save draft immediately on stop
    setTimeout(() => performAutoSave(), 2000); // slight delay to let onFinal arrive first
  }, [clearTimers, performAutoSave]);
  // Keep ref in sync so onError can call stopRecording
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

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
    const files = Array.from(e.target.files || []);
    // Reset input so the same files can be re-selected if needed
    e.target.value = "";
    if (files.length === 0) return;
    const maxSize = 500 * 1024 * 1024; // 500MB per file
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`「${file.name}」超过 500MB 限制，已跳过`);
      }
    }
    const validFiles = files.filter(f => f.size <= maxSize);
    if (validFiles.length === 0) return;

    // Initialize queue
    const initialQueue = validFiles.map(f => ({ name: f.name, status: "pending" as FileTranscribeStatus }));
    setFileQueue(initialQueue);
    setAudioFileName(validFiles.map(f => f.name).join(", "));
    setIsTranscribing(true);

    // Process all files in parallel
    // Each file updates transcript immediately when done (real-time display)
    let doneCount = 0;
    let errorCount = 0;

    const processFile = async (file: File, i: number) => {
      try {
        // Upload
        setFileQueue(q => q.map((item, idx) => idx === i ? { ...item, status: "uploading" } : item));
        const formData = new FormData();
        formData.append("file", file, file.name);
        const uploadResp = await fetch("/api/upload/meeting-audio", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!uploadResp.ok) {
          const errBody = await uploadResp.json().catch(() => ({}));
          throw new Error(errBody.error || `上传失败 (${uploadResp.status})`);
        }
        const uploadResult: { url: string; key: string } = await uploadResp.json();

        // Submit transcription task
        setFileQueue(q => q.map((item, idx) => idx === i ? { ...item, status: "transcribing" } : item));
        const { taskId } = await submitTranscribeMutation.mutateAsync({
          audioUrl: uploadResult.url,
          toolId: fileToolId,
        });

        // Poll until done
        const maxPolls = 120; // 120 * 5s = 10 minutes max
        let fileText = "";
        for (let poll = 0; poll < maxPolls; poll++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollResult = await pollTranscribeMutation.mutateAsync({
            taskId,
            toolId: fileToolId,
          });
          if (pollResult.status === "done") {
            fileText = pollResult.text || "";
            break;
          }
          if (pollResult.status === "error") {
            throw new Error(pollResult.error || "转写失败");
          }
        }
        setFileQueue(q => q.map((item, idx) => idx === i ? { ...item, status: "done" } : item));
        // 每个文件完成后立即追加到文本框（实时显示）
        if (fileText.trim()) {
          const prefix = validFiles.length > 1 ? `《${file.name}》
` : "";
          setTranscript(prev => {
            const newText = prefix + fileText.trim();
            return prev ? prev + "\n\n" + newText : newText;
          });
        }
        doneCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "未知错误";
        setFileQueue(q => q.map((item, idx) => idx === i ? { ...item, status: "error", error: msg } : item));
        toast.error(`「${file.name}」转写失败：${msg}`);
        errorCount++;
      }
    };

    // Launch all files concurrently
    await Promise.all(validFiles.map((file, i) => processFile(file, i)));

    if (doneCount > 0) {
      toast.success(`${doneCount} 个文件转写完成`);
    } else if (errorCount === 0) {
      toast.warning("转写完成，但未识别到有效内容");
    }
    setIsTranscribing(false);
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
        const ext = downloadMime.includes("ogg") ? "ogg" : downloadMime.includes("mp4") ? "mp4" : "webm";
        const dateStr = new Date().toISOString().slice(0, 10);
        const archiveFormData = new FormData();
        archiveFormData.append("file", blob, `会议录音_${meetingTitle || dateStr}.${ext}`);
        const archiveResp = await fetch("/api/upload/meeting-audio", {
          method: "POST",
          body: archiveFormData,
          credentials: "include",
        });
        if (!archiveResp.ok) throw new Error(`录音归档失败 (${archiveResp.status})`);
        const archiveResult: { url: string; key: string } = await archiveResp.json();
        audioUrl = archiveResult.url;
        audioKey = archiveResult.key;
      } catch {
        // Non-fatal: proceed without audio archive
        setIsArchiving(false);
        toast.error("录音上传失败，将仅存档纪要文本");
      }
    }

    generateMutation.mutate({
      transcript, projectName, meetingDate, meetingTitle, meetingLocation,
      meetingAttendees, toolId: llmToolId,
      projectId: importedProjectId || undefined,
      audioUrl,
      audioKey,
    });
  };

  const updateDocMutation = trpc.documents.update.useMutation({
    onSuccess: () => {
      setMinutes(editedMinutes);
      setIsEditing(false);
      setIsSavingEdit(false);
      toast.success("会议纪要已保存");
    },
    onError: () => {
      setIsSavingEdit(false);
      toast.error("保存失败，请重试");
    },
  });

  const handleStartEdit = () => {
    setEditedMinutes(minutes);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedMinutes("");
  };

  const handleSaveEdit = () => {
    if (!archivedDocId) {
      // No document saved yet, just update local state
      setMinutes(editedMinutes);
      setIsEditing(false);
      toast.success("已更新（未绑定项目，仅本地生效）");
      return;
    }
    setIsSavingEdit(true);
    updateDocMutation.mutate({ id: archivedDocId, content: editedMinutes });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(isEditing ? editedMinutes : minutes);
    toast.success("已复制到剪贴板");
  };

  const handleDownloadMd = () => {
    const content = isEditing ? editedMinutes : minutes;
    const dateStr = meetingDate || new Date().toISOString().slice(0, 10);
    const titleStr = meetingTitle || projectName || "会议纪要";
    const fileName = `${titleStr}_${dateStr}.md`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已下载 ${fileName}`);
  };

  const isRecordingActive = recordingState === "recording" || recordingState === "paused";

  return (
    <div className="pb-6">
      <div className="flex items-center justify-end mb-2 gap-2">
        <AiToolSelector capability="document" value={llmToolId} onChange={setLlmToolId} label="纪要总结" />
        <AiToolSelector capability="stream_transcription" value={streamToolId} onChange={setStreamToolId} label="实时识别" showBuiltIn={false} />
        <AiToolSelector capability="file_transcription" value={fileToolId} onChange={setFileToolId} label="文件转写" showBuiltIn={false} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          <Card className="py-0 gap-0">
            <CardContent className="space-y-4 px-4 py-4">
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
          <Card className="py-0 gap-0">
            <CardContent className="px-4 py-4">
              <div className="flex rounded-md border border-border overflow-hidden text-xs mb-4">
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
                            {streamTranscribe.isConnecting && " · 实时转写连接中…"}
                            {streamTranscribe.isReady && " · 实时转写追录中"}
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

                  {/* Auto-save status indicator */}
                  {isRecordingActive && (lastAutoSavedAt || isAutoSaving) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {isAutoSaving ? (
                        <>
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          <span>自动保存中…</span>
                        </>
                      ) : lastAutoSavedAt ? (
                        <>
                          <svg className="h-3 w-3 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                          <span>草稿已保存 {lastAutoSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                        </>
                      ) : null}
                    </div>
                  )}

                  {/* Live transcript preview */}
                  {isRecordingActive && (
                    <div className="text-xs bg-muted/40 rounded-md p-3 max-h-40 overflow-y-auto border border-border/50">
                      {transcript || streamingPartial ? (
                        <>
                          {transcript && (
                            <span className="text-foreground/80">
                              {transcript.slice(-500)}{transcript.length > 500 ? "…" : ""}
                            </span>
                          )}
                          {streamingPartial && (
                            <span className="text-primary/70 italic ml-1">{streamingPartial}…</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">
                          {streamTranscribe.isConnecting ? "实时转写连接中，请稍候…" : "转录文字将实时显示在这里…"}
                        </span>
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
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTranscribing}
                    className="w-full border-2 border-dashed border-border rounded-lg p-6 hover:border-primary/50 hover:bg-accent/30 transition-all flex flex-col items-center gap-2"
                  >
                    {isTranscribing && fileQueue.length > 0 ? (
                      <>
                        <Loader2 className="h-7 w-7 text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          正在处理 {fileQueue.filter(f => f.status === "done").length} / {fileQueue.length} 个文件…
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-7 w-7 text-muted-foreground/40" />
                        <span className="text-sm text-muted-foreground">
                          点击上传音频文件（支持多选，MP3 / WAV / M4A，每个最大 500MB）
                        </span>
                      </>
                    )}
                  </button>
                  {/* File queue progress list */}
                  {fileQueue.length > 0 && (
                    <div className="space-y-1">
                      {fileQueue.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs px-1">
                          {item.status === "pending" && <div className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />}
                          {item.status === "uploading" && <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />}
                          {item.status === "transcribing" && <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />}
                          {item.status === "done" && <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />}
                          {item.status === "error" && <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                          <span className="truncate text-muted-foreground flex-1" title={item.name}>{item.name}</span>
                          <span className="shrink-0 text-muted-foreground/60">
                            {item.status === "pending" && "等待"}
                            {item.status === "uploading" && "上传中"}
                            {item.status === "transcribing" && "转写中"}
                            {item.status === "done" && "完成"}
                            {item.status === "error" && `失败: ${item.error?.slice(0, 20) ?? ""}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="py-0 gap-0">
            <CardContent className="space-y-4 px-4 py-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  会议内容
                </Label>
                {isRecordingActive && (
                  <span className="text-xs text-primary flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    实时转写中
                  </span>
                )}
              </div>
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="录音转写结果将实时显示在此处，您也可以手动输入或编辑会议内容…"
                rows={10}
              />
              <Button onClick={handleGenerate} disabled={isGenerating || !transcript.trim() || isRecordingActive} className="w-full">
                {isArchiving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />上传录音文件…</>
                ) : isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中…</>
                ) : isRecordingActive ? (
                  <><Mic className="h-4 w-4 mr-2" />录音结束后可生成纪要</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />{importedProjectId ? "生成并存入文档库" : "生成会议纪要"}</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output Panel */}
        <Card className="h-fit py-0 gap-0">
          <CardContent className="px-4 py-4">
            {minutes && (
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-1.5">
                  {!isEditing ? (
                    <Button variant="outline" size="sm" onClick={handleStartEdit} disabled={isGenerating}>
                      <Edit2 className="h-3 w-3 mr-1.5" />编辑
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
                        {isSavingEdit ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Save className="h-3 w-3 mr-1.5" />}
                        {archivedDocId ? "保存到项目文档" : "保存"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isSavingEdit}>
                        <X className="h-3 w-3 mr-1.5" />取消
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="h-3 w-3 mr-1.5" />复制
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadMd}>
                    <Download className="h-3 w-3 mr-1.5" />下载
                  </Button>
                </div>
              </div>
            )}
            {minutes ? (
              <>
                {isEditing ? (
                  <Textarea
                    value={editedMinutes}
                    onChange={(e) => setEditedMinutes(e.target.value)}
                    className="min-h-[400px] font-mono text-sm resize-y"
                    placeholder="编辑会议纪要内容…"
                  />
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                    <Streamdown>{minutes}</Streamdown>
                  </div>
                )}
                {!isGenerating && !isEditing && (
                  <div className="mt-6 pt-4 border-t space-y-3">
                    {archivedDocId && importedProjectId && (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <span>已存入项目文档库</span>
                        <a href={`/projects/${importedProjectId}?tab=documents`} className="ml-auto underline underline-offset-2 hover:text-emerald-900 font-medium">查看文档库 →</a>
                      </div>
                    )}

                    {/* Task Extraction */}
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={handleExtractTasks}
                        disabled={isExtractingTasks}
                      >
                        {isExtractingTasks ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" />提取待办事项中…</>
                        ) : (
                          <><ListTodo className="h-3.5 w-3.5" />提取待办事项</>
                        )}
                      </Button>

                      {showExtractedTasks && extractedTasks.length > 0 && (
                        <div className="border rounded-md overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                            <span className="text-xs font-medium text-foreground">识别到 {extractedTasks.length} 个待办事项</span>
                            <div className="flex gap-1.5">
                              <button
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setExtractedTasks(ts => ts.map(t => ({ ...t, selected: true })))}
                              >全选</button>
                              <span className="text-muted-foreground">/</span>
                              <button
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setExtractedTasks(ts => ts.map(t => ({ ...t, selected: false })))}
                              >全不选</button>
                            </div>
                          </div>
                          <div className="divide-y max-h-64 overflow-y-auto">
                            {extractedTasks.map((task, idx) => (
                              <div
                                key={idx}
                                className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${task.selected ? '' : 'opacity-50'}`}
                                onClick={() => setExtractedTasks(ts => ts.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t))}
                              >
                                <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${task.selected ? 'bg-primary border-primary' : 'border-border'}`}>
                                  {task.selected && <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium text-foreground">{task.title}</span>
                                    <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${
                                      task.priority === 'urgent' ? 'border-red-300 text-red-600' :
                                      task.priority === 'high' ? 'border-orange-300 text-orange-600' :
                                      task.priority === 'medium' ? 'border-yellow-300 text-yellow-600' :
                                      'border-gray-200 text-gray-500'
                                    }`}>{task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}</Badge>
                                    {task.dueDate && <span className="text-[10px] text-muted-foreground">{task.dueDate}</span>}
                                  </div>
                                  {task.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="px-3 py-2 border-t bg-muted/20">
                            <Button
                              size="sm"
                              className="w-full gap-1.5"
                              onClick={handleSaveTasksToKanban}
                              disabled={isSavingTasks || !importedProjectId || extractedTasks.filter(t => t.selected).length === 0}
                            >
                              {isSavingTasks ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" />写入看板中…</>
                              ) : (
                                <><CheckSquare className="h-3.5 w-3.5" />将选中任务写入项目看板 {!importedProjectId && <span className="text-xs opacity-70">(请先关联项目)</span>}</>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {tasksSavedProjectId && tasksSavedCount > 0 && (
                      <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>{tasksSavedCount} 个任务已写入项目看板</span>
                        </div>
                        <a
                          href={`/projects/${tasksSavedProjectId}?tab=tasks`}
                          className="ml-4 shrink-0 font-medium underline underline-offset-2 hover:text-emerald-900"
                        >
                          查看项目看板 →
                        </a>
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
