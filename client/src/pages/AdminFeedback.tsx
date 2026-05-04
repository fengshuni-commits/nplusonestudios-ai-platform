import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ThumbsUp, ThumbsDown, TrendingUp, MessageSquare, BarChart3, Filter } from "lucide-react";
import { useState, useMemo } from "react";

const MODULE_LABELS: Record<string, string> = {
  benchmark_report: "案例调研报告",
  benchmark_ppt: "调研 PPT",
  ai_render: "AI 效果图",
  meeting_minutes: "会议纪要",
  media_xiaohongshu: "小红书内容",
  media_wechat: "公众号内容",
  media_instagram: "Instagram 内容",
  color_plan: "AI 彩平图",
  layout_design: "图文排版",
  presentation: "演示文稿",
  video_generation: "视频生成",
};

function getModuleLabel(module: string) {
  return MODULE_LABELS[module] || module;
}

export default function AdminFeedback() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [trendDays, setTrendDays] = useState(30);

  const filterParam = moduleFilter === "all" ? undefined : moduleFilter;

  const { data: stats, isLoading: statsLoading } = trpc.feedback.stats.useQuery(
    filterParam ? { module: filterParam } : undefined
  );
  const { data: trend, isLoading: trendLoading } = trpc.feedback.trend.useQuery({
    days: trendDays,
    module: filterParam,
  });
  const { data: recentFeedback, isLoading: recentLoading } = trpc.feedback.recent.useQuery({
    limit: 30,
    module: filterParam,
  });

  // Calculate max for bar chart scaling
  const maxModuleTotal = useMemo(() => {
    if (!stats?.modules) return 1;
    return Math.max(...stats.modules.map(m => m.total), 1);
  }, [stats]);

  // Calculate max for trend chart
  const maxTrendValue = useMemo(() => {
    if (!trend) return 1;
    return Math.max(...trend.map(d => d.satisfied + d.unsatisfied), 1);
  }, [trend]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm mt-1">
            各功能模块的用户满意度数据汇总与趋势分析
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="全部模块" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模块</SelectItem>
                {Object.entries(MODULE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total.total || 0}</p>
                <p className="text-xs text-muted-foreground">总反馈数</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <ThumbsUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total.satisfied || 0}</p>
                <p className="text-xs text-muted-foreground">满意</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <ThumbsDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total.unsatisfied || 0}</p>
                <p className="text-xs text-muted-foreground">不满意</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total.satisfactionRate || 0}%</p>
                <p className="text-xs text-muted-foreground">满意率</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module Breakdown Chart */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">各模块满意度</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                    <div className="h-6 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : stats?.modules && stats.modules.length > 0 ? (
              <div className="space-y-5">
                {stats.modules.map((m) => (
                  <div key={m.module} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{getModuleLabel(m.module)}</span>
                      <span className="text-muted-foreground">
                        {m.satisfactionRate}% 满意 · {m.total} 条
                      </span>
                    </div>
                    <div className="flex h-7 rounded-md overflow-hidden bg-muted/50">
                      <div
                        className="bg-green-500/80 transition-all duration-500 flex items-center justify-center"
                        style={{ width: `${(m.satisfied / maxModuleTotal) * 100}%` }}
                      >
                        {m.satisfied > 0 && (
                          <span className="text-[10px] text-white font-medium px-1">{m.satisfied}</span>
                        )}
                      </div>
                      <div
                        className="bg-red-400/80 transition-all duration-500 flex items-center justify-center"
                        style={{ width: `${(m.unsatisfied / maxModuleTotal) * 100}%` }}
                      >
                        {m.unsatisfied > 0 && (
                          <span className="text-[10px] text-white font-medium px-1">{m.unsatisfied}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">暂无反馈数据</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card>
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">反馈趋势</CardTitle>
            <Select value={String(trendDays)} onValueChange={(v) => setTrendDays(Number(v))}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">近 7 天</SelectItem>
                <SelectItem value="30">近 30 天</SelectItem>
                <SelectItem value="90">近 90 天</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : trend && trend.length > 0 ? (
              <div className="space-y-2">
                {/* Simple bar chart */}
                <div className="flex items-end gap-1 h-40">
                  {trend.map((d, i) => {
                    const total = d.satisfied + d.unsatisfied;
                    const satisfiedH = (d.satisfied / maxTrendValue) * 100;
                    const unsatisfiedH = (d.unsatisfied / maxTrendValue) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center justify-end gap-0 group relative"
                        title={`${d.date}: 满意 ${d.satisfied}, 不满意 ${d.unsatisfied}`}
                      >
                        <div className="w-full flex flex-col items-stretch">
                          {d.unsatisfied > 0 && (
                            <div
                              className="bg-red-400/70 rounded-t-sm transition-all"
                              style={{ height: `${unsatisfiedH}%`, minHeight: d.unsatisfied > 0 ? 2 : 0 }}
                            />
                          )}
                          {d.satisfied > 0 && (
                            <div
                              className={`bg-green-500/70 transition-all ${d.unsatisfied === 0 ? "rounded-t-sm" : ""}`}
                              style={{ height: `${satisfiedH}%`, minHeight: d.satisfied > 0 ? 2 : 0 }}
                            />
                          )}
                        </div>
                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                          {d.date.slice(5)}: {total}条
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* X-axis labels */}
                <div className="flex gap-1">
                  {trend.map((d, i) => (
                    <div key={i} className="flex-1 text-center">
                      {(i === 0 || i === trend.length - 1 || i % Math.ceil(trend.length / 6) === 0) && (
                        <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
                      )}
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-4 pt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-green-500/70" />
                    <span className="text-xs text-muted-foreground">满意</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-red-400/70" />
                    <span className="text-xs text-muted-foreground">不满意</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <TrendingUp className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">暂无趋势数据</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Feedback List */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">最近反馈</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : recentFeedback && recentFeedback.length > 0 ? (
            <div className="space-y-2">
              {recentFeedback.map((fb) => (
                <div
                  key={fb.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    fb.rating === "satisfied"
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-red-100 dark:bg-red-900/30"
                  }`}>
                    {fb.rating === "satisfied" ? (
                      <ThumbsUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <ThumbsDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{fb.userName || "用户"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {getModuleLabel(fb.module)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(fb.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </div>
                    {fb.comment && (
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-muted-foreground">{fb.comment}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">暂无反馈记录</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
