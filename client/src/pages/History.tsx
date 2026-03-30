import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Presentation,
  Image,
  MessageSquare,
  Clock,
  Download,
  Loader2,
  History as HistoryIcon,
  Filter,
  RefreshCw,
  BookOpen,
  Instagram,
  Megaphone,
  Copy,
  Layers,
  X,
  Trash2,
  Sparkles,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Link2,
  Link2Off,
  Film,
  LayoutTemplate,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { Streamdown } from "streamdown";
import { ReportMarkdown } from "@/components/ReportMarkdown";

// ─── Module Config ───────────────────────────────────────────────────────────

const MODULE_MAP: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconColor: string;
  accentColor: string;
}> = {
  benchmark_report: {
    label: "案例调研报告",
    icon: FileText,
    gradient: "from-stone-900 to-stone-700",
    iconColor: "text-stone-300",
    accentColor: "bg-stone-500/20 text-stone-300",
  },
  benchmark_ppt: {
    label: "调研 PPT",
    icon: Presentation,
    gradient: "from-neutral-900 to-neutral-700",
    iconColor: "text-neutral-300",
    accentColor: "bg-neutral-500/20 text-neutral-300",
  },
  ai_render: {
    label: "AI 效果图",
    icon: Image,
    gradient: "from-zinc-900 to-zinc-700",
    iconColor: "text-zinc-300",
    accentColor: "bg-zinc-500/20 text-zinc-300",
  },
  meeting_minutes: {
    label: "会议纪要",
    icon: MessageSquare,
    gradient: "from-stone-800 to-stone-600",
    iconColor: "text-stone-200",
    accentColor: "bg-stone-400/20 text-stone-200",
  },
  media_xiaohongshu: {
    label: "小红书",
    icon: BookOpen,
    gradient: "from-rose-950 to-rose-800",
    iconColor: "text-rose-300",
    accentColor: "bg-rose-500/20 text-rose-300",
  },
  media_wechat: {
    label: "公众号",
    icon: Megaphone,
    gradient: "from-neutral-800 to-neutral-600",
    iconColor: "text-neutral-200",
    accentColor: "bg-neutral-400/20 text-neutral-200",
  },
  media_instagram: {
    label: "Instagram",
    icon: Instagram,
    gradient: "from-rose-900 to-rose-700",
    iconColor: "text-rose-200",
    accentColor: "bg-rose-400/20 text-rose-200",
  },
  ai_video: {
    label: "AI 视频",
    icon: Film,
    gradient: "from-purple-900 to-purple-700",
    iconColor: "text-purple-300",
    accentColor: "bg-purple-500/20 text-purple-300",
  },
  layout_design: {
    label: "图文排版",
    icon: LayoutTemplate,
    gradient: "from-amber-950 to-amber-800",
    iconColor: "text-amber-300",
    accentColor: "bg-amber-500/20 text-amber-300",
  },
};

// Module display order
const MODULE_ORDER = [
  "ai_render",
  "ai_video",
  "layout_design",
  "benchmark_report",
  "benchmark_ppt",
  "meeting_minutes",
  "media_xiaohongshu",
  "media_wechat",
  "media_instagram",
];

function formatTime(ts: number | string | Date): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatFullTime(ts: number | string | Date): string {
  const date = new Date(ts);
  return date.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

interface LightboxProps {
  src: string;
  alt?: string;
  label?: string;
  onClose: () => void;
}

function Lightbox({ src, alt, label, onClose }: LightboxProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(prev => Math.min(Math.max(prev * (e.deltaY < 0 ? 1.15 : 0.87), 0.2), 8));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.x, y: dragStart.current.oy + e.clientY - dragStart.current.y });
  }, [dragging]);

  const handleMouseUp = useCallback(() => { setDragging(false); dragStart.current = null; }, []);

  const lastTouch = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouch.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
    }
  }, [offset]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && lastTouch.current) {
      const t = e.touches[0];
      setOffset({ x: lastTouch.current.ox + t.clientX - lastTouch.current.x, y: lastTouch.current.oy + t.clientY - lastTouch.current.y });
    }
  }, []);

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label || "image"}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(src, "_blank"); }
  }, [src, label]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none">
        <span className="text-white/80 text-sm font-medium pointer-events-auto">{label || alt || "图片预览"}</span>
        <div className="flex items-center gap-1 pointer-events-auto">
          {[
            { icon: ZoomIn, title: "放大", action: () => setScale(s => Math.min(s * 1.25, 8)) },
            { icon: ZoomOut, title: "缩小", action: () => setScale(s => Math.max(s * 0.8, 0.2)) },
            { icon: RotateCcw, title: "重置", action: resetView },
            { icon: Download, title: "下载", action: handleDownload },
          ].map(({ icon: Icon, title, action }) => (
            <button key={title} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" onClick={action} title={title}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <button className="h-8 w-8 rounded-full bg-white/10 hover:bg-red-500/60 flex items-center justify-center text-white transition-colors ml-1" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/70 text-xs px-3 py-1 rounded-full pointer-events-none">
        {Math.round(scale * 100)}% · 滚轮缩放 · 拖拽平移
      </div>
      <div className="w-full h-full overflow-hidden flex items-center justify-center"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={() => { lastTouch.current = null; }}>
        <img src={src} alt={alt} draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "center center", transition: dragging ? "none" : "transform 0.1s ease", maxWidth: "90vw", maxHeight: "90vh", userSelect: "none" }} />
      </div>
    </div>
  );
}

