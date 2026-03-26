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
} from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

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
  const applyAutoStatus = trpc.tasks.applyAutoStatus.useMutation();

  // Auto-apply status updates when tasks are loaded
  useEffect(() => {
    if (myTasks && myTasks.length > 0) {
      const taskIds = myTasks.map((t: any) => t.id);
      applyAutoStatus.mutate({ taskIds });
    }
  }, [myTasks?.length]);

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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MyTasksPanel
          myTasks={myTasks || []}
          isLoading={myTasksLoading}
          urgentTasks={urgentTasks}
          onNavigate={setLocation}
        />

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">快速操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2">
                {QUICK_ACTIONS.map((action, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    className="justify-start h-auto py-2 px-3"
                    onClick={() => setLocation(action.path)}
                  >
                    <action.icon className={`h-4 w-4 mr-2 shrink-0 ${action.iconColor}`} />
                    <div className="text-left min-w-0 flex-1">
                      <div className="text-sm font-medium">{action.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{action.desc}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">最近 AI 生成</CardTitle>
            </CardHeader>
            <CardContent>
              {genLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
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
  const applyAutoStatus = trpc.tasks.applyAutoStatus.useMutation();

  // Auto-apply status updates when my tasks are loaded
  useEffect(() => {
    if (myTasks && myTasks.length > 0) {
      const taskIds = myTasks.map((t: any) => t.id);
      applyAutoStatus.mutate({ taskIds });
    }
  }, [myTasks?.length]);

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

  // Auto-apply status updates when personal tasks are loaded
  useEffect(() => {
    if (personalTasksData && personalTasksData.length > 0 && personalTaskMode) {
      const taskIds = personalTasksData.map((t: any) => t.id);
      applyAutoStatus.mutate({ taskIds });
    }
  }, [personalTasksData?.length, personalTaskMode]);

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

  // Auto-apply status updates when all tasks are loaded
  useEffect(() => {
    if (allTasksData && allTasksData.length > 0 && memberViewMode === "all") {
      const taskIds = allTasksData.map((t: any) => t.id);
      applyAutoStatus.mutate({ taskIds });
    }
  }, [allTasksData?.length, memberViewMode]);

  // Fetch specific member tasks
  const { data: memberTasksData, isLoading: memberTasksLoading } = trpc.tasks.listByUser.useQuery(
    { userId: selectedMemberId ?? 0 },
    {
      enabled: memberViewMode === "specific" && selectedMemberId !== null,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  // Auto-apply status updates when specific member tasks are loaded
  useEffect(() => {
    if (memberTasksData && memberTasksData.length > 0 && memberViewMode === "specific") {
      const taskIds = memberTasksData.map((t: any) => t.id);
      applyAutoStatus.mutate({ taskIds });
    }
  }, [memberTasksData?.length, memberViewMode]);

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
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {personalTaskMode ? "个人任务" : "我的待办任务"}
          </CardTitle>
          <div className="flex items-center gap-1">
            {!personalTaskMode && (
              <>
                <Button
                  size="sm"
                  variant={memberViewMode === "mine" ? "default" : "ghost"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMemberViewMode("mine")}
                >
                  我的
                </Button>
                <Button
                  size="sm"
                  variant={memberViewMode === "all" ? "default" : "ghost"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMemberViewMode("all")}
                >
                  所有成员
                </Button>
                <div className="relative" ref={dropdownRef}>
                  <Button
                    size="sm"
                    variant={memberViewMode === "specific" ? "default" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setMemberDropdownOpen(!memberDropdownOpen)}
                  >
                    指定成员
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                  {memberDropdownOpen && (
                    <div className="absolute top-full right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {allUsers?.map((u: any) => (
                        <button
                          key={u.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            setSelectedMemberId(u.id);
                            setMemberViewMode("specific");
                            setMemberDropdownOpen(false);
                          }}
                        >
                          {u.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            <Button
              size="sm"
              variant={personalTaskMode ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setPersonalTaskMode(!personalTaskMode)}
            >
              个人
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {personalTaskMode ? (
            <div className="space-y-3">
              <Button
                size="sm"
                className="w-full"
                onClick={() => setPtDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                新建个人任务
              </Button>

              {ptLoading ? (
                <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : personalTasksData && personalTasksData.length > 0 ? (
                <div className="space-y-2">
                  {personalTasksData.map((pt: any) => (
                    <div key={pt.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 group">
                      <Checkbox
                        checked={pt.status === "done"}
                        onCheckedChange={(checked) => {
                          updatePersonalTask.mutate({
                            id: pt.id,
                            status: checked ? "done" : "todo",
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{pt.title}</div>
                        {pt.dueDate && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(pt.dueDate).toLocaleDateString("zh-CN")}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {pt.priority}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => deletePersonalTask.mutate({ id: pt.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="暂无个人任务" />
              )}

              <Dialog open={ptDialogOpen} onOpenChange={setPtDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>新建个人任务</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>任务名称</Label>
                      <Input
                        value={ptForm.title}
                        onChange={(e) => setPtForm({ ...ptForm, title: e.target.value })}
                        placeholder="输入任务名称"
                      />
                    </div>
                    <div>
                      <Label>优先级</Label>
                      <select
                        value={ptForm.priority}
                        onChange={(e) => setPtForm({ ...ptForm, priority: e.target.value as any })}
                        className="w-full px-2 py-1 border rounded-md"
                      >
                        <option value="low">低</option>
                        <option value="medium">中</option>
                        <option value="high">高</option>
                        <option value="urgent">紧急</option>
                      </select>
                    </div>
                    <div>
                      <Label>开始日期</Label>
                      <Input
                        type="date"
                        value={ptForm.startDate}
                        onChange={(e) => setPtForm({ ...ptForm, startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>截止日期</Label>
                      <Input
                        type="date"
                        value={ptForm.dueDate}
                        onChange={(e) => setPtForm({ ...ptForm, dueDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setPtDialogOpen(false)}>取消</Button>
                    <Button
                      onClick={() => {
                        if (ptForm.title.trim()) {
                          createPersonalTask.mutate({
                            title: ptForm.title,
                            priority: ptForm.priority,
                            startDate: ptForm.startDate ? new Date(ptForm.startDate).toISOString() : undefined,
                            dueDate: ptForm.dueDate ? new Date(ptForm.dueDate).toISOString() : undefined,
                          });
                        }
                      }}
                    >
                      创建
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <>
              {isLoadingTasks ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : displayedTasks && displayedTasks.length > 0 ? (
                <div className="space-y-2">
                  {displayedTasks.slice(0, 5).map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
                      onClick={() => openTaskDetail(t)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-xs">{t.status}</Badge>
                          {t.dueDate && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(t.dueDate).toLocaleDateString("zh-CN")}
                            </span>
                          )}
                        </div>
                      </div>
                      {t.progress !== undefined && (
                        <div className="text-xs font-medium text-muted-foreground">{t.progress}%</div>
                      )}
                    </div>
                  ))}
                  {displayedTasks.length > 5 && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => onNavigate("/projects")}
                    >
                      查看全部 ({displayedTasks.length})
                    </Button>
                  )}
                </div>
              ) : (
                <EmptyState message="暂无待办任务" />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Task Detail Dialog */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>任务详情</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-3">
              <div>
                <Label>任务名称</Label>
                <Input
                  value={taskEditForm.title}
                  onChange={(e) => setTaskEditForm({ ...taskEditForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label>状态</Label>
                <select
                  value={taskEditForm.status}
                  onChange={(e) => setTaskEditForm({ ...taskEditForm, status: e.target.value })}
                  className="w-full px-2 py-1 border rounded-md"
                >
                  <option value="todo">待做</option>
                  <option value="in_progress">进行中</option>
                  <option value="review">审核中</option>
                  <option value="done">完成</option>
                </select>
              </div>
              <div>
                <Label>优先级</Label>
                <select
                  value={taskEditForm.priority}
                  onChange={(e) => setTaskEditForm({ ...taskEditForm, priority: e.target.value })}
                  className="w-full px-2 py-1 border rounded-md"
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="urgent">紧急</option>
                </select>
              </div>
              <div>
                <Label>进度 ({taskEditForm.progress}%)</Label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={taskEditForm.progress}
                  onChange={(e) => setTaskEditForm({ ...taskEditForm, progress: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDetailOpen(false)}>取消</Button>
            <Button
              onClick={() => {
                if (selectedTask) {
                  updateTaskDetail.mutate({
                    id: selectedTask.id,
                    title: taskEditForm.title,
                    status: taskEditForm.status as any,
                    priority: taskEditForm.priority as any,
                    progress: taskEditForm.progress,
                  });
                }
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────
function EmptyState({ message, action }: { message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function formatRelativeTime(date: any): string {
  const now = new Date();
  const time = new Date(date);
  const diff = now.getTime() - time.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return time.toLocaleDateString("zh-CN");
}

// Import Checkbox
import { Checkbox } from "@/components/ui/checkbox";
