import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
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
  FileText,
  Presentation,
  Image,
  MessageSquare,
  Clock,
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  History as HistoryIcon,
  Filter,
  RefreshCw,
  BookOpen,
  Instagram,
  Megaphone,
} from "lucide-react";
import { useLocation } from "wouter";

const MODULE_MAP: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  benchmark_report: { label: "对标调研报告", icon: FileText, color: "text-blue-600 bg-blue-50" },
  benchmark_ppt: { label: "调研 PPT", icon: Presentation, color: "text-purple-600 bg-purple-50" },
  ai_render: { label: "AI 效果图", icon: Image, color: "text-emerald-600 bg-emerald-50" },
  meeting_minutes: { label: "会议纪要", icon: MessageSquare, color: "text-amber-600 bg-amber-50" },
  media_xiaohongshu: { label: "小红书", icon: BookOpen, color: "text-red-500 bg-red-50" },
  media_wechat: { label: "公众号", icon: Megaphone, color: "text-green-600 bg-green-50" },
  media_instagram: { label: "Instagram", icon: Instagram, color: "text-pink-500 bg-pink-50" },
};

const STATUS_MAP: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  success: { label: "成功", icon: CheckCircle2, color: "text-green-600" },
  failed: { label: "失败", icon: XCircle, color: "text-red-500" },
  processing: { label: "处理中", icon: Loader2, color: "text-blue-500" },
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}分${remainSeconds}秒`;
}

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

export default function HistoryPage() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [, navigate] = useLocation();

  const queryInput = useMemo(() => ({
    module: moduleFilter === "all" ? undefined : moduleFilter,
    limit: 50,
    offset: 0,
  }), [moduleFilter]);

  const { data, isLoading } = trpc.history.list.useQuery(queryInput);

  const items = data?.items || [];
  const total = data?.total || 0;

  // Navigate to design tools with reference image URL
  const handleContinueEdit = (imageUrl: string) => {
    navigate(`/design/tools?ref=${encodeURIComponent(imageUrl)}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">生成记录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看您在平台上的所有 AI 生成记录
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
              <SelectItem value="benchmark_report">对标调研报告</SelectItem>
              <SelectItem value="benchmark_ppt">调研 PPT</SelectItem>
              <SelectItem value="ai_render">AI 效果图</SelectItem>
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
        <>
          <p className="text-xs text-muted-foreground mb-3">
            共 {total} 条记录
          </p>
          <div className="space-y-2">
            {items.map((item) => {
              const moduleInfo = MODULE_MAP[item.module] || {
                label: item.module,
                icon: FileText,
                color: "text-gray-600 bg-gray-50",
              };
              const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.success;
              const ModuleIcon = moduleInfo.icon;
              const StatusIcon = statusInfo.icon;
              const isAiRender = item.module === "ai_render";

              return (
                <Card key={item.id} className="border border-border/50 shadow-none hover:border-border transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Module icon / thumbnail for AI renders */}
                      {isAiRender && item.outputUrl && item.status === "success" ? (
                        <div
                          className="h-14 w-14 rounded-lg overflow-hidden shrink-0 cursor-pointer border border-border/50 hover:border-primary/50 transition-colors"
                          onClick={() => handleContinueEdit(item.outputUrl!)}
                          title="点击继续编辑此图片"
                        >
                          <img
                            src={item.outputUrl}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${moduleInfo.color}`}>
                          <ModuleIcon className="h-4.5 w-4.5" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-medium text-foreground truncate">
                            {item.title}
                          </h3>
                          <StatusIcon
                            className={`h-3.5 w-3.5 shrink-0 ${statusInfo.color} ${item.status === "processing" ? "animate-spin" : ""}`}
                          />
                        </div>
                        {item.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">
                            {item.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(item.createdAt)}
                          </span>
                          <span>{moduleInfo.label}</span>
                          {item.durationMs && (
                            <span>耗时 {formatDuration(item.durationMs)}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* AI render: continue edit button */}
                        {isAiRender && item.outputUrl && item.status === "success" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => handleContinueEdit(item.outputUrl!)}
                            title="继续编辑"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {/* Download / open */}
                        {item.outputUrl && item.status === "success" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => window.open(item.outputUrl!, "_blank")}
                            title={item.module === "benchmark_ppt" ? "下载" : "查看"}
                          >
                            {item.module === "benchmark_ppt" ? (
                              <Download className="h-3.5 w-3.5" />
                            ) : (
                              <ExternalLink className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
