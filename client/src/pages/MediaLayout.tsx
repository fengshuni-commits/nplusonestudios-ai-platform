import { useRef, useState, useEffect, useCallback, useMemo, memo } from "react";
import { useSearch } from "wouter";
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
import { FeedbackButtons } from "@/components/FeedbackButtons";
import {
  LayoutTemplate, Upload, Sparkles, Loader2, Trash2, RefreshCw,
  Plus, ChevronLeft, ChevronRight, Check, Palette,
  BookOpen, Layers, Maximize2, FolderOpen, Pencil, FileDown, Images, HelpCircle,
  Link2, Library, RotateCcw,
  Search, ImageIcon, X
} from "lucide-react";


// ─── Types ───────────────────────────────────────────────────────────────────

type StylePackStatus = "pending" | "processing" | "done" | "failed";
type JobStatus = "pending" | "processing" | "done" | "failed";

interface StylePack {
  id: number;
  name: string;
  sourceType: string;
  status: StylePackStatus;
  sourceFileUrl?: string | null;
  sourceFileUrls?: string[] | null;
  thumbnails?: string[] | null;
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
  savedStylePrompt?: string | null;
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
  compositeImageUrl?: string; // Full image with all text rendered (server-side canvas)
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
  stylePrompt?: string | null;
  modelsUsed?: string[] | null;
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
  fileKey?: string;
  thumbnailUrl: string | null;
  isFolder?: boolean;
};

function AssetPickerDialog({
  open,
  onClose,
  onSelect,
  title = "从素材库选择",
  multiSelect = false,
  onMultiSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, name: string, fileKey?: string) => void;
  title?: string;
  multiSelect?: boolean;
  onMultiSelect?: (items: Array<{ id: number; name: string; fileUrl: string; fileKey: string; thumbnailUrl?: string | null }>) => void;
}) {
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<number | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<Array<{ id: number | undefined; name: string }>>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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
      <DialogContent className="max-w-2xl" style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
        <DialogHeader style={{flexShrink: 0}}>
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
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '320px', overflowY: 'auto', flexShrink: 0}}>
          {filtered.map((asset) => (
            <button
              key={asset.id}
              style={{position: 'relative', width: '100%', paddingBottom: '100%', display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)'}}
              onClick={() => {
                if (asset.isFolder) {
                  handleOpenFolder(asset.id, asset.name);
                } else if (multiSelect) {
                  setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
                    return next;
                  });
                } else {
                  onSelect(asset.fileUrl, asset.name, asset.fileKey);
                  onClose();
                }
              }}
            >
              {asset.isFolder ? (
                <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}}>
                  <FolderOpen className="h-8 w-8 text-amber-500" />
                  <span className="text-xs text-muted-foreground truncate px-1 w-full text-center">{asset.name}</span>
                </div>
              ) : (
                <>
                  <img src={asset.thumbnailUrl || asset.fileUrl} alt={asset.name} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
                  {multiSelect && selectedIds.has(asset.id) ? (
                    <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Check className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
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
        {multiSelect && selectedIds.size > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-sm text-muted-foreground">已选 {selectedIds.size} 张</span>
            <Button size="sm" onClick={() => {
              const items = filtered.filter(a => !a.isFolder && selectedIds.has(a.id)).map(a => ({
                id: a.id, name: a.name, fileUrl: a.fileUrl, fileKey: a.fileKey ?? "", thumbnailUrl: a.thumbnailUrl
              }));
              onMultiSelect?.(items);
              setSelectedIds(new Set());
              onClose();
            }}>确认选择（{selectedIds.size}）</Button>
          </div>
        )}
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
  // Use first available image as square thumbnail
  const thumbUrl: string | null = (
    (pack.thumbnails && pack.thumbnails.length > 0)
      ? pack.thumbnails[0]
      : (pack.sourceFileUrls && pack.sourceFileUrls.length > 0)
        ? pack.sourceFileUrls[0]
        : pack.sourceFileUrl ?? null
  );
  return (
    <div
      onClick={pack.status === "done" ? onSelect : undefined}
      className={`relative flex items-center gap-3 rounded-xl border-2 p-2.5 transition-all group ${
        pack.status === "done" ? "cursor-pointer" : "cursor-default opacity-70"
      } ${selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-border/80"}`}
    >
      {/* Left: info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate leading-tight">{pack.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {pack.status === "processing" || pack.status === "pending" ? "AI 分析中…" :
           pack.status === "failed" ? "提取失败" :
           (pack.sourceFileUrls?.length ?? 1) > 1 ? `${pack.sourceFileUrls!.length} 张参考图` :
           pack.sourceType === "pdf" ? "PDF" : "图片"}
        </p>
        {sg?.styleKeywords && sg.styleKeywords.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {sg.styleKeywords.slice(0, 2).map((kw) => (
              <span key={kw} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{kw}</span>
            ))}
          </div>
        )}
        {pack.status === "failed" && (
          <p className="text-[10px] text-red-400 mt-1 truncate">{pack.errorMessage || "提取失败"}</p>
        )}
      </div>

      {/* Right: square thumbnail */}
      <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center relative">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-contain" />
        ) : sg?.colorPalette ? (
          <div className="w-full h-full grid grid-cols-2">
            {[sg.colorPalette.primary, sg.colorPalette.background, sg.colorPalette.accent, sg.colorPalette.text].map((c, i) => (
              <div key={i} style={{ backgroundColor: `#${(c ?? "888").replace("#", "")}` }} />
            ))}
          </div>
        ) : (
          <div className="w-full h-full bg-muted" />
        )}
        {(pack.status === "processing" || pack.status === "pending") && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        )}
      </div>

      {/* Selected check badge */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow">
          <Check className="w-2.5 h-2.5 text-primary-foreground" />
        </div>
      )}

      {/* Action buttons (hover) */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {pack.status === "failed" && (
          <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="p-1 rounded text-orange-400 hover:bg-orange-400/10 cursor-pointer">
            <RefreshCw className="w-3 h-3" />
          </div>
        )}
        <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer">
          <Trash2 className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}

