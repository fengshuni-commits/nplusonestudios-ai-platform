import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, GripVertical, Calendar, User } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const statusColumns = [
  { key: "backlog", label: "待排期", color: "bg-gray-100" },
  { key: "todo", label: "待开始", color: "bg-blue-50" },
  { key: "in_progress", label: "进行中", color: "bg-amber-50" },
  { key: "review", label: "待审核", color: "bg-violet-50" },
  { key: "done", label: "已完成", color: "bg-green-50" },
];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const { data: project } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: tasks } = trpc.tasks.listByProject.useQuery({ projectId });
  const { data: documents } = trpc.documents.listByProject.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      setTaskDialogOpen(false);
      toast.success("任务创建成功");
    },
  });

  const updateTaskStatus = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => utils.tasks.listByProject.invalidate({ projectId }),
  });

  const [taskForm, setTaskForm] = useState({
    title: "", description: "", priority: "medium" as string, category: "design" as string,
  });

  if (!project) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <Badge variant="outline">{statusLabel(project.status)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.code && `${project.code} · `}{project.clientName || "未指定客户"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">任务看板</TabsTrigger>
          <TabsTrigger value="documents">项目文档</TabsTrigger>
          <TabsTrigger value="info">项目信息</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{tasks?.length || 0} 个任务</p>
            <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />新建任务</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>新建任务</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>任务标题 *</Label>
                    <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="任务标题" />
                  </div>
                  <div className="space-y-2">
                    <Label>描述</Label>
                    <Textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>优先级</Label>
                      <Select value={taskForm.priority} onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">低</SelectItem>
                          <SelectItem value="medium">中</SelectItem>
                          <SelectItem value="high">高</SelectItem>
                          <SelectItem value="urgent">紧急</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>类别</Label>
                      <Select value={taskForm.category} onValueChange={(v) => setTaskForm({ ...taskForm, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="design">设计</SelectItem>
                          <SelectItem value="construction">营建</SelectItem>
                          <SelectItem value="management">管理</SelectItem>
                          <SelectItem value="other">其他</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={() => {
                    if (!taskForm.title.trim()) { toast.error("请输入任务标题"); return; }
                    createTask.mutate({ ...taskForm, projectId, priority: taskForm.priority as any, category: taskForm.category as any });
                  }} disabled={createTask.isPending} className="w-full">
                    {createTask.isPending ? "创建中..." : "创建任务"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-5 gap-3 overflow-x-auto">
            {statusColumns.map((col) => {
              const columnTasks = (tasks || []).filter((t: any) => t.status === col.key);
              return (
                <div key={col.key} className={`rounded-lg p-3 min-h-[300px] ${col.color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-foreground/70">{col.label}</span>
                    <Badge variant="secondary" className="text-xs h-5">{columnTasks.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {columnTasks.map((task: any) => (
                      <Card key={task.id} className="shadow-sm">
                        <CardContent className="p-3">
                          <p className="text-sm font-medium">{task.title}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <PriorityBadge priority={task.priority} />
                            <CategoryBadge category={task.category} />
                          </div>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(task.dueDate).toLocaleDateString("zh-CN")}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {documents && documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50">
                      <div>
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">v{doc.version} · {new Date(doc.updatedAt).toLocaleDateString("zh-CN")}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{docTypeLabel(doc.type)}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">暂无文档</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <InfoRow label="项目名称" value={project.name} />
              <InfoRow label="项目编号" value={project.code || "-"} />
              <InfoRow label="客户" value={project.clientName || "-"} />
              <InfoRow label="状态" value={statusLabel(project.status)} />
              <InfoRow label="阶段" value={phaseLabel(project.phase)} />
              <InfoRow label="描述" value={project.description || "-"} />
              <InfoRow label="创建时间" value={new Date(project.createdAt).toLocaleDateString("zh-CN")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; class: string }> = {
    urgent: { label: "紧急", class: "bg-red-100 text-red-700" },
    high: { label: "高", class: "bg-orange-100 text-orange-700" },
    medium: { label: "中", class: "bg-blue-100 text-blue-700" },
    low: { label: "低", class: "bg-gray-100 text-gray-600" },
  };
  const p = map[priority] || map.medium;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.class}`}>{p.label}</span>;
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, string> = { design: "设计", construction: "营建", management: "管理", other: "其他" };
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{map[category] || category}</span>;
}

function statusLabel(s: string) {
  const m: Record<string, string> = { planning: "规划中", design: "设计中", construction: "施工中", completed: "已完成", archived: "已归档" };
  return m[s] || s;
}

function phaseLabel(s: string) {
  const m: Record<string, string> = { concept: "概念", schematic: "方案", development: "深化", documentation: "施工图", bidding: "招标", construction: "施工", closeout: "竣工" };
  return m[s] || s;
}

function docTypeLabel(s: string) {
  const m: Record<string, string> = { brief: "任务书", report: "报告", minutes: "会议纪要", specification: "规范", checklist: "检查清单", schedule: "排期", other: "其他" };
  return m[s] || s;
}
