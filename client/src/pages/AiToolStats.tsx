import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from "recharts";
import {
  Activity, CheckCircle2, XCircle, Clock, TrendingUp,
  AlertTriangle, BarChart2, Zap, Users, ChevronDown, ChevronRight,
  User, CalendarDays
} from "lucide-react";

const DAY_OPTIONS = [7, 14, 30];

const ACTION_LABELS: Record<string, string> = {
  rendering_generate: "AI 效果图",
  color_plan_generate: "AI 彩平",
  video_generate: "AI 视频",
  benchmark_research: "对标调研",
  media_generate: "媒体内容",
  meeting_transcribe: "会议纪要",
  rendering_edit: "图像编辑",
};

function getActionLabel(action: string | null) {
  if (!action) return "其他";
  return ACTION_LABELS[action] || action;
}

function getToolDisplayName(toolId: number, toolName: string | null) {
  if (toolId === 0) return "内置 AI";
  return toolName || `工具 #${toolId}`;
}

function getUserDisplayName(userId: number, userName: string | null) {
  return userName || `用户 #${userId}`;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.slice(0, 1).toUpperCase();
}

// 颜色映射
const TOOL_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#ef4444", "#84cc16"
];

const USER_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#ef4444", "#84cc16"
];

// ── 成功率进度条 ──
function SuccessRateBar({ rate }: { rate: number }) {
  const color = rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-8 text-right" style={{ color }}>{rate}%</span>
    </div>
  );
}

