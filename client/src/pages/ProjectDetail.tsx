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
import {
  ArrowLeft, Plus, Calendar, Save, X, Trash2,
  Compass, Ruler, FileText, Megaphone, Copy, Check,
  Image as ImageIcon, BookMarked, MessageCircle, Camera,
  ExternalLink,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

// ─── Module labels for generation history ───────────────
const moduleLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  benchmark_report: { label: "对标调研", icon: Compass, color: "bg-blue-100 text-blue-700" },
  benchmark_ppt: { label: "调研PPT", icon: Compass, color: "bg-blue-100 text-blue-700" },
  ai_render: { label: "AI 渲染", icon: ImageIcon, color: "bg-violet-100 text-violet-700" },
  meeting_minutes: { label: "会议纪要", icon: FileText, color: "bg-green-100 text-green-700" },
  media_xiaohongshu: { label: "小红书", icon: BookMarked, color: "bg-red-100 text-red-700" },
  media_wechat: { label: "公众号", icon: MessageCircle, color: "bg-emerald-100 text-emerald-700" },
  media_instagram: { label: "Instagram", icon: Camera, color: "bg-pink-100 text-pink-700" },
};

// ─── Built-in project info fields ───────────────────────
const builtInFields = [
  { key: "name", label: "项目名称", type: "input" as const, required: true },
  { key: "code", label: "项目编号", type: "input" as const },
  { key: "clientName", label: "甲方名称", type: "input" as const },
  { key: "companyProfile", label: "公司概况", type: "textarea" as const },
  { key: "businessGoal", label: "业务目标", type: "textarea" as const },
  { key: "clientProfile", label: "客户情况", type: "textarea" as const },
  { key: "projectOverview", label: "项目概况", type: "textarea" as const },
];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("info");

  const { data: project, isLoading: projectLoading } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: customFields, isLoading: fieldsLoading } = trpc.projects.listCustomFields.useQuery({ projectId });
  const { data: generationHistory } = trpc.projects.listGenerationHistory.useQuery({ projectId });
  const utils = trpc.useUtils();

  if (projectLoading || !project) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
            {project.code && `${project.code} · `}{project.clientName || "未指定甲方"}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">项目信息</TabsTrigger>
          <TabsTrigger value="documents">项目文档</TabsTrigger>
          <TabsTrigger value="tasks">任务看板</TabsTrigger>
        </TabsList>

        {/* ═══ Tab: 项目信息 ═══ */}
        <TabsContent value="info" className="mt-4">
          <ProjectInfoTab
            project={project}
            customFields={customFields || []}
            projectId={projectId}
          />
        </TabsContent>

        {/* ═══ Tab: 项目文档 ═══ */}
        <TabsContent value="documents" className="mt-4">
          <ProjectDocumentsTab
            projectId={projectId}
            generationHistory={generationHistory || []}
          />
        </TabsContent>

        {/* ═══ Tab: 任务看板 ═══ */}
        <TabsContent value="tasks" className="mt-4">
          <TaskKanbanTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ProjectInfoTab: Editable project info + custom fields + AI import
// ═══════════════════════════════════════════════════════════

