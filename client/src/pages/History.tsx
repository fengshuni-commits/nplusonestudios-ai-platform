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
  RotateCcw,
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

// ─── Module Config ───────────────────────────────────────────────────────────

const MODULE_MAP: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconColor: string;
  accentColor: string;
}> = {
  benchmark_report: {
    label: "对标调研报告",
    icon: FileText,
    gradient: "from-blue-950 to-blue-800",
    iconColor: "text-blue-300",
    accentColor: "bg-blue-500/20 text-blue-300",
  },
  benchmark_ppt: {
    label: "调研 PPT",
    icon: Presentation,
    gradient: "from-violet-950 to-violet-800",
    iconColor: "text-violet-300",
    accentColor: "bg-violet-500/20 text-violet-300",
  },
  ai_render: {
    label: "AI 效果图",
    icon: Image,
    gradient: "from-emerald-950 to-emerald-800",
    iconColor: "text-emerald-300",
    accentColor: "bg-emerald-500/20 text-emerald-300",
  },
  meeting_minutes: {
    label: "会议纪要",
    icon: MessageSquare,
    gradient: "from-amber-950 to-amber-800",
    iconColor: "text-amber-300",
    accentColor: "bg-amber-500/20 text-amber-300",
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
    gradient: "from-green-950 to-green-800",
    iconColor: "text-green-300",
    accentColor: "bg-green-500/20 text-green-300",
  },
  media_instagram: {
    label: "Instagram",
    icon: Instagram,
    gradient: "from-pink-950 to-pink-800",
    iconColor: "text-pink-300",
    accentColor: "bg-pink-500/20 text-pink-300",
  },
};

// Module display order
const MODULE_ORDER = [
  "ai_render",
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
}