// ── 按工具视图 ──
function ToolStatsView({ days }: { days: number }) {
  const { data, isLoading } = trpc.aiTools.getCallStats.useQuery({ days });

  const toolSummary = useMemo(() => {
    if (!data?.toolStats) return [];
    const map = new Map<number, {
      toolId: number; toolName: string; provider: string | null;
      totalCalls: number; successCalls: number; failedCalls: number;
      avgDurationMs: number | null; lastCalledAt: Date | null;
      actions: Record<string, number>;
    }>();
    for (const row of data.toolStats) {
      const key = row.toolId;
      const existing = map.get(key);
      if (existing) {
        existing.totalCalls += Number(row.totalCalls);
        existing.successCalls += Number(row.successCalls);
        existing.failedCalls += Number(row.failedCalls);
        if (row.action) existing.actions[row.action] = (existing.actions[row.action] || 0) + Number(row.totalCalls);
        if (row.lastCalledAt && (!existing.lastCalledAt || new Date(row.lastCalledAt) > existing.lastCalledAt)) {
          existing.lastCalledAt = new Date(row.lastCalledAt);
        }
      } else {
        map.set(key, {
          toolId: row.toolId,
          toolName: getToolDisplayName(row.toolId, row.toolName),
          provider: row.provider,
          totalCalls: Number(row.totalCalls),
          successCalls: Number(row.successCalls),
          failedCalls: Number(row.failedCalls),
          avgDurationMs: row.avgDurationMs ? Number(row.avgDurationMs) : null,
          lastCalledAt: row.lastCalledAt ? new Date(row.lastCalledAt) : null,
          actions: row.action ? { [row.action]: Number(row.totalCalls) } : {},
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [data?.toolStats]);

  const actionSummary = useMemo(() => {
    if (!data?.toolStats) return [];
    const map = new Map<string, { action: string; totalCalls: number; successCalls: number; failedCalls: number }>();
    for (const row of data.toolStats) {
      const key = row.action || "other";
      const existing = map.get(key);
      if (existing) {
        existing.totalCalls += Number(row.totalCalls);
        existing.successCalls += Number(row.successCalls);
        existing.failedCalls += Number(row.failedCalls);
      } else {
        map.set(key, { action: key, totalCalls: Number(row.totalCalls), successCalls: Number(row.successCalls), failedCalls: Number(row.failedCalls) });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [data?.toolStats]);

  const dailyTotal = useMemo(() => {
    if (!data?.dailyTrend) return [];
    const map = new Map<string, { date: string; totalCalls: number; successCalls: number; failedCalls: number }>();
    for (const row of data.dailyTrend) {
      const d = row.date;
      const existing = map.get(d);
      if (existing) {
        existing.totalCalls += Number(row.totalCalls);
        existing.successCalls += Number(row.successCalls);
        existing.failedCalls += Number(row.failedCalls);
      } else {
        map.set(d, { date: d, totalCalls: Number(row.totalCalls), successCalls: Number(row.successCalls), failedCalls: Number(row.failedCalls) });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data?.dailyTrend]);

  if (isLoading) return <div className="h-64 bg-muted rounded-lg animate-pulse" />;

  return (
    <div className="space-y-6">
      {/* 趋势折线图 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />每日调用趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyTotal.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyTotal} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }} labelStyle={{ color: "hsl(var(--foreground))" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="totalCalls" name="总调用" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="successCalls" name="成功" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="failedCalls" name="失败" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 按工具调用量 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />各工具调用量
            </CardTitle>
          </CardHeader>
          <CardContent>
            {toolSummary.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={toolSummary} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="toolName" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="successCalls" name="成功" stackId="a" fill="#10b981" />
                  <Bar dataKey="failedCalls" name="失败" stackId="a" fill="#ef4444" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 按功能模块分布 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />按功能模块分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {actionSummary.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={actionSummary} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="action" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={getActionLabel} width={60} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }} labelFormatter={getActionLabel} />
                  <Bar dataKey="totalCalls" name="调用次数" radius={[0,3,3,0]}>
                    {actionSummary.map((_, index) => <Cell key={index} fill={TOOL_COLORS[index % TOOL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 各工具详细统计表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />各工具详细统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          {toolSummary.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">近 {days} 天内暂无调用记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">工具名称</th>
                    <th className="text-right py-2 px-3 font-medium">总调用</th>
                    <th className="text-right py-2 px-3 font-medium">成功</th>
                    <th className="text-right py-2 px-3 font-medium">失败</th>
                    <th className="text-right py-2 px-3 font-medium">成功率</th>
                    <th className="text-right py-2 px-3 font-medium">平均耗时</th>
                    <th className="text-left py-2 pl-3 font-medium">使用功能</th>
                  </tr>
                </thead>
                <tbody>
                  {toolSummary.map((tool, idx) => {
                    const rate = tool.totalCalls > 0 ? Math.round((tool.successCalls / tool.totalCalls) * 100) : 0;
                    const avgSec = tool.avgDurationMs ? (tool.avgDurationMs / 1000).toFixed(1) : null;
                    return (
                      <tr key={tool.toolId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: TOOL_COLORS[idx % TOOL_COLORS.length] }} />
                            <span className="font-medium">{tool.toolName}</span>
                            {tool.provider && <span className="text-xs text-muted-foreground">{tool.provider}</span>}
                          </div>
                        </td>
                        <td className="text-right py-2.5 px-3 font-mono">{tool.totalCalls}</td>
                        <td className="text-right py-2.5 px-3 font-mono text-green-600">{tool.successCalls}</td>
                        <td className="text-right py-2.5 px-3 font-mono text-destructive">{tool.failedCalls}</td>
                        <td className="text-right py-2.5 px-3">
                          <Badge variant={rate >= 80 ? "default" : rate >= 50 ? "secondary" : "destructive"} className="text-xs font-mono">{rate}%</Badge>
                        </td>
                        <td className="text-right py-2.5 px-3 text-muted-foreground font-mono text-xs">{avgSec ? `${avgSec}s` : "—"}</td>
                        <td className="py-2.5 pl-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(tool.actions).map(([action, count]) => (
                              <Badge key={action} variant="outline" className="text-[10px] h-4 px-1.5">{getActionLabel(action)} ×{count}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 最近失败记录 */}
      {data?.recentFailures && data.recentFailures.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />最近失败记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentFailures.map((f: any) => (
                <div key={f.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{getActionLabel(f.action)}</Badge>
                      <span className="text-xs font-medium">{getToolDisplayName(f.toolId, f.toolName)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(f.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {f.inputSummary && <p className="text-xs text-muted-foreground line-clamp-1">输入：{f.inputSummary}</p>}
                  {f.errorMessage && <p className="text-xs text-destructive/80 font-mono line-clamp-2 bg-destructive/10 rounded px-2 py-1">{f.errorMessage}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 成员详情展开行 ──
function UserDetailRow({
  userId,
  actionStats,
}: {
  userId: number;
  actionStats: Array<{ action: string | null; toolId: number; toolName: string | null; totalCalls: number; successCalls: number; failedCalls: number }>;
}) {
  // 按功能模块汇总
  const byAction = useMemo(() => {
    const map = new Map<string, { label: string; totalCalls: number; successCalls: number; tools: string[] }>();
    for (const row of actionStats) {
      const key = row.action || "other";
      const existing = map.get(key);
      const toolName = getToolDisplayName(row.toolId, row.toolName);
      if (existing) {
        existing.totalCalls += Number(row.totalCalls);
        existing.successCalls += Number(row.successCalls);
        if (!existing.tools.includes(toolName)) existing.tools.push(toolName);
      } else {
        map.set(key, { label: getActionLabel(key), totalCalls: Number(row.totalCalls), successCalls: Number(row.successCalls), tools: [toolName] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [actionStats]);

  // 按工具汇总
  const byTool = useMemo(() => {
    const map = new Map<number, { toolId: number; toolName: string; totalCalls: number; successCalls: number }>();
    for (const row of actionStats) {
      const existing = map.get(row.toolId);
      if (existing) {
        existing.totalCalls += Number(row.totalCalls);
        existing.successCalls += Number(row.successCalls);
      } else {
        map.set(row.toolId, { toolId: row.toolId, toolName: getToolDisplayName(row.toolId, row.toolName), totalCalls: Number(row.totalCalls), successCalls: Number(row.successCalls) });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [actionStats]);

  return (
    <div className="px-4 pb-4 pt-2 bg-muted/20 border-t border-border/50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 功能模块分布 */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">功能模块使用分布</p>
          <div className="space-y-2">
            {byAction.map((item, idx) => (
              <div key={item.label} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: TOOL_COLORS[idx % TOOL_COLORS.length] }} />
                    <span>{item.label}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{item.totalCalls} 次</span>
                </div>
                <SuccessRateBar rate={item.totalCalls > 0 ? Math.round((item.successCalls / item.totalCalls) * 100) : 0} />
              </div>
            ))}
          </div>
        </div>
        {/* 工具使用分布 */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">使用工具分布</p>
          <div className="space-y-2">
            {byTool.map((tool, idx) => (
              <div key={tool.toolId} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: USER_COLORS[idx % USER_COLORS.length] }} />
                <span className="text-xs flex-1">{tool.toolName}</span>
                <span className="text-xs font-mono text-muted-foreground">{tool.totalCalls} 次</span>
                <Badge
                  variant={tool.totalCalls > 0 && Math.round((tool.successCalls / tool.totalCalls) * 100) >= 80 ? "default" : "secondary"}
                  className="text-[10px] h-4 px-1.5"
                >
                  {tool.totalCalls > 0 ? Math.round((tool.successCalls / tool.totalCalls) * 100) : 0}%
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 格式化时长（分钟 → 小时/分钟）
function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1 分钟";
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── 按成员视图 ──
function UserStatsView({ days }: { days: number }) {
  const { data, isLoading } = trpc.aiTools.getStatsByUser.useQuery({ days });
  const { data: sessionData } = trpc.session.getStats.useQuery({ days });
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());

  const userStats = useMemo(() => {
    if (!data?.userStats) return [];
    return data.userStats.map(u => ({
      ...u,
      totalCalls: Number(u.totalCalls),
      successCalls: Number(u.successCalls),
      failedCalls: Number(u.failedCalls),
      avgDurationMs: u.avgDurationMs ? Number(u.avgDurationMs) : null,
    }));
  }, [data?.userStats]);

  // 按用户 id 建立 session 时长映射
  const sessionMap = useMemo(() => {
    const map = new Map<number, { totalMinutes: number; sessionCount: number; activeDays: number; lastSeen: number }>();
    if (sessionData?.userSessionStats) {
      for (const s of sessionData.userSessionStats) {
        map.set(s.userId, {
          totalMinutes: Number(s.totalMinutes) || 0,
          sessionCount: Number(s.sessionCount) || 0,
          activeDays: Number((s as any).activeDays) || 0,
          lastSeen: Number(s.lastSeen) || 0,
        });
      }
    }
    return map;
  }, [sessionData?.userSessionStats]);

  // 使用时长图表数据（含活跃天数）
  const sessionChartData = useMemo(() => {
    if (!sessionData?.userSessionStats?.length) return [];
    return sessionData.userSessionStats.slice(0, 8).map((s, idx) => ({
      name: s.userName || `用户 #${s.userId}`,
      totalMinutes: Number(s.totalMinutes) || 0,
      sessionCount: Number(s.sessionCount) || 0,
      activeDays: Number((s as any).activeDays) || 0,
      color: USER_COLORS[idx % USER_COLORS.length],
    }));
  }, [sessionData?.userSessionStats]);

  // 按成员分组的操作统计
  type UserActionRow = NonNullable<typeof data>["userActionStats"][number];
  const userActionMap = useMemo(() => {
    if (!data?.userActionStats) return new Map<number, UserActionRow[]>();
    const map = new Map<number, UserActionRow[]>();
    for (const row of data.userActionStats) {
      if (!map.has(row.userId)) map.set(row.userId, []);
      map.get(row.userId)!.push(row);
    }
    return map;
  }, [data?.userActionStats]);

  // 每日趋势（按成员汇总）
  const chartData = useMemo(() => {
    if (!userStats.length) return [];
    return userStats.slice(0, 6).map((u, idx) => ({
      name: getUserDisplayName(u.userId, u.userName),
      totalCalls: u.totalCalls,
      successCalls: u.successCalls,
      failedCalls: u.failedCalls,
      color: USER_COLORS[idx % USER_COLORS.length],
    }));
  }, [userStats]);

  const toggleExpand = (userId: number) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  if (isLoading) return <div className="h-64 bg-muted rounded-lg animate-pulse" />;

  if (userStats.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">近 {days} 天内暂无成员使用记录</p>
      </div>
    );
  }

  const totalCalls = userStats.reduce((s, u) => s + u.totalCalls, 0);
  const maxCalls = Math.max(...userStats.map(u => u.totalCalls));

  return (
    <div className="space-y-6">
      {/* 成员调用量横向柱状图 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />成员调用量对比
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(180, userStats.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="successCalls" name="成功" stackId="a" fill="#10b981" />
              <Bar dataKey="failedCalls" name="失败" stackId="a" fill="#ef4444" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 成员使用时长 + 活跃天数图表 */}
      {sessionChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 使用时长图表 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />成员使用时长
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(180, sessionChartData.length * 40)}>
                <BarChart data={sessionChartData} layout="vertical" margin={{ top: 5, right: 60, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false}
                    tickFormatter={(v) => v >= 60 ? `${Math.floor(v/60)}h` : `${v}m`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                    formatter={(value: number) => [formatDuration(value), "使用时长"]}
                  />
                  <Bar dataKey="totalMinutes" name="使用时长" radius={[0,3,3,0]}>
                    {sessionChartData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 活跃天数图表 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />成员活跃天数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(180, sessionChartData.length * 40)}>
                <BarChart data={sessionChartData} layout="vertical" margin={{ top: 5, right: 60, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false}
                    tickFormatter={(v) => `${v}d`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                    formatter={(value: number) => [`${value} 天`, "活跃天数"]}
                  />
                  <Bar dataKey="activeDays" name="活跃天数" radius={[0,3,3,0]}>
                    {sessionChartData.map((entry, idx) => (
                      <Cell key={`cell-ad-${idx}`} fill={entry.color} opacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 成员详细列表（可展开） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />成员使用详情
            <span className="text-xs text-muted-foreground font-normal ml-1">点击成员行查看详细分布</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2.5 px-4 font-medium">成员</th>
                  <th className="text-left py-2.5 px-3 font-medium hidden md:table-cell">部门</th>
                  <th className="text-right py-2.5 px-3 font-medium">调用量</th>
                  <th className="text-right py-2.5 px-3 font-medium hidden sm:table-cell">成功</th>
                  <th className="text-right py-2.5 px-3 font-medium hidden sm:table-cell">失败</th>
                  <th className="py-2.5 px-3 font-medium" style={{ minWidth: 120 }}>成功率</th>
                  <th className="text-right py-2.5 px-3 font-medium hidden md:table-cell">占比</th>
                  <th className="text-right py-2.5 px-3 font-medium hidden lg:table-cell">使用时长</th>
                  <th className="text-right py-2.5 px-3 font-medium hidden lg:table-cell">活跃天数</th>
                  <th className="text-right py-2.5 px-3 font-medium hidden md:table-cell">最近使用</th>
                  <th className="py-2.5 px-4 w-8" />
                </tr>
              </thead>
              <tbody>
                {userStats.map((user, idx) => {
                  const rate = user.totalCalls > 0 ? Math.round((user.successCalls / user.totalCalls) * 100) : 0;
                  const share = totalCalls > 0 ? Math.round((user.totalCalls / totalCalls) * 100) : 0;
                  const isExpanded = expandedUsers.has(user.userId);
                  const actionStats = userActionMap.get(user.userId) || [];

                  return (
                    <>
                      <tr
                        key={user.userId}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(user.userId)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback
                                className="text-xs font-medium text-white"
                                style={{ background: USER_COLORS[idx % USER_COLORS.length] }}
                              >
                                {getInitials(user.userName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm leading-tight">{getUserDisplayName(user.userId, user.userName)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">{user.department || "—"}</span>
                        </td>
                        <td className="text-right py-3 px-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <div
                              className="h-1.5 rounded-full bg-primary/20"
                              style={{ width: `${Math.round((user.totalCalls / maxCalls) * 48)}px` }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.round((user.totalCalls / maxCalls) * 100)}%`, background: USER_COLORS[idx % USER_COLORS.length] }}
                              />
                            </div>
                            <span className="font-mono font-semibold text-sm">{user.totalCalls}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-3 font-mono text-green-600 hidden sm:table-cell">{user.successCalls}</td>
                        <td className="text-right py-3 px-3 font-mono text-destructive hidden sm:table-cell">{user.failedCalls}</td>
                        <td className="py-3 px-3" style={{ minWidth: 120 }}>
                          <SuccessRateBar rate={rate} />
                        </td>
                        <td className="text-right py-3 px-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground font-mono">{share}%</span>
                        </td>
                        <td className="text-right py-3 px-3 hidden lg:table-cell">
                          {(() => {
                            const sess = sessionMap.get(user.userId);
                            return sess && sess.totalMinutes > 0
                              ? <span className="text-xs font-mono text-blue-600">{formatDuration(sess.totalMinutes)}</span>
                              : <span className="text-xs text-muted-foreground">—</span>;
                          })()}
                        </td>
                        <td className="text-right py-3 px-3 hidden lg:table-cell">
                          {(() => {
                            const sess = sessionMap.get(user.userId);
                            return sess && sess.activeDays > 0
                              ? <span className="text-xs font-mono text-emerald-600">{sess.activeDays} 天</span>
                              : <span className="text-xs text-muted-foreground">—</span>;
                          })()}
                        </td>
                        <td className="text-right py-3 px-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {user.lastCalledAt
                              ? new Date(user.lastCalledAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
                              : "—"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                      </tr>
                      {isExpanded && actionStats.length > 0 && (
                        <tr key={`${user.userId}-detail`} className="border-b border-border/50">
                          <td colSpan={10} className="p-0">
                            <UserDetailRow userId={user.userId} actionStats={actionStats} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 主页面 ──
export default function AiToolStats() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"tools" | "users">("tools");

  // 汇总数据（两个 Tab 共用）
  const { data: statsData } = trpc.aiTools.getCallStats.useQuery({ days });
  const { data: userStatsData } = trpc.aiTools.getStatsByUser.useQuery({ days });

  const totalCalls = useMemo(() => {
    if (!statsData?.toolStats) return 0;
    return statsData.toolStats.reduce((s, t) => s + Number(t.totalCalls), 0);
  }, [statsData?.toolStats]);

  const totalSuccess = useMemo(() => {
    if (!statsData?.toolStats) return 0;
    return statsData.toolStats.reduce((s, t) => s + Number(t.successCalls), 0);
  }, [statsData?.toolStats]);

  const totalFailed = useMemo(() => {
    if (!statsData?.toolStats) return 0;
    return statsData.toolStats.reduce((s, t) => s + Number(t.failedCalls), 0);
  }, [statsData?.toolStats]);

  const overallSuccessRate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0;
  const activeMembers = userStatsData?.userStats?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* 标题 + 时间范围 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API 调用统计</h1>
          <p className="text-sm text-muted-foreground mt-1">监控各 AI 工具的调用量、成功率和团队使用情况</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {DAY_OPTIONS.map(d => (
            <Button key={d} variant={days === d ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setDays(d)}>
              近 {d} 天
            </Button>
          ))}
        </div>
      </div>

      {/* 汇总指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">总调用次数</p>
                <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">成功率</p>
                <p className="text-2xl font-bold">{overallSuccessRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">失败次数</p>
                <p className="text-2xl font-bold">{totalFailed.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <User className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">活跃成员</p>
                <p className="text-2xl font-bold">{activeMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("tools")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "tools"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />按工具
          </span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "users"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />按成员
          </span>
        </button>
      </div>

      {/* Tab 内容 */}
      {activeTab === "tools" ? (
        <ToolStatsView days={days} />
      ) : (
        <UserStatsView days={days} />
      )}
    </div>
  );
}