// ─── Page Image Viewer with Text Block Hotspots ───────────────────────────────

function PageImageViewer({
  page,
  aspectRatio,
  onClickBlock,
  onDeleteBlock,
  inpaintingBlockId,
}: {
  page: PageData;
  aspectRatio: string;
  onClickBlock: (block: TextBlock) => void;
  onDeleteBlock?: (block: TextBlock) => void;
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

  // Display the composite image (with all text rendered) by default.
  // Fall back to raw imageUrl if composite is not yet available.
  const displayImageUrl = page.compositeImageUrl ?? page.imageUrl;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden shadow-2xl"
      style={{ aspectRatio: cssRatio }}
    >
      {/* 整页图片 — 默认显示 compositeImageUrl（带文字），无则退化为纯背景图 */}
      {displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={`第 ${page.pageIndex + 1} 页`}
          className="absolute inset-0 w-full h-full object-fill"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: page.backgroundColor || "#1a1a1a" }} />
      )}

      {/* 文字块热区——透明可点击区域，不显示 HTML 文字（文字已在图片中） */}
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
                ? "ring-2 ring-primary animate-pulse bg-primary/10"
                : "hover:ring-2 hover:ring-white/50 hover:bg-white/5"
            } rounded`}
            style={{ left, top, width, height }}
          >
            {/* 加载中图标 */}
            {isInpainting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
            )}

            {/* 悬停时显示编辑 + 删除图标 */}
            {!isInpainting && (
              <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <div
                  className="w-4 h-4 rounded-full bg-primary flex items-center justify-center"
                  title="编辑文字"
                >
                  <Pencil className="w-2 h-2 text-white" />
                </div>
                {onDeleteBlock && (
                  <div
                    className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-400 transition-colors"
                    title="删除文字块"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBlock(block);
                    }}
                  >
                    <X className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>
            )}

            {/* 角色标签（悬停时显示） */}
            {!isInpainting && (
              <div className="absolute bottom-full left-0 mb-0.5 px-1 py-0.5 rounded text-[9px] bg-foreground/80 text-background whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                {block.role} · {block.text.slice(0, 20)}{block.text.length > 20 ? "…" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MediaLayout() {
  const search = useSearch();
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
  const [pendingPackFiles, setPendingPackFiles] = useState<{ file: File; preview: string }[]>([]);
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

  const saveStylePromptMutation = trpc.graphicStylePacks.saveStylePrompt.useMutation({
    onSuccess: () => {
      refetchPacks();
      toast.success("风格提示词已保存到版式包，下次选中该版式包时自动加载✨");
    },
    onError: (err) => toast.error("保存失败：" + err.message),
  });

  // 当版式包数据加载/刷新后，如果当前选中的版式包有 savedStylePrompt 且输入框为空，自动填入
  useEffect(() => {
    if (!selectedPackId || !stylePacks) return;
    const pack = (stylePacks as StylePack[]).find(p => p.id === selectedPackId);
    if (pack?.savedStylePrompt && !stylePrompt.trim()) {
      setStylePrompt(pack.savedStylePrompt);
    }
  }, [selectedPackId, stylePacks]);
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
  const [planToolId, setPlanToolId] = useState<number | undefined>(undefined);
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
  // 版式包素材库选择器
  const [packAssetPickerOpen, setPackAssetPickerOpen] = useState(false);
  const [packAssetSearch, setPackAssetSearch] = useState("");
  const [packAssetSelected, setPackAssetSelected] = useState<Array<{ id: number; name: string; fileUrl: string; fileKey: string; thumbnailUrl?: string | null }>>([]);
  // 从素材库选择已有版式包（直接提取 styleGuide）
  const [libraryPackPickerOpen, setLibraryPackPickerOpen] = useState(false);
  const [libraryPackSearch, setLibraryPackSearch] = useState("");
  // libraryPackTab / libraryPackAssets / allLibraryAssets removed:
  // 版式包库弹窗现在直接使用 stylePacks 数据，无需额外查询

  // 从 URL 参数读取 jobId（由生成记录模块跳转过来时自动恢复）
  const urlJobId = useMemo(() => {
    const params = new URLSearchParams(search);
    const v = params.get("jobId");
    return v ? Number(v) : undefined;
  }, [search]);

  // Jobs
  const { data: jobs = [], refetch: refetchJobs } = trpc.graphicLayout.list.useQuery(undefined, { staleTime: 30_000 });
  const [activeJobId, setActiveJobId] = useState<number | undefined>();
  const [currentPage, setCurrentPage] = useState(0);
  const [generating, setGenerating] = useState(false);

  // URL 参数恢复：直接设置 activeJobId，不需要在 list 中找到
  const urlJobIdAppliedRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!urlJobId) return;
    // Reset when urlJobId changes so navigating to a different job always works
    if (urlJobIdAppliedRef.current === urlJobId) return;
    // Directly activate the job by ID - graphicLayout.status will fetch it regardless of list
    setActiveJobId(urlJobId);
    setCurrentPage(0);
    urlJobIdAppliedRef.current = urlJobId;
    // Also restore form params from the job list if available
    const found = (jobs as LayoutJob[]).find((j) => j.id === urlJobId);
    if (found) {
      setDocType(found.docType);
      setAspectRatio(found.aspectRatio || "3:4");
      setPageCount(found.pageCount || 1);
      setContentText(found.contentText || "");
      setTitleInput(found.title || "");
      if (found.stylePrompt) setStylePrompt(found.stylePrompt);
      if (found.packId) setSelectedPackId(found.packId);
      const assetConfig = found.assetUrls as any;
      if (assetConfig) {
        if (assetConfig.mode === "per_page" && assetConfig.pages) {
          setAssetMode("per_page");
          const restored: Record<number, string[]> = {};
          Object.entries(assetConfig.pages).forEach(([k, v]) => { restored[Number(k)] = v as string[]; });
          setPerPageAssets(restored);
        } else if (assetConfig.mode === "by_type" && assetConfig.groups) {
          setAssetMode("by_type");
          setByTypeGroups(assetConfig.groups as Record<string, string[]>);
        } else if (assetConfig.mode === "legacy" && (assetConfig.urls as string[])?.length) {
          setAssetMode("per_page");
          setPerPageAssets({ 0: assetConfig.urls });
        }
      }
    }
  }, [urlJobId, jobs]);

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
    // 恢复风格提示词
    if (job.stylePrompt) setStylePrompt(job.stylePrompt);
    // 如果有 packId，选中对应的版式包
    if (job.packId) setSelectedPackId(job.packId);
    // 恢复素材
    const assetConfig = job.assetUrls as any;
    if (assetConfig) {
      if (assetConfig.mode === "per_page" && assetConfig.pages) {
        setAssetMode("per_page");
        const restored: Record<number, string[]> = {};
        Object.entries(assetConfig.pages).forEach(([k, v]) => { restored[Number(k)] = v as string[]; });
        setPerPageAssets(restored);
      } else if (assetConfig.mode === "by_type" && assetConfig.groups) {
        setAssetMode("by_type");
        setByTypeGroups(assetConfig.groups as Record<string, string[]>);
      } else if (assetConfig.mode === "legacy" && (assetConfig.urls as string[])?.length) {
        setAssetMode("per_page");
        setPerPageAssets({ 0: assetConfig.urls });
      }
    }
    // 切换到该 job 的预览
    setActiveJobId(job.id);
    setCurrentPage(0);
    toast.success("已恢复版式包、素材和提示词，可修改后重新生成");
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

  const trpcUtils = trpc.useUtils();

  const deleteTextBlockMutation = trpc.graphicLayout.deleteTextBlock.useMutation({
    onMutate: async ({ jobId, pageIndex, blockId }) => {
      // 乐观更新：立即从本地缓存移除文字块
      await trpcUtils.graphicLayout.status.cancel({ id: jobId });
      const previous = trpcUtils.graphicLayout.status.getData({ id: jobId });
      trpcUtils.graphicLayout.status.setData({ id: jobId }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: (old.pages ?? []).map((p: any) =>
            p.pageIndex !== pageIndex
              ? p
              : { ...p, textBlocks: (p.textBlocks ?? []).filter((b: any) => b.id !== blockId) }
          ),
        };
      });
      return { previous };
    },
    onSuccess: () => {
      toast.success("文字块已删除");
      setEditingBlock(null);
      setNewText("");
    },
    onError: (err, _vars, context) => {
      toast.error("删除失败：" + err.message);
      // 回滚乐观更新
      if (context?.previous) {
        trpcUtils.graphicLayout.status.setData({ id: _vars.jobId }, context.previous);
      }
    },
    onSettled: (_data, _err, { jobId }) => {
      // 兑底刷新确保服务端数据一致
      trpcUtils.graphicLayout.status.invalidate({ id: jobId });
    },
  });

  const handleDeleteBlock = () => {
    if (!activeJobId || !editingBlock) return;
    if (!confirm(`确定删除文字块「${editingBlock.text.slice(0, 20)}${editingBlock.text.length > 20 ? "…" : ""}」？此操作仅移除热区标记，不会重绘图像。`)) return;
    deleteTextBlockMutation.mutate({
      jobId: activeJobId,
      pageIndex: editingPageIndex,
      blockId: editingBlock.id,
    });
  };

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
  // When URL has jobId and activeJob data loads, restore form params from status API
  // This fixes the timing issue where jobs list may not be loaded yet
  const restoredFromJobRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!urlJobId || !activeJob || activeJob.id !== urlJobId) return;
    if (restoredFromJobRef.current === urlJobId) return;
    restoredFromJobRef.current = urlJobId;
    setDocType(activeJob.docType);
    setAspectRatio(activeJob.aspectRatio || "3:4");
    setPageCount(activeJob.pageCount || 1);
    setContentText(activeJob.contentText || "");
    setTitleInput(activeJob.title || "");
    if (activeJob.stylePrompt) setStylePrompt(activeJob.stylePrompt);
    if (activeJob.packId) setSelectedPackId(activeJob.packId);
    const assetConfig = activeJob.assetUrls as any;
    if (assetConfig) {
      if (assetConfig.mode === "per_page" && assetConfig.pages) {
        setAssetMode("per_page");
        const restored: Record<number, string[]> = {};
        Object.entries(assetConfig.pages).forEach(([k, v]) => { restored[Number(k)] = v as string[]; });
        setPerPageAssets(restored);
      } else if (assetConfig.mode === "by_type" && assetConfig.groups) {
        setAssetMode("by_type");
        setByTypeGroups(assetConfig.groups as Record<string, string[]>);
      } else if (assetConfig.mode === "legacy" && (assetConfig.urls as string[])?.length) {
        setAssetMode("per_page");
        setPerPageAssets({ 0: assetConfig.urls });
      }
    }
    toast.success("已恢复版式包、素材和提示词，可修改后重新生成");
  }, [urlJobId, activeJob]);

  const uploadFile = useCallback(async (file: File): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/layout-pack", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) throw new Error(`上传失败 ${res.status}`);
    return res.json();
  }, []);

  const handlePackFilesUpload = async (files: FileList) => {
    if (files.length === 0) return;
    // 生成本地预览 URL 并存入 pendingPackFiles
    const fileArray = Array.from(files);
    const previews = fileArray.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setPendingPackFiles(prev => {
      // 释放旧预览 URL
      prev.forEach(p => URL.revokeObjectURL(p.preview));
      return previews;
    });
  };
  const handleConfirmPackUpload = async () => {
    if (pendingPackFiles.length === 0) return;
    setUploadingPack(true);
    try {
      // 并行上传所有文件
      const uploaded = await Promise.all(
        pendingPackFiles.map(({ file }) => uploadFile(file))
      );
      const allUrls = uploaded.map(u => u.url);
      const firstFile = pendingPackFiles[0].file;
      const ext = firstFile.name.split(".").pop()?.toLowerCase();
      const sourceType = ext === "pdf" ? "pdf" : "images";
      const autoName = firstFile.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim() || "版式包";
      const name = packNameInput.trim() || (pendingPackFiles.length > 1 ? `版式包（${pendingPackFiles.length}张）` : autoName);
      await createPackMutation.mutateAsync({
        name, sourceType,
        sourceFileUrl: allUrls[0],
        sourceFileKey: uploaded[0].key,
        sourceFileUrls: allUrls,
      });
      toast.success(`版式包创建成功（${allUrls.length} 张参考图），AI 正在综合分析风格...`);
      setShowPackUpload(false);
      setPackNameInput("");
      setPendingPackFiles([]);
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
      planToolId: planToolId ?? undefined,
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
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <LayoutTemplate className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">图文排版</h1>
          <p className="text-xs text-muted-foreground">AI 生成整页图文排版，点击文字区域可局部重绘编辑</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHelp(true)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
          title="使用说明"
        >
          <HelpCircle className="w-4.5 h-4.5" />
        </Button>
      </div>

      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              图文排版——使用说明
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 text-sm text-muted-foreground pb-2">

            {/* Overview */}
            <div className="bg-primary/8 border border-primary/20 rounded-lg p-4">
              <p className="text-foreground leading-relaxed">
                图文排版模块可以根据你提供的文字内容和素材图片，自动生成具有专业排版的整页图片——文字、色块、图形、照片全部融入同一张图片中。适用于生成品牌手册、项目图板、商品详情页等多种场景。
              </p>
            </div>

            {/* Step 1 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">1</span>
                <h3 className="font-semibold text-foreground">选择或创建版式包</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-muted-foreground">
                <p>左侧「版式包」区域存放你的版式风格库。点击「新建版式包」可以上传参考图片，让 AI 学习其排版风格、配色和字体特征。</p>
                <p>支持上传多张图片或整个文件夹，上传后 AI 会自动提取风格指南（包含配色、字体、排版特征）。</p>
                <p>已创建的版式包可在不同生成任务中复用。</p>
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">2</span>
                <h3 className="font-semibold text-foreground">填写内容与设置</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-muted-foreground">
                <p><span className="text-foreground">文档类型：</span>可选择品牌手册、项目图板、商品详情页或自定义，不同类型会影响 AI 的排版逻辑和内容组织方式。</p>
                <p><span className="text-foreground">页面数量：</span>支持 1–8 页，多页时 AI 会自动规划每页的内容分配。</p>
                <p><span className="text-foreground">图幅比例：</span>3:4（竞屏展示）、A4（文档打印）、16:9（宽屏展示）等多种选项，导出 PDF 时页面尺寸会自动匹配。</p>
                <p><span className="text-foreground">内容描述：</span>详细描述你希望展示的主题、关键信息和风格假设。内容越具体，生成质量越高。</p>
                <p><span className="text-foreground">素材图片：</span>可选择上传你希望融入排版的实景照片或产品图片， AI 会将其嵌入到合适的版面位置。</p>
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">3</span>
                <h3 className="font-semibold text-foreground">生成与预览</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-muted-foreground">
                <p>点击「生成排版」后， AI 会先规划每页的文字块布局，再逐页生成整页图片。多页文档会逐页完成，预览区会实时更新。</p>
                <p>预览区可用左右箭头按鈕切换页面，也可点击左侧缩略图快速跳转。</p>
              </div>
            </div>

            {/* Step 4 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">4</span>
                <h3 className="font-semibold text-foreground">局部重绘修改文案</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-muted-foreground">
                <p>生成完成后，预览区会在图片上叠加透明文字热区。将鼠标悬停在文字区域时，会显示文字内容和编辑图标。</p>
                <p>点击文字区域后，在弹出的编辑框中输入新文案，点击「重绘」。AI 会以局部重绘（Inpainting）的方式，仅替换该文字区域的内容，保留其余画面不变。</p>
                <p className="text-muted-foreground/60 text-xs">提示：重绘需要 10–30 秒，请耐心等待。如果效果不理想，可再次点击重绘。</p>
              </div>
            </div>

            {/* Step 5 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">5</span>
                <h3 className="font-semibold text-foreground">导出与下载</h3>
              </div>
              <div className="ml-7 space-y-1.5 text-muted-foreground">
                <p><span className="text-foreground">导出图片：</span>将所有页面打包为 ZIP 文件下载，图片按 page-01、page-02 依次命名，适合展示和分享。</p>
                <p><span className="text-foreground">导出 PDF：</span>将所有页面合并为一个 PDF 文件，页面尺寸自动匹配所选图幅比例，适合打印和正式提交。</p>
              </div>
            </div>

            {/* Tips */}
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-foreground mb-2">使用建议</h3>
              <div className="space-y-1.5 text-muted-foreground">
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
        <div className="w-72 border-r border-border flex flex-col overflow-y-auto shrink-0 bg-background">
          {/* Style Packs */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">版式包</span>
              </div>
              <div className="flex items-center gap-2">
                <div role="button" tabIndex={0} onClick={() => setShowPackUpload(true)}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 cursor-pointer">
                  <Plus className="w-3 h-3" />图片学习
                </div>
                <div role="button" tabIndex={0} onClick={() => setLibraryPackPickerOpen(true)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer">
                  <Library className="w-3 h-3" />版式包库
                </div>
              </div>
            </div>
            <div
              onClick={() => setSelectedPackId(undefined)}
              className={`mb-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all ${
                !selectedPackId ? "border-primary/60 bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:border-border/80"
              }`}
            >
              默认风格（不使用版式包）
            </div>
            {(stylePacks as StylePack[]).length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 text-center py-2">暂无版式包，上传参考文件开始学习</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(stylePacks as StylePack[]).map((pack) => (
                  <StylePackCard key={pack.id} pack={pack} selected={selectedPackId === pack.id}
                    onSelect={() => {
                      setSelectedPackId(pack.id);
                      // 自动加载该版式包保存的风格提示词
                      if (pack.savedStylePrompt) {
                        setStylePrompt(pack.savedStylePrompt);
                        toast.info("已自动加载保存的风格提示词");
                      }
                    }}
                    onDelete={() => deletePackMutation.mutate({ id: pack.id })}
                    onRetry={() => retryPackMutation.mutate({ id: pack.id })} />
                ))}
              </div>
            )}

            {/* 风格提示词提取区域 */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">风格提示词</span>
                  {selectedPackId && (stylePacks as StylePack[]).find(p => p.id === selectedPackId)?.savedStylePrompt && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30">已保存</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!selectedPackId) { toast.error("请先选择一个版式包"); return; }
                      if (!stylePrompt.trim()) { toast.error("提示词不能为空"); return; }
                      saveStylePromptMutation.mutate({ id: selectedPackId, stylePrompt: stylePrompt.trim() });
                    }}
                    disabled={saveStylePromptMutation.isPending || !selectedPackId || !stylePrompt.trim()}
                    className="h-7 text-[10px] border-green-500/40 text-green-500 hover:bg-green-500/10"
                  >
                    {saveStylePromptMutation.isPending ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />保存中...</>
                    ) : (
                      <><Check className="w-3 h-3 mr-1" />保存提示词</>
                    )}
                  </Button>
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
                    className="h-7 text-[10px] border-primary/40 text-primary hover:bg-primary/10"
                  >
                    {extractingPrompt ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />提取中...</>
                    ) : (
                      <><Sparkles className="w-3 h-3 mr-1" />提取提示词</>
                    )}
                  </Button>
                </div>
              </div>
              <Textarea
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                placeholder="点击“提取提示词”从选中的版式包中提取风格描述，编辑满意后点“保存提示词”即可下次选中该版式包时自动加载。"
                className="min-h-[100px] text-xs resize-none"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                提示：提取并编辑满意后，点“保存提示词”可将当前提示词绑定到该版式包，下次选中时自动加载。
              </p>
            </div>
          </div>

          {/* Generate Config */}
          <div className="p-4 flex flex-col gap-4">
            {/* Doc type */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">文档类型</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {DOC_TYPES.map(({ value, label, icon: Icon }) => (
                  <div key={value} onClick={() => setDocType(value)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border cursor-pointer text-xs transition-all ${
                      docType === value ? "border-primary/60 bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}>
                    <Icon className="w-3 h-3 shrink-0" />{label}
                  </div>
                ))}
              </div>
            </div>

            {/* Aspect ratio */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Maximize2 className="w-3 h-3" />图幅
              </Label>
              <div className="grid grid-cols-4 gap-1">
                {ASPECT_RATIOS.map(({ value, label, desc }) => (
                  <div key={value} onClick={() => setAspectRatio(value)}
                    title={desc}
                    className={`flex flex-col items-center justify-center px-1 py-1.5 rounded-lg border cursor-pointer text-[10px] transition-all ${
                      aspectRatio === value ? "border-primary/60 bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}>
                    <span className="font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Page count */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center justify-between">
                <span>页数</span><span className="text-foreground font-medium">{pageCount} 页</span>
              </Label>
              <Slider min={1} max={10} step={1} value={[pageCount]} onValueChange={([v]) => setPageCount(v)} className="w-full" />
            </div>

            {/* Title */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">标题（可选）</Label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
                placeholder="如：N+1 STUDIOS 品牌手册"
                className="text-sm h-8" />
            </div>

            {/* Content */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">内容描述</Label>
              <Textarea value={contentText} onChange={(e) => setContentText(e.target.value)}
                placeholder="描述你想生成的图文内容，例如：N+1 STUDIOS 是一家专注于科技制造业办公空间设计的建筑事务所，团队6人..."
                className="text-sm min-h-[100px] resize-none" />
            </div>

            {/* Asset images - 双模式素材图上传 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">素材图（可选）</Label>
              {/* 模式切换 */}
              <div className="flex gap-1 mb-3">
                <button
                  type="button"
                  onClick={() => setAssetMode("per_page")}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                    assetMode === "per_page"
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >按页上传</button>
                <button
                  type="button"
                  onClick={() => setAssetMode("by_type")}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                    assetMode === "by_type"
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground border border-border hover:text-foreground"
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
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        第{i + 1}页
                        {(perPageAssets[i]?.length ?? 0) > 0 && (
                          <span className="ml-1 text-primary">({perPageAssets[i].length})</span>
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
                        className="w-12 h-12 rounded border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-border/80 transition-colors"
                        title="添加素材图（最多 5 张）"
                      >
                        {uploadingAsset ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                            {uploadProgress > 0 && <span className="text-[8px] text-muted-foreground">{uploadProgress}%</span>}
                          </div>
                        ) : <Plus className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">每页最多 5 张，AI 会将该页素材融入排版</p>
                  <button
                    type="button"
                    onClick={() => { setAssetPickerMode("per_page"); setAssetPickerOpen(true); }}
                    className="mt-1.5 w-full py-1.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors flex items-center justify-center gap-1"
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
                    <div key={typeName} className="bg-muted rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-foreground font-medium">{typeName}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{urls.length} 张</span>
                          <button
                            type="button"
                            onClick={() => setByTypeGroups((prev) => { const n = { ...prev }; delete n[typeName]; return n; })}
                            className="text-muted-foreground hover:text-destructive transition-colors"
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
                        {urls.length > 6 && <span className="text-[10px] text-muted-foreground self-center">+{urls.length - 6}</span>}
                      </div>
                    </div>
                  ))}
                  {/* 上传文件夹按钮 */}
                  <button
                    type="button"
                    onClick={() => assetFolderRef.current?.click()}
                    className="w-full py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors flex items-center justify-center gap-1.5"
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
                      className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                    />
                    <button
                      type="button"
                      disabled={!newTypeName.trim() || uploadingAsset}
                      onClick={() => byTypeFileRef.current?.click()}
                      className="px-2 py-1 bg-muted rounded-md text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    ><Upload className="w-3 h-3" /></button>
                  </div>
                  {/* 从素材库选择（按类型） */}
                  <button
                    type="button"
                    onClick={() => { setAssetPickerMode("by_type"); setAssetPickerOpen(true); }}
                    className="w-full py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Library className="w-3 h-3" />从素材库选择图片
                  </button>
                  <p className="text-[10px] text-muted-foreground/60">上传文件夹时自动按文件夹名分组，AI 会根据每页主题选择合适的素材</p>
                  <input ref={assetFolderRef} type="file" accept="image/*" multiple className="hidden"
                    // @ts-ignore
                    webkitdirectory="" directory=""
                    onChange={(e) => { if (e.target.files?.length) handleByTypeFiles(e.target.files); e.target.value = ""; }} />
                  <input ref={byTypeFileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { if (e.target.files?.length) handleByTypeFiles(e.target.files, newTypeName.trim() || "未分类"); e.target.value = ""; }} />
                </div>
              )}
            </div>

            {/* Layout Plan LLM Selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">排版规划模型</Label>
              <AiToolSelector
                capability="layout_plan"
                value={planToolId}
                onChange={(id) => setPlanToolId(id ?? undefined)}
                label="排版规划模型"
                showBuiltIn={true}
              />
            </div>

            {/* AI Tool Selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">图像生成工具</Label>
              <AiToolSelector
                capability="rendering"
                value={imageToolId}
                onChange={(id) => setImageToolId(id ?? undefined)}
                label="图像生成工具"
                showBuiltIn={true}
              />
            </div>

            <Button onClick={handleGenerate} disabled={generating || !contentText.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium">
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</> : <><Sparkles className="w-4 h-4 mr-2" />生成排版</>}
            </Button>
          </div>
        </div>

        {/* Center Panel: Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activeJobId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <LayoutTemplate className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">在左侧配置内容后点击「生成排版」</p>
                <p className="text-muted-foreground/60 text-xs mt-1">生成后可点击图片中的文字区域进行局部重绘编辑</p>
              </div>
            </div>
          ) : !activeJob ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : activeJob.status === "processing" || activeJob.status === "pending" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <div className="text-center">
                <p className="text-muted-foreground text-sm">AI 正在生成图文排版...</p>
                <p className="text-muted-foreground/60 text-xs mt-1">每页约需 15-30 秒，请耐心等待</p>
              </div>
            </div>
          ) : activeJob.status === "failed" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-destructive text-sm">生成失败</p>
              <p className="text-muted-foreground text-xs">{activeJob.errorMessage}</p>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">暂无页面数据</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Page nav */}
              <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{activeJob.title || DOC_TYPES.find(d => d.value === activeJob.docType)?.label}</span>
                  <Badge variant="outline" className="text-[10px]">{pages.length} 页</Badge>
                  {activeAspectRatio && (
                    <Badge variant="outline" className="text-[10px]">{activeAspectRatio}</Badge>
                  )}
                  {currentPageData?.textBlocks && currentPageData.textBlocks.length > 0 && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary/70">
                      <Pencil className="w-2.5 h-2.5 mr-1" />悬停文字可编辑
                    </Badge>
                  )}
                  {((activeJob as any)?.modelsUsed as string[] | null | undefined)?.map((name: string) => (
                    <Badge key={name} variant="outline" className="text-[10px] font-mono border-muted-foreground/20 text-muted-foreground/60">{name}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {/* 反馈按钮 */}
                  {activeJobId && (
                    <div className="relative">
                      <FeedbackButtons module="layout_design" historyId={activeJobId} compact />
                    </div>
                  )}
                  {/* 导出图片按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportImages}
                    disabled={exportingImages}
                    className="h-7 px-2.5 text-xs"
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
                    className="h-7 px-2.5 text-xs"
                  >
                    {exportingPdf ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />导出中...</>
                    ) : (
                      <><FileDown className="w-3.5 h-3.5 mr-1.5" />导出 PDF</>
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0} className="h-7 w-7 p-0 text-muted-foreground">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{currentPage + 1} / {pages.length}</span>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                    disabled={currentPage === pages.length - 1} className="h-7 w-7 p-0 text-muted-foreground">
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
                      onDeleteBlock={(block) => {
                        if (!activeJobId) return;
                        if (!confirm(`确定删除文字块「${block.text.slice(0, 20)}${block.text.length > 20 ? "…" : ""}」？`)) return;
                        deleteTextBlockMutation.mutate({
                          jobId: activeJobId,
                          pageIndex: currentPage,
                          blockId: block.id,
                        });
                      }}
                      inpaintingBlockId={inpaintingBlockId}
                    />
                  )}
                </div>
              </div>

              {/* Page strip */}
              <div className="px-6 py-3 border-t border-border flex gap-2 overflow-x-auto shrink-0">
                {pages.map((page, i) => {
                  const thumbRatio = RATIO_CSS[activeAspectRatio] || "3/4";
                  return (
                    <div key={i} onClick={() => setCurrentPage(i)}
                      className={`relative shrink-0 rounded overflow-hidden cursor-pointer border-2 transition-all ${
                        i === currentPage ? "border-primary" : "border-transparent hover:border-border"
                      }`}
                      style={{ width: "56px", aspectRatio: thumbRatio }}>
                      {(page.compositeImageUrl ?? page.imageUrl) ? (
                        <img src={page.compositeImageUrl ?? page.imageUrl} alt="" className="w-full h-full object-fill" />
                      ) : (
                        <div className="w-full h-full" style={{ backgroundColor: page.backgroundColor || "#1a1a1a" }} />
                      )}
                      <div className="absolute bottom-0.5 right-0.5 text-[8px] bg-foreground/60 text-background px-1 rounded">{page.pageIndex + 1}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Pack Upload Dialog */}
      <Dialog open={showPackUpload} onOpenChange={setShowPackUpload}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">上传版式参考文件</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">版式包名称（可选，不填则自动从文件名生成）</Label>
              <Input value={packNameInput} onChange={(e) => setPackNameInput(e.target.value)}
                placeholder="不填则自动从文件名生成" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">选择来源</Label>
              <div className="grid grid-cols-3 gap-2">
                <div role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 transition-colors">
                  {uploadingPack ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                      <p className="text-[11px] text-muted-foreground">选择文件</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">PDF/图片</p>
                    </>
                  )}
                </div>
                <div role="button" tabIndex={0} onClick={() => folderInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 transition-colors">
                  <FolderOpen className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                  <p className="text-[11px] text-muted-foreground">文件夹</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">整个文件夹</p>
                </div>
                <div role="button" tabIndex={0} onClick={() => {
                  setShowPackUpload(false);
                  setPackAssetPickerOpen(true);
                }}
                  className="border-2 border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 transition-colors">
                  <Library className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                  <p className="text-[11px] text-muted-foreground">素材库</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">已上传图片</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) handlePackFilesUpload(e.target.files); e.target.value = ""; }} />
              <input ref={folderInputRef} type="file" accept="image/*,.pdf"
                // @ts-ignore
                webkitdirectory="" directory="" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) handlePackFilesUpload(e.target.files); e.target.value = ""; }} />
            </div>
            {pendingPackFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">已选 {pendingPackFiles.length} 张参考图</Label>
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                  {pendingPackFiles.map((pf, idx) => (
                    <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0">
                      <img src={pf.preview} alt={pf.file.name} className="w-full h-full object-cover" />
                      <button
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white/70 hover:text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setPendingPackFiles(prev => prev.filter((_, i) => i !== idx))}
                      >×</button>
                    </div>
                  ))}
                  <div
                    role="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors flex-shrink-0"
                  >
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <button
                  onClick={handleConfirmPackUpload}
                  disabled={uploadingPack}
                  className="w-full h-9 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {uploadingPack ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />上传并分析中...</>
                  ) : (
                    <>创建版式包（{pendingPackFiles.length} 张）</>
                  )}
                </button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground/60">
              AI 将综合分析所有参考图的配色、字体、排版模式，生成一个版式风格包。
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Library Pack Picker - 直接使用 stylePacks 数据，点击只做选中 */}
      <Dialog open={libraryPackPickerOpen} onOpenChange={(v) => { if (!v) { setLibraryPackPickerOpen(false); setLibraryPackSearch(""); } }}>
        <DialogContent className="max-w-2xl" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <DialogHeader className="pb-3">
            <DialogTitle className="text-base flex items-center gap-2">
              <Library className="w-4 h-4 text-primary" />
              版式包库
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">点击版式包即可选中，选中后可在左侧面板查看并提取风格提示词</p>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索版式包…"
              value={libraryPackSearch}
              onChange={(e) => setLibraryPackSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          {(() => {
            const donePacks = (stylePacks as StylePack[]).filter(p => p.status === "done");
            const filtered = donePacks.filter(p => p.name.toLowerCase().includes(libraryPackSearch.toLowerCase()));
            if (donePacks.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <LayoutTemplate className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">暂无已完成的版式包</p>
                  <p className="text-xs mt-1 opacity-60">请点击「图片学习」上传参考图片进行学习</p>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {filtered.map((pack) => {
                  const previewUrls: string[] = (
                    (pack.thumbnails && pack.thumbnails.length > 0)
                      ? pack.thumbnails
                      : (pack.sourceFileUrls && pack.sourceFileUrls.length > 0)
                        ? pack.sourceFileUrls
                        : pack.sourceFileUrl
                          ? [pack.sourceFileUrl]
                          : []
                  ).slice(0, 3);
                  const isSelected = selectedPackId === pack.id;
                  return (
                    <button
                      key={pack.id}
                      onClick={() => {
                        setSelectedPackId(pack.id);
                        setLibraryPackPickerOpen(false);
                        setLibraryPackSearch("");
                        toast.success(`已选择版式包「${pack.name}」`);
                      }}
                      className={`group relative rounded-xl border-2 overflow-hidden text-left transition-all ${
                        isSelected ? "border-primary" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {/* Thumbnail grid */}
                      {previewUrls.length > 0 ? (
                        <div className={`grid bg-muted ${
                          previewUrls.length === 1 ? "grid-cols-1" :
                          previewUrls.length === 2 ? "grid-cols-2" : "grid-cols-3"
                        }`} style={{ height: 100 }}>
                          {previewUrls.map((url, i) => (
                            <img key={i} src={url} alt="" className="w-full h-full object-contain" />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-12 bg-muted">
                          {pack.styleGuide?.colorPalette && [
                            pack.styleGuide.colorPalette.primary,
                            pack.styleGuide.colorPalette.secondary,
                            pack.styleGuide.colorPalette.accent,
                            pack.styleGuide.colorPalette.background,
                          ].map((c, i) => (
                            <div key={i} className="flex-1" style={{ backgroundColor: `#${c.replace("#", "")}` }} />
                          ))}
                        </div>
                      )}
                      {/* Selected badge */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                      {/* Info */}
                      <div className="p-2 bg-card">
                        <p className="text-xs font-medium text-foreground truncate">{pack.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {(pack.sourceFileUrls?.length ?? 1) > 1
                            ? `${pack.sourceFileUrls!.length} 张参考图`
                            : pack.sourceType === "pdf" ? "PDF" : "图片"}
                        </p>
                        {pack.styleGuide?.styleKeywords && pack.styleGuide.styleKeywords.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {pack.styleGuide.styleKeywords.slice(0, 2).map((kw) => (
                              <span key={kw} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{kw}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="col-span-3 flex flex-col items-center justify-center h-24 text-muted-foreground">
                    <p className="text-sm">未找到匹配的版式包</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Pack Asset Library Picker */}
      <AssetPickerDialog
        open={packAssetPickerOpen}
        onClose={() => setPackAssetPickerOpen(false)}
        title="从素材库选择版式参考图片"
        multiSelect
        onSelect={() => {}}
        onMultiSelect={async (items) => {
          if (items.length === 0) return;
          setUploadingPack(true);
          try {
            const first = items[0];
            const allUrls = items.map(i => i.fileUrl);
            const autoName = first.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim() || "版式包";
            const name = packNameInput.trim() || (items.length > 1 ? `版式包（${items.length}张）` : autoName);
            await createPackMutation.mutateAsync({
              name,
              sourceType: "images",
              sourceFileUrl: first.fileUrl,
              sourceFileKey: first.fileKey,
              sourceFileUrls: allUrls,
            });
            toast.success(`版式包创建成功（${allUrls.length} 张参考图），AI 正在综合分析风格...`);
            setPackNameInput("");
            refetchPacks();
          } catch (err: any) {
            toast.error("创建失败：" + err.message);
          } finally {
            setUploadingPack(false);
          }
        }}
      />

      {/* Text Block Edit Dialog */}
      <Dialog open={!!editingBlock} onOpenChange={(open) => { if (!open) { setEditingBlock(null); setNewText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              AI 重绘文字
            </DialogTitle>
          </DialogHeader>
          {editingBlock && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {editingBlock.role}
                </Badge>
                <span className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={editingBlock.text}>原文字：{editingBlock.text}</span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">新文案</Label>
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="输入新的文字内容..."
                  className="text-sm min-h-[80px] resize-none"
                  autoFocus
                />
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground/70">AI 局部重绘</span>：AI 将在标记区域内重新渲染指定文字，保持周围设计不变。重绘通常需要 5–15 秒。
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setEditingBlock(null); setNewText(""); }}
                  className="flex-1">
                  取消
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDeleteBlock}
                  disabled={deleteTextBlockMutation.isPending || inpaintMutation.isPending}
                  className="border-destructive/30 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                  title="删除此文字块热区（不重绘图像）"
                >
                  {deleteTextBlockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
                <Button onClick={handleConfirmEdit} disabled={!newText.trim() || inpaintMutation.isPending || deleteTextBlockMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
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
