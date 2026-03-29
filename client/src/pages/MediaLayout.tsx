import { useRef, useState, useEffect, useCallback, useMemo } from "react";
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
  BookOpen, Layers, Maximize2, FolderOpen, Pencil
} from "lucide-react";

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
      {containerW > 0 && (page.textBlocks ?? []).map((block) => {
        const left = block.x * scale;
        const top = block.y * scale;
        const width = block.width * scale;
        const height = block.height * scale;
        const isInpainting = inpaintingBlockId === block.id;

        return (
          <div
            key={block.id}
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
  const assetInputRef = useRef<HTMLInputElement>(null);

  // Style Packs
  const { data: stylePacks = [], refetch: refetchPacks } = trpc.graphicStylePacks.list.useQuery();
  const [selectedPackId, setSelectedPackId] = useState<number | undefined>();
  const [uploadingPack, setUploadingPack] = useState(false);
  const [showPackUpload, setShowPackUpload] = useState(false);
  const [packNameInput, setPackNameInput] = useState("");

  const deletePackMutation = trpc.graphicStylePacks.delete.useMutation({
    onSuccess: () => { refetchPacks(); toast.success("版式包已删除"); },
  });
  const retryPackMutation = trpc.graphicStylePacks.retry.useMutation({
    onSuccess: () => { refetchPacks(); toast.success("已重新提取"); },
  });

  useEffect(() => {
    const hasPending = (stylePacks as StylePack[]).some((p) => p.status === "pending" || p.status === "processing");
    if (!hasPending) return;
    const timer = setInterval(() => refetchPacks(), 4000);
    return () => clearInterval(timer);
  }, [stylePacks, refetchPacks]);

  // Generate Form
  const [docType, setDocType] = useState("brand_manual");
  const [pageCount, setPageCount] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [contentText, setContentText] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [assetUrls, setAssetUrls] = useState<string[]>([]);
  const [imageToolId, setImageToolId] = useState<number | undefined>(undefined);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Jobs
  const { data: jobs = [], refetch: refetchJobs } = trpc.graphicLayout.list.useQuery();
  const [activeJobId, setActiveJobId] = useState<number | undefined>();
  const [currentPage, setCurrentPage] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Inpainting state
  const [editingBlock, setEditingBlock] = useState<TextBlock | null>(null);
  const [editingPageIndex, setEditingPageIndex] = useState<number>(0);
  const [newText, setNewText] = useState("");
  const [inpaintingBlockId, setInpaintingBlockId] = useState<string | undefined>();

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
  const { data: activeJobData, refetch: refetchActiveJob } = trpc.graphicLayout.status.useQuery(
    activeJobQueryInput,
    { enabled: !!activeJobId, refetchInterval: activeJobId ? 3000 : false }
  );

  const activeJob = activeJobData as LayoutJob | undefined;

  useEffect(() => {
    if (activeJob?.status === "done" || activeJob?.status === "failed") {
      refetchJobs();
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
      const utils = trpc.useUtils();
      await utils.client.graphicStylePacks.create.mutate({ name: packNameInput.trim(), sourceType, sourceFileUrl: url, sourceFileKey: key });
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

  const handleAssetFiles = async (files: FileList) => {
    if (files.length === 0) return;
    setUploadingAsset(true);
    setUploadProgress(0);
    const total = files.length;
    let done = 0;
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const { url } = await uploadFile(file);
        newUrls.push(url);
        done++;
        setUploadProgress(Math.round((done / total) * 100));
      }
      setAssetUrls((prev) => [...prev, ...newUrls]);
      toast.success(`已添加 ${newUrls.length} 张素材图`);
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
    generateMutation.mutate({
      packId: selectedPackId,
      docType: docType as "brand_manual" | "product_detail" | "project_board" | "custom",
      pageCount,
      aspectRatio,
      contentText: contentText.trim(),
      assetUrls,
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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0F0F0F]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/8 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#B87333]/20 flex items-center justify-center">
          <LayoutTemplate className="w-4 h-4 text-[#B87333]" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">图文排版</h1>
          <p className="text-xs text-white/40">AI 生成整页图文排版，点击文字区域可局部重绘编辑</p>
        </div>
      </div>

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

            {/* Asset images */}
            <div>
              <Label className="text-xs text-white/50 mb-1.5 flex items-center justify-between">
                <span>素材图（可选）</span>
                <span className="text-white/30">{assetUrls.length} 张</span>
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {assetUrls.map((url, i) => (
                  <div key={i} className="relative w-12 h-12 rounded overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <div role="button" tabIndex={0} onClick={() => setAssetUrls((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer">
                      <Trash2 className="w-3 h-3 text-white" />
                    </div>
                  </div>
                ))}
                <div role="button" tabIndex={0} onClick={() => assetInputRef.current?.click()}
                  className="w-12 h-12 rounded border border-dashed border-white/15 flex items-center justify-center cursor-pointer hover:border-white/30 transition-colors"
                  title="点击选择多张图片">
                  {uploadingAsset ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <Loader2 className="w-3 h-3 text-white/40 animate-spin" />
                      {uploadProgress > 0 && <span className="text-[8px] text-white/30">{uploadProgress}%</span>}
                    </div>
                  ) : <Plus className="w-3 h-3 text-white/30" />}
                </div>
              </div>
              <input ref={assetInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleAssetFiles(e.target.files); e.target.value = ""; }} />
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
        <div className="w-52 border-l border-white/8 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-white/8 shrink-0">
            <span className="text-xs font-medium text-white/50">历史记录</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {(jobs as LayoutJob[]).length === 0 ? (
              <p className="text-[11px] text-white/25 text-center py-4">暂无记录</p>
            ) : (
              (jobs as LayoutJob[]).map((job) => (
                <div key={job.id} onClick={() => { setActiveJobId(job.id); setCurrentPage(0); }}
                  className={`group p-2.5 rounded-lg border cursor-pointer transition-all ${
                    activeJobId === job.id ? "border-[#B87333]/50 bg-[#B87333]/5" : "border-white/8 hover:border-white/15"
                  }`}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs text-white/70 truncate flex-1">
                      {job.title || DOC_TYPES.find(d => d.value === job.docType)?.label || "排版"}
                    </p>
                    <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); deleteJobMutation.mutate({ id: job.id }); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {job.status === "done" ? (
                      <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-0">完成</Badge>
                    ) : job.status === "failed" ? (
                      <Badge className="text-[9px] px-1.5 py-0 bg-red-500/20 text-red-400 border-0">失败</Badge>
                    ) : (
                      <Badge className="text-[9px] px-1.5 py-0 bg-[#B87333]/20 text-[#B87333] border-0">生成中</Badge>
                    )}
                    {job.aspectRatio && (
                      <span className="text-[9px] text-white/25">{job.aspectRatio}</span>
                    )}
                    <span className="text-[9px] text-white/25">
                      {new Date(job.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))
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
    </div>
  );
}
