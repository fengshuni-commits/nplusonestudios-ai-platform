import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  ExternalLink,
  Loader2,
  History as HistoryIcon,
  Filter,
  RefreshCw,
  BookOpen,
  Instagram,
  Megaphone,
  Copy,
  Layers,
  ArrowRight,
  X,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
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

const MODULE_MAP: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  benchmark_report: { label: "对标调研报告", icon: FileText, color: "text-blue-600 bg-blue-50" },
  benchmark_ppt: { label: "调研 PPT", icon: Presentation, color: "text-purple-600 bg-purple-50" },
  ai_render: { label: "AI 效果图", icon: Image, color: "text-emerald-600 bg-emerald-50" },
  meeting_minutes: { label: "会议纪要", icon: MessageSquare, color: "text-amber-600 bg-amber-50" },
  media_xiaohongshu: { label: "小红书", icon: BookOpen, color: "text-red-500 bg-red-50" },
  media_wechat: { label: "公众号", icon: Megaphone, color: "text-green-600 bg-green-50" },
  media_instagram: { label: "Instagram", icon: Instagram, color: "text-pink-500 bg-pink-50" },
};

function formatTime(dateStr: string | Date): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (days === 1) {
    return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }
}

function formatFullTime(dateStr: string | Date): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Image Lightbox ─────────────────────────────────────────────────────────

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

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(prev => {
      const next = prev * (e.deltaY < 0 ? 1.15 : 0.87);
      return Math.min(Math.max(next, 0.2), 8);
    });
  }, []);

  // Drag pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.x,
      y: dragStart.current.oy + e.clientY - dragStart.current.y,
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
  }, []);

  // Touch support
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
      setOffset({
        x: lastTouch.current.ox + t.clientX - lastTouch.current.x,
        y: lastTouch.current.oy + t.clientY - lastTouch.current.y,
      });
    }
  }, []);

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  // Download helper
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
    } catch {
      window.open(src, "_blank");
    }
  }, [src, label]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none">
        <span className="text-white/80 text-sm font-medium pointer-events-auto">
          {label || alt || "图片预览"}
        </span>
        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={() => setScale(s => Math.min(s * 1.25, 8))}
            title="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={() => setScale(s => Math.max(s * 0.8, 0.2))}
            title="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={resetView}
            title="重置视图"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={handleDownload}
            title="下载图片"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-red-500/60 flex items-center justify-center text-white transition-colors ml-1"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scale indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/70 text-xs px-3 py-1 rounded-full pointer-events-none">
        {Math.round(scale * 100)}% · 滚轮缩放 · 拖拽平移
      </div>

      {/* Image canvas */}
      <div
        className="w-full h-full overflow-hidden flex items-center justify-center"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { lastTouch.current = null; }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.1s ease",
            maxWidth: "90vw",
            maxHeight: "90vh",
            userSelect: "none",
          }}
        />
      </div>
    </div>
  );
}

