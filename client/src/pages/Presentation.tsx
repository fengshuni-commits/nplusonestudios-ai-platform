import { useState, useRef, useCallback, useEffect } from "react";
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
  Presentation as PresentationIcon,
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
  Plus,
  Trash2,
  RefreshCw,
  Edit3,
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FeedbackButtons } from "@/components/FeedbackButtons";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

type UploadedAsset = {
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  uploading?: boolean;
  error?: string;
};

// File convert mode types (preserved from old implementation)
type GenerationStage = "structuring" | "generating_images" | "building_pptx" | "done" | "pdf_converting" | "inpainting" | "";
const STAGE_LABELS: Record<GenerationStage, string> = {
  structuring: "AI 正在规划幻灯片结构…",
  generating_images: "正在获取配图…",
  building_pptx: "正在构建 PPT 文件…",
  done: "生成完成",
  pdf_converting: "正在解析 PDF 页面…",
  inpainting: "AI 正在处理图片…",
  "": "正在初始化…",
};
type UploadedFile = {
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  uploading?: boolean;
  error?: string;
  fileType: "pdf" | "image";
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: WizardStep; total: number }) {
  const steps = [
    { n: 1, label: "项目信息" },
    { n: 2, label: "提示词审核" },
    { n: 3, label: "生成预览" },
    { n: 4, label: "导出" },
  ];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
              current === s.n
                ? "bg-primary border-primary text-primary-foreground"
                : current > s.n
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-background border-border text-muted-foreground"
            }`}>
              {current > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </div>
            <span className={`text-[10px] mt-1 font-medium ${current === s.n ? "text-primary" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1 mb-4 transition-colors ${current > s.n ? "bg-primary/40" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Slide Card (Step 2 - Prompt Review) ─────────────────────────────────────

function SlidePromptCard({
  slide,
  index,
  total,
  onUpdate,
  onDelete,
}: {
  slide: { id: number; slideOrder: number; prompt: string | null; status: string };
  index: number;
  total: number;
  onUpdate: (id: number, prompt: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(slide.prompt ?? "");

  useEffect(() => {
    setLocalPrompt(slide.prompt ?? "");
  }, [slide.prompt]);

  const handleSave = () => {
    onUpdate(slide.id, localPrompt);
    setEditing(false);
  };

  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            第 {index + 1} 页 / 共 {total} 页
          </Badge>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setEditing(!editing)}
            >
              <Edit3 className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:text-destructive"
              onClick={() => onDelete(slide.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={localPrompt}
              onChange={e => setLocalPrompt(e.target.value)}
              rows={4}
              className="text-xs resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleSave}>保存</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                setLocalPrompt(slide.prompt ?? "");
                setEditing(false);
              }}>取消</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
            {slide.prompt || <span className="italic">（无提示词）</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Slide Preview Card (Step 3 - Generation Review) ─────────────────────────

function SlidePreviewCard({
  slide,
  index,
  total,
  onRegenerate,
  onView,
}: {
  slide: { id: number; slideOrder: number; prompt: string | null; imageUrl: string | null; status: string; errorMessage?: string | null };
  index: number;
  total: number;
  onRegenerate: (id: number) => void;
  onView: (slide: any) => void;
}) {
  const isGenerating = slide.status === "generating";
  const isDone = slide.status === "done";
  const isError = slide.status === "error";

  return (
    <Card className="py-0 gap-0 overflow-hidden">
      {/* Image area */}
      <div
        className="relative bg-muted aspect-video cursor-pointer group"
        onClick={() => isDone && onView(slide)}
      >
        {isDone && slide.imageUrl ? (
          <img
            src={slide.imageUrl}
            alt={`Slide ${index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">生成中…</span>
          </div>
        ) : isError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <span className="text-xs text-destructive text-center line-clamp-2">
              {slide.errorMessage || "生成失败"}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">待生成</span>
          </div>
        )}

        {/* Overlay on hover */}
        {isDone && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye className="h-6 w-6 text-white" />
          </div>
        )}

        {/* Slide number badge */}
        <div className="absolute top-1.5 left-1.5">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-black/60 text-white border-0">
            {index + 1} / {total}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <CardContent className="p-2">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[10px] text-muted-foreground truncate flex-1">
            {slide.prompt?.split("\n")[0] ?? ""}
          </p>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => onRegenerate(slide.id)}
            disabled={isGenerating}
            title="重新生成"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PresentationPage() {
  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);
  const [activePresentationId, setActivePresentationId] = useState<number | null>(null);

  // ── Step 1: Input form ────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [designThoughts, setDesignThoughts] = useState("");
  const [targetPages, setTargetPages] = useState(10);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAsset[]>([]);
  const assetInputRef = useRef<HTMLInputElement>(null);

  // ── Step 2: Prompt review ─────────────────────────────────────────────────
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);

  // ── Step 3: Image generation ──────────────────────────────────────────────
  const [imageToolId, setImageToolId] = useState<number | undefined>(undefined);
  const [planToolId, setPlanToolId] = useState<number | undefined>(undefined);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [viewingSlide, setViewingSlide] = useState<any | null>(null);
  const [pollingActive, setPollingActive] = useState(false);

  // ── Step 4: Export ────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // ── File convert mode (preserved legacy) ─────────────────────────────────
  const [showFileConvert, setShowFileConvert] = useState(false);
  const [convertTitle, setConvertTitle] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [inpaintToolId, setInpaintToolId] = useState<number | undefined>(undefined);
  const [isConverting, setIsConverting] = useState(false);
  const [convertJobId, setConvertJobId] = useState<string | null>(null);
  const [convertProgress, setConvertProgress] = useState(0);
  const [convertStage, setConvertStage] = useState<GenerationStage>("");
  const [convertResultUrl, setConvertResultUrl] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const fileConvertInputRef = useRef<HTMLInputElement>(null);

  // ── Project list dialog ───────────────────────────────────────────────────
  const [showProjectImport, setShowProjectImport] = useState(false);

  // ── Asset import dialog ───────────────────────────────────────────────────
  const [showAssetImport, setShowAssetImport] = useState(false);
  const [assetImportTab, setAssetImportTab] = useState<"library" | "project">("library");
  const [assetImportProjectId, setAssetImportProjectId] = useState<string>("");
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedImportAssets, setSelectedImportAssets] = useState<Set<string>>(new Set());

  // ── Presentation list ─────────────────────────────────────────────────────
  const [showList, setShowList] = useState(true);

  // ── Queries & Mutations ───────────────────────────────────────────────────
  const { data: projects } = trpc.projects.list.useQuery();
  // Asset import queries (lazy, only when dialog is open)
  const { data: allAssets } = trpc.assets.listAll.useQuery(
    undefined,
    { enabled: showAssetImport && assetImportTab === "library" }
  );
  const { data: projectDocImages } = trpc.documents.listImagesByProject.useQuery(
    { projectId: Number(assetImportProjectId) },
    { enabled: showAssetImport && assetImportTab === "project" && !!assetImportProjectId }
  );
  const uploadMutation = trpc.upload.file.useMutation();
  const createMutation = trpc.presentationProjects.create.useMutation();
  const generatePromptsMutation = trpc.presentationProjects.generatePrompts.useMutation();
  const updateSlidePromptMutation = trpc.presentationProjects.updateSlidePrompt.useMutation();
  const addSlideMutation = trpc.presentationProjects.addSlide.useMutation();
  const deleteSlideMutation = trpc.presentationProjects.deleteSlide.useMutation();
  const generateAllMutation = trpc.presentationProjects.generateAllSlides.useMutation();
  const generateOneMutation = trpc.presentationProjects.generateSlideImage.useMutation();
  const regenerateMutation = trpc.presentationProjects.regenerateSlide.useMutation();
  const exportPptxMutation = trpc.presentationProjects.exportPptx.useMutation();
  const deletePresentationMutation = trpc.presentationProjects.delete.useMutation();
  const convertFromFileMutation = trpc.presentation.convertFromFile.useMutation();

  const { data: presentationList, refetch: refetchList } = trpc.presentationProjects.list.useQuery();
  const { data: presentationData, refetch: refetchPresentation } = trpc.presentationProjects.get.useQuery(
    { id: activePresentationId! },
    { enabled: !!activePresentationId }
  );

  // Poll for slide generation status
  const { data: polledData } = trpc.presentationProjects.get.useQuery(
    { id: activePresentationId! },
    {
      enabled: !!activePresentationId && pollingActive,
      refetchInterval: pollingActive ? 3000 : false,
    }
  );

  // Check if any slides are still generating
  useEffect(() => {
    if (!polledData) return;
    const slides = polledData.slides ?? [];
    const anyGenerating = slides.some((s: any) => s.status === "generating" || s.status === "pending");
    if (!anyGenerating) {
      setPollingActive(false);
      setIsGeneratingAll(false);
      refetchPresentation();
    }
  }, [polledData, refetchPresentation]);

  // Poll for file convert job
  const { data: convertJobStatus } = trpc.presentation.status.useQuery(
    { jobId: convertJobId! },
    { enabled: !!convertJobId && isConverting, refetchInterval: isConverting ? 2000 : false }
  );

  useEffect(() => {
    if (!convertJobStatus) return;
    if (convertJobStatus.status === "processing") {
      setConvertProgress(convertJobStatus.progress || 0);
      setConvertStage((convertJobStatus.stage as GenerationStage) || "");
    } else if (convertJobStatus.status === "done") {
      setIsConverting(false);
      setConvertProgress(100);
      setConvertStage("done");
      setConvertResultUrl(convertJobStatus.url || null);
      setConvertJobId(null);
      toast.success("文件转换完成");
    } else if (convertJobStatus.status === "failed") {
      setIsConverting(false);
      setConvertError(convertJobStatus.error || "转换失败");
      setConvertJobId(null);
      toast.error(`转换失败：${convertJobStatus.error}`);
    }
  }, [convertJobStatus]);

  // ── Asset upload ──────────────────────────────────────────────────────────
  const handleAssetSelect = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const newAssets: UploadedAsset[] = [];
    for (let i = 0; i < Math.min(files.length, 10 - uploadedAssets.length); i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const previewUrl = URL.createObjectURL(file);
      newAssets.push({ file, previewUrl, uploading: true });
    }
    if (newAssets.length === 0) return;
    setUploadedAssets(prev => [...prev, ...newAssets]);

    for (const asset of newAssets) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(asset.file);
        });
        const result = await uploadMutation.mutateAsync({
          fileName: asset.file.name,
          contentType: asset.file.type,
          fileData: base64.split(",")[1] || base64,
          folder: "presentation-assets",
        });
        setUploadedAssets(prev =>
          prev.map(p =>
            p.previewUrl === asset.previewUrl
              ? { ...p, uploading: false, uploadedUrl: result.url }
              : p
          )
        );
      } catch {
        setUploadedAssets(prev =>
          prev.map(p =>
            p.previewUrl === asset.previewUrl
              ? { ...p, uploading: false, error: "上传失败" }
              : p
          )
        );
      }
    }
  }, [uploadedAssets.length, uploadMutation]);

  const removeAsset = (previewUrl: string) => {
    setUploadedAssets(prev => {
      const img = prev.find(p => p.previewUrl === previewUrl);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(p => p.previewUrl !== previewUrl);
    });
  };

  // ── Import project info ───────────────────────────────────────────────────
  const handleImportProject = () => {
    if (!selectedProjectId) return;
    const project = projects?.find(p => String(p.id) === selectedProjectId);
    if (!project) return;
    const parts: string[] = [];
    if (project.name) parts.push(`项目名称：${project.name}`);
    if (project.clientName) parts.push(`委托方：${project.clientName}`);
    if (project.description) parts.push(`项目概况：${project.description}`);
    if (project.projectOverview) parts.push(`项目概况：${project.projectOverview}`);
    if (project.businessGoal) parts.push(`业务目标：${project.businessGoal}`);
    setDescription(prev => (prev ? prev + "\n\n" : "") + parts.join("\n"));
    if (!title && project.name) setTitle(project.name);
    setShowProjectImport(false);
    toast.success("项目信息已导入");
  };

  // ── Import assets from library / project docs ───────────────────────────────────
  const handleConfirmAssetImport = () => {
    const currentCount = uploadedAssets.length;
    const remaining = 10 - currentCount;
    if (remaining <= 0) { toast.error("已达到最大素材数量 (10 张)"); return; }
    // Build list of items to import based on active tab
    const items: Array<{ url: string; name: string; mimeType: string }> = [];
    if (assetImportTab === "library" && allAssets) {
      for (const a of allAssets) {
        if (selectedImportAssets.has(`lib-${a.id}`) && a.fileUrl) {
          items.push({ url: a.fileUrl, name: a.name, mimeType: a.fileType ?? "image/jpeg" });
        }
      }
    } else if (assetImportTab === "project" && projectDocImages) {
      for (const d of projectDocImages) {
        if (selectedImportAssets.has(`doc-${d.id}`) && d.fileUrl) {
          items.push({ url: d.fileUrl, name: d.title, mimeType: "image/jpeg" });
        }
      }
    }
    if (items.length === 0) { toast.error("请先选择要导入的图片"); return; }
    const toAdd = items.slice(0, remaining);
    // Create synthetic UploadedAsset entries (already uploaded, no re-upload needed)
    const newAssets: UploadedAsset[] = toAdd.map(item => ({
      file: new File([], item.name, { type: item.mimeType }),
      previewUrl: item.url,
      uploadedUrl: item.url,
      uploading: false,
    }));
    setUploadedAssets(prev => [...prev, ...newAssets]);
    setShowAssetImport(false);
    setSelectedImportAssets(new Set());
    toast.success(`已导入 ${newAssets.length} 张图片`);
  };

  const toggleImportAsset = (key: string) => {
    setSelectedImportAssets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Step 1 → Step 2: Create presentation and generate prompts ─────────────
  const handleCreateAndGeneratePrompts = async () => {
    if (!title.trim()) { toast.error("请填写演示标题"); return; }
    if (!description.trim()) { toast.error("请填写项目描述"); return; }
    const pendingUploads = uploadedAssets.filter(a => a.uploading);
    if (pendingUploads.length > 0) { toast.error("素材上传中，请稍候"); return; }

    setIsGeneratingPrompts(true);
    try {
      const assetUrls = uploadedAssets
        .filter(a => a.uploadedUrl)
        .map(a => ({ url: a.uploadedUrl!, fileName: a.file.name, mimeType: a.file.type }));

      const created = await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        designThoughts: designThoughts.trim() || undefined,
        targetPages,
        assetUrls,
      });

      setActivePresentationId(created.id);

      // Generate prompts
      await generatePromptsMutation.mutateAsync({ id: created.id });
      await refetchPresentation();
      setStep(2);
      toast.success("AI 已生成幻灯片提示词，请检查并编辑");
    } catch (err: any) {
      toast.error(`创建失败：${err?.message}`);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  // ── Step 2 → Step 3: Start image generation ───────────────────────────────
  const handleStartGeneration = async () => {
    if (!activePresentationId) return;
    setIsGeneratingAll(true);
    setPollingActive(true);
    try {
      await generateAllMutation.mutateAsync({
        id: activePresentationId,
        imageToolId,
        planToolId,
      });
      setStep(3);
      toast.success("图像生成已启动，请等待完成");
    } catch (err: any) {
      setIsGeneratingAll(false);
      setPollingActive(false);
      toast.error(`启动生成失败：${err?.message}`);
    }
  };

  // ── Slide prompt update ───────────────────────────────────────────────────
  const handleUpdateSlidePrompt = async (slideId: number, prompt: string) => {
    if (!activePresentationId) return;
    try {
      await updateSlidePromptMutation.mutateAsync({
        presentationId: activePresentationId,
        slideId,
        prompt,
      });
      await refetchPresentation();
      toast.success("提示词已更新");
    } catch (err: any) {
      toast.error(`更新失败：${err?.message}`);
    }
  };

  // ── Add slide ─────────────────────────────────────────────────────────────
  const handleAddSlide = async () => {
    if (!activePresentationId) return;
    const slides = presentationData?.slides ?? [];
    const lastOrder = slides.length > 0 ? slides[slides.length - 1].slideOrder : -1;
    try {
      await addSlideMutation.mutateAsync({
        presentationId: activePresentationId,
        prompt: "新增幻灯片",
        insertAfterOrder: lastOrder,
      });
      await refetchPresentation();
    } catch (err: any) {
      toast.error(`添加失败：${err?.message}`);
    }
  };

  // ── Delete slide ──────────────────────────────────────────────────────────
  const handleDeleteSlide = async (slideId: number) => {
    if (!activePresentationId) return;
    try {
      await deleteSlideMutation.mutateAsync({
        presentationId: activePresentationId,
        slideId,
      });
      await refetchPresentation();
      toast.success("已删除");
    } catch (err: any) {
      toast.error(`删除失败：${err?.message}`);
    }
  };

  // ── Regenerate single slide ───────────────────────────────────────────────
  const handleRegenerateSlide = async (slideId: number) => {
    if (!activePresentationId) return;
    try {
      await regenerateMutation.mutateAsync({
        presentationId: activePresentationId,
        slideId,
        imageToolId,
        planToolId,
      });
      setPollingActive(true);
      toast.success("重新生成已启动");
    } catch (err: any) {
      toast.error(`重新生成失败：${err?.message}`);
    }
  };

  // ── Export PPTX ───────────────────────────────────────────────────────────
  const handleExportPptx = async () => {
    if (!activePresentationId) return;
    setIsExporting(true);
    setExportUrl(null);
    try {
      const result = await exportPptxMutation.mutateAsync({ id: activePresentationId });
      setExportUrl(result.url);
      toast.success("PPTX 已生成，点击下载");
    } catch (err: any) {
      toast.error(`导出失败：${err?.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ── File convert handlers (preserved) ────────────────────────────────────
  const handleFileConvertSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) continue;
      if (isPdf && uploadedFiles.some(f => f.fileType === "pdf")) {
        toast.error("每次只能上传一个 PDF 文件"); continue;
      }
      if (uploadedFiles.length + newFiles.length >= 20) {
        toast.error("最多支持 20 张图片"); break;
      }
      const previewUrl = isImage ? URL.createObjectURL(file) : "";
      newFiles.push({ file, previewUrl, uploading: true, fileType: isPdf ? "pdf" : "image" });
    }
    if (newFiles.length === 0) return;
    setUploadedFiles(prev => [...prev, ...newFiles]);

    for (const uf of newFiles) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(uf.file);
        });
        const result = await uploadMutation.mutateAsync({
          fileName: uf.file.name, contentType: uf.file.type,
          fileData: base64.split(",")[1] || base64, folder: "presentation-convert",
        });
        setUploadedFiles(prev =>
          prev.map(p =>
            p.previewUrl === uf.previewUrl && p.file.name === uf.file.name
              ? { ...p, uploading: false, uploadedUrl: result.url } : p
          )
        );
      } catch {
        setUploadedFiles(prev =>
          prev.map(p =>
            p.previewUrl === uf.previewUrl && p.file.name === uf.file.name
              ? { ...p, uploading: false, error: "上传失败" } : p
          )
        );
      }
    }
  }, [uploadedFiles, uploadMutation]);

  const handleConvertFromFile = async () => {
    const readyFiles = uploadedFiles.filter(f => f.uploadedUrl);
    if (readyFiles.length === 0) { toast.error("请先上传文件"); return; }
    if (uploadedFiles.some(f => f.uploading)) { toast.error("文件上传中，请稍候"); return; }
    const hasPdf = readyFiles.some(f => f.fileType === "pdf");
    const fileType: "pdf" | "images" = hasPdf ? "pdf" : "images";
    setIsConverting(true);
    setConvertProgress(5);
    setConvertStage("structuring");
    setConvertError(null);
    setConvertResultUrl(null);
    try {
      const result = await convertFromFileMutation.mutateAsync({
        fileUrls: readyFiles.map(f => f.uploadedUrl!),
        fileType,
        title: convertTitle.trim() || undefined,
        inpaintToolId,
      });
      setConvertJobId(result.jobId);
    } catch (err: any) {
      setIsConverting(false);
      setConvertError(err?.message || "启动转换失败");
      toast.error(`转换失败：${err?.message}`);
    }
  };

  // ── Open existing presentation ────────────────────────────────────────────
  const handleOpenPresentation = async (id: number) => {
    setActivePresentationId(id);
    setShowList(false);
    // Determine which step to resume at
    const pres = (presentationList as any[])?.find((p: any) => p.id === id);
    if (pres) {
      if (pres.status === "draft") setStep(1);
      else if (pres.status === "prompts_ready") setStep(2);
      else if (pres.status === "generating" || pres.status === "review") setStep(3);
      else if (pres.status === "done") setStep(4);
      else setStep(2);
    }
  };

  // ── Delete presentation ───────────────────────────────────────────────────
  const handleDeletePresentation = async (id: number) => {
    try {
      await deletePresentationMutation.mutateAsync({ id });
      refetchList();
      toast.success("已删除");
    } catch (err: any) {
      toast.error(`删除失败：${err?.message}`);
    }
  };

  // ── Start new presentation ────────────────────────────────────────────────
  const handleNewPresentation = () => {
    setActivePresentationId(null);
    setTitle("");
    setDescription("");
    setDesignThoughts("");
    setTargetPages(10);
    setUploadedAssets([]);
    setExportUrl(null);
    setStep(1);
    setShowList(false);
  };

  // ── Current slides ────────────────────────────────────────────────────────
  const slides = (presentationData?.slides ?? []) as any[];
  const assets = (presentationData?.assets ?? []) as any[];
  const doneSlides = slides.filter((s: any) => s.status === "done");
  const generatingSlides = slides.filter((s: any) => s.status === "generating" || s.status === "pending");

  // ── Render: List View ─────────────────────────────────────────────────────
  if (showList) {
    return (
      <div className="pb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">演示文稿</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI 驱动的全流程演示文稿生成</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFileConvert(true)}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              文件转换
            </Button>
            <Button size="sm" onClick={handleNewPresentation}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              新建演示文稿
            </Button>
          </div>
        </div>

        {/* Presentation list */}
        {(presentationList as any[] | undefined)?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <PresentationIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">还没有演示文稿</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">点击「新建演示文稿」开始创作</p>
              <Button size="sm" onClick={handleNewPresentation}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                新建演示文稿
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(presentationList as any[] | undefined)?.map((pres: any) => (
            <Card
              key={pres.id}
              className="py-0 gap-0 overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => handleOpenPresentation(pres.id)}
            >
              {/* Cover image */}
              <div className="relative aspect-video bg-muted">
                {pres.coverImage ? (
                  <img src={pres.coverImage} alt={pres.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <PresentationIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                {/* Status badge */}
                <div className="absolute top-2 right-2">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${
                      pres.status === "done" ? "bg-green-500/20 text-green-700" :
                      pres.status === "generating" ? "bg-primary/20 text-primary" :
                      "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {pres.status === "draft" ? "草稿" :
                     pres.status === "prompts_ready" ? "待生成" :
                     pres.status === "generating" ? "生成中" :
                     pres.status === "review" ? "审核中" :
                     pres.status === "done" ? "已完成" : pres.status}
                  </Badge>
                </div>
              </div>

              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate">{pres.title}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {pres.slideCount} 页 · {pres.doneCount} 张已生成
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeletePresentation(pres.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* File Convert Dialog */}
        <Dialog open={showFileConvert} onOpenChange={setShowFileConvert}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>文件转换为 PPT</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">文稿标题（可选）</Label>
                <Input
                  placeholder="如不填则自动使用文件名"
                  value={convertTitle}
                  onChange={e => setConvertTitle(e.target.value)}
                  disabled={isConverting}
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">上传文件</Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileConvertInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFileConvertSelect(e.dataTransfer.files); }}
                >
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">支持 PDF 或多张图片</p>
                </div>
                <input
                  ref={fileConvertInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleFileConvertSelect(e.target.files)}
                />
                {uploadedFiles.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {uploadedFiles.map((uf, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-1.5 rounded border border-border text-xs">
                        {uf.fileType === "pdf" ? <FileText className="h-3.5 w-3.5 text-primary" /> :
                          uf.previewUrl ? <img src={uf.previewUrl} alt="" className="h-6 w-6 object-cover rounded" /> :
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="truncate flex-1">{uf.file.name}</span>
                        {uf.uploading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        {uf.uploadedUrl && !uf.uploading && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        {!uf.uploading && (
                          <button onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">文字去除 AI（可选）</Label>
                <AiToolSelector
                  capability={["image", "image_generation"]}
                  value={inpaintToolId}
                  onChange={setInpaintToolId}
                  label="选择 AI 工具去除图片中的文字"
                  showBuiltIn={false}
                />
              </div>

              {isConverting && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>{STAGE_LABELS[convertStage]}</span>
                  </div>
                  <Progress value={convertProgress} className="h-1.5" />
                </div>
              )}

              {convertResultUrl && (
                <div className="flex items-center gap-2 p-2 rounded bg-green-50 border border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-700 flex-1">转换完成</span>
                  <Button size="sm" className="h-7 text-xs" asChild>
                    <a href={convertResultUrl} download>
                      <Download className="h-3 w-3 mr-1" />
                      下载
                    </a>
                  </Button>
                </div>
              )}

              {convertError && (
                <p className="text-xs text-destructive">{convertError}</p>
              )}

              <Button
                className="w-full"
                onClick={handleConvertFromFile}
                disabled={isConverting || !uploadedFiles.some(f => f.uploadedUrl)}
              >
                {isConverting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />转换中…</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />开始转换</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Render: Wizard ─────────────────────────────────────────────────────────
  return (
    <div className="pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => { setShowList(true); refetchList(); }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-base font-semibold">{title || "新建演示文稿"}</h2>
          <p className="text-xs text-muted-foreground">
            {activePresentationId ? `ID: ${activePresentationId}` : "未保存"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} total={4} />

      {/* ── STEP 1: Input Form ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">项目信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Import project */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowProjectImport(true)}
              >
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                从项目看板导入信息（可选）
              </Button>

              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  演示标题 <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="如：JPT 总部办公空间设计方案汇报"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  项目描述 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="描述项目背景、设计目标、空间类型、面积、主要功能区等。内容越详细，AI 生成质量越高。"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  className="text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground">{description.length} 字</p>
              </div>

              {/* Design thoughts */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">设计思路（可选）</Label>
                <Textarea
                  placeholder="设计理念、风格方向、材料选择、亮点特色等"
                  value={designThoughts}
                  onChange={e => setDesignThoughts(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>

              {/* Target pages */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">目标页数</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={3}
                    max={30}
                    value={targetPages}
                    onChange={e => setTargetPages(Math.max(3, Math.min(30, Number(e.target.value))))}
                    className="w-24 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">页（AI 可适当增减）</span>
                </div>
              </div>

              {/* Asset upload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">参考素材（可选，最多 10 张）</Label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => { setAssetImportTab("library"); setShowAssetImport(true); setSelectedImportAssets(new Set()); }}
                    >
                      <ImageIcon className="h-3 w-3" />素材库
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => { setAssetImportTab("project"); setShowAssetImport(true); setSelectedImportAssets(new Set()); }}
                    >
                      <FolderOpen className="h-3 w-3" />项目文件
                    </Button>
                  </div>
                </div>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => assetInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleAssetSelect(e.dataTransfer.files); }}
                >
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">点击或拖拽上传本地图片</p>
                </div>
                <input
                  ref={assetInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleAssetSelect(e.target.files)}
                />
                {uploadedAssets.length > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {uploadedAssets.map(asset => (
                      <div key={asset.previewUrl} className="relative aspect-square rounded overflow-hidden border border-border bg-muted">
                        <img src={asset.previewUrl} alt="" className="w-full h-full object-cover" />
                        {asset.uploading && (
                          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          </div>
                        )}
                        {!asset.uploading && !asset.error && (
                          <button
                            className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 hover:bg-background"
                            onClick={() => removeAsset(asset.previewUrl)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handleCreateAndGeneratePrompts}
                disabled={isGeneratingPrompts || !title.trim() || !description.trim()}
              >
                {isGeneratingPrompts ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />AI 正在规划幻灯片结构…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />下一步：AI 生成幻灯片提示词</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 2: Prompt Review ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">AI 已生成 {slides.length} 页提示词</p>
              <p className="text-xs text-muted-foreground">检查并编辑每页内容，可增删页面</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddSlide}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                添加页面
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!activePresentationId) return;
                  setIsGeneratingPrompts(true);
                  try {
                    await generatePromptsMutation.mutateAsync({ id: activePresentationId });
                    await refetchPresentation();
                    toast.success("已重新生成提示词");
                  } catch (err: any) {
                    toast.error(`重新生成失败：${err?.message}`);
                  } finally {
                    setIsGeneratingPrompts(false);
                  }
                }}
                disabled={isGeneratingPrompts}
              >
                {isGeneratingPrompts ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                重新生成
              </Button>
            </div>
          </div>

          {/* Tool selectors */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">图像生成工具</span>
                  <AiToolSelector
                    capability="image_generation"
                    value={imageToolId}
                    onChange={setImageToolId}
                    label="图像生成"
                    showBuiltIn={true}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Slide prompt cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {slides.map((slide: any, i: number) => (
              <SlidePromptCard
                key={slide.id}
                slide={slide}
                index={i}
                total={slides.length}
                onUpdate={handleUpdateSlidePrompt}
                onDelete={handleDeleteSlide}
              />
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              上一步
            </Button>
            <Button
              onClick={handleStartGeneration}
              disabled={isGeneratingAll || slides.length === 0}
            >
              {isGeneratingAll ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />开始生成图像（{slides.length} 页）</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Image Generation Review ───────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {doneSlides.length} / {slides.length} 页已生成
                {generatingSlides.length > 0 && (
                  <span className="text-xs text-primary ml-2">
                    <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                    {generatingSlides.length} 页生成中…
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">点击图片预览，点击刷新图标重新生成</p>
            </div>
            <div className="flex gap-2">
              {generatingSlides.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchPresentation()}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  刷新状态
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setStep(4)}
                disabled={doneSlides.length === 0}
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                下一步：导出
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          {slides.length > 0 && (
            <Progress value={(doneSlides.length / slides.length) * 100} className="h-1.5" />
          )}

          {/* Slide grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {slides.map((slide: any, i: number) => (
              <SlidePreviewCard
                key={slide.id}
                slide={slide}
                index={i}
                total={slides.length}
                onRegenerate={handleRegenerateSlide}
                onView={setViewingSlide}
              />
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回编辑提示词
            </Button>
            <Button
              onClick={() => setStep(4)}
              disabled={doneSlides.length === 0}
            >
              <FileDown className="h-4 w-4 mr-2" />
              导出 PPTX
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Export ─────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">导出演示文稿</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="rounded-md bg-secondary/30 p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">演示标题</span>
                  <span className="font-medium">{title || presentationData?.title}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">总页数</span>
                  <span className="font-medium">{slides.length} 页</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">已生成</span>
                  <span className="font-medium text-green-600">{doneSlides.length} 页</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">格式</span>
                  <span className="font-medium">PPTX（16:9，可编辑文字）</span>
                </div>
              </div>

              {/* Slide thumbnails preview */}
              {doneSlides.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">幻灯片预览</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {doneSlides.map((slide: any, i: number) => (
                      <div
                        key={slide.id}
                        className="shrink-0 w-32 aspect-video rounded overflow-hidden border border-border"
                      >
                        <img src={slide.imageUrl} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Export button */}
              {exportUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">PPTX 已生成</p>
                      <p className="text-xs text-green-600">包含 {doneSlides.length} 张幻灯片，文字可在 PowerPoint 中编辑</p>
                    </div>
                  </div>
                  <Button className="w-full" asChild>
                    <a href={exportUrl} download>
                      <Download className="h-4 w-4 mr-2" />
                      下载 PPTX
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setExportUrl(null); }}
                  >
                    重新导出
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleExportPptx}
                  disabled={isExporting || doneSlides.length === 0}
                >
                  {isExporting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />正在构建 PPTX…</>
                  ) : (
                    <><FileDown className="h-4 w-4 mr-2" />导出为 PPTX（{doneSlides.length} 页）</>
                  )}
                </Button>
              )}

              <Separator />

              {/* File convert alternative */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">其他选项</p>
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => setShowFileConvert(true)}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  上传 PDF / 图片转换为 PPT
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回预览
            </Button>
            <Button
              variant="outline"
              onClick={() => { setShowList(true); refetchList(); }}
            >
              返回列表
            </Button>
          </div>
        </div>
      )}

      {/* ── Slide viewer dialog ────────────────────────────────────────────── */}
      <Dialog open={!!viewingSlide} onOpenChange={() => setViewingSlide(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              第 {viewingSlide ? viewingSlide.slideOrder + 1 : ""} 页
            </DialogTitle>
          </DialogHeader>
          {viewingSlide?.imageUrl && (
            <div className="space-y-3">
              <img
                src={viewingSlide.imageUrl}
                alt="Slide preview"
                className="w-full rounded-md"
              />
              <p className="text-xs text-muted-foreground">{viewingSlide.prompt}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleRegenerateSlide(viewingSlide.id);
                    setViewingSlide(null);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  重新生成
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Project import dialog ──────────────────────────────────────────── */}
      <Dialog open={showProjectImport} onOpenChange={setShowProjectImport}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">导入项目信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" size="sm" onClick={handleImportProject} disabled={!selectedProjectId}>
              导入
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Convert Dialog (also accessible from wizard) */}
      <Dialog open={showFileConvert} onOpenChange={setShowFileConvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>文件转换为 PPT</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">文稿标题（可选）</Label>
              <Input
                placeholder="如不填则自动使用文件名"
                value={convertTitle}
                onChange={e => setConvertTitle(e.target.value)}
                disabled={isConverting}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">上传文件</Label>
              <div
                className="border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileConvertInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFileConvertSelect(e.dataTransfer.files); }}
              >
                <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">支持 PDF 或多张图片</p>
              </div>
              <input
                ref={fileConvertInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                className="hidden"
                onChange={e => handleFileConvertSelect(e.target.files)}
              />
              {uploadedFiles.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {uploadedFiles.map((uf, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-1.5 rounded border border-border text-xs">
                      {uf.fileType === "pdf" ? <FileText className="h-3.5 w-3.5 text-primary" /> :
                        uf.previewUrl ? <img src={uf.previewUrl} alt="" className="h-6 w-6 object-cover rounded" /> :
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="truncate flex-1">{uf.file.name}</span>
                      {uf.uploading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      {uf.uploadedUrl && !uf.uploading && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {!uf.uploading && (
                        <button onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">文字去除 AI（可选）</Label>
              <AiToolSelector
                capability={["image", "image_generation"]}
                value={inpaintToolId}
                onChange={setInpaintToolId}
                label="选择 AI 工具去除图片中的文字"
                showBuiltIn={false}
              />
            </div>
            {isConverting && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>{STAGE_LABELS[convertStage]}</span>
                </div>
                <Progress value={convertProgress} className="h-1.5" />
              </div>
            )}
            {convertResultUrl && (
              <div className="flex items-center gap-2 p-2 rounded bg-green-50 border border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-700 flex-1">转换完成</span>
                <Button size="sm" className="h-7 text-xs" asChild>
                  <a href={convertResultUrl} download>
                    <Download className="h-3 w-3 mr-1" />下载
                  </a>
                </Button>
              </div>
            )}
            {convertError && <p className="text-xs text-destructive">{convertError}</p>}
            <Button
              className="w-full"
              onClick={handleConvertFromFile}
              disabled={isConverting || !uploadedFiles.some(f => f.uploadedUrl)}
            >
              {isConverting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />转换中…</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" />开始转换</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Asset Import Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showAssetImport} onOpenChange={open => { setShowAssetImport(open); if (!open) setSelectedImportAssets(new Set()); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入参考素材</DialogTitle>
          </DialogHeader>
          <Tabs value={assetImportTab} onValueChange={v => { setAssetImportTab(v as "library" | "project"); setSelectedImportAssets(new Set()); }}>
            <TabsList className="w-full">
              <TabsTrigger value="library" className="flex-1">素材库</TabsTrigger>
              <TabsTrigger value="project" className="flex-1">项目文件</TabsTrigger>
            </TabsList>

            {/* ── Library Tab ── */}
            <TabsContent value="library" className="mt-3 space-y-3">
              <Input
                placeholder="搜索素材名称…"
                value={assetSearch}
                onChange={e => setAssetSearch(e.target.value)}
                className="h-8 text-sm"
              />
              <ScrollArea className="h-72">
                {!allAssets ? (
                  <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : (() => {
                  const filtered = allAssets.filter(a =>
                    a.fileUrl &&
                    /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(a.fileUrl) &&
                    (!assetSearch || a.name.toLowerCase().includes(assetSearch.toLowerCase()))
                  );
                  if (filtered.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">素材库中暂无图片素材</p>;
                  return (
                    <div className="grid grid-cols-4 gap-2 pr-2">
                      {filtered.map(a => {
                        const key = `lib-${a.id}`;
                        const selected = selectedImportAssets.has(key);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                              selected ? "border-primary" : "border-transparent hover:border-border"
                            }`}
                            onClick={() => toggleImportAsset(key)}
                          >
                            <img src={a.thumbnailUrl ?? a.fileUrl} alt={a.name} className="w-full h-full object-cover" />
                            {selected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            <p className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/50 text-white px-1 py-0.5 truncate">{a.name}</p>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </ScrollArea>
            </TabsContent>

            {/* ── Project Files Tab ── */}
            <TabsContent value="project" className="mt-3 space-y-3">
              <Select value={assetImportProjectId} onValueChange={v => { setAssetImportProjectId(v); setSelectedImportAssets(new Set()); }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="选择项目…" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ScrollArea className="h-64">
                {!assetImportProjectId ? (
                  <p className="text-xs text-muted-foreground text-center py-8">请先选择项目</p>
                ) : !projectDocImages ? (
                  <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : projectDocImages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">该项目暂无图片文件</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 pr-2">
                    {projectDocImages.map(d => {
                      const key = `doc-${d.id}`;
                      const selected = selectedImportAssets.has(key);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                            selected ? "border-primary" : "border-transparent hover:border-border"
                          }`}
                          onClick={() => toggleImportAsset(key)}
                        >
                          <img src={d.fileUrl!} alt={d.title} className="w-full h-full object-cover" />
                          {selected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <p className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/50 text-white px-1 py-0.5 truncate">{d.title}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">已选 {selectedImportAssets.size} 张</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAssetImport(false)}>取消</Button>
              <Button size="sm" onClick={handleConfirmAssetImport} disabled={selectedImportAssets.size === 0}>
                导入选中的图片
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
