import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from "recharts";
import {
  Activity, CheckCircle2, XCircle, Clock, TrendingUp,
  AlertTriangle, BarChart2, Zap
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

// 工具颜色映射
const TOOL_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#ef4444", "#84cc16"
];

export default function AiToolStats() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = trpc.aiTools.getCallStats.useQuery({ days });

  // ── 按工具聚合（合并同一工具的多个 action）──
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

  // ── 按操作类型汇总 ──
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
        map.set(key, {
          action: key,
          totalCalls: Number(row.totalCalls),
          successCalls: Number(row.successCalls),
          failedCalls: Number(row.failedCalls),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [data?.toolStats]);

  // ── 日趋势：聚合所有工具的每日总量 ──
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
        map.set(d, {
          date: d,
          totalCalls: Number(row.totalCalls),
          successCalls: Number(row.successCalls),
          failedCalls: Number(row.failedCalls),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data?.dailyTrend]);

  // ── 汇总卡片数据 ──
  const totalCalls = toolSummary.reduce((s, t) => s + t.totalCalls, 0);
  const totalSuccess = toolSummary.reduce((s, t) => s + t.successCalls, 0);
  const totalFailed = toolSummary.reduce((s, t) => s + t.failedCalls, 0);
  const overallSuccessRate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">API 调用统计</h1>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 标题 + 时间范围切换 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API 调用统计</h1>
          <p className="text-sm text-muted-foreground mt-1">监控各 AI 工具的调用量、成功率和响应时间</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {DAY_OPTIONS.map(d => (
            <Button
              key={d}
              variant={days === d ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setDays(d)}
            >
              近 {d} 天
            </Button>
          ))}
        </div>
      </div>

      {/* ── 汇总指标卡片 ── */}
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
                <Zap className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">活跃工具数</p>
                <p className="text-2xl font-bold">{toolSummary.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 调用趋势折线图 ── */}
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
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => v.slice(5)} // MM-DD
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
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
        {/* ── 按工具调用量柱状图 ── */}
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
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="successCalls" name="成功" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                  <Bar dataKey="failedCalls" name="失败" stackId="a" fill="#ef4444" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── 按操作类型分布 ── */}
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
                  <YAxis
                    type="category"
                    dataKey="action"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={getActionLabel}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                    formatter={(value, name) => [value, name === "totalCalls" ? "总调用" : name]}
                    labelFormatter={getActionLabel}
                  />
                  <Bar dataKey="totalCalls" name="调用次数" radius={[0,3,3,0]}>
                    {actionSummary.map((_, index) => (
                      <Cell key={index} fill={TOOL_COLORS[index % TOOL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 各工具详细统计表 ── */}
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
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: TOOL_COLORS[idx % TOOL_COLORS.length] }}
                            />
                            <span className="font-medium">{tool.toolName}</span>
                            {tool.provider && (
                              <span className="text-xs text-muted-foreground">{tool.provider}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-2.5 px-3 font-mono">{tool.totalCalls}</td>
                        <td className="text-right py-2.5 px-3 font-mono text-green-600">{tool.successCalls}</td>
                        <td className="text-right py-2.5 px-3 font-mono text-destructive">{tool.failedCalls}</td>
                        <td className="text-right py-2.5 px-3">
                          <Badge
                            variant={rate >= 80 ? "default" : rate >= 50 ? "secondary" : "destructive"}
                            className="text-xs font-mono"
                          >
                            {rate}%
                          </Badge>
                        </td>
                        <td className="text-right py-2.5 px-3 text-muted-foreground font-mono text-xs">
                          {avgSec ? `${avgSec}s` : "—"}
                        </td>
                        <td className="py-2.5 pl-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(tool.actions).map(([action, count]) => (
                              <Badge key={action} variant="outline" className="text-[10px] h-4 px-1.5">
                                {getActionLabel(action)} ×{count}
                              </Badge>
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

      {/* ── 最近失败记录 ── */}
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
                      <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                        {getActionLabel(f.action)}
                      </Badge>
                      <span className="text-xs font-medium">{getToolDisplayName(f.toolId, f.toolName)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(f.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {f.inputSummary && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      输入：{f.inputSummary}
                    </p>
                  )}
                  {f.errorMessage && (
                    <p className="text-xs text-destructive/80 font-mono line-clamp-2 bg-destructive/10 rounded px-2 py-1">
                      {f.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