// ─── Download helper ─────────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.includes("png") ? "png" : "jpg";
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${filename}.${ext}`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch { window.open(url, "_blank"); }
}

// ─── Unified Tile Card ───────────────────────────────────────────────────────

interface TileCardProps {
  item: any;
  onDelete: (id: number) => void;
  onOpenDetail?: (item: any) => void;
  onLightbox?: (src: string, label: string) => void;
  onNavigate?: (path: string) => void;
  onImport?: (id: number) => void;
}

/** Expandable content preview for benchmark report chain items */
function BenchmarkChainItem({ content, isLast }: { content: string; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 200).replace(/#+\s/g, '').replace(/\*\*/g, '');
  return (
    <div className={`mt-2 rounded-lg border text-xs ${isLast ? 'border-primary/20 bg-primary/5' : 'border-border/40 bg-muted/30'}`}>
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
        onClick={() => setExpanded(v => !v)}>
        <span className="text-muted-foreground truncate flex-1">{preview}{content.length > 200 ? '…' : ''}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30">
          <div className="pt-2 prose prose-xs prose-neutral max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 text-xs leading-relaxed">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/80 bg-transparent">{content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function TileCard({ item, onDelete, onOpenDetail, onLightbox, onNavigate, onImport }: TileCardProps) {
  const cfg = MODULE_MAP[item.module] || {
    label: item.module,
    icon: FileText,
    gradient: "from-zinc-900 to-zinc-700",
    iconColor: "text-zinc-300",
    accentColor: "bg-zinc-500/20 text-zinc-300",
  };
  const ModuleIcon = cfg.icon;
  const isRender = item.module === "ai_render" || item.module === "layout_design";
  const displayUrl = item.latestOutputUrl || item.outputUrl;
  const chainLen = item.chainLength || 1;
  const title = item.latestTitle || item.title;

  const handleClick = () => {
    if (item.module === "layout_design") {
      // 图文排版：跳转到图文排版页面
      if (onNavigate) onNavigate("/media/layout");
      return;
    }
    if (isRender && onOpenDetail) {
      // AI 效果图：打开迭代链详情
      onOpenDetail(item);
    } else if (item.module === "ai_video" && onOpenDetail) {
      // AI 视频：打开视频详情
      onOpenDetail(item);
    } else if (item.module === "benchmark_ppt" && item.outputUrl) {
      // PPT：直接打开下载链接
      window.open(item.outputUrl, "_blank");
    } else if (item.module === "benchmark_report" && onOpenDetail) {
      // 案例调研报告：打开编辑链弹窗
      onOpenDetail(item);
    } else if (!isRender && onOpenDetail) {
      // 所有其他文字类模块（小红书、公众号、Instagram、会议纪要等）：打开内容查看弹窗
      onOpenDetail(item);
    } else if (item.outputUrl && isRender && onLightbox) {
      onLightbox(item.outputUrl, title);
    }
  };

  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5"
      onClick={handleClick}>

      {/* Background: image or gradient */}
      {isRender && displayUrl ? (
        <img src={displayUrl} alt={title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : item.module === "ai_video" && displayUrl ? (
        <video src={displayUrl} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient}`} />
      )}

      {/* Dark overlay for non-image tiles */}
      {!isRender && item.module !== "ai_video" && (
        <div className="absolute inset-0 bg-black/20" />
      )}

      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col justify-between p-2.5">
        {/* Top row: module badge + badges */}
        <div className="flex items-start justify-between gap-1">
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm ${isRender ? "bg-black/50 text-white/80" : cfg.accentColor}`}>
            <ModuleIcon className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">{cfg.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {item.latestEnhancedImageUrl && (
              <div className="flex items-center gap-0.5 bg-primary/80 text-white text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                <Sparkles className="h-2.5 w-2.5" />
              </div>
            )}
            {chainLen > 1 && (
              <div className="flex items-center gap-0.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                <Layers className="h-2.5 w-2.5" />
                {chainLen}
              </div>
            )}
          </div>
        </div>

        {/* Center: large icon for non-image tiles */}
        {!isRender && (
          <div className="flex items-center justify-center flex-1">
            <ModuleIcon className={`h-10 w-10 opacity-30 ${cfg.iconColor}`} />
          </div>
        )}

        {/* Bottom: title + time */}
        <div className={`${isRender ? "opacity-0 group-hover:opacity-100 transition-opacity" : ""}`}>
          <div className={`rounded-lg p-2 ${isRender ? "bg-gradient-to-t from-black/70 via-black/40 to-transparent -mx-2.5 -mb-2.5 px-2.5 pb-2.5 pt-4" : ""}`}>
            <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">{title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[10px] text-white/50">{formatTime(item.createdAt)}</p>
              {item.modelName && (
                <span className="text-[9px] text-white/40 bg-white/10 px-1 py-0 rounded truncate max-w-[70px]">{item.modelName}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PPT download button */}
      {item.module === "benchmark_ppt" && item.outputUrl && (
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); window.open(item.outputUrl, "_blank"); }}>
          <div className="h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-colors">
            <Download className="h-3 w-3" />
          </div>
        </div>
      )}

      {/* Import to asset library button for ai_render */}
      {item.module === "ai_render" && (item.latestOutputUrl || item.outputUrl) && onImport && (
        <div className="absolute bottom-1.5 right-14 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); onImport(item.id); }}>
          <div className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-emerald-500/80 hover:text-white transition-colors" title="导入到素材库">
            <FolderPlus className="h-3 w-3" />
          </div>
        </div>
      )}

      {/* Copy prompt button for benchmark_report */}
      {item.module === "benchmark_report" && (item.summary || item.title) && (
        <div className="absolute bottom-1.5 right-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.stopPropagation();
            const promptText = item.summary || item.title || "";
            navigator.clipboard.writeText(promptText)
              .then(() => { const el = e.currentTarget as HTMLElement; el.setAttribute("data-copied", "1"); setTimeout(() => el.removeAttribute("data-copied"), 1500); })
              .catch(() => {});
          }}>
          <div className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors" title="复制提示词">
            <Copy className="h-3 w-3" />
          </div>
        </div>
      )}

      {/* Delete button */}
      <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => e.stopPropagation()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:bg-red-500/80 hover:text-white transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                将删除此条生成记录{isRender && chainLen > 1 ? `及其 ${chainLen} 张迭代图片` : ""}，不可恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(item.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isDetailFullscreen, setIsDetailFullscreen] = useState(false);
  const [contentItem, setContentItem] = useState<any | null>(null);
  const [contentItemId, setContentItemId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const [, navigate] = useLocation();

  // Benchmark report refine state
  const [refineFeedback, setRefineFeedback] = useState("");
  const [currentReportContent, setCurrentReportContent] = useState<string | null>(null);
  const [refineJobId, setRefineJobId] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const refinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const PAGE_SIZE = 30;
  const [loadedCount, setLoadedCount] = useState(PAGE_SIZE);

  const queryInput = useMemo(() => ({
    module: moduleFilter === "all" ? undefined : moduleFilter,
    limit: 500,
    offset: 0,
  }), [moduleFilter]);

  const handleModuleFilterChange = useCallback((val: string) => {
    setModuleFilter(val);
    setLoadedCount(PAGE_SIZE);
  }, []);

  const { data, isLoading } = trpc.history.listGrouped.useQuery(queryInput);
  const chainQuery = trpc.history.getEditChain.useQuery(
    { rootId: selectedRootId! },
    { enabled: !!selectedRootId && detailOpen }
  );

  const allItems = data?.items || [];

  // Group by module, sort groups by most recent item, sort items within group by time
  const groupedModules = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const item of allItems) {
      if (!grouped[item.module]) grouped[item.module] = [];
      grouped[item.module].push(item);
    }
    // Sort items within each group by createdAt desc
    for (const mod of Object.keys(grouped)) {
      grouped[mod].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    // Sort groups by most recent item
    const sortedMods = Object.keys(grouped).sort((a, b) => {
      const latestA = new Date(grouped[a][0]?.createdAt || 0).getTime();
      const latestB = new Date(grouped[b][0]?.createdAt || 0).getTime();
      return latestB - latestA;
    });
    return sortedMods.map(mod => ({ module: mod, items: grouped[mod] }));
  }, [allItems]);

  // Flatten for "load more" pagination (across all groups)
  const totalCount = allItems.length;
  const hasMore = totalCount > loadedCount;

  // Per-group visible counts (for "load more" within a group when filtered)
  const visibleGroupedModules = useMemo(() => {
    if (moduleFilter !== "all") {
      // Single group, apply loadedCount
      return groupedModules.map(g => ({
        ...g,
        items: g.items.slice(0, loadedCount),
      }));
    }
    return groupedModules;
  }, [groupedModules, moduleFilter, loadedCount]);

  const handleContinueEdit = useCallback((imageUrl: string, historyId: number) => {
    navigate(`/design/tools?ref=${encodeURIComponent(imageUrl)}&historyId=${historyId}`);
  }, [navigate]);

  const handleCopyPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => toast.success("提示词已复制到剪贴板")).catch(() => toast.error("复制失败"));
  }, []);

  // Query full content for text-based modules (in case listGrouped truncates large fields)
  const contentDetailQuery = trpc.history.getById.useQuery(
    { id: contentItemId! },
    { enabled: !!contentItemId }
  );

  const handleOpenDetail = useCallback((item: any) => {
    if (item.module === "ai_render" || item.module === "benchmark_report") {
      setSelectedRootId(item.id);
      setSelectedItem(item);
      setDetailOpen(true);
    } else if (item.module === "ai_video") {
      // Open video viewer for ai_video
      setContentItem(item);
      setContentItemId(item.id);
    } else {
      // Open content viewer for all non-render modules
      setContentItem(item); // show immediately with cached data
      setContentItemId(item.id); // trigger full fetch in background
    }
  }, []);

  // Merge full content when getById returns
  const displayContentItem = useMemo(() => {
    if (!contentItem) return null;
    const full = contentDetailQuery.data;
    if (full && full.id === contentItem.id) {
      return { ...contentItem, ...full };
    }
    return contentItem;
  }, [contentItem, contentDetailQuery.data]);

  // Sync currentReportContent when displayContentItem changes
  useEffect(() => {
    if (displayContentItem?.module === "benchmark_report" && displayContentItem.outputContent) {
      setCurrentReportContent(displayContentItem.outputContent);
    }
  }, [displayContentItem?.id, displayContentItem?.outputContent]);

  const refineMutation = trpc.benchmark.refine.useMutation({
    onSuccess: (data) => {
      // Now returns { jobId } - start polling
      setRefineJobId(data.jobId);
      setRefineFeedback("");
    },
    onError: (e) => {
      setIsRefining(false);
      toast.error(e.message || "调整失败，请重试");
    },
  });

  const utils = trpc.useUtils();

  // Poll refine job status
  const pollRefineStatus = useCallback(async (jobId: string) => {
    try {
      const result = await utils.benchmark.pollStatus.fetch({ jobId });
      if (result.status === "done") {
        const content = (result as any).content || "";
        // Append to chat history - user can click "采用此版本" to replace the main report
        setChatHistory(prev => [...prev, { role: "assistant", content }]);
        setIsRefining(false);
        setRefineJobId(null);
        // Refresh the edit chain to show the new version in history
        utils.history.getEditChain.invalidate();
        utils.history.listGrouped.invalidate();
        toast.success("修订版报告已生成，已保存到历史记录");
        return true;
      } else if (result.status === "failed") {
        setIsRefining(false);
        setRefineJobId(null);
        toast.error((result as any).error || "调整失败，请重试");
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Refine Poll] Error:", err);
      return false;
    }
  }, [utils]);

  // Start/stop refine polling when refineJobId changes
  useEffect(() => {
    if (!refineJobId) {
      if (refinePollRef.current) { clearInterval(refinePollRef.current); refinePollRef.current = null; }
      return;
    }
    const poll = async () => {
      const shouldStop = await pollRefineStatus(refineJobId);
      if (shouldStop && refinePollRef.current) { clearInterval(refinePollRef.current); refinePollRef.current = null; }
    };
    const t = setTimeout(poll, 2000);
    refinePollRef.current = setInterval(poll, 3000);
    return () => {
      clearTimeout(t);
      if (refinePollRef.current) { clearInterval(refinePollRef.current); refinePollRef.current = null; }
    };
  }, [refineJobId, pollRefineStatus]);

  const handleRefine = useCallback(() => {
    // Use selectedItem when in the detail dialog (benchmark_report chain view)
    const activeItem = selectedItem || displayContentItem;
    if (!refineFeedback.trim() || !currentReportContent || !activeItem || isRefining) return;
    const userMsg = refineFeedback.trim();
    setChatHistory(prev => [...prev, { role: "user", content: userMsg }]);
    setRefineFeedback("");
    setIsRefining(true);
    // Always use selectedRootId (root of the chain) as parentHistoryId
    // so the refine worker can load caseRefs from the original report's inputParams
    const rootHistoryId = selectedRootId || activeItem.id;
    refineMutation.mutate({
      currentReport: currentReportContent,
      feedback: userMsg,
      projectName: activeItem.title || "未命名项目",
      projectType: "办公空间",
      parentHistoryId: rootHistoryId,
    });
  }, [refineFeedback, currentReportContent, displayContentItem, selectedItem, chainQuery.data, refineMutation, isRefining, selectedRootId]);
  const deleteMutation = trpc.history.delete.useMutation({
    onSuccess: () => { utils.history.listGrouped.invalidate(); toast.success("已删除记录"); },
    onError: (e) => toast.error(e.message || "删除失败"),
  });
  const importMutation = trpc.assets.importFromHistory.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) {
        toast.info("该图片已在素材库中");
      } else {
        toast.success("已导入到素材库");
      }
    },
    onError: (e) => toast.error(e.message || "导入失败"),
  });
  const handleImport = useCallback((historyId: number) => {
    importMutation.mutate({ historyId });
  }, [importMutation]);

  // Project association
  const { data: projectsData } = trpc.projects.list.useQuery({});
  const allProjects = Array.isArray(projectsData) ? projectsData : [];
  const [projectSelectOpen, setProjectSelectOpen] = useState(false);
  const updateProjectMutation = trpc.history.updateProject.useMutation({
    onSuccess: () => {
      utils.history.listGrouped.invalidate();
      utils.history.getEditChain.invalidate();
      utils.history.getById.invalidate();
      toast.success("项目关联已更新");
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const handleAssociateProject = useCallback((historyId: number, projectId: number | null) => {
    updateProjectMutation.mutate({ historyId, projectId });
  }, [updateProjectMutation]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">生成记录</h1>
          <p className="text-sm text-muted-foreground mt-1">所有 AI 生成记录，按类别分组展示</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={moduleFilter} onValueChange={handleModuleFilterChange}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="筛选模块" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模块</SelectItem>
              <SelectItem value="ai_render">AI 效果图</SelectItem>
              <SelectItem value="ai_video">AI 视频</SelectItem>
              <SelectItem value="layout_design">图文排版</SelectItem>
              <SelectItem value="benchmark_report">案例调研报告</SelectItem>
              <SelectItem value="benchmark_ppt">调研 PPT</SelectItem>
              <SelectItem value="meeting_minutes">会议纪要</SelectItem>
              <SelectItem value="media_xiaohongshu">小红书</SelectItem>
              <SelectItem value="media_wechat">公众号</SelectItem>
              <SelectItem value="media_instagram">Instagram</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <HistoryIcon className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-base font-medium mb-1">暂无生成记录</p>
          <p className="text-sm">{moduleFilter === "all" ? "使用平台的 AI 功能后，生成记录将显示在这里" : "该模块暂无生成记录"}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {visibleGroupedModules.map(({ module, items }) => {
            const cfg = MODULE_MAP[module] || { label: module, icon: FileText, gradient: "from-zinc-900 to-zinc-700", iconColor: "text-zinc-300", accentColor: "" };
            const ModuleIcon = cfg.icon;
            return (
              <div key={module}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-3">
                  <ModuleIcon className={`h-4 w-4 ${cfg.iconColor}`} />
                  <h2 className="text-sm font-medium text-foreground">{cfg.label}</h2>
                  <span className="text-xs text-muted-foreground">{items.length} 条</span>
                  <span className="text-xs text-muted-foreground/50">· 最近使用 {formatTime(items[0]?.createdAt)}</span>
                </div>
                {/* Tile grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
                  {items.map((item: any) => (
                    <TileCard
                      key={item.id}
                      item={item}
                      onDelete={(id) => deleteMutation.mutate({ id })}
                      onOpenDetail={handleOpenDetail}
                      onLightbox={(src, label) => setLightbox({ src, label })}
                      onNavigate={(path) => navigate(path)}
                      onImport={handleImport}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Load more (for single-module filter view) */}
          {moduleFilter !== "all" && hasMore && (
            <div className="flex flex-col items-center gap-2 pt-2 pb-4">
              <p className="text-xs text-muted-foreground">已显示 {loadedCount} / {totalCount} 条记录</p>
              <Button variant="outline" size="sm" className="h-8 px-6 text-sm"
                onClick={() => setLoadedCount(c => c + PAGE_SIZE)}>
                <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
                加载更多
              </Button>
            </div>
          )}
          {moduleFilter !== "all" && !hasMore && totalCount > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground py-4">已显示全部 {totalCount} 条记录</p>
          )}
        </div>
      )}

      {/* Detail Dialog for AI Render / Benchmark Report Edit Chain */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) { setChatHistory([]); setCurrentReportContent(null); setRefineFeedback(""); setIsDetailFullscreen(false); } }}>
        <DialogContent className={`flex flex-col p-0 transition-all duration-200 ${
          isDetailFullscreen
            ? '!fixed !inset-4 !max-w-none !w-[calc(100vw-2rem)] !h-[calc(100vh-2rem)] !translate-x-0 !translate-y-0 !left-4 !top-4'
            : selectedItem?.module === 'benchmark_report' ? 'max-w-4xl w-[90vw] max-h-[88vh]' : 'max-w-3xl w-[90vw] max-h-[88vh]'
        }`}>
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0 bg-background z-10 border-b border-border/40">
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              {selectedItem?.module === 'benchmark_report'
                ? <FileText className="h-4 w-4 text-primary" />
                : <Image className="h-4 w-4 text-primary" />}
              {selectedItem?.module === 'benchmark_report' ? '报告修改历史' : '编辑历史'}
              {chainQuery.data && (
                <span className="text-xs font-normal text-muted-foreground ml-1">共 {chainQuery.data.length} 个版本</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsDetailFullscreen(v => !v)}
                  title={isDetailFullscreen ? "缩小" : "放大"}>
                  {isDetailFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {chainQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chainQuery.data && chainQuery.data.length > 0 ? (
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-0 pt-4">
                {chainQuery.data.map((chainItem: any, idx: number) => {
                  const isFirst = idx === 0;
                  const isLast = idx === chainQuery.data!.length - 1;
                  const inputParams = chainItem.inputParams as any;
                  const isBenchmark = selectedItem?.module === 'benchmark_report';
                  const promptText = isBenchmark
                    ? chainItem.summary || ""
                    : (inputParams?.prompt || chainItem.summary || "");
                  const itemTitle = chainItem.title || `第 ${idx + 1} 次生成`;

                  return (
                    <div key={chainItem.id} className="relative">
                      {!isLast && <div className="absolute left-[23px] top-[calc(100%-8px)] w-px h-8 bg-border z-0" />}
                      <div className={`relative flex gap-4 ${!isFirst ? "pt-4" : ""} ${!isLast ? "pb-4" : ""}`}>
                        {/* Timeline icon */}
                        <div className="flex flex-col items-center shrink-0 z-10">
                          <div
                            className={`h-[46px] w-[46px] rounded-lg overflow-hidden border-2 ${isLast ? "border-primary" : "border-border"} ${!isBenchmark ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                            onClick={() => !isBenchmark && chainItem.outputUrl && setLightbox({ src: chainItem.outputUrl, label: itemTitle })}
                            title={!isBenchmark ? "点击放大查看" : ""}>
                            {!isBenchmark && chainItem.outputUrl ? (
                              <img src={chainItem.outputUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-muted flex items-center justify-center">
                                {isBenchmark
                                  ? <FileText className="h-4 w-4 text-amber-500/60" />
                                  : <Image className="h-4 w-4 text-muted-foreground/40" />}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isFirst ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {isFirst ? "初始生成" : `第 ${idx + 1} 次修改`}
                                </span>
                                <span className="text-[11px] text-muted-foreground/60">{formatFullTime(chainItem.createdAt)}</span>
                                {chainItem.modelName && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/80 text-muted-foreground/70 font-mono">{chainItem.modelName}</span>
                                )}
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{promptText}</p>
                              {!isBenchmark && inputParams?.style && (
                                <span className="inline-block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1">
                                  风格: {inputParams.style}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                              {/* Per-version project selector */}
                              <div className="flex items-center gap-1">
                                {chainItem.projectId ? (
                                  <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded-full">
                                    <FolderOpen className="h-2.5 w-2.5" />
                                    {allProjects.find((p: any) => p.id === chainItem.projectId)?.name || '项目'}
                                  </span>
                                ) : null}
                                <Select
                                  value={chainItem.projectId?.toString() || ""}
                                  onValueChange={(val) => {
                                    if (val === "__none__") handleAssociateProject(chainItem.id, null);
                                    else handleAssociateProject(chainItem.id, Number(val));
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-[10px] border-dashed border-muted-foreground/30 bg-transparent w-auto px-1.5 gap-1 text-muted-foreground hover:text-foreground hover:border-muted-foreground/60">
                                    <Link2 className="h-2.5 w-2.5 shrink-0" />
                                    <span>{chainItem.projectId ? '切换' : '关联项目'}</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {chainItem.projectId && <SelectItem value="__none__">解除关联</SelectItem>}
                                    {allProjects.map((p: any) => (
                                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                                    ))}
                                    {allProjects.length === 0 && (
                                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">暂无项目</div>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              {isBenchmark ? (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      const content = chainItem.outputContent || "";
                                      navigator.clipboard.writeText(content).then(() => toast.success("已复制到剪贴板，在飞书文档中粘贴即可")).catch(() => toast.error("复制失败"));
                                    }} title="复制到飞书">
                                    <Copy className="h-3 w-3 mr-1" />
                                    复制到飞书
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setCurrentReportContent(chainItem.outputContent || "");
                                      toast.success("已加载此版本，可在下方继续修改");
                                    }} title="基于此版本继续修改">
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    继续修改
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary/80"
                                    onClick={() => {
                                      const targetId = chainItem.id;
                                      setDetailOpen(false);
                                      setTimeout(() => navigate(`/design/planning?historyId=${targetId}`), 150);
                                    }} title="跳转到案例调研页面编辑此版本">
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    编辑此版本
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleCopyPrompt(promptText)} title="复制提示词">
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  {chainItem.outputUrl && (
                                    <>
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                        onClick={() => setLightbox({ src: chainItem.outputUrl!, label: itemTitle })} title="放大查看">
                                        <Maximize2 className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                        onClick={() => downloadImage(chainItem.outputUrl!, itemTitle)} title="下载原图">
                                        <Download className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-emerald-500"
                                        onClick={() => handleImport(chainItem.id)} title="导入到素材库">
                                        <FolderPlus className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                        onClick={() => { setDetailOpen(false); handleContinueEdit(chainItem.outputUrl!, chainItem.id); }} title="使用此图片继续生成">
                                        <RefreshCw className="h-3 w-3" />
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Benchmark report: expandable content preview */}
                          {isBenchmark && chainItem.outputContent && (
                            <BenchmarkChainItem content={chainItem.outputContent} isLast={isLast} />
                          )}

                          {/* AI render: image preview */}
                          {!isBenchmark && chainItem.outputUrl && (
                            <div className="mt-2 space-y-2">
                              <div className="rounded-lg overflow-hidden border border-border/50 bg-muted cursor-zoom-in group/img relative"
                                onClick={() => setLightbox({ src: chainItem.outputUrl!, label: itemTitle })}>
                                <img src={chainItem.outputUrl} alt={chainItem.title} className="w-full h-auto max-h-[320px] object-contain" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/20">
                                  <div className="bg-black/60 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5">
                                    <Maximize2 className="h-3 w-3" />
                                    点击放大
                                  </div>
                                </div>
                              </div>
                              {chainItem.enhancedImageUrl && (
                                <div className="rounded-lg overflow-hidden border border-primary/20 bg-muted cursor-zoom-in group/enh relative"
                                  onClick={() => setLightbox({ src: chainItem.enhancedImageUrl!, label: `${itemTitle} (增强版)` })}>
                                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-primary/80 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    增强版
                                  </div>
                                  <img src={chainItem.enhancedImageUrl} alt="增强版" className="w-full h-auto max-h-[320px] object-contain" />
                                  <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover/enh:opacity-100 transition-opacity">
                                    <button className="h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                                      onClick={(e) => { e.stopPropagation(); downloadImage(chainItem.enhancedImageUrl!, `${itemTitle}-enhanced`); }} title="下载增强版">
                                      <Download className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Benchmark report: refine input area at bottom of chain */}
              {selectedItem?.module === 'benchmark_report' && (
                <div className="mt-6 border-t border-border/40 pt-4">
                  {/* Chat history */}
                  {chatHistory.length > 0 && (
                    <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground border border-border/40'
                          }`}>
                            {msg.role === 'user' ? msg.content : (
                              <span className="text-muted-foreground italic">修订版已保存到上方历史记录中</span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                  {/* Input */}
                  <div className="flex gap-2">
                    <Textarea
                      value={refineFeedback}
                      onChange={(e) => setRefineFeedback(e.target.value)}
                      placeholder="描述你的修改意见，例如：增加更多国内案例，重点关注制造业办公空间…"
                      className="flex-1 min-h-[60px] max-h-[120px] text-sm resize-none"
                      disabled={isRefining}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRefine(); }}
                    />
                    <Button
                      onClick={handleRefine}
                      disabled={isRefining || !refineFeedback.trim() || !currentReportContent}
                      className="shrink-0 self-end h-9 px-3"
                    >
                      {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {isRefining && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      AI 正在修改报告，通常需要 2-3 分钟，完成后将自动保存到上方历史记录…
                    </p>
                  )}
                  {!currentReportContent && (
                    <p className="text-xs text-muted-foreground mt-2">请先点击某个版本的「继续修改」按钮加载内容</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">暂无编辑历史</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Content Viewer Dialog for text-based modules */}
      <Dialog open={!!contentItem} onOpenChange={(open) => { if (!open) { setContentItem(null); setContentItemId(null); setCurrentReportContent(null); setRefineFeedback(""); } }}>
        <DialogContent className="max-w-2xl w-[90vw] max-h-[88vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {displayContentItem && (() => {
                    const cfg = MODULE_MAP[displayContentItem.module];
                    const Icon = cfg?.icon || FileText;
                    return <Icon className={`h-4 w-4 shrink-0 ${cfg?.iconColor || "text-muted-foreground"}`} />;
                  })()}
                  <span className="text-xs text-muted-foreground">{displayContentItem && MODULE_MAP[displayContentItem.module]?.label}</span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground/50">{displayContentItem && formatFullTime(displayContentItem.createdAt)}</span>
                  {displayContentItem?.modelName && (
                    <>
                      <span className="text-xs text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground/60 font-mono bg-muted px-1.5 py-0 rounded">{displayContentItem.modelName}</span>
                    </>
                  )}
                </div>
                <DialogTitle className="text-base font-medium leading-snug">{displayContentItem?.title}</DialogTitle>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Project association selector for content dialog */}
                {displayContentItem && (() => {
                  const cProjId = displayContentItem.projectId;
                  const cProjName = allProjects.find((p: any) => p.id === cProjId)?.name;
                  return (
                    <div className="flex items-center gap-1 mr-1">
                      {cProjId ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full">
                            <FolderOpen className="h-3 w-3" />
                            {cProjName || '项目'}
                          </span>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            title="解除项目关联"
                            disabled={updateProjectMutation.isPending}
                            onClick={() => handleAssociateProject(displayContentItem.id, null)}>
                            <Link2Off className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : null}
                      <Select
                        value={cProjId?.toString() || ""}
                        onValueChange={(val) => {
                          if (val === "__none__") handleAssociateProject(displayContentItem.id, null);
                          else handleAssociateProject(displayContentItem.id, Number(val));
                        }}
                      >
                        <SelectTrigger className="h-6 text-[11px] border-dashed border-muted-foreground/30 bg-transparent w-auto px-2 gap-1 text-muted-foreground hover:text-foreground hover:border-muted-foreground/60">
                          <Link2 className="h-3 w-3 shrink-0" />
                          <span>{cProjId ? '切换项目' : '关联项目'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {cProjId && <SelectItem value="__none__">解除关联</SelectItem>}
                          {allProjects.map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                          {allProjects.length === 0 && (
                            <div className="px-2 py-3 text-xs text-muted-foreground text-center">暂无项目</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                {displayContentItem?.outputContent && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      const text = displayContentItem?.outputContent || "";
                      navigator.clipboard.writeText(text).then(() => toast.success("内容已复制")).catch(() => toast.error("复制失败"));
                    }}>
                    <Copy className="h-3 w-3 mr-1" />
                    复制
                  </Button>
                )}
                {displayContentItem?.outputUrl && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => window.open(displayContentItem.outputUrl, "_blank")}>
                    <Download className="h-3 w-3 mr-1" />
                    下载
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {contentDetailQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                加载中…
              </div>
            ) : displayContentItem?.module === "ai_video" && displayContentItem?.outputUrl ? (
              <div className="space-y-4">
                <video
                  src={displayContentItem.outputUrl}
                  controls
                  className="w-full rounded-lg bg-black"
                />
                {displayContentItem?.summary && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">描述</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{displayContentItem.summary}</p>
                  </div>
                )}
              </div>
            ) : (currentReportContent || displayContentItem?.outputContent) ? (
              <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                <ReportMarkdown>{currentReportContent || displayContentItem?.outputContent || ""}</ReportMarkdown>
              </div>
            ) : displayContentItem?.summary ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground/80 leading-relaxed">{displayContentItem.summary}</p>
                <p className="text-xs text-muted-foreground/60 border-t border-border/30 pt-3">此记录的完整内容未保存，仅昺示摘要。重新生成可查看完整内容。</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无内容</p>
            )}
          </div>

          {/* Refine input for benchmark_report */}
          {displayContentItem?.module === "benchmark_report" && (currentReportContent || displayContentItem?.outputContent) && (
            <div className="shrink-0 border-t border-border/40 px-6 py-4 bg-muted/20 space-y-3">
              {/* Chat history */}
              {chatHistory.length > 0 && (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} gap-1`}>
                      {msg.role === "user" ? (
                        <div className="rounded-lg px-3 py-2 text-sm max-w-[85%] bg-primary text-primary-foreground">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="w-full rounded-lg border bg-background overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                            <span className="text-xs font-medium text-foreground/60">修订版报告</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => setCurrentReportContent(msg.content)}
                            >
                              采用此版本
                            </Button>
                          </div>
                          <div className="p-3 prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 max-h-80 overflow-y-auto">
                            <ReportMarkdown>{msg.content}</ReportMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input area */}
              <p className="text-xs text-muted-foreground">对报告提出修改意见，AI 将生成修订版并显示在下方，可点「采用此版本」替换上方报告</p>
              {isRefining && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  AI 正在调整报告，通常需要 2-3 分钒…
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={refineFeedback}
                  onChange={(e) => setRefineFeedback(e.target.value)}
                  placeholder="例如：增加更多国内案例、把展厅部分扩充、调整报告结构…"
                  className="flex-1 min-h-[72px] max-h-[120px] text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleRefine();
                    }
                  }}
                  disabled={isRefining}
                />
                <Button
                  size="sm"
                  className="self-end h-9 px-3 shrink-0"
                  onClick={handleRefine}
                  disabled={!refineFeedback.trim() || isRefining}
                >
                  {isRefining ? (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
