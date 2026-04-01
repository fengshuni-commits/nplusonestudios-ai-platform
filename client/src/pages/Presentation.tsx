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
import { Presentation,
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
  Upload,
  FileText,
  CheckCircle2,
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

  // Layout pack selection
  const [selectedLayoutPackId, setSelectedLayoutPackId] = useState<number | undefined>(undefined);
  const { data: layoutPacks = [] } = trpc.layoutPacks.list.useQuery();
  const doneLayoutPacks = (layoutPacks as any[]).filter((p: any) => p.status === "done");

  // Generation state
  const [jobId, setJobId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState<GenerationStage>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState<string | null>(null);
  const [resultSlideCount, setResultSlideCount] = useState<number | null>(null);
  const [resultSlides, setResultSlides] = useState<Array<{ title: string; subtitle: string; bullets: string[]; layout: string; imageUrl?: string; styleGuide?: any }>>([]); 
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
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
  const convertFromFileMutation = trpc.presentation.convertFromFile.useMutation();

  // ── File convert mode state ──────────────────────────────────────────────
  type ConvertMode = "text" | "file";
  const [convertMode, setConvertMode] = useState<ConvertMode>("file");

  type UploadedFile = {
    file: File;
    previewUrl: string; // for images; empty for PDF
    uploadedUrl?: string;
    uploading?: boolean;
    error?: string;
    fileType: "pdf" | "image";
  };
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [convertTitle, setConvertTitle] = useState("");
  const fileConvertInputRef = useRef<HTMLInputElement>(null);

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
      setResultSlides((jobStatus.slides as any) || []);
      setPreviewSlideIndex(0);
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
        layoutPackId: selectedLayoutPackId,
      });
      setJobId(result.jobId);
    } catch (err: any) {
      setIsGenerating(false);
      setGenerationError(err?.message || "启动生成失败");
      toast.error(`生成失败：${err?.message}`);
    }
  };

  const canGenerate = title.trim().length > 0 && content.trim().length > 0 && !isGenerating;

  // Handle file selection for convert mode
  const handleFileConvertSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) continue;
      // Limit: 1 PDF or up to 20 images
      if (isPdf && uploadedFiles.some(f => f.fileType === "pdf")) {
        toast.error("每次只能上传一个 PDF 文件");
        continue;
      }
      if (uploadedFiles.length + newFiles.length >= 20) {
        toast.error("最多支持 20 张图片");
        break;
      }
      const previewUrl = isImage ? URL.createObjectURL(file) : "";
      newFiles.push({ file, previewUrl, uploading: true, fileType: isPdf ? "pdf" : "image" });
    }
    if (newFiles.length === 0) return;
    setUploadedFiles(prev => [...prev, ...newFiles]);

    // Upload each file
    for (const uf of newFiles) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(uf.file);
        });
        const result = await uploadMutation.mutateAsync({
          fileName: uf.file.name,
          contentType: uf.file.type,
          fileData: base64.split(",")[1] || base64,
          folder: "presentation-convert",
        });
        setUploadedFiles(prev =>
          prev.map(p =>
            p.previewUrl === uf.previewUrl && p.file.name === uf.file.name
              ? { ...p, uploading: false, uploadedUrl: result.url }
              : p
          )
        );
      } catch {
        setUploadedFiles(prev =>
          prev.map(p =>
            p.previewUrl === uf.previewUrl && p.file.name === uf.file.name
              ? { ...p, uploading: false, error: "上传失败" }
              : p
          )
        );
      }
    }
  }, [uploadedFiles, uploadMutation]);

  const removeConvertFile = (idx: number) => {
    setUploadedFiles(prev => {
      const copy = [...prev];
      const removed = copy.splice(idx, 1)[0];
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  };

  const handleConvertFromFile = async () => {
    const readyFiles = uploadedFiles.filter(f => f.uploadedUrl);
    if (readyFiles.length === 0) {
      toast.error("请先上传 PDF 或图片文件");
      return;
    }
    const pendingUploads = uploadedFiles.filter(f => f.uploading);
    if (pendingUploads.length > 0) {
      toast.error("文件上传中，请稍候");
      return;
    }

    const hasPdf = readyFiles.some(f => f.fileType === "pdf");
    const fileType: "pdf" | "images" = hasPdf ? "pdf" : "images";
    const fileUrls = readyFiles.map(f => f.uploadedUrl!);

    setIsGenerating(true);
    setGenerationProgress(5);
    setGenerationStage("structuring");
    setGenerationError(null);
    setResultUrl(null);
    setResultTitle(null);
    setResultSlideCount(null);
    setResultSlides([]);

    try {
      const result = await convertFromFileMutation.mutateAsync({
        fileUrls,
        fileType,
        title: convertTitle.trim() || undefined,
      });
      setJobId(result.jobId);
    } catch (err: any) {
      setIsGenerating(false);
      setGenerationError(err?.message || "启动转换失败");
      toast.error(`转换失败：${err?.message}`);
    }
  };

  const canConvert = uploadedFiles.some(f => f.uploadedUrl) && !isGenerating;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">演示文稿</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {convertMode === "file"
              ? "上传 PDF 或图片，AI 逐页分析布局，生成可编辑的 .pptx 文件"
              : "输入演示内容，可选上传项目图片，AI 自动生成图文并茂的 PPT 文件"}
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
              {/* Mode Tab */}
              <div className="flex rounded-lg border border-border overflow-hidden mt-2">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
                    convertMode === "file"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-secondary/50"
                  }`}
                  onClick={() => setConvertMode("file")}
                  disabled={isGenerating}
                >
                  <Upload className="h-3.5 w-3.5" />
                  文件转换
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
                    convertMode === "text"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-secondary/50"
                  }`}
                  onClick={() => setConvertMode("text")}
                  disabled={isGenerating}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 创作
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* ── FILE CONVERT MODE ── */}
              {convertMode === "file" && (
                <>
                  {/* Title (optional) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="convert-title" className="text-xs font-medium">
                      文稿标题（可选）
                    </Label>
                    <Input
                      id="convert-title"
                      placeholder="如不填则自动使用文件名"
                      value={convertTitle}
                      onChange={e => setConvertTitle(e.target.value)}
                      disabled={isGenerating}
                      className="text-sm"
                    />
                  </div>

                  {/* File upload zone */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      上传文件 <span className="text-destructive">*</span>
                    </Label>
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => fileConvertInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        handleFileConvertSelect(e.dataTransfer.files);
                      }}
                    >
                      <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground mb-0.5">点击或拖拽上传</p>
                      <p className="text-xs text-muted-foreground">支持 PDF（自动识别每页）或多张图片</p>
                    </div>
                    <input
                      ref={fileConvertInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      multiple
                      className="hidden"
                      onChange={e => handleFileConvertSelect(e.target.files)}
                    />

                    {/* File list */}
                    {uploadedFiles.length > 0 && (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {uploadedFiles.map((uf, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/20"
                          >
                            {uf.fileType === "pdf" ? (
                              <FileText className="h-4 w-4 text-primary shrink-0" />
                            ) : uf.previewUrl ? (
                              <img src={uf.previewUrl} alt="" className="h-8 w-8 object-cover rounded shrink-0" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-xs text-foreground truncate flex-1">{uf.file.name}</span>
                            {uf.uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                            {uf.uploadedUrl && !uf.uploading && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                            {uf.error && <span className="text-xs text-destructive shrink-0">失败</span>}
                            {!uf.uploading && (
                              <button
                                className="shrink-0 hover:text-destructive transition-colors"
                                onClick={() => removeConvertFile(idx)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">转换说明</p>
                    <p>• 文字内容将提取为可编辑文本框</p>
                    <p>• 多张独立图片分别嵌入，可单独移动和缩放</p>
                    <p>• 单张复合插画作为整体图片嵌入</p>
                    <p>• 处理时间约 1–3 分钟（每页需 AI 分析）</p>
                  </div>

                  {/* Convert button */}
                  <Button
                    className="w-full"
                    onClick={handleConvertFromFile}
                    disabled={!canConvert}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        转换中…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        开始转换
                      </>
                    )}
                  </Button>
                </>
              )}

              {/* ── TEXT / AI CREATE MODE ── */}
              {convertMode === "text" && (
                <>
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

              {/* Layout Pack Selector */}
              {doneLayoutPacks.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">版式包（可选）</Label>
                  <Select
                    value={selectedLayoutPackId ? String(selectedLayoutPackId) : "none"}
                    onValueChange={(v) => setSelectedLayoutPackId(v === "none" ? undefined : Number(v))}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="使用默认版式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">默认版式（N+1 STUDIOS 标准）</SelectItem>
                      {doneLayoutPacks.map((pack: any) => (
                        <SelectItem key={pack.id} value={String(pack.id)}>
                          {pack.name}
                          {pack.styleGuide?.styleKeywords?.length > 0 && (
                            <span className="text-muted-foreground ml-1 text-[10px]">
                              · {pack.styleGuide.styleKeywords.slice(0, 2).join("、")}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedLayoutPackId && (
                    <p className="text-[10px] text-muted-foreground">
                      AI 将参考该版式包的设计风格生成 PPT
                    </p>
                  )}
                </div>
              )}

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
                </>
              )}

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
                {/* PPT Slide Preview */}
                {resultSlides.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">幻灯片预览</p>
                      <p className="text-xs text-muted-foreground">{previewSlideIndex + 1} / {resultSlides.length}</p>
                    </div>
                    {/* Slide canvas */}
                    <div className="relative w-full rounded-lg overflow-hidden border border-border" style={{ aspectRatio: '16/9' }}>
                      {(() => {
                        const slide = resultSlides[previewSlideIndex];
                        if (!slide) return null;
                        const layout = slide.layout;

                        // Dynamic colors from layout pack styleGuide
                        const sg = slide.styleGuide;
                        const cp = sg?.colorPalette || {};
                        const hex = (v: string | undefined, fallback: string) => v ? v.replace(/^#/, '') : fallback;
                        const PC = {
                          charcoal: '#' + hex(cp.background, '1A1A2E'),
                          warmGray: '#' + hex(cp.secondary, 'F5F0EB'),
                          cream: '#' + hex(cp.background, 'FAF8F5'),
                          copper: '#' + hex(cp.accent || cp.primary, 'B87333'),
                          copperLight: '#' + hex(cp.primary, 'D4956B'),
                          text: '#' + hex(cp.text, '2C2C2C'),
                          textLight: '#' + hex(cp.text, '6B6560'),
                          white: '#FFFFFF',
                          divider: '#D4CFC8',
                        };
                        // For dark tone, swap bg colors
                        if (sg?.tone === 'dark' && cp.background) {
                          PC.charcoal = '#' + hex(cp.background, '1A1A2E');
                          PC.warmGray = '#' + hex(cp.secondary || cp.background, '2D2D3F');
                          PC.cream = '#' + hex(cp.secondary || cp.background, '2D2D3F');
                          PC.text = '#' + hex(cp.text, 'E8E4DF');
                          PC.textLight = '#' + hex(cp.text, 'A09890');
                        } else if (sg?.tone === 'light' && cp.background) {
                          PC.charcoal = '#' + hex(cp.secondary, '2C2C2C');
                          PC.warmGray = '#' + hex(cp.background, 'F5F0EB');
                          PC.cream = '#' + hex(cp.background, 'FAF8F5');
                        }

                        // ── cover ──────────────────────────────────────────
                        if (layout === 'cover') return (
                          <div className="absolute inset-0 flex" style={{ backgroundColor: PC.charcoal }}>
                            {slide.imageUrl && (
                              <>
                                <img src={slide.imageUrl} alt="" className="absolute right-0 top-0 h-full w-1/2 object-cover" />
                                <div className="absolute right-0 top-0 h-full w-[52%]" style={{ background: `linear-gradient(to right, ${PC.charcoal}, transparent)` }} />
                              </>
                            )}
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="absolute left-[8%] top-1/2 -translate-y-1/2 w-[50%] z-10">
                              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: PC.copper }} />
                              <div className="pl-5">
                                <h1 className="font-bold text-3xl leading-tight mb-3" style={{ color: PC.white }}>{slide.title}</h1>
                                <p className="text-base mb-5" style={{ color: PC.copperLight }}>{slide.subtitle || '演示文稿'}</p>
                                <div className="h-[2px] w-20 mb-4" style={{ backgroundColor: PC.copper }} />
                                <p className="font-bold text-sm tracking-widest" style={{ color: PC.copper }}>N+1 STUDIOS</p>
                              </div>
                            </div>
                          </div>
                        );

                        // ── toc ──────────────────────────────────────────
                        if (layout === 'toc') return (
                          <div className="absolute inset-0 flex" style={{ backgroundColor: PC.cream }}>
                            <div className="absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: PC.copper }} />
                            <div className="pl-10 pt-8 pr-8 w-full">
                              <p className="text-xs font-bold tracking-[0.2em] mb-1" style={{ color: PC.copper }}>目录</p>
                              <h2 className="font-bold text-xl mb-5" style={{ color: PC.text }}>{slide.title}</h2>
                              <div className="space-y-3">
                                {slide.bullets.map((b, bi) => (
                                  <div key={bi} className="flex items-center gap-3">
                                    <span className="font-bold text-lg w-7 flex-shrink-0" style={{ color: PC.copper }}>{String(bi + 1).padStart(2, '0')}</span>
                                    <span className="text-sm" style={{ color: PC.text }}>{b}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );

                        // ── section_intro ──────────────────────────
                        if (layout === 'section_intro') return (
                          <div className="absolute inset-0 flex" style={{ backgroundColor: PC.warmGray }}>
                            {slide.imageUrl && (
                              <>
                                <img src={slide.imageUrl} alt="" className="absolute right-0 top-0 h-full w-2/5 object-cover" />
                                <div className="absolute right-0 top-0 h-full w-[45%]" style={{ background: `linear-gradient(to right, ${PC.warmGray}, transparent)` }} />
                              </>
                            )}
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="pl-10 pt-10 w-3/5 z-10">
                              <h2 className="font-bold text-2xl mb-2" style={{ color: PC.text }}>{slide.title}</h2>
                              {slide.subtitle && <p className="text-sm italic mb-3" style={{ color: PC.textLight }}>{slide.subtitle}</p>}
                              <div className="h-[2px] w-14 mb-4" style={{ backgroundColor: PC.copper }} />
                              <ul className="space-y-2">
                                {slide.bullets.map((b, bi) => (
                                  <li key={bi} className="flex items-start gap-2 text-xs" style={{ color: PC.text }}>
                                    <span className="mt-1" style={{ color: PC.copper }}>—</span><span>{b}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        );

                        // ── case_study ─────────────────────────────────
                        if (layout === 'case_study') return (
                          <div className="absolute inset-0 flex" style={{ backgroundColor: PC.cream }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            {slide.imageUrl ? (
                              <>
                                <div className="w-1/2 p-6 flex flex-col justify-start">
                                  <h2 className="font-bold text-lg mb-1" style={{ color: PC.text }}>{slide.title}</h2>
                                  {slide.subtitle && <p className="text-xs italic mb-3" style={{ color: PC.copper }}>{slide.subtitle}</p>}
                                  <div className="h-[1px] mb-3" style={{ backgroundColor: PC.divider }} />
                                  <ul className="space-y-2">
                                    {slide.bullets.map((b, bi) => (
                                      <li key={bi} className="flex items-start gap-2 text-xs" style={{ color: PC.text }}>
                                        <span className="mt-0.5" style={{ color: PC.copper }}>▪</span><span>{b}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="w-1/2 overflow-hidden">
                                  <img src={slide.imageUrl} alt="" className="w-full h-full object-cover rounded-l-lg" />
                                </div>
                              </>
                            ) : (
                              <div className="p-8 w-full">
                                <h2 className="font-bold text-xl mb-2" style={{ color: PC.text }}>{slide.title}</h2>
                                {slide.subtitle && <p className="text-sm italic mb-3" style={{ color: PC.copper }}>{slide.subtitle}</p>}
                                <div className="h-[1px] mb-4" style={{ backgroundColor: PC.divider }} />
                                <ul className="space-y-2.5">
                                  {slide.bullets.map((b, bi) => (
                                    <li key={bi} className="flex items-start gap-2 text-sm" style={{ color: PC.text }}>
                                      <span className="mt-0.5" style={{ color: PC.copper }}>▪</span><span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );

                        // ── insight ──────────────────────────────────────────
                        if (layout === 'insight') return (
                          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: PC.warmGray }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            {slide.imageUrl ? (
                              <>
                                <div className="h-[52%] overflow-hidden">
                                  <img src={slide.imageUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="p-5 flex-1">
                                  <h2 className="font-bold text-base mb-1" style={{ color: PC.text }}>{slide.title}</h2>
                                  <div className="h-[2px] w-10 mb-2" style={{ backgroundColor: PC.copper }} />
                                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                                    {slide.bullets.map((b, bi) => (
                                      <li key={bi} className="flex items-start gap-1.5 text-xs" style={{ color: PC.text }}>
                                        <span style={{ color: PC.copper }}>▸</span><span>{b}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </>
                            ) : (
                              <div className="p-8 flex flex-col justify-center h-full">
                                <h2 className="font-bold text-2xl mb-2" style={{ color: PC.text }}>{slide.title}</h2>
                                {slide.subtitle && <p className="text-sm italic mb-3" style={{ color: PC.copper }}>{slide.subtitle}</p>}
                                <div className="h-[2px] w-14 mb-4" style={{ backgroundColor: PC.copper }} />
                                <ul className="space-y-2">
                                  {slide.bullets.map((b, bi) => (
                                    <li key={bi} className="flex items-start gap-2 text-sm" style={{ color: PC.text }}>
                                      <span style={{ color: PC.copper }}>▸</span><span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );

                        // ── quote ──────────────────────────────────────────
                        if (layout === 'quote') return (
                          <div className="absolute inset-0 flex items-center" style={{ backgroundColor: PC.charcoal }}>
                            {slide.imageUrl && (
                              <>
                                <img src={slide.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                                <div className="absolute inset-0" style={{ backgroundColor: `${PC.charcoal}B3` }} />
                              </>
                            )}
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="absolute left-[7%] top-[15%] bottom-[15%] w-[5px]" style={{ backgroundColor: PC.copper }} />
                            <div className="relative z-10 pl-16 pr-10">
                              <div className="text-6xl font-bold leading-none mb-2 opacity-80" style={{ color: PC.copper }}>&ldquo;</div>
                              <h2 className="font-bold text-2xl leading-relaxed mb-4" style={{ color: PC.white }}>{slide.title}</h2>
                              {slide.subtitle && <p className="text-sm italic mb-3" style={{ color: PC.copperLight }}>{slide.subtitle}</p>}
                              {slide.bullets[0] && (
                                <>
                                  <div className="h-[1px] w-24 mb-3" style={{ backgroundColor: `${PC.copper}80` }} />
                                  <p className="text-xs" style={{ color: PC.textLight }}>{slide.bullets[0]}</p>
                                </>
                              )}
                            </div>
                          </div>
                        );

                        // ── comparison ─────────────────────────────────────
                        if (layout === 'comparison') return (
                          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: PC.cream }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="px-6 pt-4 pb-2 text-center">
                              <h2 className="font-bold text-lg" style={{ color: PC.text }}>{slide.title}</h2>
                              {slide.subtitle && <p className="text-xs italic" style={{ color: PC.textLight }}>{slide.subtitle}</p>}
                            </div>
                            <div className="flex flex-1 gap-0 px-4 pb-4">
                              {/* Left */}
                              <div className="flex-1 flex flex-col">
                                <div className="text-white text-sm font-bold text-center py-1.5 rounded-t mb-2" style={{ backgroundColor: PC.copper }}>
                                  {slide.bullets[0] || '方案 A'}
                                </div>
                                <ul className="space-y-1.5 flex-1">
                                  {slide.bullets.slice(1, Math.ceil(slide.bullets.length / 2) + 1).map((b, bi) => (
                                    <li key={bi} className="flex items-start gap-1.5 text-xs" style={{ color: PC.text }}>
                                      <span className="mt-0.5" style={{ color: PC.copper }}>▸</span><span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              {/* Divider */}
                              <div className="w-[2px] mx-3 self-stretch" style={{ backgroundColor: PC.copper }} />
                              {/* Right */}
                              <div className="flex-1 flex flex-col">
                                <div className="text-white text-sm font-bold text-center py-1.5 rounded-t mb-2" style={{ backgroundColor: PC.charcoal }}>
                                  {slide.bullets[Math.ceil(slide.bullets.length / 2)] || '方案 B'}
                                </div>
                                <ul className="space-y-1.5 flex-1">
                                  {slide.bullets.slice(Math.ceil(slide.bullets.length / 2) + 1).map((b, bi) => (
                                    <li key={bi} className="flex items-start gap-1.5 text-xs" style={{ color: PC.text }}>
                                      <span className="mt-0.5" style={{ color: PC.charcoal }}>▸</span><span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        );

                        // ── timeline ──────────────────────────────────────────
                        if (layout === 'timeline') return (
                          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: PC.charcoal }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="px-8 pt-5 pb-3">
                              <h2 className="font-bold text-lg" style={{ color: PC.white }}>{slide.title}</h2>
                              {slide.subtitle && <p className="text-xs italic" style={{ color: PC.copperLight }}>{slide.subtitle}</p>}
                            </div>
                            {/* Timeline */}
                            <div className="flex-1 flex items-center px-6 pb-4">
                              <div className="relative w-full">
                                <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2" style={{ backgroundColor: PC.copper }} />
                                <div className="flex justify-around">
                                  {slide.bullets.slice(0, 5).map((b, bi) => {
                                    const parts = b.split(' — ');
                                    const label = parts[0] || '';
                                    const desc = parts[1] || b;
                                    return (
                                      <div key={bi} className="flex flex-col items-center gap-2 w-1/5">
                                        <p className="text-xs font-bold text-center" style={{ color: PC.copper }}>{label}</p>
                                        <div className="h-3 w-3 rounded-full z-10 flex-shrink-0" style={{ backgroundColor: PC.copper }} />
                                        <p className="text-[10px] text-center leading-tight" style={{ color: PC.textLight }}>{desc}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );

                        // ── data_highlight ─────────────────────────────────
                        if (layout === 'data_highlight') return (
                          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: PC.charcoal }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="px-8 pt-5">
                              <h2 className="font-bold text-lg" style={{ color: PC.white }}>{slide.title}</h2>
                              {slide.subtitle && <p className="text-xs italic" style={{ color: PC.copperLight }}>{slide.subtitle}</p>}
                              <div className="h-[1px] mt-2" style={{ backgroundColor: `${PC.copper}66` }} />
                            </div>
                            <div className="flex-1 flex items-center justify-center px-8 pb-4">
                              <div className={`grid gap-4 w-full ${slide.bullets.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                                {slide.bullets.slice(0, 4).map((b, bi) => {
                                  const parts = b.split(' — ');
                                  const num = parts[0] || '';
                                  const desc = parts[1] || b;
                                  return (
                                    <div key={bi} className="text-center">
                                      <div className="font-bold text-4xl leading-none mb-1" style={{ color: PC.copper }}>{num}</div>
                                      <div className="text-xs" style={{ color: PC.textLight }}>{desc}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );

                        // ── summary ──────────────────────────────────────────
                        if (layout === 'summary') return (
                          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: PC.charcoal }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="flex-1 flex flex-col justify-center px-12">
                              <div className="absolute left-[8%] top-[12%] bottom-[20%] w-[3px]" style={{ backgroundColor: PC.copper }} />
                              <div className="pl-6">
                                <h2 className="font-bold text-2xl mb-2" style={{ color: PC.white }}>{slide.title}</h2>
                                {slide.subtitle && <p className="text-sm italic mb-4" style={{ color: PC.copperLight }}>{slide.subtitle}</p>}
                                <div className="h-[1px] mb-4" style={{ backgroundColor: `${PC.copper}66` }} />
                                <ul className="space-y-2">
                                  {slide.bullets.map((b, bi) => (
                                    <li key={bi} className="flex items-start gap-2 text-sm" style={{ color: PC.textLight }}>
                                      <span style={{ color: PC.copper }}>▸</span><span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <div className="px-10 py-3 flex justify-between items-center" style={{ backgroundColor: PC.warmGray }}>
                              <span className="font-bold text-sm tracking-widest" style={{ color: PC.copper }}>N+1 STUDIOS</span>
                              <span className="text-xs" style={{ color: PC.textLight }}>感谢您的关注</span>
                            </div>
                          </div>
                        );

                        // ── default (fallback) ─────────────────────────────
                        return (
                          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: PC.cream }}>
                            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: PC.copper }} />
                            <div className="p-8 flex flex-col justify-center h-full">
                              <h2 className="font-bold text-xl mb-2" style={{ color: PC.text }}>{slide.title}</h2>
                              {slide.subtitle && <p className="text-sm italic mb-3" style={{ color: PC.copper }}>{slide.subtitle}</p>}
                              <div className="h-[2px] w-14 mb-4" style={{ backgroundColor: PC.copper }} />
                              <ul className="space-y-2">
                                {slide.bullets.map((b, bi) => (
                                  <li key={bi} className="flex items-start gap-2 text-sm" style={{ color: PC.text }}>
                                    <span style={{ color: PC.copper }}>—</span><span>{b}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Navigation */}
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline" size="sm"
                        disabled={previewSlideIndex === 0}
                        onClick={() => setPreviewSlideIndex(i => Math.max(0, i - 1))}
                      >
                        上一页
                      </Button>
                      <div className="flex gap-1">
                        {resultSlides.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setPreviewSlideIndex(i)}
                            className={`h-1.5 rounded-full transition-all ${
                              i === previewSlideIndex ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40'
                            }`}
                          />
                        ))}
                      </div>
                      <Button
                        variant="outline" size="sm"
                        disabled={previewSlideIndex === resultSlides.length - 1}
                        onClick={() => setPreviewSlideIndex(i => Math.min(resultSlides.length - 1, i + 1))}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
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
