import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Users,
  UserCheck,
  ChevronDown,
  X,
  Plus,
  CheckSquare,
  Square,
  Trash2,
  Edit3,
  Calendar,
  ExternalLink,
  Lock,
  ChevronRight,
  Layers,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

const MODULE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  ai_render: { label: "AI 效果图", icon: <ImageIcon className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10" },
  analysis_image: { label: "AI 分析图", icon: <Layers className="h-3.5 w-3.5" />, color: "text-primary bg-primary/10" },
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
  { icon: Layers, label: "AI 分析图", desc: "材质搜配图与软装搜配图", path: "/design/analysis", accent: "from-primary/8 to-primary/3 border-primary/15", iconColor: "text-primary/80" },
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
  const utils = trpc.useUtils();
  const applyAutoStatus = trpc.tasks.applyAutoStatus.useMutation({
    onSuccess: (data) => {
      // If any tasks were updated, refresh the task lists
      if (data.updated > 0) {
        utils.tasks.listMine.invalidate();
        utils.tasks.listAll.invalidate();
      }
    },
  });

  // Auto-apply status updates on mount (full scan, no taskIds needed)
  useEffect(() => {
    applyAutoStatus.mutate({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* My Tasks Panel — moved above recent grid */}
      <div id="my-tasks-panel">
        <MyTasksPanel myTasks={myTasks || []} isLoading={myTasksLoading} urgentTasks={urgentTasks} onNavigate={setLocation} />
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
                  const hasImage = item.outputUrl && (item.module === "ai_render" || item.module === "analysis_image");
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
                        <p className="text-sm font-medium truncate">{item.title || "未命名"}</p>
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
  const { user: currentUser } = useAuth();

  // Task detail dialog state
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskEditForm, setTaskEditForm] = useState({ title: "", status: "", priority: "", progress: 0, startDate: "", dueDate: "", description: "" });

  const updateTaskDetail = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.listMine.invalidate();
      utils.tasks.listAll.invalidate();
      utils.tasks.listByUser.invalidate();
      setTaskDetailOpen(false);
    },
  });

  const submitProgressHome = trpc.tasks.submitProgress.useMutation({
    onSuccess: () => {
      utils.tasks.listMine.invalidate();
      utils.tasks.listAll.invalidate();
      utils.tasks.listByUser.invalidate();
      setTaskDetailOpen(false);
    },
  });
  const approveTaskHome = trpc.tasks.approveTask.useMutation({
    onSuccess: () => {
      utils.tasks.listMine.invalidate();
      utils.tasks.listAll.invalidate();
      utils.tasks.listByUser.invalidate();
    },
  });

  const [homeProgressDraft, setHomeProgressDraft] = useState(0);
  const [homeProgressNote, setHomeProgressNote] = useState("");

  const openTaskDetail = useCallback((task: any) => {
    setSelectedTask(task);
    setTaskEditForm({
      title: task.title || "",
      status: task.status || "todo",
      priority: task.priority || "medium",
      progress: task.progress ?? 0,
      startDate: task.startDate ? new Date(task.startDate).toISOString().split("T")[0] : "",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
      description: task.description || "",
    });
    setHomeProgressDraft(task.progress ?? 0);
    setHomeProgressNote(task.progressNote || "");
    setTaskDetailOpen(true);
  }, []);

  // Personal tasks state
  const [personalTaskMode, setPersonalTaskMode] = useState(false);
  const [ptView, setPtView] = useState<"list" | "gantt">("list");
  const [ptStatusFilter, setPtStatusFilter] = useState<"all" | "todo" | "in_progress" | "done">("all");
  const [ptDialogOpen, setPtDialogOpen] = useState(false);
  const [ptForm, setPtForm] = useState({ title: "", notes: "", priority: "medium" as "urgent"|"high"|"medium"|"low", startDate: "", dueDate: "" });
  const [ptEditingId, setPtEditingId] = useState<number | null>(null);
  const [ptEditTitle, setPtEditTitle] = useState("");
  const utils = trpc.useUtils();

  const { data: personalTasksData, isLoading: ptLoading } = trpc.personalTasks.list.useQuery(
    { status: ptStatusFilter },
    { enabled: personalTaskMode, staleTime: 30 * 1000, refetchOnWindowFocus: false }
  );

  const createPersonalTask = trpc.personalTasks.create.useMutation({
    onSuccess: () => { utils.personalTasks.list.invalidate(); setPtDialogOpen(false); setPtForm({ title: "", notes: "", priority: "medium", startDate: "", dueDate: "" }); },
  });
  const updatePersonalTask = trpc.personalTasks.update.useMutation({
    onSuccess: () => { utils.personalTasks.list.invalidate(); setPtEditingId(null); },
  });
  const deletePersonalTask = trpc.personalTasks.delete.useMutation({
    onSuccess: () => utils.personalTasks.list.invalidate(),
  });

  // Member view state
  const [memberViewMode, setMemberViewMode] = useState<"mine" | "all" | "specific">("mine");
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all members (for dropdown)
  const { data: allUsers } = trpc.tasks.listTeamMembers.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  // Fetch all tasks (when memberViewMode === "all")
  const { data: allTasksData, isLoading: allTasksLoading } = trpc.tasks.listAll.useQuery(undefined, {
    enabled: memberViewMode === "all",
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch specific member tasks
  const { data: memberTasksData, isLoading: memberTasksLoading } = trpc.tasks.listByUser.useQuery(
    { userId: selectedMemberId ?? 0 },
    {
      enabled: memberViewMode === "specific" && selectedMemberId !== null,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMemberDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Determine which tasks to display based on mode
  const activeTasks = useMemo(() => {
    if (memberViewMode === "all") return allTasksData || [];
    if (memberViewMode === "specific") return memberTasksData || [];
    return myTasks;
  }, [memberViewMode, allTasksData, memberTasksData, myTasks]);

  const assigneeTasks = memberViewMode === "mine"
    ? myTasks.filter((t: any) => t.role === 'assignee')
    : activeTasks;
  const reviewerTasks = memberViewMode === "mine"
    ? myTasks.filter((t: any) => t.role === 'reviewer')
    : [];

  const displayedTasks = (memberViewMode === "mine" && activeTab === "reviewer")
    ? reviewerTasks
    : assigneeTasks;

  const isLoadingTasks = isLoading ||
    (memberViewMode === "all" && allTasksLoading) ||
    (memberViewMode === "specific" && memberTasksLoading);

  const selectedMember = allUsers?.find((u: any) => u.id === selectedMemberId);

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
      {/* Deadline warnings (only in "mine" mode) */}
      {memberViewMode === "mine" && urgentTasks.length > 0 && (
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
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">
              {memberViewMode === "mine" ? "我的待办任务" :
               memberViewMode === "all" ? "所有成员任务" :
               `${selectedMember?.name || "成员"} 的任务`}
            </CardTitle>
            {displayedTasks.length > 0 && (
              <Badge variant="secondary" className="text-xs h-5">{displayedTasks.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {/* Personal tasks toggle */}
            <Button
              variant={personalTaskMode ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPersonalTaskMode(v => !v)}
            >
              <Square className="h-3 w-3 mr-1" />
              个人
            </Button>
            <div className="w-px h-5 bg-border mx-0.5" />
            {/* Member view buttons */}
            <Button
              variant={!personalTaskMode && memberViewMode === "mine" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { setMemberViewMode("mine"); setSelectedMemberId(null); setPersonalTaskMode(false); }}
            >
              我的
            </Button>
            <Button
              variant={memberViewMode === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { setMemberViewMode("all"); setSelectedMemberId(null); }}
            >
              <Users className="h-3 w-3 mr-1" />
              所有成员
            </Button>
            {/* Specific member dropdown */}
            <div className="relative" ref={dropdownRef}>
              <Button
                variant={memberViewMode === "specific" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setMemberDropdownOpen(v => !v)}
              >
                <UserCheck className="h-3 w-3 mr-1" />
                {memberViewMode === "specific" && selectedMember ? selectedMember.name : "指定成员"}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {memberDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-lg shadow-lg z-50 py-1">
                  {allUsers && allUsers.length > 0 ? (
                    allUsers.map((u: any) => (
                      <button
                        key={u.id}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2 ${
                          selectedMemberId === u.id ? "text-primary font-medium" : "text-foreground"
                        }`}
                        onClick={() => {
                          setSelectedMemberId(u.id);
                          setMemberViewMode("specific");
                          setMemberDropdownOpen(false);
                        }}
                      >
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.name} className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium text-primary">
                            {u.name?.charAt(0) || "?"}
                          </div>
                        )}
                        <span className="truncate">{u.name || u.email}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">暂无成员数据</div>
                  )}
                </div>
              )}
            </div>
            {/* Clear member filter */}
            {memberViewMode !== "mine" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => { setMemberViewMode("mine"); setSelectedMemberId(null); }}
                title="返回我的任务"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* View toggle */}
            <div className="w-px h-5 bg-border mx-0.5" />
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
          {/* Personal Tasks UI */}
          {personalTaskMode ? (
            <div>
              {/* Personal tasks toolbar */}
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  {(["all", "todo", "in_progress", "done"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setPtStatusFilter(s)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        ptStatusFilter === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "all" ? "全部" : s === "todo" ? "待办" : s === "in_progress" ? "进行中" : "已完成"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant={ptView === "list" ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => setPtView("list")}>
                    <ListTodo className="h-3.5 w-3.5 mr-1" />列表
                  </Button>
                  <Button variant={ptView === "gantt" ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => setPtView("gantt")}>
                    <BarChart2 className="h-3.5 w-3.5 mr-1" />甘特图
                  </Button>
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setPtDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />新建
                  </Button>
                </div>
              </div>

              {/* Personal tasks content */}
              {ptLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !personalTasksData || personalTasksData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">暂无个人任务</p>
                  <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setPtDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />创建第一个个人任务
                  </Button>
                </div>
              ) : ptView === "gantt" ? (
                <GanttView
                  tasks={(personalTasksData || []).map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    startDate: t.startDate,
                    dueDate: t.dueDate,
                    projectName: "个人任务",
                    projectId: -1,
                    assigneeName: "我",
                  }))}
                  colorByProject={false}
                />
              ) : (
                <div className="space-y-1">
                  {(personalTasksData || []).map((task: any) => (
                    <div key={task.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50 group transition-colors">
                      {/* Status toggle */}
                      <button
                        className="flex-shrink-0"
                        onClick={() => updatePersonalTask.mutate({
                          id: task.id,
                          status: task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done",
                        })}
                        title="切换状态"
                      >
                        {task.status === "done" ? (
                          <CheckSquare className="h-4 w-4 text-green-500" />
                        ) : task.status === "in_progress" ? (
                          <Square className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Title (inline edit) */}
                      {ptEditingId === task.id ? (
                        <input
                          autoFocus
                          className="flex-1 text-xs bg-background border border-border rounded px-2 py-0.5 outline-none"
                          value={ptEditTitle}
                          onChange={e => setPtEditTitle(e.target.value)}
                          onBlur={() => {
                            if (ptEditTitle.trim() && ptEditTitle !== task.title) {
                              updatePersonalTask.mutate({ id: task.id, title: ptEditTitle.trim() });
                            } else {
                              setPtEditingId(null);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") { setPtEditingId(null); }
                          }}
                        />
                      ) : (
                        <span
                          className={`flex-1 text-xs cursor-pointer ${
                            task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                          onDoubleClick={() => { setPtEditingId(task.id); setPtEditTitle(task.title); }}
                          title="双击编辑"
                        >
                          {task.title}
                        </span>
                      )}

                      {/* Priority badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        task.priority === "urgent" ? "bg-red-100 text-red-600" :
                        task.priority === "high" ? "bg-orange-100 text-orange-600" :
                        task.priority === "medium" ? "bg-blue-100 text-blue-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {task.priority === "urgent" ? "紧急" : task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
                      </span>

                      {/* Due date */}
                      {task.dueDate && (
                        <span className={`text-[10px] flex-shrink-0 flex items-center gap-0.5 ${
                          new Date(task.dueDate) < new Date() && task.status !== "done" ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          <Calendar className="h-3 w-3" />
                          {new Date(task.dueDate).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                        </span>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          onClick={() => { setPtEditingId(task.id); setPtEditTitle(task.title); }}
                          title="编辑"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-red-500"
                          onClick={() => { if (confirm("确认删除这个个人任务？")) deletePersonalTask.mutate({ id: task.id }); }}
                          title="删除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create personal task dialog */}
              {ptDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
                    <h3 className="text-base font-semibold mb-4">新建个人任务</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">任务名称 *</label>
                        <input
                          autoFocus
                          className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="输入任务名称"
                          value={ptForm.title}
                          onChange={e => setPtForm(f => ({ ...f, title: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter" && ptForm.title.trim()) createPersonalTask.mutate(ptForm); }}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">备注</label>
                        <textarea
                          className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                          placeholder="可选备注"
                          rows={2}
                          value={ptForm.notes}
                          onChange={e => setPtForm(f => ({ ...f, notes: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">优先级</label>
                          <select
                            className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none"
                            value={ptForm.priority}
                            onChange={e => setPtForm(f => ({ ...f, priority: e.target.value as any }))}
                          >
                            <option value="urgent">紧急</option>
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">截止日期</label>
                          <input
                            type="date"
                            className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none"
                            value={ptForm.dueDate}
                            onChange={e => setPtForm(f => ({ ...f, dueDate: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">开始日期</label>
                        <input
                          type="date"
                          className="w-full text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none"
                          value={ptForm.startDate}
                          onChange={e => setPtForm(f => ({ ...f, startDate: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-5">
                      <Button variant="outline" size="sm" onClick={() => setPtDialogOpen(false)}>取消</Button>
                      <Button
                        size="sm"
                        disabled={!ptForm.title.trim() || createPersonalTask.isPending}
                        onClick={() => createPersonalTask.mutate(ptForm)}
                      >
                        {createPersonalTask.isPending ? "创建中..." : "创建任务"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Regular tasks (hidden when personalTaskMode) */}
          {!personalTaskMode && (
            <div>
          {/* Tab: 执行中 / 待审核 — only shown in "mine" mode */}
          {memberViewMode === "mine" && (
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
          )}

          {isLoadingTasks ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : displayedTasks.length === 0 ? (
            <EmptyState
              message={
                memberViewMode === "mine"
                  ? (activeTab === "assignee" ? "暂无分配给你的任务" : "暂无待审核的任务")
                  : memberViewMode === "all"
                    ? "所有成员暂无进行中的任务"
                    : `${selectedMember?.name || "该成员"} 暂无进行中的任务`
              }
              action={{ label: "查看项目", onClick: () => onNavigate("/projects") }}
            />
          ) : view === "list" ? (
            <TaskListView
              tasks={displayedTasks}
              onNavigate={onNavigate}
              isReviewMode={memberViewMode === "mine" && activeTab === "reviewer"}
              showAssignee={memberViewMode !== "mine"}
              onTaskClick={openTaskDetail}
            />
          ) : (
            <GanttView tasks={displayedTasks} colorByProject={memberViewMode !== "mine"} onTaskClick={openTaskDetail} />
          )}
          </div>
          )}
        </CardContent>
      </Card>

      {/* Task Detail Dialog */}
      {selectedTask && (() => {
        const isTaskCreator = currentUser && (
          currentUser.role === "admin" ||
          selectedTask.createdBy === currentUser.id
        );
        const isTaskAssigneeOnly = currentUser &&
          selectedTask.assigneeId === currentUser.id &&
          !isTaskCreator;
        const isTaskReviewer = currentUser &&
          selectedTask.reviewerId === currentUser.id &&
          selectedTask.status !== 'done';
        const canEdit = isTaskCreator;
        return (
          <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {canEdit ? (
                    <Input
                      value={taskEditForm.title}
                      onChange={e => setTaskEditForm(f => ({ ...f, title: e.target.value }))}
                      className="text-base font-semibold h-8 border-0 border-b rounded-none px-0 focus-visible:ring-0 shadow-none"
                    />
                  ) : (
                    <span>{selectedTask.title}</span>
                  )}
                  {!canEdit && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-1">
                {/* Project & assignee info */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {selectedTask.projectName && (
                    <button
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                      onClick={() => { setTaskDetailOpen(false); onNavigate(`/projects/${selectedTask.projectId}`); }}
                    >
                      <FolderKanban className="h-3.5 w-3.5" />
                      {selectedTask.projectName}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                  {selectedTask.assigneeName && (
                    <span className="flex items-center gap-1">
                      <div className="h-3.5 w-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-medium text-primary">
                        {selectedTask.assigneeName.charAt(0)}
                      </div>
                      {selectedTask.assigneeName}
                    </span>
                  )}
                </div>

                {/* Status & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">状态</Label>
                    {canEdit ? (
                      <select
                        className="w-full text-xs border rounded px-2 py-1.5 bg-background text-foreground"
                        value={taskEditForm.status}
                        onChange={e => setTaskEditForm(f => ({ ...f, status: e.target.value }))}
                      >
                        <option value="backlog">待排期</option>
                        <option value="todo">待开始</option>
                        <option value="in_progress">进行中</option>
                        <option value="review">待审核</option>
                        <option value="done">已完成</option>
                      </select>
                    ) : (
                      <Badge variant="outline" className="text-xs">{taskStatusLabel(taskEditForm.status)}</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">优先级</Label>
                    {canEdit ? (
                      <select
                        className="w-full text-xs border rounded px-2 py-1.5 bg-background text-foreground"
                        value={taskEditForm.priority}
                        onChange={e => setTaskEditForm(f => ({ ...f, priority: e.target.value }))}
                      >
                        <option value="urgent">紧急</option>
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    ) : (
                      <Badge variant="outline" className="text-xs">{taskStatusLabel(taskEditForm.status)}</Badge>
                    )}
                  </div>
                </div>

                {/* Progress: assignee-only sees submit form; creator sees slider */}
                {isTaskAssigneeOnly ? (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Label className="text-xs font-semibold text-primary">提交完成进度</Label>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">当前进度</span>
                      <span className="text-sm font-bold text-primary">{homeProgressDraft}%</span>
                    </div>
                    <input
                      type="range" min="0" max="100" step="5"
                      value={homeProgressDraft}
                      onChange={e => setHomeProgressDraft(Number(e.target.value))}
                      className="w-full h-1.5 accent-primary"
                    />
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${homeProgressDraft}%` }} />
                    </div>
                    <textarea
                      className="w-full text-xs rounded-md border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={2}
                      placeholder="进度说明（可选）"
                      value={homeProgressNote}
                      onChange={e => setHomeProgressNote(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">进度 {taskEditForm.progress}%</Label>
                    {canEdit ? (
                      <input
                        type="range" min="0" max="100" step="5"
                        value={taskEditForm.progress}
                        onChange={e => setTaskEditForm(f => ({ ...f, progress: Number(e.target.value) }))}
                        className="w-full h-1.5 accent-primary"
                      />
                    ) : (
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${taskEditForm.progress}%` }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">开始日期</Label>
                    {canEdit ? (
                      <Input type="date" className="text-xs h-7" value={taskEditForm.startDate} onChange={e => setTaskEditForm(f => ({ ...f, startDate: e.target.value }))} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{taskEditForm.startDate || "未设置"}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">截止日期</Label>
                    {canEdit ? (
                      <Input type="date" className="text-xs h-7" value={taskEditForm.dueDate} onChange={e => setTaskEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{taskEditForm.dueDate || "未设置"}</span>
                    )}
                  </div>
                </div>

                {/* Description */}
                {canEdit && (
                  <div className="space-y-1">
                    <Label className="text-xs">备注</Label>
                    <Textarea
                      placeholder="添加备注..."
                      className="text-xs min-h-[60px] resize-none"
                      value={taskEditForm.description}
                      onChange={e => setTaskEditForm(f => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                )}
                {!canEdit && selectedTask.description && (
                  <div className="space-y-1">
                    <Label className="text-xs">备注</Label>
                    <p className="text-xs text-muted-foreground">{selectedTask.description}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                {selectedTask.projectId && (
                  <Button variant="ghost" size="sm" className="text-xs mr-auto" onClick={() => { setTaskDetailOpen(false); onNavigate(`/projects/${selectedTask.projectId}`); }}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />前往项目
                  </Button>
                )}
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setTaskDetailOpen(false)}>关闭</Button>
                {isTaskAssigneeOnly && (
                  <Button size="sm" className="text-xs" disabled={submitProgressHome.isPending} onClick={() => {
                    submitProgressHome.mutate({
                      id: selectedTask.id,
                      progress: homeProgressDraft,
                      progressNote: homeProgressNote || undefined,
                    });
                  }}>
                    {submitProgressHome.isPending ? "提交中..." : "提交进度"}
                  </Button>
                )}
                {isTaskReviewer && (
                  <Button
                    size="sm"
                    className="text-xs bg-green-600 hover:bg-green-700 text-white"
                    disabled={approveTaskHome.isPending}
                    onClick={() => {
                      approveTaskHome.mutate({ id: selectedTask.id }, {
                        onSuccess: () => {
                          setSelectedTask((prev: any) => prev ? { ...prev, status: 'done', approval: true } : prev);
                          import('sonner').then(({ toast }) => toast.success('审核已通过，任务已标记为已完成'));
                        },
                      });
                    }}
                  >
                    {approveTaskHome.isPending ? '处理中...' : '✓ 通过审核'}
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" className="text-xs" disabled={updateTaskDetail.isPending} onClick={() => {
                    updateTaskDetail.mutate({
                      id: selectedTask.id,
                      title: taskEditForm.title,
                      status: taskEditForm.status as any,
                      priority: taskEditForm.priority as any,
                      progress: taskEditForm.progress,
                      startDate: taskEditForm.startDate || undefined,
                      dueDate: taskEditForm.dueDate || undefined,
                      description: taskEditForm.description,
                    });
                  }}>
                    {updateTaskDetail.isPending ? "保存中..." : "保存"}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

// ─── Task List View ──────────────────────────────────────
function TaskListView({
  tasks,
  onNavigate,
  isReviewMode,
  showAssignee,
  onTaskClick,
}: {
  tasks: any[];
  onNavigate: (path: string) => void;
  isReviewMode?: boolean;
  showAssignee?: boolean;
  onTaskClick?: (task: any) => void;
}) {
  const utils = trpc.useUtils();
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.listMine.invalidate();
      utils.tasks.listAll.invalidate();
    },
  });

  return (
    <div className="space-y-1">
      {tasks.map((task: any) => {
        const daysLeft = task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000) : null;
        const isDone = task.status === "done";
        const isOverdue = !isDone && daysLeft !== null && daysLeft < 0;
        const isUrgent = !isDone && daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;
        const completionDiff = (isDone && task.dueDate && task.completedAt)
          ? Math.ceil((new Date(task.completedAt).getTime() - new Date(task.dueDate).getTime()) / 86400000)
          : null;
        const completionLabel = completionDiff === null ? null
          : completionDiff < 0 ? `提前 ${Math.abs(completionDiff)} 天`
          : completionDiff === 0 ? "准时完成"
          : `超期 ${completionDiff} 天完成`;

        return (
          <div
            key={task.id}
            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors group"
          >
            {/* Priority dot */}
            <PriorityDot priority={task.priority} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className="text-sm font-medium truncate cursor-pointer hover:text-primary hover:underline underline-offset-2 transition-colors"
                  onClick={() => onTaskClick ? onTaskClick(task) : (task.projectId && onNavigate(`/projects/${task.projectId}`))}
                >{task.title}</p>
                {task.projectName && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 hidden sm:block">
                    {task.projectName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {/* Assignee avatar (shown in team view) */}
                {showAssignee && task.assigneeName && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {task.assigneeAvatar ? (
                      <img src={task.assigneeAvatar} alt={task.assigneeName} className="h-3.5 w-3.5 rounded-full object-cover" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-medium text-primary">
                        {task.assigneeName.charAt(0)}
                      </div>
                    )}
                    {task.assigneeName}
                  </span>
                )}
                {isDone && completionLabel ? (
                  <span className={`text-[10px] flex items-center gap-0.5 ${
                    completionDiff! > 0 ? "text-amber-600" : completionDiff === 0 ? "text-muted-foreground" : "text-green-600"
                  }`}>
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {completionLabel}
                  </span>
                ) : isDone && task.dueDate ? (
                  <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    已完成
                  </span>
                ) : task.dueDate ? (
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
                ) : null}
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
// Project color palette for Gantt chart
const PROJECT_COLORS = [
  { bar: "#6366f1" }, // indigo
  { bar: "#0ea5e9" }, // sky
  { bar: "#10b981" }, // emerald
  { bar: "#f59e0b" }, // amber
  { bar: "#ec4899" }, // pink
  { bar: "#8b5cf6" }, // violet
  { bar: "#14b8a6" }, // teal
  { bar: "#f97316" }, // orange
  { bar: "#64748b" }, // slate
  { bar: "#a16207" }, // yellow-800
];

function GanttView({ tasks, colorByProject = false, onTaskClick }: { tasks: any[]; colorByProject?: boolean; onTaskClick?: (task: any) => void }) {
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

  // Build project → color index map
  const projectColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    let idx = 0;
    ganttTasks.forEach((t: any) => {
      const key = String(t.projectId ?? "none");
      if (!(key in map)) {
        map[key] = idx % PROJECT_COLORS.length;
        idx++;
      }
    });
    return map;
  }, [ganttTasks]);

  // Memoize date range and day array to avoid re-creating on every render
  const { rangeStart, totalDays, days, today } = useMemo(() => {
    if (ganttTasks.length === 0) return { rangeStart: new Date(), totalDays: 0, days: [], today: new Date() };
    const minDate = ganttTasks.reduce((m: Date, t: any) => t._start < m ? t._start : m, ganttTasks[0]._start);
    const maxDate = ganttTasks.reduce((m: Date, t: any) => t._end > m ? t._end : m, ganttTasks[0]._end);
    const rs = new Date(minDate.getTime() - 2 * 86400000);
    const re = new Date(maxDate.getTime() + 2 * 86400000);
    const td = Math.ceil((re.getTime() - rs.getTime()) / 86400000);
    const d: Date[] = [];
    for (let i = 0; i < td; i++) d.push(new Date(rs.getTime() + i * 86400000));
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return { rangeStart: rs, totalDays: td, days: d, today: t };
  }, [ganttTasks]);

  if (ganttTasks.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        暂无设置了时间范围的任务。<br />
        <span className="text-xs">在任务看板中为任务设置开始/截止日期后，甘特图将自动显示。</span>
      </div>
    );
  }

  const dayWidth = 32; // px per day
  const rowHeight = 36; // px per row
  const labelWidth = 180; // px for sticky label column

  const priorityBarColors: Record<string, string> = {
    urgent: "#ef4444",
    high: "#f97316",
    medium: "#6366f1",
    low: "#94a3b8",
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ position: "relative" }}>
        <div style={{ minWidth: `${totalDays * dayWidth + labelWidth}px` }}>

          {/* Header row */}
          <div className="flex" style={{ height: "24px" }}>
            {/* Sticky label header */}
            <div
              className="shrink-0 bg-muted/80 border-r border-b border-border/40 flex items-center px-2 z-20"
              style={{ width: `${labelWidth}px`, position: "sticky", left: 0 }}
            >
              <span className="text-[10px] font-medium text-muted-foreground">任务名称</span>
            </div>
            {/* Day columns header */}
            <div className="flex flex-1 border-b border-border/40">
              {days.map((d, i) => {
                const isToday = d.getTime() === today.getTime();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const showLabel = d.getDate() === 1 || i === 0 || d.getDay() === 1;
                return (
                  <div
                    key={i}
                    style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px` }}
                    className={`relative border-r border-border/20 ${isWeekend ? "bg-muted/30" : ""} ${isToday ? "bg-primary/10" : ""}`}
                  >
                    {showLabel && (
                      <span className="text-[9px] text-muted-foreground absolute top-0 left-0.5 leading-none pt-0.5">
                        {d.getDate() === 1 ? `${d.getMonth() + 1}月` : `${d.getDate()}`}
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[9px] font-bold text-primary absolute top-0 left-0.5 leading-none pt-0.5">今</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task rows */}
          {ganttTasks.map((task: any) => {
            const startOffset = Math.floor((task._start.getTime() - rangeStart.getTime()) / 86400000);
            const duration = Math.max(1, Math.ceil((task._end.getTime() - task._start.getTime()) / 86400000));
            const daysLeft = Math.ceil((task._end.getTime() - Date.now()) / 86400000);
            const isGanttTaskDone = task.status === "done";
            const isOverdue = !isGanttTaskDone && daysLeft < 0;
            const isUrgent = !isGanttTaskDone && daysLeft >= 0 && daysLeft <= 3;

            // Determine bar color
            let barColor: string;
            if (colorByProject && task.projectId != null) {
              const colorIdx = projectColorMap[String(task.projectId)] ?? 0;
              barColor = PROJECT_COLORS[colorIdx].bar;
            } else if (isOverdue) {
              barColor = "#ef4444";
            } else if (isUrgent) {
              barColor = "#f59e0b";
            } else {
              barColor = priorityBarColors[task.priority] || "#6366f1";
            }

            const tooltipLabel = [
              task.title,
              task.projectName ? `项目：${task.projectName}` : "",
              task.assigneeName ? `负责人：${task.assigneeName}` : "",
              `${task._start.toLocaleDateString("zh-CN")} → ${task._end.toLocaleDateString("zh-CN")}`,
              isOverdue ? "⚠ 已逾期" : isUrgent ? "⚡ 即将到期" : "",
            ].filter(Boolean).join("\n");

            return (
              <div key={task.id} className="flex items-center border-b border-border/20" style={{ height: `${rowHeight}px` }}>
                {/* Sticky label column */}
                <div
                  className={`shrink-0 flex items-center gap-1.5 px-2 bg-background border-r border-border/20 z-10 ${onTaskClick ? "cursor-pointer hover:bg-accent/50" : ""}`}
                  style={{ width: `${labelWidth}px`, position: "sticky", left: 0, height: `${rowHeight}px` }}
                  title={tooltipLabel}
                  onClick={() => onTaskClick && onTaskClick(task)}
                >
                  <PriorityDot priority={task.priority} />
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs truncate block leading-tight ${onTaskClick ? "hover:text-primary hover:underline underline-offset-2" : ""}`}>{task.title}</span>
                    {colorByProject && task.assigneeName && (
                      <span className="text-[9px] text-blue-600/80 truncate block leading-tight font-medium">{task.assigneeName}</span>
                    )}
                    {task.projectName && (
                      <span className="text-[9px] text-muted-foreground truncate block leading-tight">{task.projectName}</span>
                    )}
                  </div>
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
                    className={`absolute top-1/2 -translate-y-1/2 rounded flex items-center px-1.5 overflow-hidden ${onTaskClick ? "cursor-pointer" : "cursor-default"}`}
                  onClick={() => onTaskClick && onTaskClick(task)}
                    style={{
                      left: `${startOffset * dayWidth}px`,
                      width: `${Math.max(20, duration * dayWidth - 2)}px`,
                      height: "22px",
                      backgroundColor: barColor,
                    }}
                    title={tooltipLabel}
                  >
                    {/* Progress fill */}
                    {(task.progress ?? 0) > 0 && (
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded bg-white/30"
                        style={{ width: `${task.progress}%` }}
                      />
                    )}
                    {duration > 2 ? (
                      <div className="flex flex-col justify-center relative z-10 min-w-0 leading-none">
                        <span className="text-[9px] text-white font-medium truncate">{task.title}</span>
                        {colorByProject && task.assigneeName && (
                          <span className="text-[8px] text-white/80 truncate">{task.assigneeName}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        仅显示已设置时间范围的任务 · 竖线为今日 · 悬停任务名称可查看详情
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
