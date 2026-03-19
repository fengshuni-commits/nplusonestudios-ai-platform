import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiToolSelector } from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Play, Download, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export default function VideoGeneration() {
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(3);
  const [selectedToolId, setSelectedToolId] = useState<number | undefined>();
  const [inputImageUrl, setInputImageUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // 任务状态：taskId 驱动轮询，videoUrl 直接从查询结果读取
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<"pending" | "processing" | "completed" | "failed" | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const prevStatusRef = useRef<string | null>(null);

  // 轮询：只要 taskId 存在且任务未终止，就持续查询
  const isTerminal = taskStatus === "completed" || taskStatus === "failed";
  const checkTaskStatus = trpc.video.getStatus.useQuery(
    { taskId: taskId || "" },
    {
      enabled: !!taskId && !isTerminal,
      refetchInterval: 3000,
    }
  );

  // 同步查询结果到本地状态
  useEffect(() => {
    const data = checkTaskStatus.data;
    if (!data) return;

    const prevStatus = prevStatusRef.current;
    const newStatus = data.status;
    prevStatusRef.current = newStatus;

    setTaskStatus(newStatus);
    setProgress(data.progress ?? 0);

    if (data.videoUrl) {
      setVideoUrl(data.videoUrl);
    }
    if (data.errorMessage) {
      setErrorMessage(data.errorMessage);
    }

    if (newStatus === "failed" && prevStatus !== "failed") {
      toast.error(
        `视频生成失败：${data.errorMessage || "任务被拒绝或超时，请检查工具配置"}`,
        { duration: 10000 }
      );
    }
    if (newStatus === "completed" && prevStatus !== "completed") {
      toast.success("视频已生成完成！");
    }
  }, [checkTaskStatus.data]);

  const generateVideo = trpc.video.generate.useMutation({
    onSuccess: (data: any) => {
      // 重置状态，开始新任务
      setVideoUrl(null);
      setErrorMessage(null);
      setProgress(0);
      prevStatusRef.current = null;

      setTaskId(data.taskId);
      setTaskStatus(data.status);

      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if (data.status === "failed") {
        toast.error(`失败原因：${data.errorMessage || "API 调用失败，请检查工具配置"}`, { duration: 8000 });
      } else {
        toast.success("视频生成任务已提交，请等待...");
      }
      setIsGenerating(false);
    },
    onError: (err: any) => {
      toast.error(`视频生成失败：${err.message || "未知错误"}`, { duration: 8000 });
      setIsGenerating(false);
    },
  });

  const handleGenerateClick = async () => {
    if (!prompt.trim()) { toast.error("请输入描述词"); return; }
    if (mode === "image-to-video" && !inputImageUrl.trim()) { toast.error("请选择或上传首帧图"); return; }
    if (!selectedToolId) { toast.error("请选择视频生成工具"); return; }

    setIsGenerating(true);
    generateVideo.mutate({
      mode,
      prompt,
      duration,
      toolId: selectedToolId,
      inputImageUrl: mode === "image-to-video" ? inputImageUrl : undefined,
    });
  };

  const handleDownloadVideo = () => {
    const url = videoUrl;
    if (!url) { toast.error("视频 URL 不可用"); return; }
    const link = document.createElement("a");
    link.href = url;
    link.download = `video-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("视频下载已开始");
  };

  const getStatusIcon = (status: typeof taskStatus) => {
    switch (status) {
      case "pending":
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: typeof taskStatus) => {
    switch (status) {
      case "pending": return "等待处理";
      case "processing": return "生成中...";
      case "completed": return "已完成";
      case "failed": return "生成失败";
      default: return "未知状态";
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">AI 视频生成</h1>
        <p className="text-muted-foreground mt-2">使用 AI 快速生成 1-8 秒短视频</p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text-to-video">文生视频</TabsTrigger>
          <TabsTrigger value="image-to-video">图生视频</TabsTrigger>
        </TabsList>

        <TabsContent value="text-to-video" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>文生视频</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>视频描述 *</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述你想要生成的视频内容，例如：一个现代办公室，员工在讨论项目..."
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>视频时长 *</Label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="1" max="8" value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))} className="flex-1" />
                    <span className="text-sm font-medium w-12">{duration}秒</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>生成工具 *</Label>
                  <AiToolSelector capability="video" value={selectedToolId}
                    onChange={(toolId) => setSelectedToolId(toolId)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="image-to-video" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>图生视频</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>首帧图 *</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-accent/50 transition-colors">
                  <input type="text" placeholder="粘贴图片 URL 或从素材库选择"
                    value={inputImageUrl} onChange={(e) => setInputImageUrl(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm" />
                  <p className="text-xs text-muted-foreground mt-2">支持 JPG、PNG 格式，建议尺寸 1280×720</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>视频描述（可选）</Label>
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder="补充描述视频的动作、效果等，例如：镜头缓慢推进，人物转身..."
                  rows={3} className="resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>视频时长 *</Label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="1" max="8" value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))} className="flex-1" />
                    <span className="text-sm font-medium w-12">{duration}秒</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>生成工具 *</Label>
                  <AiToolSelector capability="video" value={selectedToolId}
                    onChange={(toolId) => setSelectedToolId(toolId)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button onClick={handleGenerateClick}
        disabled={isGenerating || !prompt.trim() || !selectedToolId}
        size="lg" className="w-full">
        {isGenerating ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中...</>
        ) : (
          <><Play className="h-4 w-4 mr-2" />生成视频</>
        )}
      </Button>

      {/* 任务状态卡片 */}
      {taskId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(taskStatus)}
              生成状态
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">任务 ID: {taskId}</span>
              <Badge variant={taskStatus === "completed" ? "default" : "secondary"}>
                {getStatusLabel(taskStatus)}
              </Badge>
            </div>

            {/* 进度条：处理中或已完成时显示 */}
            {taskStatus && taskStatus !== "failed" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">进度</span>
                  <span className="text-xs font-semibold text-foreground">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {errorMessage && taskStatus === "failed" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
            )}

            {/* 视频播放区：有 videoUrl 就显示 */}
            {videoUrl && (
              <div className="space-y-3">
                <div className="bg-black rounded-lg aspect-video overflow-hidden">
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    autoPlay={false}
                    className="w-full h-full"
                    onError={() => toast.error("视频加载失败，请尝试直接下载")}
                  />
                </div>
                <Button onClick={handleDownloadVideo} variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  下载视频
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
