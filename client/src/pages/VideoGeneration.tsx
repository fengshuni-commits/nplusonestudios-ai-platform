import { useState, useEffect, useRef, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AiToolSelector } from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import {
  Play,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Search,
  ImageIcon,
  Check,
  X,
  Upload,
} from "lucide-react";

type TaskStatus = "pending" | "processing" | "completed" | "failed";

export default function VideoGeneration() {
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<"480p" | "720p" | "1080p">("720p");
  const [selectedToolId, setSelectedToolId] = useState<number | undefined>();
  // Query selected tool to determine supported resolutions
  const { data: selectedTool } = trpc.aiTools.getById.useQuery(
    { id: selectedToolId! },
    { enabled: !!selectedToolId }
  );
  // Determine available resolutions based on tool model name
  // Seedance 2.0 Fast: max 720p; others (1.5 Pro, 2.0 standard): up to 1080p
  const isFastModel = selectedTool ? /fast/i.test((selectedTool as any).name || "") : false;
  const availableResolutions: Array<"480p" | "720p" | "1080p"> = isFastModel
    ? ["480p", "720p"]
    : ["480p", "720p", "1080p"];
  // Auto-downgrade resolution if current selection exceeds model capability
  useEffect(() => {
    if (isFastModel && resolution === "1080p") setResolution("720p");
  }, [isFastModel, resolution]);
  const [inputImageUrl, setInputImageUrl] = useState("");
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 素材库弹窗
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");

  // 本地上传状态
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 上传图片到 S3 并同步到素材库
  const uploadAsset = trpc.assets.upload.useMutation();
  const createAsset = trpc.assets.create.useMutation();

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target) return;
    // 重置 input 以允许重复选择同一文件
    (e.target as HTMLInputElement).value = "";
    if (!file) return;

    // 校验文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件（JPG、PNG、WebP 等）");
      return;
    }
    // 校验文件大小（16MB）
    if (file.size > 16 * 1024 * 1024) {
      toast.error("图片文件不能超过 16MB");
      return;
    }

    setIsUploading(true);
    try {
      // 读取为 base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // 去掉 data:image/xxx;base64, 前缀
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 上传到 S3
      const { url, key } = await uploadAsset.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });

      // 同步到素材库
      await createAsset.mutateAsync({
        name: file.name.replace(/\.[^.]+$/, "") || "上传图片",
        fileUrl: url,
        fileKey: key,
        fileType: file.type,
        fileSize: file.size,
        thumbnailUrl: url,
        category: "image",
        tags: "视频首帧,本地上传",
      });

      // 填入首帧图
      setInputImageUrl(url);
      setInputImagePreview(url);
      toast.success(`图片已上传并同步到素材库：${file.name}`);
    } catch (err: any) {
      toast.error(`上传失败：${err.message || "未知错误"}`);
    } finally {
      setIsUploading(false);
    }
  };

  // 任务状态
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoRecordId, setVideoRecordId] = useState<number | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // 是否有正在进行中或已完成的任务（用于控制工作区显示）
  const [hasActiveTask, setHasActiveTask] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const restoredRef = useRef(false);

  // 加载最近的视频任务列表，用于恢复状态
  const { data: videoList } = trpc.video.list.useQuery({ limit: 1, offset: 0 });

  // 页面加载时，从最近任务恢复状态（只执行一次）
  // 仅恢复进行中的任务（pending/processing），已完成/失败的任务不自动显示到工作区
  useEffect(() => {
    if (restoredRef.current) return;
    if (!videoList) return;
    const items = Array.isArray(videoList) ? videoList : (videoList as any).items || [];
    if (items.length === 0) return;
    const latest = items[0];
    if (!latest?.taskId) return;
    restoredRef.current = true;
    // 只有进行中的任务才恢复到工作区（让轮询继续）
    if (latest.status === "pending" || latest.status === "processing") {
      setTaskId(latest.taskId);
      setTaskStatus(latest.status as TaskStatus);
      setHasActiveTask(true);
      if (latest.status === "processing") setProgress(50);
      else setProgress(10);
      prevStatusRef.current = latest.status;
    }
    // 已完成/失败的任务不恢复，用户需要主动点击生成才显示工作区
  }, [videoList]);

  // 轮询：只要 taskId 存在且任务未终止，就持续查询
  const isTerminal = taskStatus === "completed" || taskStatus === "failed";
  const { data: statusData } = trpc.video.getStatus.useQuery(
    { taskId: taskId || "" },
    {
      enabled: !!taskId && !isTerminal,
      refetchInterval: 3000,
    }
  );

  // 同步查询结果到本地状态
  useEffect(() => {
    if (!statusData) return;
    const prevStatus = prevStatusRef.current;
    const newStatus = statusData.status;
    prevStatusRef.current = newStatus;

    setTaskStatus(newStatus);
    setProgress(statusData.progress ?? 0);

    if (statusData.videoUrl) setVideoUrl(statusData.videoUrl);
    if ((statusData as any).recordId) setVideoRecordId((statusData as any).recordId);
    if (statusData.errorMessage) setErrorMessage(statusData.errorMessage);

    if (newStatus === "failed" && prevStatus !== "failed") {
      toast.error(
        `视频生成失败：${statusData.errorMessage || "任务被拒绝或超时，请检查工具配置"}`,
        { duration: 10000 }
      );
    }
    if (newStatus === "completed" && prevStatus !== "completed") {
      toast.success("视频已生成完成！");
    }
  }, [statusData]);

  // 素材库数据
  const { data: allAssets } = trpc.assets.list.useQuery(undefined, {
    enabled: showAssetPicker,
  });

  const imageAssets = useMemo(() => {
    if (!allAssets) return [];
    return (allAssets as any[]).filter((a) => {
      const isImage =
        a.fileType?.startsWith("image/") ||
        /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(a.fileUrl || "") ||
        a.category === "image";
      if (!isImage) return false;
      if (assetSearch.trim()) {
        const q = assetSearch.toLowerCase();
        return (
          a.name?.toLowerCase().includes(q) ||
          a.tags?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allAssets, assetSearch]);

  const handleSelectAsset = (asset: any) => {
    const url = asset.fileUrl;
    setInputImageUrl(url);
    setInputImagePreview(asset.thumbnailUrl || url);
    setShowAssetPicker(false);
    setAssetSearch("");
    toast.success(`已选择素材：${asset.name}`);
  };

  const generateVideo = trpc.video.generate.useMutation({
    onSuccess: (data: any) => {
      // 重置状态，开始新任务
      setVideoUrl(null);
      setErrorMessage(null);
      setProgress(0);
      prevStatusRef.current = null;
      restoredRef.current = true; // 防止恢复逻辑覆盖新任务
      setHasActiveTask(true);

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

  const handleGenerateClick = () => {
    if (!prompt.trim()) { toast.error("请输入描述词"); return; }
    if (mode === "image-to-video" && !inputImageUrl.trim()) { toast.error("请选择或上传首帧图"); return; }
    if (!selectedToolId) { toast.error("请选择视频生成工具"); return; }

    setIsGenerating(true);
    generateVideo.mutate({
      mode,
      prompt,
      duration,
      resolution,
      toolId: selectedToolId,
      inputImageUrl: mode === "image-to-video" ? inputImageUrl : undefined,
    });
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) { toast.error("视频 URL 不可用"); return; }
    const link = document.createElement("a");
    link.href = videoUrl;
    link.target = "_blank";
    link.download = `video-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("视频下载已开始");
  };

  const getStatusIcon = (status: TaskStatus | null) => {
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

  const getStatusLabel = (status: TaskStatus | null) => {
    switch (status) {
      case "pending": return "等待处理";
      case "processing": return "生成中...";
      case "completed": return "已完成";
      case "failed": return "生成失败";
      default: return "未知状态";
    }
  };

  return (
    <div className="pb-6 space-y-4">
      <div className="flex items-center justify-end mb-2">
        <AiToolSelector capability="video" value={selectedToolId} onChange={(toolId) => setSelectedToolId(toolId)} label="AI 工具" showBuiltIn={false} />
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text-to-video">文生视频</TabsTrigger>
          <TabsTrigger value="image-to-video">图生视频</TabsTrigger>
        </TabsList>

        {/* ─── 文生视频 ─── */}
        <TabsContent value="text-to-video" className="space-y-6">
          <Card>
            <CardContent className="px-4 py-4 space-y-4">
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
              <div className="space-y-2">
                <Label>视频时长 *</Label>
                <div className="flex items-center gap-2">
                  <input type="range" min="5" max="10" step="5" value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value))} className="flex-1" />
                  <span className="text-sm font-medium w-12">{duration}秒</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>分辨率</Label>
                <div className="flex gap-2">
                  {availableResolutions.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        resolution === r
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── 图生视频 ─── */}
        <TabsContent value="image-to-video" className="space-y-6">
          <Card>
            <CardContent className="px-4 py-4 space-y-4">
              <div className="space-y-2">
                <Label>首帧图 *</Label>
                {/* 已选图片预览 */}
                {inputImagePreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                    <img
                      src={inputImagePreview}
                      alt="首帧图"
                      className="w-full max-h-48 object-contain"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 bg-black/50 hover:bg-black/70 text-white rounded-full"
                      onClick={() => { setInputImageUrl(""); setInputImagePreview(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                      <p className="text-xs text-white/80 truncate">{inputImageUrl}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* 隐藏的文件 input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLocalUpload}
                    />
                    {/* 素材库选择 + 本地上传 两个并排按钮 */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 border-dashed flex flex-col gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAssetPicker(true)}
                      >
                        <FolderOpen className="h-6 w-6" />
                        <span className="text-sm">从素材库选择</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 border-dashed flex flex-col gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <><Loader2 className="h-6 w-6 animate-spin" /><span className="text-sm">上传中...</span></>
                        ) : (
                          <><Upload className="h-6 w-6" /><span className="text-sm">本地上传图片</span></>
                        )}
                      </Button>
                    </div>
                    {/* 手动粘贴 URL */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">或粘贴图片 URL</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <Input
                      type="text"
                      placeholder="https://..."
                      value={inputImageUrl}
                      onChange={(e) => {
                        setInputImageUrl(e.target.value);
                        if (e.target.value.trim()) setInputImagePreview(e.target.value.trim());
                      }}
                      className="text-sm"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">支持 JPG、PNG 格式，建议尺寸 1280×720</p>
              </div>
              <div className="space-y-2">
                <Label>视频描述（可选）</Label>
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder="补充描述视频的动作、效果等，例如：镜头缓慢推进，人物转身..."
                  rows={3} className="resize-none" />
              </div>
              <div className="space-y-2">
                <Label>视频时长 *</Label>
                <div className="flex items-center gap-2">
                  <input type="range" min="5" max="10" step="5" value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value))} className="flex-1" />
                  <span className="text-sm font-medium w-12">{duration}秒</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>分辨率</Label>
                <div className="flex gap-2">
                  {availableResolutions.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        resolution === r
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
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

      {/* 任务状态卡片：只在用户主动触发过任务后才显示 */}
      {hasActiveTask && taskId && (
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
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
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
                <div className="flex gap-2 flex-wrap">
                  {videoRecordId && (
                    <div className="flex items-center">
                      <FeedbackButtons module="video_generation" historyId={videoRecordId} compact />
                    </div>
                  )}
                  <Button onClick={handleDownloadVideo} variant="outline" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    下载视频
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(videoUrl, "_blank")}
                  >
                    在新窗口打开
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── 素材库选择弹窗 ─── */}
      <Dialog open={showAssetPicker} onOpenChange={(open) => { setShowAssetPicker(open); if (!open) setAssetSearch(""); }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              从素材库选择
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="搜索素材名称或标签..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[50vh]">
            {imageAssets.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 p-1">
                {imageAssets.map((asset: any) => (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className="group relative rounded-lg overflow-hidden border border-border bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  >
                    <div className="aspect-square">
                      <img
                        src={asset.thumbnailUrl || asset.fileUrl}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                      <p className="text-[11px] text-white/90 truncate">{asset.name}</p>
                      {asset.tags && <p className="text-[9px] text-white/60 truncate">{asset.tags}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">{assetSearch ? "没有找到匹配的素材" : "素材库中暂无图片素材"}</p>
                <p className="text-xs mt-1 opacity-60">请先在素材库页面上传图片素材</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
