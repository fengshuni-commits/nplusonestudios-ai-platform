import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  FolderKanban,
  PenTool,
  HardHat,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";

const MODULE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ai_render: { label: "AI 效果图", icon: <ImageIcon className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10" },
  benchmark_report: { label: "对标调研", icon: <FileText className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-muted" },
  benchmark_ppt: { label: "调研 PPT", icon: <FileText className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-muted" },
  meeting_minutes: { label: "会议纪要", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-secondary" },
  media_xiaohongshu: { label: "小红书", icon: <Newspaper className="h-3.5 w-3.5" />, color: "text-rose-600 bg-rose-50" },
  media_wechat: { label: "公众号", icon: <Newspaper className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-secondary" },
  media_instagram: { label: "Instagram", icon: <Newspaper className="h-3.5 w-3.5" />, color: "text-rose-600 bg-rose-50" },
};

const QUICK_ACTIONS = [
  { icon: PenTool, label: "案例调研", desc: "AI 生成对标案例分析报告", path: "/design/planning", accent: "from-primary/10 to-primary/5 border-primary/20", iconColor: "text-primary" },
  { icon: Sparkles, label: "AI 效果图", desc: "一键渲染空间效果图", path: "/design/tools", accent: "from-primary/8 to-primary/3 border-primary/15", iconColor: "text-primary/80" },
  { icon: MessageSquare, label: "会议纪要", desc: "语音转文字自动整理", path: "/meeting", accent: "from-muted to-muted/50 border-border", iconColor: "text-foreground/70" },
  { icon: Newspaper, label: "内容创作", desc: "小红书 / 公众号推文", path: "/media/xiaohongshu", accent: "from-rose-500/10 to-rose-500/5 border-rose-200/60", iconColor: "text-rose-600" },
  { icon: FolderKanban, label: "项目管理", desc: "查看所有在建项目", path: "/projects", accent: "from-muted to-muted/50 border-border", iconColor: "text-foreground/60" },
  { icon: HardHat, label: "施工管理", desc: "图纸文档与采购", path: "/construction/docs", accent: "from-muted to-muted/50 border-border", iconColor: "text-foreground/60" },
];

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: greetingData, isLoading: greetingLoading, refetch: refetchGreeting } = trpc.dashboard.greeting.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const { data: recentGenerations, isLoading: genLoading } = trpc.dashboard.recentGenerations.useQuery();

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase block mb-1">
            {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
          </span>
          {greetingLoading ? (
            <Skeleton className="h-7 w-80 mb-1" />
          ) : (
            <h1 className="text-xl font-semibold tracking-tight leading-snug text-foreground">
              {greetingData?.greeting || `欢迎回来，${user?.name || "设计师"}。`}
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{user?.name} · N+1 STUDIOS</p>
        </div>
        <Button
          variant="ghost" size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground mt-1"
          onClick={() => refetchGreeting()}
          disabled={greetingLoading}
          title="重新生成问候语"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${greetingLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="进行中项目" value={statsLoading ? null : (stats?.activeProjects ?? 0)} icon={<FolderKanban className="h-4 w-4" />} unit="个" onClick={() => setLocation("/projects")} />
        <StatCard title="待办任务" value={statsLoading ? null : (stats?.pendingTasks ?? 0)} icon={<Clock className="h-4 w-4" />} unit="项" onClick={() => setLocation("/projects")} />
        <StatCard title="本周完成" value={statsLoading ? null : (stats?.completedThisWeek ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} unit="任务" />
        <StatCard title="AI 调用（本月）" value={statsLoading ? null : (stats?.aiToolCalls ?? 0)} icon={<Sparkles className="h-4 w-4" />} unit="次" onClick={() => setLocation("/history")} />
      </div>

      <div>
        <h2 className="text-xs font-medium text-muted-foreground mb-3 tracking-widest uppercase">快捷入口</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.path}
              onClick={() => setLocation(action.path)}
              className={`flex flex-col items-start gap-2 p-3.5 rounded-xl border bg-gradient-to-br ${action.accent} hover:shadow-sm transition-all text-left`}
            >
              <div className={`p-1.5 rounded-lg bg-white/60 ${action.iconColor}`}>
                <action.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground leading-tight">{action.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight hidden md:block">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">最近项目</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/projects")} className="text-xs h-7 px-2">
              全部 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {statsLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : stats?.recentProjects && stats.recentProjects.length > 0 ? (
              <div className="space-y-1">
                {stats.recentProjects.map((project: any) => (
                  <div key={project.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setLocation(`/projects/${project.id}`)}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <FolderKanban className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{project.clientName || "未指定客户"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 ml-2">{statusLabel(project.status)}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="暂无项目" action={{ label: "新建项目", onClick: () => setLocation("/projects") }} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">最近 AI 生成</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/history")} className="text-xs h-7 px-2">
              全部 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {genLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentGenerations && recentGenerations.length > 0 ? (
              <div className="space-y-1">
                {recentGenerations.map((item: any) => {
                  const meta = MODULE_META[item.module] || { label: item.module, icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-gray-600 bg-gray-50" };
                  const hasImage = item.outputUrl && item.module === "ai_render";
                  return (
                    <div key={item.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setLocation("/history")}>
                      {hasImage ? (
                        <div className="h-9 w-9 rounded-md overflow-hidden shrink-0 bg-muted">
                          <img src={item.outputUrl} alt={item.title} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${meta.color}`}>{meta.icon}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="暂无 AI 生成记录" action={{ label: "开始使用", onClick: () => setLocation("/design/planning") }} />
            )}
          </CardContent>
        </Card>
      </div>

      {stats?.recentTasks && stats.recentTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">待办任务</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/projects")} className="text-xs h-7 px-2">
              全部 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {stats.recentTasks.map((task: any) => (
                <div key={task.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                  <PriorityDot priority={task.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.dueDate ? `截止 ${new Date(task.dueDate).toLocaleDateString("zh-CN")}` : "无截止日期"}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{taskStatusLabel(task.status)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, unit, onClick }: { title: string; value: number | null; icon: React.ReactNode; unit: string; onClick?: () => void }) {
  return (
    <Card className={`transition-shadow ${onClick ? "cursor-pointer hover:shadow-sm" : ""}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-muted-foreground/50">{icon}</span>
        </div>
        {value === null ? <Skeleton className="h-7 w-12" /> : (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = { urgent: "bg-primary", high: "bg-primary/70", medium: "bg-muted-foreground/40", low: "bg-muted-foreground/20" };
  return <div className={`h-2 w-2 rounded-full shrink-0 ${colors[priority] || colors.medium}`} />;
}

function EmptyState({ message, action }: { message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
      <AlertCircle className="h-7 w-7 opacity-20" />
      <p className="text-sm">{message}</p>
      {action && <Button variant="outline" size="sm" onClick={action.onClick} className="text-xs">{action.label}</Button>}
    </div>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = { planning: "规划中", design: "设计中", construction: "施工中", completed: "已完成", archived: "已归档" };
  return map[status] || status;
}

function taskStatusLabel(status: string) {
  const map: Record<string, string> = { backlog: "待排期", todo: "待开始", in_progress: "进行中", review: "待审核", done: "已完成" };
  return map[status] || status;
}

function formatRelativeTime(date: Date | string | number) {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
