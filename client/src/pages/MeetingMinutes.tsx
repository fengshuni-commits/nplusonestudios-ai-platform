import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { FileText, Loader2, Sparkles, Upload, Mic, Copy, Download } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { FeedbackButtons } from "@/components/FeedbackButtons";

export default function MeetingMinutes() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [transcript, setTranscript] = useState("");
  const [projectName, setProjectName] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split("T")[0]);
  const [minutes, setMinutes] = useState("");
  const [minutesHistoryId, setMinutesHistoryId] = useState<number | undefined>(undefined);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioFileName, setAudioFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      toast.error("请先上传音频或手动输入会议内容");
      return;
    }
    setIsGenerating(true);
    generateMutation.mutate({ transcript, projectName, meetingDate, toolId });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(minutes);
    toast.success("已复制到剪贴板");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">会议纪要</h1>
          <p className="text-sm text-muted-foreground mt-1">上传录音或输入文字，AI 自动生成结构化会议纪要</p>
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

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">录音上传</CardTitle>
            </CardHeader>
            <CardContent>
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
                    <span className="text-sm text-muted-foreground">正在转写 {audioFileName}...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground/40" />
                    <span className="text-sm text-muted-foreground">
                      {audioFileName ? `已上传: ${audioFileName}` : "点击上传音频文件（MP3, WAV, M4A, 最大 16MB）"}
                    </span>
                  </>
                )}
              </button>
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
                placeholder="音频转写结果将显示在此处，您也可以手动输入或编辑会议内容..."
                rows={10}
              />
              <Button onClick={handleGenerate} disabled={isGenerating || !transcript.trim()} className="w-full">
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中...</>
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="h-3 w-3 mr-1.5" />复制
                </Button>
              </div>
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
                <p className="text-sm">上传会议录音或输入文字内容</p>
                <p className="text-xs mt-1 opacity-60">AI 将自动整理为结构化会议纪要</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
