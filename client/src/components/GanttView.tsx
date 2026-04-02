import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

interface GanttProject {
  id: number;
  name: string;
  code: string | null;
  status: string;
  startDate: number | null;
  endDate: number | null;
  taskCount: number;
}

interface GanttViewProps {
  data: GanttProject[];
  isLoading: boolean;
  onProjectClick: (id: number) => void;
}

export default function GanttView({ data, isLoading, onProjectClick }: GanttViewProps) {
  // 计算时间范围
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const validProjects = data.filter(p => p.startDate && p.endDate);
    if (validProjects.length === 0) {
      const now = Date.now();
      return { minDate: now, maxDate: now + 30 * 24 * 60 * 60 * 1000, totalDays: 30 };
    }
    const min = Math.min(...validProjects.map(p => p.startDate!));
    const max = Math.max(...validProjects.map(p => p.endDate!));
    const days = Math.ceil((max - min) / (24 * 60 * 60 * 1000)) + 1;
    return { minDate: min, maxDate: max, totalDays: days };
  }, [data]);

  // 生成月份标记
  const months = useMemo(() => {
    const result: { label: string; width: number }[] = [];
    let currentDate = new Date(minDate);
    currentDate.setDate(1); // 月初
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate.getTime() <= maxDate) {
      const monthStart = currentDate.getTime();
      const nextMonth = new Date(currentDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthEnd = Math.min(nextMonth.getTime(), maxDate);
      const monthDays = (monthEnd - monthStart) / (24 * 60 * 60 * 1000);
      const widthPercent = (monthDays / totalDays) * 100;
      result.push({
        label: `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`,
        width: widthPercent,
      });
      currentDate = nextMonth;
    }
    return result;
  }, [minDate, maxDate, totalDays]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-64 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">暂无项目</p>
        </CardContent>
      </Card>
    );
  }

  const projectsWithoutDates = data.filter(p => !p.startDate || !p.endDate);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          {/* 时间轴标题 */}
          <div className="flex border-b pb-2 mb-4">
            <div className="w-48 font-medium text-sm">项目名称</div>
            <div className="flex-1 flex">
              {months.map((month, i) => (
                <div key={i} style={{ width: `${month.width}%` }} className="text-xs text-muted-foreground text-center border-l px-1">
                  {month.label}
                </div>
              ))}
            </div>
          </div>

          {/* 项目行 */}
          <div className="space-y-2">
            {data.filter(p => p.startDate && p.endDate).map((project) => {
              const start = project.startDate!;
              const end = project.endDate!;
              const leftPercent = ((start - minDate) / (maxDate - minDate)) * 100;
              const widthPercent = ((end - start) / (maxDate - minDate)) * 100;

              return (
                <div
                  key={project.id}
                  className="flex items-center group cursor-pointer hover:bg-muted/30 rounded-md p-2 -mx-2 transition-colors"
                  onClick={() => onProjectClick(project.id)}
                >
                  <div className="w-48 pr-4">
                    <div className="font-medium text-sm group-hover:text-primary transition-colors truncate">{project.name}</div>
                    {project.code && <div className="text-xs text-muted-foreground">{project.code}</div>}
                  </div>
                  <div className="flex-1 relative h-8">
                    <div
                      className={`absolute h-full rounded flex items-center px-2 text-xs font-medium ${statusBarColor(project.status)}`}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                    >
                      <span className="truncate">{project.taskCount} 个任务</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 无时间范围的项目 */}
      {projectsWithoutDates.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium mb-3 text-muted-foreground">未设置任务时间的项目</div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projectsWithoutDates.map((project) => (
                <div
                  key={project.id}
                  className="border rounded-md p-3 cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors"
                  onClick={() => onProjectClick(project.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-sm truncate">{project.name}</div>
                    <Badge variant="outline" className={`text-xs ${statusBadgeClassName(project.status)}`}>
                      {statusLabel(project.status)}
                    </Badge>
                  </div>
                  {project.code && <div className="text-xs text-muted-foreground">{project.code}</div>}
                  <div className="text-xs text-muted-foreground mt-2">{project.taskCount} 个任务</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function statusBarColor(status: string): string {
  const colors: Record<string, string> = {
    planning: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    design: "bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    construction: "bg-orange-200 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    completed: "bg-green-200 text-green-700 dark:bg-green-900 dark:text-green-300",
    archived: "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return colors[status] ?? "bg-muted text-muted-foreground";
}

function statusBadgeClassName(status: string): string {
  const configs: Record<string, string> = {
    planning: "border-slate-300 text-slate-500 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-400",
    design: "border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400",
    construction: "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400",
    completed: "border-green-400 text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400",
    archived: "border-gray-300 text-gray-400 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-500",
  };
  return configs[status] ?? "";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    planning: "待启动",
    design: "设计中",
    construction: "施工中",
    completed: "已完成",
    archived: "已归档",
  };
  return labels[status] ?? status;
}