function TileCard({ item, onDelete, onOpenDetail, onLightbox }: TileCardProps) {
  const cfg = MODULE_MAP[item.module] || {
    label: item.module,
    icon: FileText,
    gradient: "from-zinc-900 to-zinc-700",
    iconColor: "text-zinc-300",
    accentColor: "bg-zinc-500/20 text-zinc-300",
  };
  const ModuleIcon = cfg.icon;
  const isRender = item.module === "ai_render";
  const displayUrl = item.latestOutputUrl || item.outputUrl;
  const chainLen = item.chainLength || 1;
  const title = item.latestTitle || item.title;

  const handleClick = () => {
    if (isRender && onOpenDetail) {
      onOpenDetail(item);
    } else if (item.outputUrl && item.module === "benchmark_ppt") {
      window.open(item.outputUrl, "_blank");
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
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient}`} />
      )}

      {/* Dark overlay for non-image tiles */}
      {!isRender && (
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
              <div className="flex items-center gap-0.5 bg-emerald-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
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
            <p className="text-[10px] text-white/50 mt-0.5">{formatTime(item.createdAt)}</p>
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [contentItem, setContentItem] = useState<any | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const [, navigate] = useLocation();

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

  const handleOpenDetail = useCallback((item: any) => {
    if (item.module === "ai_render") {
      setSelectedRootId(item.id);
      setDetailOpen(true);
    } else if (item.outputContent || item.outputUrl) {
      setContentItem(item);
    }
  }, []);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.history.delete.useMutation({
    onSuccess: () => { utils.history.listGrouped.invalidate(); toast.success("已删除记录"); },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

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
              <SelectItem value="benchmark_report">对标调研报告</SelectItem>
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

      {/* Detail Dialog for AI Render Edit Chain */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[88vh] overflow-y-auto p-0 resize">
          <DialogHeader className="px-6 pt-6 pb-2 sticky top-0 bg-background z-10 border-b border-border/40">
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              <Image className="h-4 w-4 text-emerald-600" />
              编辑历史
              {chainQuery.data && (
                <span className="text-xs font-normal text-muted-foreground ml-1">共 {chainQuery.data.length} 次生成</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {chainQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chainQuery.data && chainQuery.data.length > 0 ? (
            <div className="px-6 pb-6">
              <div className="space-y-0 pt-4">
                {chainQuery.data.map((chainItem: any, idx: number) => {
                  const isFirst = idx === 0;
                  const isLast = idx === chainQuery.data!.length - 1;
                  const inputParams = chainItem.inputParams as any;
                  const promptText = inputParams?.prompt || chainItem.summary || "";
                  const itemTitle = chainItem.title || `第 ${idx + 1} 次生成`;

                  return (
                    <div key={chainItem.id} className="relative">
                      {!isLast && <div className="absolute left-[23px] top-[calc(100%-8px)] w-px h-8 bg-border z-0" />}
                      <div className={`relative flex gap-4 ${!isFirst ? "pt-4" : ""} ${!isLast ? "pb-4" : ""}`}>
                        {/* Timeline thumbnail */}
                        <div className="flex flex-col items-center shrink-0 z-10">
                          <div
                            className={`h-[46px] w-[46px] rounded-lg overflow-hidden border-2 cursor-pointer hover:opacity-80 transition-opacity ${isLast ? "border-emerald-500" : "border-border"}`}
                            onClick={() => chainItem.outputUrl && setLightbox({ src: chainItem.outputUrl, label: itemTitle })}
                            title="点击放大查看">
                            {chainItem.outputUrl ? (
                              <img src={chainItem.outputUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-muted flex items-center justify-center">
                                <Image className="h-4 w-4 text-muted-foreground/40" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isFirst ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                                  {isFirst ? "初始生成" : `第 ${idx + 1} 次编辑`}
                                </span>
                                <span className="text-[11px] text-muted-foreground/60">{formatFullTime(chainItem.createdAt)}</span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{promptText}</p>
                              {inputParams?.style && (
                                <span className="inline-block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1">
                                  风格: {inputParams.style}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
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
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => { setDetailOpen(false); handleContinueEdit(chainItem.outputUrl!, chainItem.id); }} title="使用此图片继续生成">
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {chainItem.outputUrl && (
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
                              {/* Enhanced image */}
                              {chainItem.enhancedImageUrl && (
                                <div className="rounded-lg overflow-hidden border border-emerald-500/30 bg-muted cursor-zoom-in group/enh relative"
                                  onClick={() => setLightbox({ src: chainItem.enhancedImageUrl!, label: `${itemTitle} (增强版)` })}>
                                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-emerald-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full">
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
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">暂无编辑历史</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Content Viewer Dialog for text-based modules */}
      <Dialog open={!!contentItem} onOpenChange={(open) => { if (!open) setContentItem(null); }}>
        <DialogContent className="max-w-2xl w-[90vw] max-h-[88vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {contentItem && (() => {
                    const cfg = MODULE_MAP[contentItem.module];
                    const Icon = cfg?.icon || FileText;
                    return <Icon className={`h-4 w-4 shrink-0 ${cfg?.iconColor || "text-muted-foreground"}`} />;
                  })()}
                  <span className="text-xs text-muted-foreground">{contentItem && MODULE_MAP[contentItem.module]?.label}</span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground/50">{contentItem && formatFullTime(contentItem.createdAt)}</span>
                </div>
                <DialogTitle className="text-base font-medium leading-snug">{contentItem?.title}</DialogTitle>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    const text = contentItem?.outputContent || contentItem?.summary || "";
                    navigator.clipboard.writeText(text).then(() => toast.success("内容已复制")).catch(() => toast.error("复制失败"));
                  }}>
                  <Copy className="h-3 w-3 mr-1" />
                  复制
                </Button>
                {contentItem?.outputUrl && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => window.open(contentItem.outputUrl, "_blank")}>
                    <Download className="h-3 w-3 mr-1" />
                    下载
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {contentItem?.outputContent ? (
              <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 bg-transparent p-0 border-0">
                  {contentItem.outputContent}
                </pre>
              </div>
            ) : contentItem?.summary ? (
              <p className="text-sm text-foreground/80 leading-relaxed">{contentItem.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground">暂无内容</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
