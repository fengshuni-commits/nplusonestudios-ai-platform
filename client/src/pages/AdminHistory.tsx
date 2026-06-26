import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Image,
  Film,
  Layers,
  MessageSquare,
  BookOpen,
  Megaphone,
  LayoutTemplate,
  Presentation,
  ChevronLeft,
  ChevronRight,
  Search,
  ExternalLink,
  User,
  Calendar,
  X,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ─── Module Config ────────────────────────────────────────────────────────────

const MODULE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  benchmark_report: { label: "案例调研报告", icon: FileText, color: "bg-stone-500/20 text-stone-300 border-stone-500/30" },
  benchmark_ppt:    { label: "调研 PPT",     icon: Presentation, color: "bg-neutral-500/20 text-neutral-300 border-neutral-500/30" },
  ai_render:        { label: "AI 效果图",    icon: Image, color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
  analysis_image:   { label: "AI 分析图",    icon: Layers, color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  meeting_minutes:  { label: "会议纪要",     icon: MessageSquare, color: "bg-stone-400/20 text-stone-200 border-stone-400/30" },
  media_xiaohongshu:{ label: "小红书",       icon: BookOpen, color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  media_wechat:     { label: "公众号",       icon: Megaphone, color: "bg-neutral-400/20 text-neutral-200 border-neutral-400/30" },
  media_instagram:  { label: "Instagram",    icon: Image, color: "bg-rose-400/20 text-rose-200 border-rose-400/30" },
  ai_video:         { label: "AI 视频",      icon: Film, color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  layout_design:    { label: "图文排版",     icon: LayoutTemplate, color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  color_plan:       { label: "AI 平面图",    icon: Image, color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  presentation:     { label: "演示文稿",     icon: Presentation, color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
};

function getModuleConfig(module: string) {
  return MODULE_CONFIG[module] || { label: module, icon: FileText, color: "bg-muted text-muted-foreground border-border" };
}

function formatTime(ts: string | Date) {
  const date = new Date(ts);
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryItem = {
  id: number;
  userId: number;
  module: string;
  title: string;
  summary?: string | null;
  outputUrl?: string | null;
  outputContent?: string | null;
  status: "success" | "failed" | "processing";
  projectId?: number | null;
  createdByName?: string | null;
  createdAt: Date | string;
  userName?: string | null;
  userEmail?: string | null;
  projectName?: string | null;
};

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function DetailDialog({ item, open, onClose }: { item: HistoryItem | null; open: boolean; onClose: () => void }) {
  if (!item) return null;
  const cfg = getModuleConfig(item.module);
  const ModuleIcon = cfg.icon;

  const isImage = item.outputUrl && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(item.outputUrl);
  const isPpt = item.outputUrl && /\.(pptx?|pdf)(\?|$)/i.test(item.outputUrl);
  const isVideo = item.outputUrl && /\.(mp4|webm|mov)(\?|$)/i.test(item.outputUrl);

  let parsedContent: any = null;
  if (item.outputContent) {
    try { parsedContent = JSON.parse(item.outputContent); } catch { /* not JSON */ }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ModuleIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.userName || item.createdByName || "未知"}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatTime(item.createdAt)}</span>
            {item.projectName && <span className="flex items-center gap-1 text-foreground/70">项目：{item.projectName}</span>}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${cfg.color}`}>{cfg.label}</Badge>
          </div>

          {/* Image output */}
          {isImage && (
            <div className="rounded-lg overflow-hidden border border-border/50">
              <img src={item.outputUrl!} alt={item.title} className="w-full h-auto max-h-[400px] object-contain bg-black/20" />
            </div>
          )}

          {/* Video output */}
          {isVideo && (
            <video src={item.outputUrl!} controls className="w-full rounded-lg border border-border/50 max-h-[300px]" />
          )}

          {/* PPT / file download */}
          {isPpt && (
            <a href={item.outputUrl!} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <ExternalLink className="h-4 w-4" /> 下载文件
            </a>
          )}

          {/* Non-image URL link */}
          {item.outputUrl && !isImage && !isPpt && !isVideo && (
            <a href={item.outputUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <ExternalLink className="h-4 w-4" /> 查看输出链接
            </a>
          )}

          {/* Text content */}
          {item.outputContent && !parsedContent && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm max-h-[300px] overflow-y-auto">
              <Streamdown>{item.outputContent}</Streamdown>
            </div>
          )}

          {/* Parsed JSON content (e.g. media posts) */}
          {parsedContent && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm max-h-[300px] overflow-y-auto">
              {typeof parsedContent === "string" ? (
                <Streamdown>{parsedContent}</Streamdown>
              ) : (
                <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(parsedContent, null, 2)}</pre>
              )}
            </div>
          )}

          {/* Summary fallback */}
          {item.summary && !item.outputContent && !item.outputUrl && (
            <p className="text-sm text-muted-foreground">{item.summary}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── History Card ─────────────────────────────────────────────────────────────

function HistoryCard({ item, onClick }: { item: HistoryItem; onClick: () => void }) {
  const cfg = getModuleConfig(item.module);
  const ModuleIcon = cfg.icon;
  const isImage = item.outputUrl && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(item.outputUrl);

  return (
    <div
      className="group bg-card border border-border/50 rounded-xl overflow-hidden cursor-pointer hover:border-border hover:shadow-md transition-all duration-200"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-muted/30 flex items-center justify-center overflow-hidden">
        {isImage ? (
          <img
            src={item.outputUrl!}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
            <ModuleIcon className="h-8 w-8" />
          </div>
        )}
        {/* Module badge overlay */}
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border backdrop-blur-sm ${cfg.color}`}>
            {cfg.label}
          </Badge>
        </div>
        {/* Status badge */}
        {item.status !== "success" && (
          <div className="absolute top-2 right-2">
            <Badge variant={item.status === "failed" ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
              {item.status === "failed" ? "失败" : "处理中"}
            </Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium line-clamp-2 leading-snug">{item.title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.userName || item.createdByName || "未知"}</span>
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatTime(item.createdAt)}
          </span>
        </div>
        {item.projectName && (
          <p className="text-xs text-muted-foreground/70 truncate">📁 {item.projectName}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48;

export default function AdminHistory() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (v: string) => {
    setSearch(v);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    searchTimeout[1](setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 400));
  };

  const queryInput = useMemo(() => ({
    userId: userFilter !== "all" ? Number(userFilter) : undefined,
    module: moduleFilter !== "all" ? moduleFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [userFilter, moduleFilter, dateFrom, dateTo, debouncedSearch, page]);

  const { data, isLoading } = trpc.admin.listAllHistory.useQuery(queryInput);
  const { data: users } = trpc.admin.listUsers.useQuery();

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const handleItemClick = (item: HistoryItem) => {
    setSelectedItem(item);
    setDetailOpen(true);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setModuleFilter("all");
    setUserFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const hasFilters = search || moduleFilter !== "all" || userFilter !== "all" || dateFrom || dateTo;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">生成成果看板</h1>
            <p className="text-sm text-muted-foreground mt-0.5">查看所有成员的 AI 生成历史记录</p>
          </div>
          {data && (
            <span className="text-sm text-muted-foreground">
              共 <span className="font-medium text-foreground">{data.total}</span> 条记录
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索标题…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Member filter */}
          <Select value={userFilter} onValueChange={v => { setUserFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="全部成员" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部成员</SelectItem>
              {users?.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email || `用户 ${u.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Module filter */}
          <Select value={moduleFilter} onValueChange={v => { setModuleFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {Object.entries(MODULE_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(0); }}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            title="开始日期"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(0); }}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            title="结束日期"
          />

          {/* Clear filters */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" /> 清除筛选
            </Button>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="bg-muted/30 rounded-xl h-52 animate-pulse" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <Image className="h-12 w-12 opacity-20" />
            <p className="text-sm">{hasFilters ? "没有符合条件的记录" : "暂无生成记录"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {data.items.map(item => (
              <HistoryCard key={item.id} item={item as HistoryItem} onClick={() => handleItemClick(item as HistoryItem)} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="h-8 gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> 上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              第 {page + 1} / {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="h-8 gap-1"
            >
              下一页 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <DetailDialog
        item={selectedItem}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </DashboardLayout>
  );
}
