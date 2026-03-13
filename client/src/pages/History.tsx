import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
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

export default function HistoryPage() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
  const total = data?.total || 0;

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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              <Image className="h-4 w-4 text-emerald-600" />
              编辑历史
            </DialogTitle>
          </DialogHeader>

          {chainQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chainQuery.data && chainQuery.data.length > 0 ? (
            <div className="px-6 pb-6">
              {/* Edit chain timeline */}
              <div className="space-y-0">
                {chainQuery.data.map((chainItem: any, idx: number) => {
                  const isFirst = idx === 0;
                  const isLast = idx === chainQuery.data!.length - 1;
                  const inputParams = chainItem.inputParams as any;
                  const promptText = inputParams?.prompt || chainItem.summary || "";

                  return (
                    <div key={chainItem.id} className="relative">
                      {/* Timeline connector */}
                      {!isLast && (
                        <div className="absolute left-[23px] top-[calc(100%-8px)] w-px h-8 bg-border z-0" />
                      )}

                      <div className={`relative flex gap-4 ${!isFirst ? "pt-4" : ""} ${!isLast ? "pb-4" : ""}`}>
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center shrink-0 z-10">
                          <div className={`h-[46px] w-[46px] rounded-lg overflow-hidden border-2 ${isLast ? "border-emerald-500" : "border-border"}`}>
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
                              )}
                            </div>
                          </div>

                          {/* Large preview for the image */}
                          {chainItem.outputUrl && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-border/50 bg-muted">
                              <img
                                src={chainItem.outputUrl}
                                alt={chainItem.title}
                                className="w-full h-auto max-h-[300px] object-contain"
                              />
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
    </div>
  );
}