// ─── Download helper (inline, no lightbox) ──────────────────────────────────

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
  } catch {
    window.open(url, "_blank");
  }
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedEnhance, setExpandedEnhance] = useState<Record<number, boolean>>({});
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const [, navigate] = useLocation();

  const queryInput = useMemo(() => ({
    module: moduleFilter === "all" ? undefined : moduleFilter,
    limit: 50,
    offset: 0,
  }), [moduleFilter]);

  const { data, isLoading } = trpc.history.listGrouped.useQuery(queryInput);

  // Fetch edit chain when a render item is selected
  const chainQuery = trpc.history.getEditChain.useQuery(
    { rootId: selectedRootId! },
    { enabled: !!selectedRootId && detailOpen }
  );

  const items = data?.items || [];

  // Navigate to design tools with reference image URL
  const handleContinueEdit = useCallback((imageUrl: string, historyId: number) => {
    navigate(`/design/tools?ref=${encodeURIComponent(imageUrl)}&historyId=${historyId}`);
  }, [navigate]);

  const handleCopyPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => {
      toast.success("提示词已复制到剪贴板");
    }).catch(() => {
      toast.error("复制失败");
    });
  }, []);

  const handleOpenDetail = useCallback((item: any) => {
    if (item.module === "ai_render") {
      setSelectedRootId(item.id);
      setDetailOpen(true);
    }
  }, []);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.history.delete.useMutation({
    onSuccess: () => {
      utils.history.listGrouped.invalidate();
      toast.success("已删除记录");
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  // Separate render items and non-render items
  const renderItems = items.filter((i: any) => i.module === "ai_render");
  const otherItems = items.filter((i: any) => i.module !== "ai_render");

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">生成记录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看所有 AI 生成记录，点击缩略图查看详情
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <HistoryIcon className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-base font-medium mb-1">暂无生成记录</p>
          <p className="text-sm">
            {moduleFilter === "all"
              ? "使用平台的 AI 功能后，生成记录将显示在这里"
              : "该模块暂无生成记录"}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* AI Render Thumbnail Grid */}
          {(moduleFilter === "all" || moduleFilter === "ai_render") && renderItems.length > 0 && (
            <div>
              {moduleFilter === "all" && (
                <div className="flex items-center gap-2 mb-3">
                  <Image className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-medium text-foreground">AI 效果图</h2>
                  <span className="text-xs text-muted-foreground">
                    {renderItems.length} 组
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {renderItems.map((item: any) => {
                  const displayUrl = item.latestOutputUrl || item.outputUrl;
                  const chainLen = item.chainLength || 1;
                  return (
                    <div
                      key={item.id}
                      className="group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer border border-border/40 hover:border-primary/50 transition-all hover:shadow-md"
                      onClick={() => handleOpenDetail(item)}
                    >
                      {displayUrl ? (
                        <img
                          src={displayUrl}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Enhanced badge */}
                      {item.latestEnhancedImageUrl && (
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-emerald-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          <Sparkles className="h-2.5 w-2.5" />
                        </div>
                      )}
                      {/* Chain badge */}
                      {chainLen > 1 && (
                        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                          <Layers className="h-2.5 w-2.5" />
                          {chainLen}
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <p className="text-[11px] text-white/90 line-clamp-2 leading-tight">
                            {item.latestTitle || item.title}
                          </p>
                          <p className="text-[10px] text-white/60 mt-0.5">
                            {formatTime(item.createdAt)}
                          </p>
                        </div>
                        {/* Delete button */}
                        <div className="absolute top-1.5 left-1.5" onClick={(e) => e.stopPropagation()}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/80 hover:bg-red-500/80 hover:text-white transition-colors">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确认删除</AlertDialogTitle>
                                <AlertDialogDescription>将删除此条生成记录及其所有编辑历史，不可恢复。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate({ id: item.id })}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other Module Items - compact list */}
          {(moduleFilter === "all" ? otherItems.length > 0 : moduleFilter !== "ai_render") && (
            <div>
              {moduleFilter === "all" && otherItems.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-foreground">其他记录</h2>
                  <span className="text-xs text-muted-foreground">
                    {otherItems.length} 条
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {(moduleFilter === "all" ? otherItems : items.filter((i: any) => i.module !== "ai_render")).map((item: any) => {
                  const moduleInfo = MODULE_MAP[item.module] || {
                    label: item.module,
                    icon: FileText,
                    color: "text-gray-600 bg-gray-50",
                  };
                  const ModuleIcon = moduleInfo.icon;

                  return (
                    <Card key={item.id} className="border border-border/50 shadow-none hover:border-border transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${moduleInfo.color}`}>
                            <ModuleIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-foreground truncate">
                              {item.title}
                            </h3>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mt-0.5">
                              <span>{moduleInfo.label}</span>
                              <span>{formatTime(item.createdAt)}</span>
                            </div>
                          </div>
                          {item.outputUrl && item.status === "success" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => window.open(item.outputUrl!, "_blank")}
                            >
                              {item.module === "benchmark_ppt" ? (
                                <Download className="h-3.5 w-3.5" />
                              ) : (
                                <ExternalLink className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确认删除</AlertDialogTitle>
                                <AlertDialogDescription>将删除此条生成记录，不可恢复。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate({ id: item.id })}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
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
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  共 {chainQuery.data.length} 次生成
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {chainQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chainQuery.data && chainQuery.data.length > 0 ? (
            <div className="px-6 pb-6">
              {/* Edit chain timeline */}
              <div className="space-y-0 pt-4">
                {chainQuery.data.map((chainItem: any, idx: number) => {
                  const isFirst = idx === 0;
                  const isLast = idx === chainQuery.data!.length - 1;
                  const inputParams = chainItem.inputParams as any;
                  const promptText = inputParams?.prompt || chainItem.summary || "";
                  const itemTitle = chainItem.title || `第 ${idx + 1} 次生成`;

                  return (
                    <div key={chainItem.id} className="relative">
                      {/* Timeline connector */}
                      {!isLast && (
                        <div className="absolute left-[23px] top-[calc(100%-8px)] w-px h-8 bg-border z-0" />
                      )}

                      <div className={`relative flex gap-4 ${!isFirst ? "pt-4" : ""} ${!isLast ? "pb-4" : ""}`}>
                        {/* Timeline thumbnail */}
                        <div className="flex flex-col items-center shrink-0 z-10">
                          <div
                            className={`h-[46px] w-[46px] rounded-lg overflow-hidden border-2 cursor-pointer hover:opacity-80 transition-opacity ${isLast ? "border-emerald-500" : "border-border"}`}
                            onClick={() => chainItem.outputUrl && setLightbox({ src: chainItem.outputUrl, label: itemTitle })}
                            title="点击放大查看"
                          >
                            {chainItem.outputUrl ? (
                              <img
                                src={chainItem.outputUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
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
                                <span className="text-[11px] text-muted-foreground/60">
                                  {formatFullTime(chainItem.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed">
                                {promptText}
                              </p>
                              {inputParams?.style && (
                                <span className="inline-block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1">
                                  风格: {inputParams.style}
                                </span>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                onClick={() => handleCopyPrompt(promptText)}
                                title="复制提示词"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              {chainItem.outputUrl && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setLightbox({ src: chainItem.outputUrl!, label: itemTitle })}
                                    title="放大查看"
                                  >
                                    <Maximize2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => downloadImage(chainItem.outputUrl!, itemTitle)}
                                    title="下载原图"
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setDetailOpen(false);
                                      handleContinueEdit(chainItem.outputUrl!, chainItem.id);
                                    }}
                                    title="使用此图片继续生成"
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Large preview for the image */}
                          {chainItem.outputUrl && (
                            <div className="mt-2 space-y-2">
                              <div
                                className="rounded-lg overflow-hidden border border-border/50 bg-muted cursor-zoom-in group/img relative"
                                onClick={() => setLightbox({ src: chainItem.outputUrl!, label: itemTitle })}
                              >
                                <img
                                  src={chainItem.outputUrl}
                                  alt={chainItem.title}
                                  className="w-full h-auto max-h-[320px] object-contain"
                                />
                                {/* Hover hint */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/20">
                                  <div className="bg-black/60 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5">
                                    <Maximize2 className="h-3 w-3" />
                                    点击放大
                                  </div>
                                </div>
                              </div>

                              {/* Enhanced image section */}
                              {chainItem.enhancedImageUrl && (
                                <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/30 overflow-hidden">
                                  <button
                                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50/50 transition-colors"
                                    onClick={() => setExpandedEnhance(prev => ({ ...prev, [chainItem.id]: !prev[chainItem.id] }))}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Sparkles className="h-3 w-3" />
                                      Magnific 增强版
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800 bg-emerald-100/60 hover:bg-emerald-100 px-2 py-0.5 rounded-full transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setLightbox({ src: chainItem.enhancedImageUrl!, label: `${itemTitle}（增强版）` });
                                        }}
                                        title="放大查看增强版"
                                      >
                                        <Maximize2 className="h-2.5 w-2.5" />
                                        放大
                                      </button>
                                      <button
                                        className="flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800 bg-emerald-100/60 hover:bg-emerald-100 px-2 py-0.5 rounded-full transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadImage(chainItem.enhancedImageUrl!, `${itemTitle}-增强版`);
                                        }}
                                        title="下载增强版"
                                      >
                                        <Download className="h-2.5 w-2.5" />
                                        下载
                                      </button>
                                      {expandedEnhance[chainItem.id] ? (
                                        <ChevronUp className="h-3 w-3" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3" />
                                      )}
                                    </div>
                                  </button>
                                  {expandedEnhance[chainItem.id] && (
                                    <div className="px-3 pb-3">
                                      {/* Side-by-side comparison */}
                                      <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                          <p className="text-[10px] text-muted-foreground mb-1 text-center">原图</p>
                                          <div
                                            className="rounded overflow-hidden border border-border/40 bg-muted cursor-zoom-in"
                                            onClick={() => setLightbox({ src: chainItem.outputUrl!, label: `${itemTitle}（原图）` })}
                                          >
                                            <img
                                              src={chainItem.outputUrl}
                                              alt="原图"
                                              className="w-full h-auto max-h-[200px] object-contain"
                                            />
                                          </div>
                                          <button
                                            className="w-full mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground py-0.5"
                                            onClick={() => downloadImage(chainItem.outputUrl!, `${itemTitle}-原图`)}
                                          >
                                            <Download className="h-2.5 w-2.5" />
                                            下载原图
                                          </button>
                                        </div>
                                        <div>
                                          <p className="text-[10px] text-emerald-600 mb-1 text-center font-medium">增强后</p>
                                          <div
                                            className="rounded overflow-hidden border border-emerald-200 bg-muted cursor-zoom-in"
                                            onClick={() => setLightbox({ src: chainItem.enhancedImageUrl!, label: `${itemTitle}（增强版）` })}
                                          >
                                            <img
                                              src={chainItem.enhancedImageUrl}
                                              alt="增强版"
                                              className="w-full h-auto max-h-[200px] object-contain"
                                            />
                                          </div>
                                          <button
                                            className="w-full mt-1 flex items-center justify-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800 py-0.5"
                                            onClick={() => downloadImage(chainItem.enhancedImageUrl!, `${itemTitle}-增强版`)}
                                          >
                                            <Download className="h-2.5 w-2.5" />
                                            下载增强版
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Arrow between items */}
                      {!isLast && (
                        <div className="flex items-center justify-center py-1 pl-[23px]">
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40 rotate-90" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom action bar */}
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  共 {chainQuery.data.length} 次生成
                </p>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const lastItem = chainQuery.data![chainQuery.data!.length - 1];
                    if (lastItem?.outputUrl) {
                      setDetailOpen(false);
                      handleContinueEdit(lastItem.outputUrl, lastItem.id);
                    }
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  继续编辑最新版本
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Image className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">暂无编辑记录</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox overlay */}
      {lightbox && (
        <Lightbox
          src={lightbox.src}
          label={lightbox.label}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
