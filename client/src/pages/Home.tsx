import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats } = trpc.dashboard.stats.useQuery();

  const quickActions = [
    { icon: FolderKanban, label: "新建项目", path: "/projects", color: "bg-blue-500/10 text-blue-600" },
    { icon: PenTool, label: "设计策划", path: "/design/planning", color: "bg-violet-500/10 text-violet-600" },
    { icon: HardHat, label: "施工管理", path: "/construction/docs", color: "bg-amber-500/10 text-amber-600" },
    { icon: Sparkles, label: "AI 工具", path: "/ai-tools", color: "bg-rose-500/10 text-rose-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}，{user?.name || "用户"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          欢迎回到 N+1 STUDIOS 工作平台
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="进行中项目"
          value={stats?.activeProjects ?? 0}
          icon={<FolderKanban className="h-4 w-4" />}
          trend="项目"
        />
        <StatCard
          title="待办任务"
          value={stats?.pendingTasks ?? 0}
          icon={<Clock className="h-4 w-4" />}
          trend="任务"
        />
        <StatCard
          title="本周完成"
          value={stats?.completedThisWeek ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend="任务"
        />
        <StatCard
          title="AI 工具调用"
          value={stats?.aiToolCalls ?? 0}
          icon={<Sparkles className="h-4 w-4" />}
          trend="本月"
        />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => setLocation(action.path)}
                className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border/50 hover:border-border hover:bg-accent/50 transition-all group"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Projects & Tasks */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">最近项目</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/projects")} className="text-xs">
              查看全部 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentProjects && stats.recentProjects.length > 0 ? (
              <div className="space-y-3">
                {stats.recentProjects.map((project: any) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/projects/${project.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <FolderKanban className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.clientName || "未指定客户"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {statusLabel(project.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="暂无项目" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">待办任务</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/projects")} className="text-xs">
              查看全部 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentTasks && stats.recentTasks.length > 0 ? (
              <div className="space-y-3">
                {stats.recentTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PriorityDot priority={task.priority} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.dueDate ? `截止 ${new Date(task.dueDate).toLocaleDateString("zh-CN")}` : "无截止日期"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {taskStatusLabel(task.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="暂无待办任务" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: { title: string; value: number; icon: React.ReactNode; trend: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-muted-foreground/60">{icon}</span>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-semibold">{value}</span>
          <span className="text-xs text-muted-foreground ml-1">{trend}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-blue-500",
    low: "bg-gray-400",
  };
  return <div className={`h-2 w-2 rounded-full shrink-0 ${colors[priority] || colors.medium}`} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    planning: "规划中",
    design: "设计中",
    construction: "施工中",
    completed: "已完成",
    archived: "已归档",
  };
  return map[status] || status;
}

function taskStatusLabel(status: string) {
  const map: Record<string, string> = {
    backlog: "待排期",
    todo: "待开始",
    in_progress: "进行中",
    review: "待审核",
    done: "已完成",
  };
  return map[status] || status;
}
