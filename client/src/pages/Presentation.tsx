import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AiToolSelector } from "@/components/AiToolSelector";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Presentation,
  ImageIcon,
  X,
  Download,
  Loader2,
  Sparkles,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  FileDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type GenerationStage = "structuring" | "generating_images" | "building_pptx" | "done" | "";

const STAGE_LABELS: Record<GenerationStage, string> = {
  structuring: "AI 正在规划幻灯片结构…",
  generating_images: "正在获取配图…",
  building_pptx: "正在构建 PPT 文件…",
  done: "生成完成",
  "": "正在初始化…",
};

// ─── Image Upload Preview ─────────────────────────────────────────────────────

type UploadedImage = {
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  uploading?: boolean;
  error?: string;
};

// ─── History Item ─────────────────────────────────────────────────────────────

type HistoryItem = {
  id: number;
  title: string;
  summary: string | null;
  outputUrl: string | null;
  createdAt: Date;
  modelName: string | null;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PresentationPage() {

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // AI tool selection
  const [selectedToolId, setSelectedToolId] = useState<number | undefined>(undefined);

  // Generation state
  const [jobId, setJobId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState<GenerationStage>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState<string | null>(null);
  const [resultSlideCount, setResultSlideCount] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // History
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Project import dialog
  const [showProjectImport, setShowProjectImport] = useState(false);

  // Queries
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: historyData, refetch: refetchHistory } = trpc.history.list.useQuery(
    { module: "presentation", limit: 10 },
    { enabled: historyExpanded }
  );
  const uploadMutation = trpc.upload.file.useMutation();
  const generateMutation = trpc.presentation.generate.useMutation();

  // Poll job status
  const { data: jobStatus } = trpc.presentation.status.useQuery(
    { jobId: jobId! },
    {
      enabled: !!jobId && isGenerating,
      refetchInterval: isGenerating ? 2000 : false,
    }
  );

  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status === "processing") {
      setGenerationProgress(jobStatus.progress || 0);
      setGenerationStage((jobStatus.stage as GenerationStage) || "");
    } else if (jobStatus.status === "done") {
      setIsGenerating(false);
      setGenerationProgress(100);
      setGenerationStage("done");
      setResultUrl(jobStatus.url || null);
      setResultTitle(jobStatus.title || null);
      setResultSlideCount(jobStatus.slideCount || null);
      setJobId(null);
      refetchHistory();
      toast.success(`演示文稿生成完成，共 ${jobStatus.slideCount} 页幻灯片`);
    } else if (jobStatus.status === "failed") {
      setIsGenerating(false);
      setGenerationError(jobStatus.error || "生成失败，请重试");
      setJobId(null);
      toast.error(`生成失败：${jobStatus.error}`);
    }
  }, [jobStatus]);

  // Handle image file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newImages: UploadedImage[] = [];
    for (let i = 0; i < Math.min(files.length, 8 - uploadedImages.length); i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const previewUrl = URL.createObjectURL(file);
      newImages.push({ file, previewUrl, uploading: true });
    }
    if (newImages.length === 0) return;
    setUploadedImages(prev => [...prev, ...newImages]);

    // Upload each image
    for (const img of newImages) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(img.file);
        });
        const result = await uploadMutation.mutateAsync({
          fileName: img.file.name,
          contentType: img.file.type,
          fileData: base64.split(",")[1] || base64,
          folder: "presentation-images",
        });
        setUploadedImages(prev =>
          prev.map(p =>
            p.previewUrl === img.previewUrl
              ? { ...p, uploading: false, uploadedUrl: result.url }
              : p
          )
        );
      } catch (err) {
        setUploadedImages(prev =>
          prev.map(p =>
            p.previewUrl === img.previewUrl
              ? { ...p, uploading: false, error: "上传失败" }
              : p
          )
        );
      }
    }
  }, [uploadedImages.length, uploadMutation]);

  const removeImage = (previewUrl: string) => {
    setUploadedImages(prev => {
      const img = prev.find(p => p.previewUrl === previewUrl);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(p => p.previewUrl !== previewUrl);
    });
  };

  // Import project info
  const handleImportProject = () => {
    if (!selectedProjectId) return;
    const project = projects?.find(p => String(p.id) === selectedProjectId);
    if (!project) return;
    const parts: string[] = [];
    if (project.name) parts.push(`项目名称：${project.name}`);
    if (project.description) parts.push(`项目概况：${project.description}`);
    if (project.clientName) parts.push(`委托方：${project.clientName}`);
    if (project.projectOverview) parts.push(`项目概况：${project.projectOverview}`);
    setContent(prev => (prev ? prev + "\n\n" : "") + parts.join("\n"));
    if (!title && project.name) setTitle(project.name);
    setShowProjectImport(false);
    toast.success("项目信息已导入");
  };

  // Generate
  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error("请填写演示标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请填写演示内容描述");
      return;
    }
    const pendingUploads = uploadedImages.filter(img => img.uploading);
    if (pendingUploads.length > 0) {
      toast.error("图片上传中，请稍候");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(5);
    setGenerationStage("structuring");
    setGenerationError(null);
    setResultUrl(null);
    setResultTitle(null);
    setResultSlideCount(null);

    try {
      const imageUrls = uploadedImages
        .filter(img => img.uploadedUrl)
        .map(img => img.uploadedUrl!);

      const result = await generateMutation.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        toolId: selectedToolId,
      });
      setJobId(result.jobId);
    } catch (err: any) {
      setIsGenerating(false);
      setGenerationError(err?.message || "启动生成失败");
      toast.error(`生成失败：${err?.message}`);
    }
  };

  const canGenerate = title.trim().length > 0 && content.trim().length > 0 && !isGenerating;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">演示文稿</h1>
          <p className="text-sm text-muted-foreground mt-1">
            输入演示内容，可选上传项目图片，AI 自动生成图文并茂的 PPT 文件
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Input Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Presentation className="h-4 w-4 text-primary" />
                演示参数
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Project import */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowProjectImport(true)}
              >
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                导入项目信息（可选）
              </Button>

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="pres-title" className="text-xs font-medium">
                  演示标题 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pres-title"
                  placeholder="如：JPT 总部办公空间设计方案汇报"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={isGenerating}
                  className="text-sm"
                />
              </div>

              {/* Content */}
              <div className="space-y-1.5">
                <Label htmlFor="pres-content" className="text-xs font-medium">
                  演示内容描述 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="pres-content"
                  placeholder="描述演示文稿的主要内容，如：设计理念、空间布局方案、材料选择、项目亮点等。内容越详细，生成质量越高。"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  disabled={isGenerating}
                  rows={8}
                  className="text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {content.length} 字 · 建议 100 字以上
                </p>
              </div>

              {/* Image upload */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  项目图片（可选，最多 8 张）
                </Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    handleFileSelect(e.dataTransfer.files);
                  }}
                >
                  <ImageIcon className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">
                    点击或拖拽上传图片
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files)}
                />

                {/* Image previews */}
                {uploadedImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {uploadedImages.map(img => (
                      <div
                        key={img.previewUrl}
                        className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted"
                      >
                        <img
                          src={img.previewUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {img.uploading && (
                          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          </div>
                        )}
                        {img.error && (
                          <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                            <span className="text-xs text-destructive">失败</span>
                          </div>
                        )}
                        {!img.uploading && !img.error && (
                          <button
                            className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 hover:bg-background"
                            onClick={() => removeImage(img.previewUrl)}
                          >
                            <X className="h-3 w-3 text-foreground" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Tool Selector */}
              <div className="space-y-1.5">
                <AiToolSelector
                  capability="document"
                  value={selectedToolId}
                  onChange={setSelectedToolId}
                  label="AI 模型"
                  showBuiltIn={true}
                />
              </div>

              {/* Generate button */}
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    生成演示文稿
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Result Panel */}
        <div className="lg:col-span-3 space-y-4">
          {/* Generation progress */}
          {isGenerating && (
            <Card>
              <CardContent className="pt-6 pb-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">
                    {STAGE_LABELS[generationStage]}
                  </span>
                </div>
                <Progress value={generationProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  生成通常需要 1–3 分钟，请耐心等待
                </p>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {generationError && !isGenerating && (
            <Card className="border-destructive/50">
              <CardContent className="pt-5 pb-4">
                <p className="text-sm text-destructive">{generationError}</p>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {resultUrl && !isGenerating && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6 pb-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Presentation className="h-5 w-5 text-primary" />
                      <span className="font-medium text-foreground">{resultTitle}</span>
                    </div>
                    {resultSlideCount && (
                      <p className="text-sm text-muted-foreground">
                        共 {resultSlideCount} 页幻灯片
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm">
                      <a href={resultUrl} download target="_blank" rel="noopener noreferrer">
                        <FileDown className="h-4 w-4 mr-1.5" />
                        下载 PPT
                      </a>
                    </Button>
                  </div>
                </div>
                <Separator />
                {/* PPT Preview via Office Online Viewer */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">在线预览</p>
                  <div className="relative w-full rounded-lg overflow-hidden border border-border bg-muted" style={{ paddingBottom: '56.25%' }}>
                    <iframe
                      src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(resultUrl)}`}
                      className="absolute inset-0 w-full h-full"
                      frameBorder="0"
                      allowFullScreen
                      title="PPT 预览"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    预览由 Microsoft Office Online 提供，首次加载可能需要等待 10-20 秒
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!isGenerating && !resultUrl && !generationError && (
            <Card className="border border-dashed border-border bg-secondary/20">
              <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Presentation className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <h3 className="font-medium text-foreground">填写左侧参数，开始生成</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    AI 将根据你的描述自动规划幻灯片结构，搜索配图，生成可下载的 .pptx 文件
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generation History */}
          <Card>
            <CardHeader
              className="pb-3 cursor-pointer select-none"
              onClick={() => setHistoryExpanded(v => !v)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  生成历史
                </CardTitle>
                {historyExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            {historyExpanded && (
              <CardContent className="pt-0 space-y-2">
                {!historyData || historyData.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    暂无生成记录
                  </p>
                ) : (
                  historyData.items.map((item: HistoryItem) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-background hover:bg-secondary/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("zh-CN", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {item.summary && (
                            <span className="text-xs text-muted-foreground">
                              · {item.summary}
                            </span>
                          )}
                          {item.modelName && (
                            <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">
                              {item.modelName}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {item.outputUrl && (
                        <Button variant="ghost" size="sm" asChild className="shrink-0">
                          <a
                            href={item.outputUrl}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* Project Import Dialog */}
      <Dialog open={showProjectImport} onOpenChange={setShowProjectImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>导入项目信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              选择项目后，项目名称、概况、委托方等信息将自动填入演示内容描述。
            </p>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="选择项目…" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProjectImport(false)}>
                取消
              </Button>
              <Button onClick={handleImportProject} disabled={!selectedProjectId}>
                导入
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
