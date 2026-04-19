import { useRef, useState, useEffect, useCallback, useMemo, memo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { AiToolSelector } from "@/components/AiToolSelector";
import {
  LayoutTemplate, Upload, Sparkles, Loader2, Trash2, RefreshCw,
  Plus, ChevronLeft, ChevronRight, Check, Palette,
  BookOpen, Layers, Maximize2, FolderOpen, Pencil, FileDown, Images, HelpCircle,
  Link2, Library, RotateCcw, Eye, ChevronDown, ChevronUp, Folder,
  Search, ImageIcon
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

type StylePackStatus = "pending" | "processing" | "done" | "failed";
type JobStatus = "pending" | "processing" | "done" | "failed";

interface StylePack {
  id: number;
  name: string;
  sourceType: string;
  status: StylePackStatus;
  styleGuide?: {
    description: string;
    colorPalette: { primary: string; secondary: string; background: string; text: string; accent: string };
    typography: { titleFont: string; bodyFont: string; style: string };
    layoutPatterns: Array<{ patternName: string; visualDescription: string; contentSuggestion: string }>;
    styleKeywords: string[];
    tone: string;
    density: string;
  };
  errorMessage?: string;
  createdAt: Date;
}

interface TextBlock {
  id: string;
  role: "title" | "subtitle" | "body" | "caption" | "label";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
}

interface PageData {
  pageIndex: number;
  imageUrl: string;
  backgroundColor: string;
  textBlocks?: TextBlock[];
  imageSize?: { width: number; height: number };
  // legacy
  layoutType?: string;
  textLayers?: any[];
}

interface LayoutJob {
  id: number;
  status: JobStatus;
  docType: string;
  title?: string;
  aspectRatio?: string;
  pages?: PageData[];
  htmlPages?: string[];
  errorMessage?: string;
  createdAt: Date;
  // 用于继续编辑的字段
  contentText?: string;
  packId?: number;
  pageCount?: number;
  assetUrls?: any;
}

const DOC_TYPES = [
  { value: "brand_manual", label: "品牌手册", icon: BookOpen },
  { value: "product_detail", label: "商品详情页", icon: Layers },
  { value: "project_board", label: "项目图板", icon: LayoutTemplate },
  { value: "custom", label: "自定义", icon: Sparkles },
];

const ASPECT_RATIOS = [
  { value: "3:4", label: "3:4", desc: "竖版标准" },
  { value: "4:3", label: "4:3", desc: "横版标准" },
  { value: "1:1", label: "1:1", desc: "正方形" },
  { value: "16:9", label: "16:9", desc: "宽屏" },
  { value: "9:16", label: "9:16", desc: "竖屏" },
  { value: "A4", label: "A4", desc: "297×210mm" },
  { value: "A3", label: "A3", desc: "420×297mm" },
];

const RATIO_CSS: Record<string, string> = {
  "3:4": "3/4", "4:3": "4/3", "1:1": "1/1",
  "16:9": "16/9", "9:16": "9/16",
  "A4": "210/297", "A3": "297/420",
};

// ─── Asset Picker Dialog ────────────────────────────────────────────────────────

type AssetItem = {
  id: number;
  name: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  isFolder?: boolean;
};

function AssetPickerDialog({
  open,
  onClose,
  onSelect,
  title = "从素材库选择",
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, name: string) => void;
  title?: string;
}) {
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<number | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<Array<{ id: number | undefined; name: string }>>([]);

  const { data: assetsData } = trpc.assets.listByParent.useQuery(
    { parentId: folderId },
    { enabled: open }
  );

  const assets = (assetsData || []) as AssetItem[];
  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenFolder = (id: number, name: string) => {
    setFolderPath((p) => [...p, { id: folderId, name: folderPath.length === 0 ? "素材库" : p[p.length - 1].name }]);
    setFolderId(id);
  };

  const handleBreadcrumb = (idx: number) => {
    const target = folderPath[idx];
    setFolderPath(folderPath.slice(0, idx));
    setFolderId(target.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {folderPath.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            <button className="hover:text-foreground" onClick={() => { setFolderPath([]); setFolderId(undefined); }}>素材库</button>
            {folderPath.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                <span>/</span>
                <button className="hover:text-foreground" onClick={() => handleBreadcrumb(i + 1)}>{p.name}</button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索素材…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto">
          {filtered.map((asset) => (
            <button
              key={asset.id}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border/40 hover:border-primary/60 transition-colors bg-muted/30"
              onClick={() => {
                if (asset.isFolder) {
                  handleOpenFolder(asset.id, asset.name);
                } else {
                  onSelect(asset.fileUrl, asset.name);
                  onClose();
                }
              }}
            >
              {asset.isFolder ? (
                <div className="flex flex-col items-center justify-center h-full gap-1">
                  <FolderOpen className="h-8 w-8 text-amber-500" />
                  <span className="text-xs text-muted-foreground truncate px-1 w-full text-center">{asset.name}</span>
                </div>
              ) : (
                <>
                  <img src={asset.thumbnailUrl || asset.fileUrl} alt={asset.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Check className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">{asset.name}</p>
                  </div>
                </>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-4 flex flex-col items-center justify-center h-32 text-muted-foreground">
              <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">暂无素材</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Style Pack Card ──────────────────────────────────────────────────────────

function StylePackCard({
  pack, selected, onSelect, onDelete, onRetry,
}: {
  pack: StylePack; selected: boolean;
  onSelect: () => void; onDelete: () => void; onRetry: () => void;
}) {
  const sg = pack.styleGuide;
  return (
    <div
      onClick={pack.status === "done" ? onSelect : undefined}
      className={`relative rounded-xl border-2 transition-all group ${
        pack.status === "done" ? "cursor-pointer" : "cursor-default opacity-70"
      } ${selected ? "border-[#B87333] bg-[#B87333]/5" : "border-white/10 bg-white/3 hover:border-white/20"}`}
    >
      {sg?.colorPalette && (
        <div className="flex h-1.5 rounded-t-xl overflow-hidden">
          {[sg.colorPalette.primary, sg.colorPalette.secondary, sg.colorPalette.accent, sg.colorPalette.background].map((c, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: `#${c.replace("#", "")}` }} />
          ))}
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{pack.name}</p>
            <p className="text-xs text-white/40 mt-0.5">{pack.sourceType === "pdf" ? "PDF" : "图片"}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(pack.status === "processing" || pack.status === "pending") && (
              <Loader2 className="w-3.5 h-3.5 text-[#B87333] animate-spin" />
            )}
            {pack.status === "failed" && (
              <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="p-1 rounded text-orange-400 hover:bg-orange-400/10 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
              </div>
            )}
            {pack.status === "done" && selected && <Check className="w-3.5 h-3.5 text-[#B87333]" />}
            <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
        {sg && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sg.styleKeywords.slice(0, 3).map((kw) => (
              <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/50">{kw}</span>
            ))}
          </div>
        )}
        {pack.status === "failed" && (
          <p className="text-[10px] text-red-400 mt-1 truncate">{pack.errorMessage || "提取失败"}</p>
        )}
      </div>
    </div>
  );
}

// ─── Page Image Viewer with Text Block Hotspots ───────────────────────────────

function PageImageViewer({
  page,
  aspectRatio,
  onClickBlock,
  inpaintingBlockId,
}: {
  page: PageData;
  aspectRatio: string;
  onClickBlock: (block: TextBlock) => void;
  inpaintingBlockId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const cssRatio = RATIO_CSS[aspectRatio] || "3/4";
  const imgW = page.imageSize?.width ?? 1024;
  const imgH = page.imageSize?.height ?? 1024;

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setContainerW(containerRef.current.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = containerW > 0 ? containerW / imgW : 1;
  const containerH = imgH * scale;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden shadow-2xl"
      style={{ aspectRatio: cssRatio }}
    >
      {/* 整页图片 */}
      {page.imageUrl ? (
        <img
          src={page.imageUrl}
          alt={`第 ${page.pageIndex + 1} 页`}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: page.backgroundColor || "#1a1a1a" }} />
      )}

      {/* 文字块热区叠加 */}
      {containerW > 0 && (page.textBlocks ?? []).map((block, blockIdx) => {
        const left = block.x * scale;
        const top = block.y * scale;
        const width = block.width * scale;
        const height = block.height * scale;
        const isInpainting = inpaintingBlockId === block.id;

        return (
          <div
            key={block.id ? `${block.id}-${blockIdx}` : `block-${blockIdx}`}
            onClick={() => onClickBlock(block)}
            title={`点击编辑：${block.text}`}
            className={`absolute group cursor-pointer transition-all ${
              isInpainting
                ? "ring-2 ring-[#B87333] bg-[#B87333]/20 animate-pulse"
                : "hover:ring-2 hover:ring-white/40 hover:bg-white/10"
            } rounded`}
            style={{ left, top, width, height }}
          >
            {/* 编辑图标 */}
            <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#B87333] flex items-center justify-center transition-opacity ${
              isInpainting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}>
              {isInpainting
                ? <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />
                : <Pencil className="w-2 h-2 text-white" />
              }
            </div>
            {/* 角色标签 */}
            <div className={`absolute bottom-full left-0 mb-0.5 px-1 py-0.5 rounded text-[9px] bg-black/70 text-white/70 whitespace-nowrap transition-opacity ${
              isInpainting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}>
              {block.role} · {block.text.slice(0, 20)}{block.text.length > 20 ? "…" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MediaLayout() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null); // per_page 模式用
  const assetFolderRef = useRef<HTMLInputElement>(null); // by_type 文件夹模式用
  const byTypeFileRef = useRef<HTMLInputElement>(null); // by_type 单文件模式用

  // Style Packs
  const { data: stylePacks = [], refetch: refetchPacks } = trpc.graphicStylePacks.list.useQuery(undefined, {
    staleTime: 10_000,
    refetchInterval: (query) => {
      const packs = (query.state.data as StylePack[] | undefined) ?? [];
      const hasPending = packs.some(p => p.status === "pending" || p.status === "processing");
      return hasPending ? 4000 : false;
    },
  });
  const [selectedPackId, setSelectedPackId] = useState<number | undefined>();
  const [uploadingPack, setUploadingPack] = useState(false);
  const [showPackUpload, setShowPackUpload] = useState(false);
  const [packNameInput, setPackNameInput] = useState("");
  // 新增：风格提示词提取
  const [stylePrompt, setStylePrompt] = useState<string>("");
  const [extractingPrompt, setExtractingPrompt] = useState(false);
  const extractPromptMutation = trpc.graphicLayout.extractStylePrompt.useMutation({
    onSuccess: (data) => {
      setStylePrompt(data.stylePrompt);
      setExtractingPrompt(false);
      toast.success("风格提示词提取成功！可以编辑后生成");
    },
    onError: (err) => {
      toast.error("提取失败：" + err.message);
      setExtractingPrompt(false);
    },
  });

  const deletePackMutation = trpc.graphicStylePacks.delete.useMutation({
    onSuccess: () => { refetchPacks(); toast.success("版式包已删除"); },
  });
  const retryPackMutation = trpc.graphicStylePacks.retry.useMutation({
    onSuccess: () => { refetchPacks(); toast.success("已重新提取"); },
  });
  const createPackMutation = trpc.graphicStylePacks.create.useMutation({
    onSuccess: () => { refetchPacks(); },
  });

  // Generate Form
  const [docType, setDocType] = useState("brand_manual");
  const [pageCount, setPageCount] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [contentText, setContentText] = useState("");
  const [titleInput, setTitleInput] = useState("");
  // 素材图模式：per_page（按页）或 by_type（按类型文件夹）
  const [assetMode, setAssetMode] = useState<"per_page" | "by_type">("per_page");
  // 按页模式：{ pageIndex: url[] }
  const [perPageAssets, setPerPageAssets] = useState<Record<number, string[]>>({});
  // 按类型模式：{ typeName: url[] }
  const [byTypeGroups, setByTypeGroups] = useState<Record<string, string[]>>({});
  // 按类型模式：当前正在上传的类型名称输入
  const [newTypeName, setNewTypeName] = useState("");
  // 当前选中的按页上传的页码
  const [assetPageTab, setAssetPageTab] = useState(0);
  const [imageToolId, setImageToolId] = useState<number | undefined>(undefined);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingTypeName, setUploadingTypeName] = useState<string | null>(null);
  // 素材库选择器
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerMode, setAssetPickerMode] = useState<"per_page" | "by_type">("per_page");
  // 按类型模式从素材库选择时的待确认 URL
  const [pendingAssetUrl, setPendingAssetUrl] = useState<string | null>(null);
  const [pendingAssetName, setPendingAssetName] = useState<string | null>(null);
  const [byTypeNameDialogOpen, setByTypeNameDialogOpen] = useState(false);
  const [byTypeNameInput, setByTypeNameInput] = useState("");

  // Jobs
  const { data: jobs = [], refetch: refetchJobs } = trpc.graphicLayout.list.useQuery(undefined, { staleTime: 30_000 });
  const [activeJobId, setActiveJobId] = useState<number | undefined>();
  const [currentPage, setCurrentPage] = useState(0);
  const [generating, setGenerating] = useState(false);

  // 历史记录详情面板
  const [selectedHistoryJobId, setSelectedHistoryJobId] = useState<number | undefined>(); // 当前展开详情的 job
  const [renamingJobId, setRenamingJobId] = useState<number | undefined>();
  const [renameInput, setRenameInput] = useState("");
  const [savingToAssets, setSavingToAssets] = useState(false);

  // 项目列表（用于关联项目）
  const { data: projectsData = [] } = trpc.projects.list.useQuery({});

  // 保存到素材库 mutation
  const saveToAssetsMutation = trpc.graphicLayout.saveToAssets.useMutation({
    onSuccess: (data) => {
      toast.success(`已保存 ${data.savedCount} 张图片到素材库`);
      setSavingToAssets(false);
    },
    onError: (err) => {
      toast.error("保存失败：" + err.message);
      setSavingToAssets(false);
    },
  });

  // 重命名 mutation
  const updateJobMutation = trpc.graphicLayout.updateJob.useMutation({
    onSuccess: () => {
      refetchJobs();
      setRenamingJobId(undefined);
      setRenameInput("");
      toast.success("重命名成功");
    },
    onError: (err) => {
      toast.error("重命名失败：" + err.message);
    },
  });

  // 继续编辑：恢复参数到表单
  const handleContinueEdit = (job: LayoutJob) => {
    setDocType(job.docType);
    setAspectRatio(job.aspectRatio || "3:4");
    setPageCount(job.pageCount || 1);
    setContentText(job.contentText || "");
    setTitleInput(job.title || "");
    // 如果有 packId，选中对应的版式包
    if (job.packId) setSelectedPackId(job.packId);
    // 切换到该 job 的预览
    setActiveJobId(job.id);
    setCurrentPage(0);
    toast.success("已恢复参数，可修改后重新生成");
  };

  // Inpainting state
  const [editingBlock, setEditingBlock] = useState<TextBlock | null>(null);
  const [editingPageIndex, setEditingPageIndex] = useState<number>(0);
  const [newText, setNewText] = useState("");
  const [inpaintingBlockId, setInpaintingBlockId] = useState<string | undefined>();

  // Export PDF state
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportPdfMutation = trpc.graphicLayout.exportPdf.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("导出成功！");
      setExportingPdf(false);
    },
    onError: (err) => {
      toast.error("导出失败：" + err.message);
      setExportingPdf(false);
    },
  });

  const handleExportPdf = () => {
    if (!activeJobId) return;
    setExportingPdf(true);
    exportPdfMutation.mutate({ jobId: activeJobId });
  };

  // Export Images state
  const [exportingImages, setExportingImages] = useState(false);
  const exportImagesMutation = trpc.graphicLayout.exportImages.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`导出成功！共 ${data.pageCount} 张图片`);
      setExportingImages(false);
    },
    onError: (err) => {
      toast.error("导出失败：" + err.message);
      setExportingImages(false);
    },
  });

  const handleExportImages = () => {
    if (!activeJobId) return;
    setExportingImages(true);
    exportImagesMutation.mutate({ jobId: activeJobId });
  };

  const generateMutation = trpc.graphicLayout.generate.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.id);
      setCurrentPage(0);
      refetchJobs();
      setGenerating(false);
    },
    onError: (err) => {
      toast.error("生成失败：" + err.message);
      setGenerating(false);
    },
  });

  const deleteJobMutation = trpc.graphicLayout.delete.useMutation({
    onSuccess: () => { refetchJobs(); setActiveJobId(undefined); toast.success("已删除"); },
  });

  const inpaintMutation = trpc.graphicLayout.inpaintTextBlock.useMutation({
    onSuccess: () => {
      toast.success("文字已更新");
      setEditingBlock(null);
      setNewText("");
      setInpaintingBlockId(undefined);
      refetchActiveJob();
    },
    onError: (err) => {
      toast.error("重绘失败：" + err.message);
      setInpaintingBlockId(undefined);
    },
  });

  const activeJobQueryInput = useMemo(() => ({ id: activeJobId! }), [activeJobId]);
  const activeJobIsTerminal = useMemo(() => {
    const found = (jobs as LayoutJob[]).find(j => j.id === activeJobId);
    return found?.status === "done" || found?.status === "failed";
  }, [jobs, activeJobId]);
  const { data: activeJobData, refetch: refetchActiveJob } = trpc.graphicLayout.status.useQuery(
    activeJobQueryInput,
    {
      enabled: !!activeJobId,
      // Stop polling once the job is done or failed
      refetchInterval: (query) => {
        const status = (query.state.data as LayoutJob | undefined)?.status;
        if (status === "done" || status === "failed") return false;
        return activeJobId ? 3000 : false;
      },
      staleTime: 0,
    }
  );

  const activeJob = activeJobData as LayoutJob | undefined;

  const prevActiveStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const status = activeJob?.status;
    if ((status === "done" || status === "failed") && prevActiveStatusRef.current !== status) {
      prevActiveStatusRef.current = status;
      refetchJobs();
    } else {
      prevActiveStatusRef.current = status;
    }
  }, [activeJob?.status]);

  const uploadFile = useCallback(async (file: File): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/layout-pack", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) throw new Error(`上传失败 ${res.status}`);
    return res.json();
  }, []);

  const handlePackFilesUpload = async (files: FileList) => {
    if (!packNameInput.trim()) { toast.error("请先输入版式包名称"); return; }
    if (files.length === 0) return;
    setUploadingPack(true);
    try {
      const file = files[0];
      const { url, key } = await uploadFile(file);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const sourceType = ext === "pdf" ? "pdf" : "images";
      await createPackMutation.mutateAsync({ name: packNameInput.trim(), sourceType, sourceFileUrl: url, sourceFileKey: key });
      const extra = files.length > 1 ? `（已选 ${files.length} 个文件，使用第一个作为版式参考）` : "";
      toast.success(`版式包上传成功${extra}，AI 正在分析风格...`);
      setShowPackUpload(false);
      setPackNameInput("");
      refetchPacks();
    } catch (err: any) {
      toast.error("上传失败：" + err.message);
    } finally {
      setUploadingPack(false);
    }
  };

  // 按页模式：为指定页上传素材图（最多 5 张）
  const handlePerPageFiles = async (files: FileList, pageIdx: number) => {
    if (files.length === 0) return;
    const existing = perPageAssets[pageIdx] ?? [];
    const remaining = 5 - existing.length;
    if (remaining <= 0) { toast.error(`第 ${pageIdx + 1} 页已达上限（5 张）`); return; }
    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploadingAsset(true);
    setUploadProgress(0);
    const total = filesToUpload.length;
    let done = 0;
    const newUrls: string[] = [];
    try {
      for (const file of filesToUpload) {
        const { url } = await uploadFile(file);
        newUrls.push(url);
        done++;
        setUploadProgress(Math.round((done / total) * 100));
      }
      setPerPageAssets((prev) => ({ ...prev, [pageIdx]: [...(prev[pageIdx] ?? []), ...newUrls] }));
      toast.success(`第 ${pageIdx + 1} 页已添加 ${newUrls.length} 张素材图`);
    } catch (err: any) {
      toast.error("上传失败：" + err.message);
    } finally {
      setUploadingAsset(false);
      setUploadProgress(0);
    }
  };

  // 按类型模式：上传文件夹（自动按文件夹名分组）或指定类型名称上传
  const handleByTypeFiles = async (files: FileList, typeName?: string) => {
    if (files.length === 0) return;
    // 如果没有指定 typeName，尝试从文件路径提取文件夹名
    const fileArray = Array.from(files);
    // 按文件夹名分组
    const grouped: Record<string, File[]> = {};
    for (const file of fileArray) {
      // webkitRelativePath 格式：「文件夹名/文件名」
      const parts = (file as any).webkitRelativePath?.split("/") ?? [];
      const folderName = parts.length >= 2 ? parts[parts.length - 2] : (typeName || "未分类");
      if (!grouped[folderName]) grouped[folderName] = [];
      grouped[folderName].push(file);
    }
    // 如果没有文件夹结构，统一归入指定 typeName
    if (Object.keys(grouped).length === 1 && Object.keys(grouped)[0] === "未分类" && typeName) {
      grouped[typeName] = grouped["未分类"];
      delete grouped["未分类"];
    }
    setUploadingAsset(true);
    setUploadProgress(0);
    const allFiles = fileArray.length;
    let done = 0;
    try {
      const newGroups: Record<string, string[]> = {};
      for (const [fName, fFiles] of Object.entries(grouped)) {
        const urls: string[] = [];
        for (const file of fFiles.filter((f) => f.type.startsWith("image/"))) {
          const { url } = await uploadFile(file);
          urls.push(url);
          done++;
          setUploadProgress(Math.round((done / allFiles) * 100));
        }
        if (urls.length > 0) newGroups[fName] = urls;
      }
      setByTypeGroups((prev) => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(newGroups)) {
          merged[k] = [...(merged[k] ?? []), ...v];
        }
        return merged;
      });
      const totalAdded = Object.values(newGroups).flat().length;
      const groupNames = Object.keys(newGroups).join("、");
      toast.success(`已添加 ${totalAdded} 张素材图（类型：${groupNames}）`);
      setNewTypeName("");
    } catch (err: any) {
      toast.error("上传失败：" + err.message);
    } finally {
      setUploadingAsset(false);
      setUploadProgress(0);
    }
  };

  const handleGenerate = () => {
    if (!contentText.trim()) { toast.error("请输入内容描述"); return; }
    setGenerating(true);
    // 构建 assetConfig
    let assetConfig: { mode: "per_page"; pages: Record<string, string[]> } | { mode: "by_type"; groups: Record<string, string[]> } | undefined;
    if (assetMode === "per_page") {
      const hasAssets = Object.values(perPageAssets).some((v) => v.length > 0);
      if (hasAssets) {
        assetConfig = {
          mode: "per_page",
          pages: Object.fromEntries(Object.entries(perPageAssets).map(([k, v]) => [k, v])),
        };
      }
    } else {
      const hasAssets = Object.values(byTypeGroups).some((v) => v.length > 0);
      if (hasAssets) {
        assetConfig = { mode: "by_type", groups: byTypeGroups };
      }
    }
    generateMutation.mutate({
      packId: stylePrompt ? undefined : selectedPackId, // 有提示词时不传 packId
      stylePrompt: stylePrompt.trim() || undefined,
      docType: docType as "brand_manual" | "product_detail" | "project_board" | "custom",
      pageCount,
      aspectRatio,
      contentText: contentText.trim(),
      assetConfig,
      title: titleInput.trim() || undefined,
      imageToolId: imageToolId ?? undefined,
    });
  };

  const handleClickBlock = (block: TextBlock) => {
    setEditingBlock(block);
    setEditingPageIndex(currentPage);
    setNewText(block.text);
  };

  const handleConfirmEdit = () => {
    if (!activeJobId || !editingBlock || !newText.trim()) return;
    setInpaintingBlockId(editingBlock.id);
    setEditingBlock(null);
    inpaintMutation.mutate({
      jobId: activeJobId,
      pageIndex: editingPageIndex,
      blockId: editingBlock.id,
      newText: newText.trim(),
      imageToolId: imageToolId ?? undefined,
    });
  };

   const pages = (activeJob?.pages ?? []) as PageData[];
  const currentPageData = pages[currentPage];
  const activeAspectRatio = activeJob?.aspectRatio || aspectRatio;

  // Help dialog state
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0F0F0F]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/8 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#B87333]/20 flex items-center justify-center">
          <LayoutTemplate className="w-4 h-4 text-[#B87333]" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-white">图文排版</h1>
          <p className="text-xs text-white/40">AI 生成整页图文排版，点击文字区域可局部重绘编辑</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHelp(true)}
          className="h-8 w-8 p-0 text-white/30 hover:text-white/70 hover:bg-white/8 rounded-lg"
          title="使用说明"
        >
          <HelpCircle className="w-4.5 h-4.5" />
        </Button>
      </div>

      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl bg-[#1A1A1A] border-white/10 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-semibold flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#B87333]" />
              图文排版——使用说明
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 text-sm text-white/80 pb-2">

            {/* Overview */}
            <div className="bg-[#B87333]/10 border border-[#B87333]/20 rounded-lg p-4">
              <p className="text-white/90 leading-relaxed">
                图文排版模块可以根据你提供的文字内容和素材图片，自动生成具有专业排版的整页图片——文字、色块、图形、照片全部融入同一张图片中。适用于生成品牌手册、项目图板、商品详情页等多种场景。
              </p>
            </div>

            {/* Step 1 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[#B87333] text-white text-xs flex items-center justify-center font-bold shrink-0">1</span>
                <h3 className="font-semibold text-white">选择或创建版式包</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-white/70">
                <p>左侧「版式包」区域存放你的版式风格库。点击「新建版式包」可以上传参考图片，让 AI 学习其排版风格、配色和字体特征。</p>
                <p>支持上传多张图片或整个文件夹，上传后 AI 会自动提取风格指南（包含配色、字体、排版特征）。</p>
                <p>已创建的版式包可在不同生成任务中复用。</p>
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[#B87333] text-white text-xs flex items-center justify-center font-bold shrink-0">2</span>
                <h3 className="font-semibold text-white">填写内容与设置</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-white/70">
                <p><span className="text-white/90">文档类型：</span>可选择品牌手册、项目图板、商品详情页或自定义，不同类型会影响 AI 的排版逻辑和内容组织方式。</p>
                <p><span className="text-white/90">页面数量：</span>支持 1–8 页，多页时 AI 会自动规划每页的内容分配。</p>
                <p><span className="text-white/90">图幅比例：</span>3:4（竞屏展示）、A4（文档打印）、16:9（宽屏展示）等多种选项，导出 PDF 时页面尺寸会自动匹配。</p>
                <p><span className="text-white/90">内容描述：</span>详细描述你希望展示的主题、关键信息和风格假设。内容越具体，生成质量越高。</p>
                <p><span className="text-white/90">素材图片：</span>可选择上传你希望融入排版的实景照片或产品图片， AI 会将其嵌入到合适的版面位置。</p>
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[#B87333] text-white text-xs flex items-center justify-center font-bold shrink-0">3</span>
                <h3 className="font-semibold text-white">生成与预览</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-white/70">
                <p>点击「生成排版」后， AI 会先规划每页的文字块布局，再逐页生成整页图片。多页文档会逐页完成，右侧预览区会实时更新。</p>
                <p>预览区可用左右箭头按鈕切换页面，也可点击左侧缩略图快速跳转。</p>
              </div>
            </div>

            {/* Step 4 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[#B87333] text-white text-xs flex items-center justify-center font-bold shrink-0">4</span>
                <h3 className="font-semibold text-white">局部重绘修改文案</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-white/70">
                <p>生成完成后，预览区会在图片上叠加透明文字热区。将鼠标悬停在文字区域时，会显示文字内容和编辑图标。</p>
                <p>点击文字区域后，在弹出的编辑框中输入新文案，点击「重绘」。AI 会以局部重绘（Inpainting）的方式，仅替换该文字区域的内容，保留其余画面不变。</p>
                <p className="text-white/50 text-xs">提示：重绘需要 10–30 秒，请耐心等待。如果效果不理想，可再次点击重绘。</p>
              </div>
            </div>

            {/* Step 5 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-[#B87333] text-white text-xs flex items-center justify-center font-bold shrink-0">5</span>
                <h3 className="font-semibold text-white">导出与下载</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-white/70">
                <p><span className="text-white/90">导出图片：</span>将所有页面打包为 ZIP 文件下载，图片按 page-01、page-02 依次命名，适合展示和分享。</p>
                <p><span className="text-white/90">导出 PDF：</span>将所有页面合并为一个 PDF 文件，页面尺寸自动匹配所选图幅比例，适合打印和正式提交。</p>
              </div>
            </div>

            {/* Tips */}
            <div className="border-t border-white/8 pt-4">
              <h3 className="font-semibold text-white mb-2">使用建议</h3>
              <div className="space-y-1.5 text-white/60">
                <p>• 版式包的参考图越多、风格越统一，AI 学习效果越好，建议上传 5–10 张同一风格的参考图。</p>
                <p>• 内容描述中建议包含：主题、核心信息点（标题/副标题/正文）、希望的调性或氛围。</p>
                <p>• 如果生成结果不理想，可修改内容描述后重新生成，每次生成都会保存在历史记录中。</p>
                <p>• 局部重绘适合微调文案，如需大幅修改排版风格，建议重新生成。</p>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-72 border-r border-white/8 flex flex-col overflow-y-auto shrink-0">
          {/* Style Packs */}
          <div className="p-4 border-b border-white/8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-[#B87333]" />
                <span className="text-xs font-medium text-white/70">版式包</span>
              </div>
              <div role="button" tabIndex={0} onClick={() => setShowPackUpload(true)}
                className="flex items-center gap-1 text-[10px] text-[#B87333] hover:text-[#D4956B] cursor-pointer">
                <Plus className="w-3 h-3" />上传学习
              </div>
            </div>
            <div
              onClick={() => setSelectedPackId(undefined)}
              className={`mb-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all ${
                !selectedPackId ? "border-[#B87333]/60 bg-[#B87333]/8 text-white" : "border-white/8 text-white/40 hover:border-white/15"
              }`}
            >
              默认风格（不使用版式包）
            </div>
            {(stylePacks as StylePack[]).length === 0 ? (
              <p className="text-[11px] text-white/30 text-center py-2">暂无版式包，上传参考文件开始学习</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(stylePacks as StylePack[]).map((pack) => (
                  <StylePackCard key={pack.id} pack={pack} selected={selectedPackId === pack.id}
                    onSelect={() => setSelectedPackId(pack.id)}
                    onDelete={() => deletePackMutation.mutate({ id: pack.id })}
                    onRetry={() => retryPackMutation.mutate({ id: pack.id })} />
                ))}
              </div>
            )}

            {/* 风格提示词提取区域 */}
            <div className="mt-4 pt-4 border-t border-white/8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-white/70">风格提示词</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!selectedPackId) {
                      toast.error("请先选择一个版式包");
                      return;
                    }
                    const pack = (stylePacks as StylePack[]).find(p => p.id === selectedPackId);
                    if (!pack || pack.status !== "done") {
                      toast.error("请等待版式包提取完成");
                      return;
                    }
                    setExtractingPrompt(true);
                    extractPromptMutation.mutate({ packId: selectedPackId });
                  }}
                  disabled={extractingPrompt || !selectedPackId}
                  className="h-7 text-[10px] border-[#B87333]/40 text-[#B87333] hover:bg-[#B87333]/10"
                >
                  {extractingPrompt ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      提取中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" />
                      提取提示词
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                placeholder="点击“提取提示词”按钮从选中的版式包中提取风格描述，或直接输入你的风格要求。提示词会直接传给图像模型，指导生成风格。"
                className="min-h-[100px] text-xs bg-black/20 border-white/8 text-white/90 placeholder:text-white/30 resize-none"
              />
              <p className="text-[10px] text-white/40 mt-1.5">
                提示：提取后可以编辑提示词，或直接输入你的风格要求。如果你在下方的内容描述中包含配色/版式要求，会自动覆盖这里的提示词。
              </p>
            </div>
          </div>

          {/* Generate Config */}
          <div className="p-4 flex flex-col gap-4">
            {/* Doc type */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">文档类型</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {DOC_TYPES.map(({ value, label, icon: Icon }) => (
                  <div key={value} onClick={() => setDocType(value)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border cursor-pointer text-xs transition-all ${
                      docType === value ? "border-[#B87333]/60 bg-[#B87333]/8 text-white" : "border-white/8 text-white/40 hover:border-white/15"
                    }`}>
                    <Icon className="w-3 h-3 shrink-0" />{label}
                  </div>
                ))}
              </div>
            </div>

            {/* Aspect ratio */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 flex items-center gap-1.5">
                <Maximize2 className="w-3 h-3" />图幅
              </Label>
              <div className="grid grid-cols-4 gap-1">
                {ASPECT_RATIOS.map(({ value, label, desc }) => (
                  <div key={value} onClick={() => setAspectRatio(value)}
                    title={desc}
                    className={`flex flex-col items-center justify-center px-1 py-1.5 rounded-lg border cursor-pointer text-[10px] transition-all ${
                      aspectRatio === value ? "border-[#B87333]/60 bg-[#B87333]/8 text-white" : "border-white/8 text-white/40 hover:border-white/15"
                    }`}>
                    <span className="font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Page count */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 flex items-center justify-between">
                <span>页数</span><span className="text-white font-medium">{pageCount} 页</span>
              </Label>
              <Slider min={1} max={10} step={1} value={[pageCount]} onValueChange={([v]) => setPageCount(v)} className="w-full" />
            </div>

            {/* Title */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">标题（可选）</Label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
                placeholder="如：N+1 STUDIOS 品牌手册"
                className="bg-white/5 border-white/10 text-white text-sm h-8" />
            </div>

            {/* Content */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">内容描述</Label>
              <Textarea value={contentText} onChange={(e) => setContentText(e.target.value)}
                placeholder="描述你想生成的图文内容，例如：N+1 STUDIOS 是一家专注于科技制造业办公空间设计的建筑事务所，团队6人..."
                className="bg-white/5 border-white/10 text-white text-sm min-h-[100px] resize-none" />
            </div>

            {/* Asset images - 双模式素材图上传 */}
            <div>
              <Label className="text-xs text-white/50 mb-2 block">素材图（可选）</Label>
              {/* 模式切换 */}
              <div className="flex gap-1 mb-3">
                <button
                  type="button"
                  onClick={() => setAssetMode("per_page")}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                    assetMode === "per_page"
                      ? "bg-[#B87333]/20 text-[#B87333] border border-[#B87333]/30"
                      : "bg-white/5 text-white/40 border border-white/8 hover:text-white/60"
                  }`}
                >按页上传</button>
                <button
                  type="button"
                  onClick={() => setAssetMode("by_type")}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                    assetMode === "by_type"
                      ? "bg-[#B87333]/20 text-[#B87333] border border-[#B87333]/30"
                      : "bg-white/5 text-white/40 border border-white/8 hover:text-white/60"
                  }`}
                >按类型文件夹</button>
              </div>

              {/* 按页模式 */}
              {assetMode === "per_page" && (
                <div>
                  {/* 页码标签 */}
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {Array.from({ length: pageCount }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setAssetPageTab(i)}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                          assetPageTab === i
                            ? "bg-white/15 text-white"
                            : "bg-white/5 text-white/40 hover:text-white/60"
                        }`}
                      >
                        第{i + 1}页
                        {(perPageAssets[i]?.length ?? 0) > 0 && (
                          <span className="ml-1 text-[#B87333]">({perPageAssets[i].length})</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {/* 当前页素材图 */}
                  <div className="flex flex-wrap gap-1.5">
                    {(perPageAssets[assetPageTab] ?? []).map((url: string, i: number) => (
                      <div key={i} className="relative w-12 h-12 rounded overflow-hidden group">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <div
                          role="button" tabIndex={0}
                          onClick={() => setPerPageAssets((prev) => ({
                            ...prev,
                            [assetPageTab]: (prev[assetPageTab] ?? []).filter((_: string, j: number) => j !== i)
                          }))}
                          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    ))}
                    {(perPageAssets[assetPageTab]?.length ?? 0) < 5 && (
                      <div
                        role="button" tabIndex={0}
                        onClick={() => assetInputRef.current?.click()}
                        className="w-12 h-12 rounded border border-dashed border-white/15 flex items-center justify-center cursor-pointer hover:border-white/30 transition-colors"
                        title="添加素材图（最多 5 张）"
                      >
                        {uploadingAsset ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Loader2 className="w-3 h-3 text-white/40 animate-spin" />
                            {uploadProgress > 0 && <span className="text-[8px] text-white/30">{uploadProgress}%</span>}
                          </div>
                        ) : <Plus className="w-3 h-3 text-white/30" />}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-white/25 mt-1.5">每页最多 5 张，AI 会将该页素材融入排版</p>
                  <button
                    type="button"
                    onClick={() => { setAssetPickerMode("per_page"); setAssetPickerOpen(true); }}
                    className="mt-1.5 w-full py-1.5 rounded-md border border-dashed border-white/15 text-[10px] text-white/40 hover:text-white/60 hover:border-white/25 transition-colors flex items-center justify-center gap-1"
                  >
                    <Library className="w-3 h-3" />从素材库选择
                  </button>
                  <input ref={assetInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { if (e.target.files?.length) handlePerPageFiles(e.target.files, assetPageTab); e.target.value = ""; }} />
                </div>
              )}

              {/* 按类型模式 */}
              {assetMode === "by_type" && (
                <div className="space-y-2">
                  {/* 已添加的类型组 */}
                  {Object.entries(byTypeGroups).map(([typeName, urls]) => (
                    <div key={typeName} className="bg-white/4 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-white/70 font-medium">{typeName}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-white/30">{urls.length} 张</span>
                          <button
                            type="button"
                            onClick={() => setByTypeGroups((prev) => { const n = { ...prev }; delete n[typeName]; return n; })}
                            className="text-white/20 hover:text-white/50 transition-colors"
                          ><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {urls.slice(0, 6).map((url: string, i: number) => (
                          <div key={i} className="relative w-9 h-9 rounded overflow-hidden group">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <div
                              role="button" tabIndex={0}
                              onClick={() => setByTypeGroups((prev) => ({
                                ...prev,
                                [typeName]: prev[typeName].filter((_: string, j: number) => j !== i)
                              }))}
                              className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                            ><Trash2 className="w-2.5 h-2.5 text-white" /></div>
                          </div>
                        ))}
                        {urls.length > 6 && <span className="text-[10px] text-white/30 self-center">+{urls.length - 6}</span>}
                      </div>
                    </div>
                  ))}
                  {/* 上传文件夹按钮 */}
                  <button
                    type="button"
                    onClick={() => assetFolderRef.current?.click()}
                    className="w-full py-2 rounded-lg border border-dashed border-white/15 text-xs text-white/40 hover:text-white/60 hover:border-white/25 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {uploadingAsset ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />上传中 {uploadProgress > 0 ? `${uploadProgress}%` : ""}</>
                    ) : (
                      <><FolderOpen className="w-3 h-3" />上传文件夹（自动按文件夹名分组）</>
                    )}
                  </button>
                  {/* 手动指定类型名称上传 */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="类型名称（如：室内实景）"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white placeholder-white/25 outline-none focus:border-white/20"
                    />
                    <button
                      type="button"
                      disabled={!newTypeName.trim() || uploadingAsset}
                      onClick={() => byTypeFileRef.current?.click()}
                      className="px-2 py-1 bg-white/8 rounded-md text-xs text-white/50 hover:text-white/70 disabled:opacity-30 transition-colors"
                    ><Upload className="w-3 h-3" /></button>
                  </div>
                  {/* 从素材库选择（按类型） */}
                  <button
                    type="button"
                    onClick={() => { setAssetPickerMode("by_type"); setAssetPickerOpen(true); }}
                    className="w-full py-2 rounded-lg border border-dashed border-white/15 text-xs text-white/40 hover:text-white/60 hover:border-white/25 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Library className="w-3 h-3" />从素材库选择图片
                  </button>
                  <p className="text-[10px] text-white/25">上传文件夹时自动按文件夹名分组，AI 会根据每页主题选择合适的素材</p>
                  <input ref={assetFolderRef} type="file" accept="image/*" multiple className="hidden"
                    // @ts-ignore
                    webkitdirectory="" directory=""
                    onChange={(e) => { if (e.target.files?.length) handleByTypeFiles(e.target.files); e.target.value = ""; }} />
                  <input ref={byTypeFileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { if (e.target.files?.length) handleByTypeFiles(e.target.files, newTypeName.trim() || "未分类"); e.target.value = ""; }} />
                </div>
              )}
            </div>

            {/* AI Tool Selector */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">图像生成工具</Label>
              <AiToolSelector
                capability="rendering"
                value={imageToolId}
                onChange={(id) => setImageToolId(id ?? undefined)}
                label="图像生成工具"
                showBuiltIn={true}
              />
            </div>

            <Button onClick={handleGenerate} disabled={generating || !contentText.trim()}
              className="w-full bg-[#B87333] hover:bg-[#D4956B] text-white font-medium">
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</> : <><Sparkles className="w-4 h-4 mr-2" />生成排版</>}
            </Button>
          </div>
        </div>

        {/* Center Panel: Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activeJobId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                <LayoutTemplate className="w-8 h-8 text-white/20" />
              </div>
              <div>
                <p className="text-white/40 text-sm">在左侧配置内容后点击「生成排版」</p>
                <p className="text-white/20 text-xs mt-1">生成后可点击图片中的文字区域进行局部重绘编辑</p>
              </div>
            </div>
          ) : !activeJob ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-[#B87333] animate-spin" />
            </div>
          ) : activeJob.status === "processing" || activeJob.status === "pending" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-[#B87333] animate-spin" />
              <div className="text-center">
                <p className="text-white/60 text-sm">AI 正在生成图文排版...</p>
                <p className="text-white/30 text-xs mt-1">每页约需 15-30 秒，请耐心等待</p>
              </div>
            </div>
          ) : activeJob.status === "failed" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-red-400 text-sm">生成失败</p>
              <p className="text-white/30 text-xs">{activeJob.errorMessage}</p>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white/30 text-sm">暂无页面数据</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Page nav */}
              <div className="px-6 py-3 border-b border-white/8 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/60">{activeJob.title || DOC_TYPES.find(d => d.value === activeJob.docType)?.label}</span>
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/40">{pages.length} 页</Badge>
                  {activeAspectRatio && (
                    <Badge variant="outline" className="text-[10px] border-white/10 text-white/30">{activeAspectRatio}</Badge>
                  )}
                  {currentPageData?.textBlocks && currentPageData.textBlocks.length > 0 && (
                    <Badge variant="outline" className="text-[10px] border-[#B87333]/30 text-[#B87333]/60">
                      <Pencil className="w-2.5 h-2.5 mr-1" />悬停文字可编辑
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* 导出图片按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportImages}
                    disabled={exportingImages}
                    className="h-7 px-2.5 border-white/15 text-white/60 bg-transparent hover:bg-white/8 hover:text-white text-xs"
                  >
                    {exportingImages ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />导出中...</>
                    ) : (
                      <><Images className="w-3.5 h-3.5 mr-1.5" />导出图片</>
                    )}
                  </Button>
                  {/* 导出 PDF 按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                    className="h-7 px-2.5 border-white/15 text-white/60 bg-transparent hover:bg-white/8 hover:text-white text-xs"
                  >
                    {exportingPdf ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />导出中...</>
                    ) : (
                      <><FileDown className="w-3.5 h-3.5 mr-1.5" />导出 PDF</>
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0} className="h-7 w-7 p-0 text-white/40">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-white/40">{currentPage + 1} / {pages.length}</span>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                    disabled={currentPage === pages.length - 1} className="h-7 w-7 p-0 text-white/40">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Page preview */}
              <div className="flex-1 overflow-y-auto p-6 flex items-start justify-center">
                <div className="w-full max-w-sm">
                  {currentPageData && (
                    <PageImageViewer
                      page={currentPageData}
                      aspectRatio={activeAspectRatio}
                      onClickBlock={handleClickBlock}
                      inpaintingBlockId={inpaintingBlockId}
                    />
                  )}
                </div>
              </div>

              {/* Page strip */}
              <div className="px-6 py-3 border-t border-white/8 flex gap-2 overflow-x-auto shrink-0">
                {pages.map((page, i) => {
                  const thumbRatio = RATIO_CSS[activeAspectRatio] || "3/4";
                  return (
                    <div key={i} onClick={() => setCurrentPage(i)}
                      className={`relative shrink-0 rounded overflow-hidden cursor-pointer border-2 transition-all ${
                        i === currentPage ? "border-[#B87333]" : "border-transparent hover:border-white/20"
                      }`}
                      style={{ width: "56px", aspectRatio: thumbRatio }}>
                      {page.imageUrl ? (
                        <img src={page.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full" style={{ backgroundColor: page.backgroundColor || "#1a1a1a" }} />
                      )}
                      <div className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/60 text-white/60 px-1 rounded">{page.pageIndex + 1}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: History */}
        <div className="w-64 border-l border-white/8 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-white/8 shrink-0">
            <span className="text-xs font-medium text-white/50">历史记录</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {(jobs as LayoutJob[]).length === 0 ? (
              <p className="text-[11px] text-white/25 text-center py-4">暂无记录</p>
            ) : (
              (jobs as LayoutJob[]).map((job) => {
                const isExpanded = selectedHistoryJobId === job.id;
                const isActive = activeJobId === job.id;
                const jobPages = (job.pages ?? []) as PageData[];
                const firstPageThumb = jobPages[0]?.imageUrl;
                return (
                  <div key={job.id} className={`rounded-lg border transition-all ${
                    isActive ? "border-[#B87333]/50" : "border-white/8"
                  }`}>
                    {/* 卡片头部 */}
                    <div
                      onClick={() => {
                        setActiveJobId(job.id);
                        setCurrentPage(0);
                        setSelectedHistoryJobId(isExpanded ? undefined : job.id);
                      }}
                      className={`group p-2.5 cursor-pointer transition-all ${
                        isActive ? "bg-[#B87333]/5" : "hover:bg-white/3"
                      } rounded-t-lg ${!isExpanded ? "rounded-b-lg" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        {/* 缩略图 */}
                        {firstPageThumb && (
                          <div className="w-8 h-10 rounded overflow-hidden shrink-0 mr-1.5">
                            <img src={firstPageThumb} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {renamingJobId === job.id ? (
                            <input
                              autoFocus
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") updateJobMutation.mutate({ id: job.id, title: renameInput.trim() || undefined });
                                if (e.key === "Escape") { setRenamingJobId(undefined); setRenameInput(""); }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-xs bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white outline-none"
                            />
                          ) : (
                            <p className="text-xs text-white/70 truncate">
                              {job.title || DOC_TYPES.find(d => d.value === job.docType)?.label || "排版"}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {job.status === "done" ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-0">完成</Badge>
                            ) : job.status === "failed" ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-red-500/20 text-red-400 border-0">失败</Badge>
                            ) : (
                              <Badge className="text-[9px] px-1.5 py-0 bg-[#B87333]/20 text-[#B87333] border-0">生成中</Badge>
                            )}
                            <span className="text-[9px] text-white/25">
                              {new Date(job.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {isExpanded
                            ? <ChevronUp className="w-3 h-3 text-white/30" />
                            : <ChevronDown className="w-3 h-3 text-white/20 opacity-0 group-hover:opacity-100" />
                          }
                        </div>
                      </div>
                    </div>

                    {/* 展开的详情面板 */}
                    {isExpanded && (
                      <div className="border-t border-white/8 p-2.5 flex flex-col gap-2">
                        {/* 页面缩略图列表 */}
                        {jobPages.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {jobPages.map((page) => (
                              <div key={page.pageIndex} className="relative w-10 rounded overflow-hidden" style={{ aspectRatio: RATIO_CSS[job.aspectRatio || "3:4"] || "3/4" }}>
                                {page.imageUrl ? (
                                  <img src={page.imageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-white/5" />
                                )}
                                <div className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/60 text-white/60 px-0.5 rounded">{page.pageIndex + 1}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 参数信息 */}
                        <div className="text-[10px] text-white/35 space-y-0.5">
                          {job.aspectRatio && <div>图幅：{job.aspectRatio}</div>}
                          {job.pageCount && <div>页数：{job.pageCount} 页</div>}
                          {job.docType && <div>类型：{DOC_TYPES.find(d => d.value === job.docType)?.label}</div>}
                        </div>

                        {/* 关联项目 */}
                        <div>
                          <div className="text-[10px] text-white/35 mb-1 flex items-center gap-1">
                            <Folder className="w-2.5 h-2.5" />关联项目
                          </div>
                          <Select
                            value={""}
                            onValueChange={(val) => {
                              if (val && val !== "__none__") {
                                saveToAssetsMutation.mutate({ jobId: job.id, category: "graphic_layout", projectId: Number(val) });
                                toast.success("已保存到素材库并关联项目");
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-[10px] border-white/15 bg-transparent text-white/50 hover:text-white">
                              <SelectValue placeholder="选择项目并保存..." />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-white/15 text-white">
                              {(projectsData as any[]).length === 0 ? (
                                <div className="px-2 py-3 text-xs text-white/40 text-center">暂无项目</div>
                              ) : (
                                (projectsData as any[]).map((p: any) => (
                                  <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex flex-col gap-1.5">
                          {/* 查看按钮 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setActiveJobId(job.id); setCurrentPage(0); }}
                            className="h-7 text-[10px] w-full border-white/15 text-white/60 bg-transparent hover:bg-white/8 hover:text-white justify-start gap-1.5"
                          >
                            <Eye className="w-3 h-3" />查看排版
                          </Button>

                          {/* 继续编辑按钮 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleContinueEdit(job)}
                            className="h-7 text-[10px] w-full border-[#B87333]/30 text-[#B87333] bg-transparent hover:bg-[#B87333]/10 justify-start gap-1.5"
                          >
                            <RotateCcw className="w-3 h-3" />继续编辑
                          </Button>

                          {/* 重命名按钮 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingJobId(job.id);
                              setRenameInput(job.title || "");
                            }}
                            className="h-7 text-[10px] w-full border-white/15 text-white/50 bg-transparent hover:bg-white/8 hover:text-white justify-start gap-1.5"
                          >
                            <Pencil className="w-3 h-3" />重命名
                          </Button>

                          {/* 保存到素材库按钮 */}
                          {job.status === "done" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingToAssets}
                              onClick={() => {
                                setSavingToAssets(true);
                                saveToAssetsMutation.mutate({ jobId: job.id, category: "graphic_layout" });
                              }}
                              className="h-7 text-[10px] w-full border-white/15 text-white/50 bg-transparent hover:bg-white/8 hover:text-white justify-start gap-1.5"
                            >
                              {savingToAssets ? <Loader2 className="w-3 h-3 animate-spin" /> : <Library className="w-3 h-3" />}
                              保存到素材库
                            </Button>
                          )}

                          {/* 删除按钮 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("确定删除这条排版记录？")) {
                                deleteJobMutation.mutate({ id: job.id });
                                if (selectedHistoryJobId === job.id) setSelectedHistoryJobId(undefined);
                              }
                            }}
                            className="h-7 text-[10px] w-full border-red-500/20 text-red-400/60 bg-transparent hover:bg-red-500/10 hover:text-red-400 justify-start gap-1.5"
                          >
                            <Trash2 className="w-3 h-3" />删除记录
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pack Upload Dialog */}
      <Dialog open={showPackUpload} onOpenChange={setShowPackUpload}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">上传版式参考文件</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">版式包名称</Label>
              <Input value={packNameInput} onChange={(e) => setPackNameInput(e.target.value)}
                placeholder="如：N+1 品牌手册风格"
                className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-xs text-white/50 mb-1.5 block">上传文件</Label>
              <div className="grid grid-cols-2 gap-2">
                <div role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 rounded-xl p-4 text-center cursor-pointer hover:border-[#B87333]/40 transition-colors">
                  {uploadingPack ? (
                    <Loader2 className="w-5 h-5 text-[#B87333] animate-spin mx-auto" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-white/30 mx-auto mb-1.5" />
                      <p className="text-[11px] text-white/40">选择文件</p>
                      <p className="text-[10px] text-white/20 mt-0.5">PDF / 图片（可多选）</p>
                    </>
                  )}
                </div>
                <div role="button" tabIndex={0} onClick={() => folderInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 rounded-xl p-4 text-center cursor-pointer hover:border-[#B87333]/40 transition-colors">
                  <FolderOpen className="w-5 h-5 text-white/30 mx-auto mb-1.5" />
                  <p className="text-[11px] text-white/40">选择文件夹</p>
                  <p className="text-[10px] text-white/20 mt-0.5">上传整个文件夹</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) handlePackFilesUpload(e.target.files); e.target.value = ""; }} />
              <input ref={folderInputRef} type="file" accept="image/*,.pdf"
                // @ts-ignore
                webkitdirectory="" directory="" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) handlePackFilesUpload(e.target.files); e.target.value = ""; }} />
            </div>
            <p className="text-[11px] text-white/30">
              AI 将分析文件的配色、字体、排版模式，生成可复用的版式风格包。
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Text Block Edit Dialog */}
      <Dialog open={!!editingBlock} onOpenChange={(open) => { if (!open) { setEditingBlock(null); setNewText(""); } }}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-[#B87333]" />
              编辑文字
            </DialogTitle>
          </DialogHeader>
          {editingBlock && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-white/15 text-white/50 capitalize">
                  {editingBlock.role}
                </Badge>
                <span className="text-[11px] text-white/30">原文字：{editingBlock.text}</span>
              </div>
              <div>
                <Label className="text-xs text-white/50 mb-1.5 block">新文案</Label>
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="输入新的文字内容..."
                  className="bg-white/5 border-white/10 text-white text-sm min-h-[80px] resize-none"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-white/30">
                AI 将对该文字区域进行局部重绘，保持周围图像不变，仅更新文字内容。
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setEditingBlock(null); setNewText(""); }}
                  className="flex-1 border-white/15 text-white/60 bg-transparent hover:bg-white/5">
                  取消
                </Button>
                <Button onClick={handleConfirmEdit} disabled={!newText.trim() || inpaintMutation.isPending}
                  className="flex-1 bg-[#B87333] hover:bg-[#D4956B] text-white">
                  {inpaintMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />重绘中...</> : "确认重绘"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 素材库选择器 */}
      <AssetPickerDialog
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        title={assetPickerMode === "per_page" ? `从素材库选择（第 ${assetPageTab + 1} 页）` : "从素材库选择图片"}
        onSelect={(url, name) => {
          if (assetPickerMode === "per_page") {
            const existing = perPageAssets[assetPageTab] ?? [];
            if (existing.length >= 5) { toast.error(`第 ${assetPageTab + 1} 页已达上限（5 张）`); return; }
            if (existing.includes(url)) { toast.error("该素材已添加"); return; }
            setPerPageAssets((prev) => ({ ...prev, [assetPageTab]: [...(prev[assetPageTab] ?? []), url] }));
            toast.success(`已添加素材到第 ${assetPageTab + 1} 页`);
          } else {
            // 按类型模式：先记录 URL，弹出命名对话框
            setPendingAssetUrl(url);
            setPendingAssetName(name);
            setByTypeNameInput(newTypeName.trim() || "");
            setByTypeNameDialogOpen(true);
          }
        }}
      />

      {/* 按类型模式：命名对话框 */}
      <Dialog open={byTypeNameDialogOpen} onOpenChange={(v) => !v && setByTypeNameDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>指定素材类型</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">请为此素材指定类型名称（如：室内实景、产品图），AI 会根据每页主题选择合适的素材。</p>
          <Input
            value={byTypeNameInput}
            onChange={(e) => setByTypeNameInput(e.target.value)}
            placeholder="类型名称（如：室内实景）"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && byTypeNameInput.trim()) {
                const tName = byTypeNameInput.trim();
                if (pendingAssetUrl) {
                  setByTypeGroups((prev) => ({
                    ...prev,
                    [tName]: [...(prev[tName] ?? []), pendingAssetUrl],
                  }));
                  toast.success(`已添加到「${tName}」`);
                }
                setPendingAssetUrl(null); setPendingAssetName(null);
                setByTypeNameDialogOpen(false);
              }
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setPendingAssetUrl(null); setPendingAssetName(null); setByTypeNameDialogOpen(false); }}>取消</Button>
            <Button
              disabled={!byTypeNameInput.trim()}
              onClick={() => {
                const tName = byTypeNameInput.trim();
                if (pendingAssetUrl) {
                  setByTypeGroups((prev) => ({
                    ...prev,
                    [tName]: [...(prev[tName] ?? []), pendingAssetUrl],
                  }));
                  toast.success(`已添加到「${tName}」`);
                }
                setPendingAssetUrl(null); setPendingAssetName(null);
                setByTypeNameDialogOpen(false);
              }}
            >确定</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
