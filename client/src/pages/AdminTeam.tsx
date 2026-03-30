import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Users, Shield, User, UserCheck, UserX, Clock, CheckCircle2, XCircle,
  BarChart3, TrendingUp, TrendingDown, AlertCircle, Sparkles, Loader2,
  Zap, FileText, Activity, PieChart,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

export default function AdminTeam() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  // ─── Member management state ───────────────────────────
  const { data: members = [], isLoading: loadingMembers } = trpc.admin.listUsers.useQuery();
  const { data: pending = [], isLoading: loadingPending } = trpc.admin.listPendingUsers.useQuery();
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "revoke";
    userId: number;
    userName: string;
  } | null>(null);

  // ─── Task stats state ──────────────────────────────────
  const { data: taskStats = [], isLoading: loadingStats } = trpc.admin.getMemberTaskStats.useQuery();
  const { data: aiStats = [], isLoading: loadingAiStats } = trpc.admin.getMemberAiStats.useQuery();
  const { data: aiTools = [] } = trpc.aiTools.list.useQuery({ activeOnly: true });
  const [selectedAiToolId, setSelectedAiToolId] = useState<string>("default");
  const [analysisReport, setAnalysisReport] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiStatsView, setAiStatsView] = useState<"calls" | "generations">("calls");

  // ─── Mutations ─────────────────────────────────────────
  const approveMutation = trpc.admin.approveUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.listPendingUsers.invalidate();
      toast.success("已批准成员访问权限");
      setConfirmAction(null);
    },
    onError: () => toast.error("操作失败"),
  });

  const revokeMutation = trpc.admin.revokeUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      utils.admin.listPendingUsers.invalidate();
      toast.success("已撤销成员访问权限");
      setConfirmAction(null);
    },
    onError: () => toast.error("操作失败"),
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("角色已更新");
    },
    onError: () => toast.error("操作失败"),
  });

  const analyzePerformanceMutation = trpc.admin.analyzePerformance.useMutation({
    onSuccess: (data) => {
      setAnalysisReport(typeof data.report === 'string' ? data.report : '');
      setIsAnalyzing(false);
    },
    onError: () => {
      toast.error("分析失败，请重试");
      setIsAnalyzing(false);
    },
  });

  const approvedMembers = members.filter((m: any) => m.approved);

  // ─── Chart data ────────────────────────────────────────
  const chartData = taskStats.map((m: any) => ({
    name: m.name?.split(" ")[0] || m.name || "未知",
    提前完成: m.earlyCompleted,
    延期完成: m.overdueCompleted,
    进行中: m.inProgress,
    逾期未完成: m.overdueIncomplete,
  }));

  const handleAnalyze = () => {
    if (taskStats.length === 0) {
      toast.error("暂无任务数据可供分析");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisReport("");
    const toolId = selectedAiToolId !== "default" ? parseInt(selectedAiToolId) : undefined;
    analyzePerformanceMutation.mutate({
      statsJson: JSON.stringify(taskStats),
      aiToolId: toolId,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">团队管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理平台成员权限，查看任务完成情况，并使用 AI 分析团队表现。
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="mb-4">
          <TabsTrigger value="members" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            成员管理
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            任务视图
          </TabsTrigger>
          <TabsTrigger value="ai-stats" className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            AI 使用统计
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Members ─── */}
        <TabsContent value="members" className="space-y-6">
          {/* 待审批成员 */}
          {(loadingPending || pending.length > 0) && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                  待审批成员
                  {pending.length > 0 && (
                    <Badge variant="outline" className="ml-1 text-amber-700 border-amber-400 text-xs">
                      {pending.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPending ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">暂无待审批成员</p>
                ) : (
                  <div className="space-y-2">
                    {pending.map((member: any) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                            <User className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{member.name || "未命名用户"}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.email || member.loginMethod || "无联系方式"} · 注册于{" "}
                              {new Date(member.createdAt).toLocaleDateString("zh-CN")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                            onClick={() =>
                              setConfirmAction({ type: "approve", userId: member.id, userName: member.name || "该用户" })
                            }
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            批准
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 已批准成员 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                已批准成员
                <Badge variant="secondary" className="ml-1 text-xs">
                  {approvedMembers.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : approvedMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">暂无已批准成员</div>
              ) : (
                <div className="space-y-2">
                  {approvedMembers.map((member: any) => {
                    const isOwner = member.role === "admin" && member.id === currentUser?.id;
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            {member.role === "admin" ? (
                              <Shield className="h-4 w-4 text-primary" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {member.name || "未命名用户"}
                              {isOwner && (
                                <span className="ml-2 text-xs text-muted-foreground">(你)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member.email || member.loginMethod || "无联系方式"} · 最近登录{" "}
                              {new Date(member.lastSignedIn).toLocaleDateString("zh-CN")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={member.role === "admin" ? "default" : "outline"}
                            className="text-xs cursor-pointer select-none"
                            onClick={() => {
                              if (isOwner) return;
                              const newRole = member.role === "admin" ? "user" : "admin";
                              updateRoleMutation.mutate({ userId: member.id, role: newRole });
                            }}
                            title={isOwner ? "无法修改自己的角色" : "点击切换角色"}
                          >
                            {member.role === "admin" ? "管理员" : "成员"}
                          </Badge>
                          {!isOwner && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setConfirmAction({
                                  type: "revoke",
                                  userId: member.id,
                                  userName: member.name || "该用户",
                                })
                              }
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              撤销
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 使用说明 */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-3">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>新用户通过 Manus 账号登录后，会进入待审批状态，无法访问平台功能。</p>
                  <p>管理员在此页面批准后，成员即可正常使用工作平台。撤销权限后成员将无法继续使用。</p>
                  <p>点击成员的角色标签可切换"管理员"与"成员"角色。</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Task View ─── */}
        <TabsContent value="tasks" className="space-y-6">
          {/* Summary cards */}
          {loadingStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : taskStats.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                暂无任务数据。请先在项目看板中为成员分配任务。
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Per-member stat cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {taskStats.map((m: any) => (
                  <Card key={m.userId} className="overflow-hidden">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{m.name}</p>
                          {m.department && (
                            <p className="text-xs text-muted-foreground truncate">{m.department}</p>
                          )}
                        </div>
                        <div className="ml-auto text-right shrink-0">
                          <p className="text-lg font-bold">{m.completionRate}%</p>
                          <p className="text-xs text-muted-foreground">完成率</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="text-center p-2 rounded-md bg-muted/50">
                          <p className="text-base font-semibold">{m.total}</p>
                          <p className="text-xs text-muted-foreground">总任务</p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-muted/50">
                          <p className="text-base font-semibold">{m.done}</p>
                          <p className="text-xs text-muted-foreground">已完成</p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-muted/50">
                          <p className="text-base font-semibold">{m.inProgress}</p>
                          <p className="text-xs text-muted-foreground">进行中</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <TrendingUp className="h-3 w-3" />
                          提前 {m.earlyCompleted}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <TrendingDown className="h-3 w-3" />
                          延期完成 {m.overdueCompleted}
                        </div>
                        {m.overdueIncomplete > 0 && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            逾期未完成 {m.overdueIncomplete}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Bar chart */}
              {chartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">任务完成情况对比</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Bar dataKey="提前完成" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="延期完成" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="进行中" fill="hsl(217, 91%, 60%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="逾期未完成" fill="hsl(0, 84%, 60%)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* AI Analysis */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI 员工表现分析
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Select value={selectedAiToolId} onValueChange={setSelectedAiToolId}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="选择 AI 工具" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">默认 AI 工具</SelectItem>
                          {aiTools.map((tool: any) => (
                            <SelectItem key={tool.id} value={String(tool.id)}>
                              {tool.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="h-9 gap-1.5"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          分析中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          生成分析报告
                        </>
                      )}
                    </Button>
                  </div>

                  {analysisReport && (
                    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                      <Streamdown>{analysisReport}</Streamdown>
                    </div>
                  )}

                  {!analysisReport && !isAnalyzing && (
                    <p className="text-xs text-muted-foreground">
                      点击「生成分析报告」，AI 将根据上方任务数据分析每位成员的工作表现，并给出改进建议。
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── Tab 3: AI 使用统计 ─── */}
        <TabsContent value="ai-stats" className="space-y-6">
          {loadingAiStats ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* 切换视图 */}
              <div className="flex items-center gap-2">
                <Button
                  variant={aiStatsView === "calls" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAiStatsView("calls")}
                  className="gap-1.5"
                >
                  <Activity className="h-3.5 w-3.5" />
                  AI 工具调用
                </Button>
                <Button
                  variant={aiStatsView === "generations" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAiStatsView("generations")}
                  className="gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  成果生成
                </Button>
              </div>

              {/* 成员统计卡片 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {aiStats.map((m) => (
                  <Card key={m.userId} className="border-border/60">
                    <CardContent className="pt-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {(m.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{m.name}</p>
                          {m.department && <p className="text-xs text-muted-foreground">{m.department}</p>}
                        </div>
                      </div>
                      {aiStatsView === "calls" ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">总调用次数</span>
                            <span className="font-semibold">{m.totalCalls}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">近 30 天</span>
                            <span className="font-medium text-blue-500">{m.recentCalls}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">成功率</span>
                            <span className={m.successRate >= 80 ? "font-medium text-green-500" : "font-medium text-amber-500"}>
                              {m.successRate}%
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">平均耗时</span>
                            <span className="font-medium">
                              {m.avgDurationMs > 0 ? `${(m.avgDurationMs / 1000).toFixed(1)}s` : '-'}
                            </span>
                          </div>
                          {Object.keys(m.toolBreakdown || {}).length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="mb-1 text-xs text-muted-foreground">工具分布</p>
                              {Object.entries(m.toolBreakdown || {}).slice(0, 3).map(([tool, count]) => (
                                <div key={tool} className="flex justify-between text-xs">
                                  <span className="truncate text-muted-foreground" style={{maxWidth: '70%'}}>{tool}</span>
                                  <span>{count as number}次</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">总成果数</span>
                            <span className="font-semibold">{m.totalGenerations}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">近 30 天</span>
                            <span className="font-medium text-blue-500">{m.recentGenerations}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">成功生成</span>
                            <span className="font-medium text-green-500">{m.successGenerations}</span>
                          </div>
                          {Object.keys(m.moduleBreakdown || {}).length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="mb-1 text-xs text-muted-foreground">模块分布</p>
                              {Object.entries(m.moduleBreakdown || {}).slice(0, 4).map(([mod, count]) => (
                                <div key={mod} className="flex justify-between text-xs">
                                  <span className="truncate text-muted-foreground" style={{maxWidth: '70%'}}>{mod}</span>
                                  <span>{count as number}次</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* 对比图表 */}
              {aiStats.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <PieChart className="h-4 w-4" />
                      {aiStatsView === "calls" ? "AI 工具调用对比" : "成果生成对比"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={aiStats.map((m) => ({
                          name: m.name,
                          ...(aiStatsView === "calls"
                            ? { 总调用: m.totalCalls, 近30天: m.recentCalls }
                            : { 总成果: m.totalGenerations, 近30天: m.recentGenerations, 成功: m.successGenerations }
                          ),
                        }))}
                        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {aiStatsView === "calls" ? (
                          <>
                            <Bar dataKey="总调用" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="近30天" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                          </>
                        ) : (
                          <>
                            <Bar dataKey="总成果" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="近30天" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="成功" fill="#22c55e" radius={[3, 3, 0, 0]} />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {aiStats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Zap className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-sm">暂无 AI 使用记录</p>
                  <p className="mt-1 text-xs">当成员使用 AI 工具后，统计数据将在此显示</p>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
      {/* 确认对话框 */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "approve" ? "批准成员访问" : "撤销成员权限"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "approve"
                ? `确认批准 ${confirmAction?.userName} 访问工作平台？批准后该成员可以登录并使用所有功能。`
                : `确认撤销 ${confirmAction?.userName} 的访问权限？撤销后该成员将无法登录工作平台。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "revoke" ? "bg-destructive hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "approve") {
                  approveMutation.mutate({ userId: confirmAction.userId });
                } else {
                  revokeMutation.mutate({ userId: confirmAction.userId });
                }
              }}
            >
              {confirmAction?.type === "approve" ? "确认批准" : "确认撤销"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