function ProjectInfoTab({
  project,
  customFields,
  projectId,
}: {
  project: any;
  customFields: any[];
  projectId: number;
}) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // New custom field dialog
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  // Editing custom field
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editFieldName, setEditFieldName] = useState("");
  const [editFieldValue, setEditFieldValue] = useState("");

  // Initialize form from project data
  useEffect(() => {
    if (project) {
      const initial: Record<string, string> = {};
      builtInFields.forEach((f) => {
        initial[f.key] = (project as any)[f.key] || "";
      });
      setForm(initial);
    }
  }, [project]);

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
      setEditing(false);
      toast.success("项目信息已保存");
    },
    onError: () => toast.error("保存失败"),
  });

  const createCustomField = trpc.projects.createCustomField.useMutation({
    onSuccess: () => {
      utils.projects.listCustomFields.invalidate({ projectId });
      setAddFieldOpen(false);
      setNewFieldName("");
      setNewFieldValue("");
      toast.success("信息条已添加");
    },
  });

  const updateCustomField = trpc.projects.updateCustomField.useMutation({
    onSuccess: () => {
      utils.projects.listCustomFields.invalidate({ projectId });
      setEditingFieldId(null);
      toast.success("信息条已更新");
    },
  });

  const deleteCustomField = trpc.projects.deleteCustomField.useMutation({
    onSuccess: () => {
      utils.projects.listCustomFields.invalidate({ projectId });
      toast.success("信息条已删除");
    },
  });

  const handleSave = () => {
    const payload: Record<string, any> = { id: projectId };
    builtInFields.forEach((f) => {
      payload[f.key] = form[f.key] || (f.key === "name" ? project.name : undefined);
    });
    updateProject.mutate(payload as any);
  };

  // Build context text for AI import
  const buildContextText = useCallback(() => {
    const lines: string[] = [];
    builtInFields.forEach((f) => {
      const val = (project as any)[f.key];
      if (val) lines.push(`${f.label}：${val}`);
    });
    customFields.forEach((cf) => {
      if (cf.fieldValue) lines.push(`${cf.fieldName}：${cf.fieldValue}`);
    });
    return lines.join("\n");
  }, [project, customFields]);

  const handleCopyContext = () => {
    const text = buildContextText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("项目信息已复制到剪贴板，可粘贴到任意 AI 模块");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleImportToModule = (path: string) => {
    const text = buildContextText();
    // Store in sessionStorage for the target module to pick up
    sessionStorage.setItem("projectContext", text);
    sessionStorage.setItem("projectContextId", String(projectId));
    sessionStorage.setItem("projectContextName", project.name);
    setLocation(path);
    toast.success(`已导入项目信息到模块，请在目标页面查看`);
  };

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={updateProject.isPending}>
              <Save className="h-4 w-4 mr-1" />{updateProject.isPending ? "保存中..." : "保存"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setEditing(false);
              // Reset form
              const initial: Record<string, string> = {};
              builtInFields.forEach((f) => { initial[f.key] = (project as any)[f.key] || ""; });
              setForm(initial);
            }}>
              <X className="h-4 w-4 mr-1" />取消
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            编辑项目信息
          </Button>
        )}

        <div className="flex-1" />

        {/* AI Import dropdown */}
        <Button size="sm" variant="outline" onClick={handleCopyContext}>
          {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
          {copied ? "已复制" : "复制项目信息"}
        </Button>
      </div>

      {/* Built-in fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {builtInFields.map((field) => (
            <div key={field.key} className="grid grid-cols-[120px_1fr] gap-4 items-start">
              <Label className="text-sm text-muted-foreground pt-2">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              {editing ? (
                field.type === "textarea" ? (
                  <Textarea
                    value={form[field.key] || ""}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                ) : (
                  <Input
                    value={form[field.key] || ""}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className="text-sm"
                  />
                )
              ) : (
                <p className="text-sm pt-2 whitespace-pre-wrap">
                  {(project as any)[field.key] || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>
          ))}

          {/* Status & Phase (always shown, editable) */}
          <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
            <Label className="text-sm text-muted-foreground pt-2">项目状态</Label>
            {editing ? (
              <Select value={form._status || project.status} onValueChange={(v) => setForm({ ...form, _status: v })}>
                <SelectTrigger className="w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">规划中</SelectItem>
                  <SelectItem value="design">设计中</SelectItem>
                  <SelectItem value="construction">施工中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm pt-2"><Badge variant="outline">{statusLabel(project.status)}</Badge></p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Custom fields */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">自定义信息</CardTitle>
            <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />添加信息条
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>添加自定义信息</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>信息名称 <span className="text-destructive">*</span></Label>
                    <Input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="例：项目面积、设计风格、预算范围" />
                  </div>
                  <div className="space-y-2">
                    <Label>信息内容</Label>
                    <Textarea value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)} placeholder="填写具体内容" rows={3} />
                  </div>
                  <Button onClick={() => {
                    if (!newFieldName.trim()) { toast.error("请输入信息名称"); return; }
                    createCustomField.mutate({ projectId, fieldName: newFieldName, fieldValue: newFieldValue || undefined });
                  }} disabled={createCustomField.isPending} className="w-full">
                    {createCustomField.isPending ? "添加中..." : "添加"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {customFields && customFields.length > 0 ? (
            <div className="space-y-3">
              {customFields.map((cf: any) => (
                <div key={cf.id} className="grid grid-cols-[120px_1fr_auto] gap-4 items-start group">
                  {editingFieldId === cf.id ? (
                    <>
                      <Input
                        value={editFieldName}
                        onChange={(e) => setEditFieldName(e.target.value)}
                        className="text-sm"
                      />
                      <Textarea
                        value={editFieldValue}
                        onChange={(e) => setEditFieldValue(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                          updateCustomField.mutate({ id: cf.id, fieldName: editFieldName, fieldValue: editFieldValue });
                        }}>
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingFieldId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground pt-1">{cf.fieldName}</span>
                      <p className="text-sm pt-1 whitespace-pre-wrap">{cf.fieldValue || <span className="text-muted-foreground">-</span>}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                          setEditingFieldId(cf.id);
                          setEditFieldName(cf.fieldName);
                          setEditFieldValue(cf.fieldValue || "");
                        }}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                          if (confirm("确定删除此信息条？")) deleteCustomField.mutate({ id: cf.id });
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">暂无自定义信息，点击上方按钮添加</p>
          )}
        </CardContent>
      </Card>

      {/* AI Module Import Buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">一键导入 AI 模块</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">将项目信息作为背景资料导入到 AI 功能模块</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "项目策划", icon: Compass, path: "/design/planning" },
              { label: "设计工具", icon: Ruler, path: "/design/tools" },
              { label: "会议纪要", icon: FileText, path: "/meeting" },
              { label: "小红书", icon: BookMarked, path: "/media/xiaohongshu" },
              { label: "公众号", icon: MessageCircle, path: "/media/wechat" },
              { label: "Instagram", icon: Camera, path: "/media/instagram" },
            ].map((mod) => (
              <Button
                key={mod.path}
                variant="outline"
                className="h-auto py-3 flex flex-col gap-1.5 items-center"
                onClick={() => handleImportToModule(mod.path)}
              >
                <mod.icon className="h-5 w-5" />
                <span className="text-xs">{mod.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ProjectDocumentsTab: View AI-generated outputs grouped by module
// ═══════════════════════════════════════════════════════════

function ProjectDocumentsTab({
  projectId,
  generationHistory,
}: {
  projectId: number;
  generationHistory: any[];
}) {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const { data: documents } = trpc.documents.listByProject.useQuery({ projectId });

  // Group generation history by module
  const grouped = generationHistory.reduce((acc: Record<string, any[]>, item: any) => {
    const mod = item.module || "other";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(item);
    return acc;
  }, {});

  const moduleKeys = Object.keys(grouped);

  return (
    <div className="space-y-4">
      {/* Module filter buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selectedModule === null ? "default" : "outline"}
          onClick={() => setSelectedModule(null)}
        >
          全部
        </Button>
        {moduleKeys.map((mod) => {
          const info = moduleLabels[mod] || { label: mod, color: "bg-gray-100 text-gray-700" };
          return (
            <Button
              key={mod}
              size="sm"
              variant={selectedModule === mod ? "default" : "outline"}
              onClick={() => setSelectedModule(mod)}
            >
              {info.label} ({grouped[mod].length})
            </Button>
          );
        })}
      </div>

      {/* Generation history items */}
      {generationHistory.length > 0 ? (
        <div className="space-y-2">
          {generationHistory
            .filter((item: any) => !selectedModule || item.module === selectedModule)
            .map((item: any) => {
              const info = moduleLabels[item.module] || { label: item.module, icon: FileText, color: "bg-gray-100 text-gray-700" };
              const Icon = info.icon;
              return (
                <Card key={item.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${info.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(item.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">{info.label}</Badge>
                    {item.outputUrl && (
                      <a href={item.outputUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">暂无生成记录</p>
            <p className="text-xs text-muted-foreground mt-1">在 AI 模块中导入此项目信息并生成内容后，记录将显示在这里</p>
          </CardContent>
        </Card>
      )}

      {/* Traditional documents */}
      {documents && documents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">项目文档</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50">
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">v{doc.version} · {new Date(doc.updatedAt).toLocaleDateString("zh-CN")}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{docTypeLabel(doc.type)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TaskKanbanTab: Task kanban board (preserved from original)
// ═══════════════════════════════════════════════════════════

const statusColumns = [
  { key: "backlog", label: "待排期", color: "bg-gray-100" },
  { key: "todo", label: "待开始", color: "bg-blue-50" },
  { key: "in_progress", label: "进行中", color: "bg-amber-50" },
  { key: "review", label: "待审核", color: "bg-violet-50" },
  { key: "done", label: "已完成", color: "bg-green-50" },
];

function TaskKanbanTab({ projectId }: { projectId: number }) {
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const { data: tasks } = trpc.tasks.listByProject.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      setTaskDialogOpen(false);
      toast.success("任务创建成功");
    },
  });

  const [taskForm, setTaskForm] = useState({
    title: "", description: "", priority: "medium" as string, category: "design" as string,
  });

  return (
    <div>
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
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────

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

function docTypeLabel(s: string) {
  const m: Record<string, string> = { brief: "任务书", report: "报告", minutes: "会议纪要", specification: "规范", checklist: "检查清单", schedule: "排期", other: "其他" };
  return m[s] || s;
}
