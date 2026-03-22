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
  Presentation,
  ListTodo,
  BarChart2,
  Bell,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

const MODULE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ai_render: { label: "AI 效果图", icon: <ImageIcon className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10" },
  benchmark_report: { label: "案例调研", icon: <FileText className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-muted" },
  benchmark_ppt: { label: "调研 PPT", icon: <FileText className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-muted" },
  meeting_minutes: { label: "会议纪要", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-secondary" },
  media_xiaohongshu: { label: "小红书", icon: <Newspaper className="h-3.5 w-3.5" />, color: "text-rose-600 bg-rose-50" },
  media_wechat: { label: "公众号", icon: <Newspaper className="h-3.5 w-3.5" />, color: "text-foreground/70 bg-secondary" },
  media_instagram: { label: "Instagram", icon: <Newspaper className="h-3.5 w-3.5" />, color: "text-rose-600 bg-rose-50" },
};

const QUICK_ACTIONS = [
  { icon: PenTool, label: "案例调研", desc: "AI 生成对标案例分析报告", path: "/design/planning", accent: "from-primary/10 to-primary/5 border-primary/20", iconColor: "text-primary" },
  { icon: Sparkles, label: "AI 效果图", desc: "一键渲染空间效果图", path: "/design/tools", accent: "from-primary/8 to-primary/3 border-primary/15", iconColor: "text-primary/80" },
  { icon: Presentation, label: "演示文稿", desc: "AI 生成图文并茂演示文稿", path: "/design/presentation", accent: "from-muted to-muted/50 border-border", iconColor: "text-foreground/70" },
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
  const { data: myTasks, isLoading: myTasksLoading } = trpc.tasks.listMine.useQuery();

  // Deadline warnings: tasks due within 3 days
  const urgentTasks = useMemo(() => {
    if (!myTasks) return [];
    const now = Date.now();
    return myTasks.filter((t: any) => {
      if (!t.dueDate || t.status === "done") return false;
      const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - now) / 86400000);
      return daysLeft >= 0 && daysLeft <= 3;
    });
  }, [myTasks]);

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
          <div className="flex items-center gap-2 mt-1">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663304605552/fRco6A2SeYp4EEqicyDKLT/nplus1-logo-transparent_aaa215a8.png"
              alt="N+1 STUDIOS"
              className="h-3 w-auto object-contain opacity-70"
            />
            {user?.name && <span className="text-xs text-muted-foreground">{user.name}</span>}
          </div>
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
        <StatCard title="我的待办" value={myTasksLoading ? null : (myTasks?.length ?? 0)} icon={<Clock className="h-4 w-4" />} unit="项" onClick={() => document.getElementById('my-tasks-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
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
                    <Badge variant="outline" className={`text-xs shrink-0 ml-2 ${statusBadgeProps(project.status).className}`}>{statusBadgeProps(project.status).label}</Badge>
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

      {/* My Tasks Panel */}
      <div id="my-tasks-panel">
        <MyTasksPanel myTasks={myTasks || []} isLoading={myTasksLoading} urgentTasks={urgentTasks} onNavigate={setLocation} />
      </div>
    </div>
  );
}

// ─── My Tasks Panel ──────────────────────────────────────
function MyTasksPanel({
  myTasks,
  isLoading,
  urgentTasks,
  onNavigate,
}: {
  myTasks: any[];
  isLoading: boolean;
  urgentTasks: any[];
  onNavigate: (path: string) => void;
}) {
  const [view, setView] = useState<"list" | "gantt">("list");
  const [activeTab, setActiveTab] = useState<"assignee" | "reviewer">("assignee");
  const assigneeTasks = myTasks.filter((t: any) => t.role === 'assignee');
  const reviewerTasks = myTasks.filter((t: any) => t.role === 'reviewer');
  const displayedTasks = activeTab === "assignee" ? assigneeTasks : reviewerTasks;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">我的待办任务</CardTitle></CardHeader>
        <CardContent><div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Deadline warnings */}
      {urgentTasks.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {urgentTasks.length} 项任务即将到期（3 天内）
            </span>
          </div>
          <div className="space-y-1">
            {urgentTasks.map((t: any) => {
              const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000);
              return (
                <div key={t.id} className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
                  <span className="truncate flex-1 mr-2">{t.title}</span>
                  <span className="shrink-0 font-medium">
                    {daysLeft === 0 ? "今天到期" : `还剩 ${daysLeft} 天`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">我的待办任务</CardTitle>
            {myTasks.length > 0 && (
              <Badge variant="secondary" className="text-xs h-5">{myTasks.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setView("list")}
            >
              <ListTodo className="h-3.5 w-3.5 mr-1" />列表
            </Button>
            <Button
              variant={view === "gantt" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setView("gantt")}
            >
              <BarChart2 className="h-3.5 w-3.5 mr-1" />甘特图
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Tab: 执行中 / 待审核 */}
          <div className="flex items-center gap-1 mb-3 border-b">
            <button
              onClick={() => setActiveTab("assignee")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "assignee"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              执行中
              {assigneeTasks.length > 0 && (
                <span className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] ${
                  activeTab === "assignee" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>{assigneeTasks.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("reviewer")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "reviewer"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              待我审核
              {reviewerTasks.length > 0 && (
                <span className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] ${
                  activeTab === "reviewer" ? "bg-primary text-primary-foreground" : "bg-orange-100 text-orange-600"
                }`}>{reviewerTasks.length}</span>
              )}
            </button>
          </div>
          {displayedTasks.length === 0 ? (
            <EmptyState
              message={activeTab === "assignee" ? "暂无分配给你的任务" : "暂无待审核的任务"}
              action={{ label: "查看项目", onClick: () => onNavigate("/projects") }}
            />
          ) : view === "list" ? (
            <TaskListView tasks={displayedTasks} onNavigate={onNavigate} isReviewMode={activeTab === "reviewer"} />
          ) : (
            <GanttView tasks={displayedTasks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Task List View ──────────────────────────────────────
function TaskListView({ tasks, onNavigate, isReviewMode }: { tasks: any[]; onNavigate: (path: string) => void; isReviewMode?: boolean }) {
  const utils = trpc.useUtils();
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.listMine.invalidate(),
  });

  return (
    <div className="space-y-1">
      {tasks.map((task: any) => {
        const daysLeft = task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000) : null;
        const isOverdue = daysLeft !== null && daysLeft < 0;
        const isUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;

        return (
          <div
            key={task.id}
            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
            onClick={() => task.projectId && onNavigate(`/projects/${task.projectId}`)}
          >
            {/* Priority dot */}
            <PriorityDot priority={task.priority} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{task.title}</p>
                {task.projectName && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 hidden sm:block">
                    {task.projectName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {task.dueDate && (
                  <span className={`text-[10px] flex items-center gap-0.5 ${
                    isOverdue ? "text-red-500" : isUrgent ? "text-amber-600" : "text-muted-foreground"
                  }`}>
                    <Clock className="h-2.5 w-2.5" />
                    {isOverdue
                      ? `已超期 ${Math.abs(daysLeft!)}d`
                      : isUrgent
                        ? `还剩 ${daysLeft}d`
                        : `截止 ${new Date(task.dueDate).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
                    }
                  </span>
                )}
                {/* Progress */}
                {(task.progress ?? 0) > 0 && (
                  <span className="text-[10px] text-muted-foreground">{task.progress}%</span>
                )}
              </div>
              {/* Progress bar */}
              {(task.progress ?? 0) > 0 && (
                <div className="h-1 bg-muted rounded-full overflow-hidden mt-1.5 w-full max-w-[160px]">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
                </div>
              )}
            </div>

            {/* Status badge / review action */}
            <div className="shrink-0 flex items-center gap-2">
              {isReviewMode ? (
                <button
                  className="text-[10px] px-2 py-0.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTask.mutate({ id: task.id, status: "done" });
                  }}
                >
                  通过审核
                </button>
              ) : (
                <select
                  className="text-[10px] border rounded px-1 py-0.5 bg-background text-foreground cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  value={task.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateTask.mutate({ id: task.id, status: e.target.value as any });
                  }}
                >
                  <option value="backlog">待排期</option>
                  <option value="todo">待开始</option>
                  <option value="in_progress">进行中</option>
                  <option value="review">待审核</option>
                  <option value="done">已完成</option>
                </select>
              )}
              <Badge variant="outline" className="text-[10px] h-5">{taskStatusLabel(task.status)}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gantt View ──────────────────────────────────────────
function GanttView({ tasks }: { tasks: any[] }) {
  // Only show tasks with at least a dueDate
  const ganttTasks = useMemo(() => {
    const now = new Date();
    return tasks
      .filter((t: any) => t.dueDate || t.startDate)
      .map((t: any) => {
        const start = t.startDate ? new Date(t.startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = t.dueDate ? new Date(t.dueDate) : new Date(start.getTime() + 86400000);
        return { ...t, _start: start, _end: end };
      })
      .sort((a: any, b: any) => a._start.getTime() - b._start.getTime());
  }, [tasks]);

  if (ganttTasks.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        暂无设置了时间范围的任务。<br />
        <span className="text-xs">在任务看板中为任务设置开始/截止日期后，甘特图将自动显示。</span>
      </div>
    );
  }

  // Compute date range: from earliest start to latest end + padding
  const minDate = ganttTasks.reduce((m: Date, t: any) => t._start < m ? t._start : m, ganttTasks[0]._start);
  const maxDate = ganttTasks.reduce((m: Date, t: any) => t._end > m ? t._end : m, ganttTasks[0]._end);

  // Add 2-day padding on each side
  const rangeStart = new Date(minDate.getTime() - 2 * 86400000);
  const rangeEnd = new Date(maxDate.getTime() + 2 * 86400000);
  const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);

  // Generate day headers
  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    days.push(new Date(rangeStart.getTime() + i * 86400000));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayWidth = 32; // px per day
  const rowHeight = 36; // px per row

  const priorityColors: Record<string, string> = {
    urgent: "bg-red-400",
    high: "bg-orange-400",
    medium: "bg-primary",
    low: "bg-muted-foreground/40",
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${totalDays * dayWidth + 160}px` }}>
        {/* Header: day labels */}
        <div className="flex" style={{ marginLeft: "160px" }}>
          {days.map((d, i) => {
            const isToday = d.getTime() === today.getTime();
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const showLabel = d.getDate() === 1 || i === 0 || d.getDay() === 1;
            return (
              <div
                key={i}
                style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px` }}
                className={`text-center border-r border-border/30 relative ${isWeekend ? "bg-muted/30" : ""} ${isToday ? "bg-primary/10" : ""}`}
              >
                {showLabel && (
                  <span className="text-[9px] text-muted-foreground absolute top-0 left-0.5 leading-none pt-0.5">
                    {d.getDate() === 1 ? `${d.getMonth() + 1}月` : `${d.getDate()}`}
                  </span>
                )}
                {isToday && (
                  <span className="text-[9px] font-bold text-primary absolute top-0 left-0.5 leading-none pt-0.5">今</span>
                )}
                <div className="h-5" />
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {ganttTasks.map((task: any) => {
          const startOffset = Math.floor((task._start.getTime() - rangeStart.getTime()) / 86400000);
          const duration = Math.max(1, Math.ceil((task._end.getTime() - task._start.getTime()) / 86400000));
          const daysLeft = Math.ceil((task._end.getTime() - Date.now()) / 86400000);
          const isOverdue = daysLeft < 0;
          const isUrgent = daysLeft >= 0 && daysLeft <= 3;
          const barColor = isOverdue ? "bg-red-400" : isUrgent ? "bg-amber-400" : (priorityColors[task.priority] || "bg-primary");

          return (
            <div key={task.id} className="flex items-center border-b border-border/20" style={{ height: `${rowHeight}px` }}>
              {/* Task label */}
              <div className="shrink-0 flex items-center gap-1.5 px-2" style={{ width: "160px" }}>
                <PriorityDot priority={task.priority} />
                <span className="text-xs truncate">{task.title}</span>
              </div>
              {/* Bar area */}
              <div className="relative flex-1" style={{ height: `${rowHeight}px` }}>
                {/* Today line */}
                {(() => {
                  const todayOffset = Math.floor((today.getTime() - rangeStart.getTime()) / 86400000);
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-primary/40 z-10"
                      style={{ left: `${todayOffset * dayWidth + dayWidth / 2}px` }}
                    />
                  );
                })()}
                {/* Weekend shading */}
                {days.map((d, i) => (
                  (d.getDay() === 0 || d.getDay() === 6) ? (
                    <div key={i} className="absolute top-0 bottom-0 bg-muted/20" style={{ left: `${i * dayWidth}px`, width: `${dayWidth}px` }} />
                  ) : null
                ))}
                {/* Task bar */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 rounded ${barColor} flex items-center px-1.5`}
                  style={{
                    left: `${startOffset * dayWidth}px`,
                    width: `${duration * dayWidth - 2}px`,
                    height: "20px",
                  }}
                >
                  {/* Progress fill */}
                  {(task.progress ?? 0) > 0 && (
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded bg-white/30"
                      style={{ width: `${task.progress}%` }}
                    />
                  )}
                  <span className="text-[9px] text-white font-medium truncate relative z-10">
                    {duration > 2 ? task.title : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        仅显示已设置时间范围的任务 · 竖线为今日 · 悬停查看详情请前往项目看板
      </p>
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
  const colors: Record<string, string> = { urgent: "bg-red-500", high: "bg-orange-400", medium: "bg-primary/70", low: "bg-muted-foreground/30" };
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

function statusBadgeProps(status: string): { label: string; className: string } {
  const configs: Record<string, { label: string; className: string }> = {
    planning:     { label: "待启动",   className: "border-slate-300 text-slate-500 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-400" },
    design:       { label: "设计中",   className: "border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
    construction: { label: "施工中",   className: "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" },
    completed:    { label: "已完成",   className: "border-green-400 text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400" },
    archived:     { label: "已归档",   className: "border-gray-300 text-gray-400 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-500" },
  };
  return configs[status] ?? { label: status, className: "" };
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
