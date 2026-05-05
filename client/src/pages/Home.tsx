import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  FolderKanban,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Bot,
  ChevronRight,
  CalendarDays,
  Circle,
  CircleDot,
  CircleCheck,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: greetingData, isLoading: greetingLoading } = trpc.director.getGreeting.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const { data: myTasks, isLoading: myTasksLoading } = trpc.tasks.listMine.useQuery();
  const utils = trpc.useUtils();

  const applyAutoStatus = trpc.tasks.applyAutoStatus.useMutation({
    onSuccess: (data) => {
      if (data.updated > 0) {
        utils.tasks.listMine.invalidate();
        utils.tasks.listAll.invalidate();
      }
    },
  });

  useEffect(() => {
    applyAutoStatus.mutate({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tasks due within 3 days
  const urgentTasks = useMemo(() => {
    if (!myTasks) return [];
    const now = Date.now();
    return myTasks.filter((t: any) => {
      if (!t.dueDate || t.status === "done") return false;
      const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - now) / 86400000);
      return daysLeft >= 0 && daysLeft <= 3;
    });
  }, [myTasks]);

  const pendingTasks = useMemo(() => {
    if (!myTasks) return [];
    return myTasks.filter((t: any) => t.status !== "done");
  }, [myTasks]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase block mb-1">
            {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
          </span>
          <div className="flex items-center gap-2">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663304605552/fRco6A2SeYp4EEqicyDKLT/nplus1-logo-transparent_aaa215a8.png"
              alt="N+1 STUDIOS"
              className="h-3 w-auto object-contain opacity-60"
            />
            {user?.name && <span className="text-xs text-muted-foreground">{user.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatBadge icon={<FolderKanban className="h-3.5 w-3.5" />} value={statsLoading ? "—" : String(stats?.activeProjects ?? 0)} label="进行中项目" onClick={() => setLocation("/projects")} />
          <StatBadge icon={<CheckCircle2 className="h-3.5 w-3.5" />} value={statsLoading ? "—" : String(stats?.completedThisWeek ?? 0)} label="本周完成" />
          <StatBadge icon={<Sparkles className="h-3.5 w-3.5" />} value={statsLoading ? "—" : String(stats?.aiToolCalls ?? 0)} label="AI 调用" onClick={() => setLocation("/history")} />
        </div>
      </div>

      {/* Director Greeting Card */}
      <button
        onClick={() => setLocation("/director")}
        className="w-full text-left group"
      >
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background hover:border-primary/40 hover:shadow-sm transition-all">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-primary tracking-wide">所长</span>
                  <span className="text-xs text-muted-foreground">N+1 STUDIOS AI 助手</span>
                </div>
                {greetingLoading ? (
                  <Skeleton className="h-4 w-64" />
                ) : (
                  <p className="text-sm text-foreground leading-relaxed">
                    {greetingData?.greeting || `欢迎回来，${user?.name?.split(" ")[0] || "成员"}。`}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1.5 group-hover:text-primary transition-colors">
                  点击进入对话 →
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* My Tasks */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">我的任务</CardTitle>
                {urgentTasks.length > 0 && (
                  <Badge variant="destructive" className="text-xs h-4.5 px-1.5 py-0">
                    {urgentTasks.length} 项即将到期
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/projects")} className="text-xs h-7 px-2">
                全部 <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {myTasksLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : pendingTasks.length > 0 ? (
                <div className="space-y-1">
                  {pendingTasks.slice(0, 8).map((task: any) => (
                    <TaskRow key={task.id} task={task} onNavigate={setLocation} />
                  ))}
                  {pendingTasks.length > 8 && (
                    <button
                      onClick={() => setLocation("/projects")}
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
                    >
                      还有 {pendingTasks.length - 8} 项任务 →
                    </button>
                  )}
                </div>
              ) : (
                <EmptyState message="当前没有待处理任务" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* My Projects */}
        <div>
          <Card className="h-full">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">参与项目</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/projects")} className="text-xs h-7 px-2">
                全部 <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {statsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : stats?.recentProjects && stats.recentProjects.length > 0 ? (
                <div className="space-y-1">
                  {stats.recentProjects.map((project: any) => (
                    <button
                      key={project.id}
                      onClick={() => setLocation(`/projects/${project.id}`)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <FolderKanban className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{project.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{project.clientName || "未指定客户"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Badge variant="outline" className={`text-xs ${statusBadgeProps(project.status).className}`}>
                          {statusBadgeProps(project.status).label}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState message="暂无参与项目" action={{ label: "查看项目", onClick: () => setLocation("/projects") }} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({ task, onNavigate }: { task: any; onNavigate: (path: string) => void }) {
  const now = Date.now();
  const daysLeft = task.dueDate
    ? Math.ceil((new Date(task.dueDate).getTime() - now) / 86400000)
    : null;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
  const isOverdue = daysLeft !== null && daysLeft < 0;

  const StatusIcon = task.status === "done"
    ? CircleCheck
    : task.status === "in_progress"
    ? CircleDot
    : Circle;

  const statusColor = task.status === "done"
    ? "text-green-500"
    : task.status === "in_progress"
    ? "text-primary"
    : "text-muted-foreground/40";

  return (
    <button
      onClick={() => task.projectId && onNavigate(`/projects/${task.projectId}`)}
      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left"
    >
      <StatusIcon className={`h-4 w-4 shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        {task.projectName && (
          <p className="text-xs text-muted-foreground truncate">{task.projectName}</p>
        )}
      </div>
      {task.dueDate && (
        <div className={`flex items-center gap-1 text-xs shrink-0 ${isOverdue ? "text-red-500" : isUrgent ? "text-orange-500" : "text-muted-foreground"}`}>
          <CalendarDays className="h-3 w-3" />
          <span>
            {isOverdue
              ? `逾期 ${Math.abs(daysLeft!)} 天`
              : daysLeft === 0
              ? "今日到期"
              : `${daysLeft} 天后`}
          </span>
        </div>
      )}
      {!task.dueDate && (
        <Badge variant="outline" className={`text-xs shrink-0 ${taskStatusBadge(task.status).className}`}>
          {taskStatusBadge(task.status).label}
        </Badge>
      )}
    </button>
  );
}

// ─── Stat Badge ───────────────────────────────────────────────────────────────
function StatBadge({ icon, value, label, onClick }: { icon: React.ReactNode; value: string; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-card text-xs transition-colors ${onClick ? "hover:bg-accent cursor-pointer" : "cursor-default"}`}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function taskStatusBadge(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    backlog:     { label: "待排期", className: "border-slate-200 text-slate-400" },
    todo:        { label: "待开始", className: "border-slate-300 text-slate-500" },
    in_progress: { label: "进行中", className: "border-blue-300 text-blue-600" },
    review:      { label: "待审核", className: "border-orange-300 text-orange-600" },
    done:        { label: "已完成", className: "border-green-300 text-green-600" },
  };
  return map[status] ?? { label: status, className: "" };
}
