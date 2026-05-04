import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, FolderKanban, Calendar, Users, Trash2, Sparkles, Check, X, ChevronDown, ChevronUp, LayoutGrid, GanttChart, Filter } from "lucide-react";
import GanttView from "@/components/GanttView";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface FieldEntry {
  fieldName: string;
  fieldValue: string;
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "gantt">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: projects, isLoading } = trpc.projects.list.useQuery({ search, status: statusFilters.length > 0 ? statusFilters : undefined });
  const { data: ganttData, isLoading: ganttLoading } = trpc.projects.ganttData.useQuery({ search, status: statusFilters.length > 0 ? statusFilters : undefined });

  const STATUS_OPTIONS = [
    { value: "planning",     label: "待启动" },
    { value: "design",       label: "设计中" },
    { value: "construction", label: "施工中" },
    { value: "paused",       label: "已暂停" },
    { value: "completed",    label: "已完成" },
    { value: "archived",     label: "已归档" },
  ];

  const toggleStatusFilter = (value: string) => {
    setStatusFilters(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };
  const { data: fieldTemplates } = trpc.fieldTemplates.list.useQuery();
  const utils = trpc.useUtils();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [fields, setFields] = useState<FieldEntry[]>([]);
  const [freeText, setFreeText] = useState("");
  const [showFreeText, setShowFreeText] = useState(false);

  // New tag state
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const createTemplate = trpc.fieldTemplates.create.useMutation({
    onSuccess: (_created, variables) => {
      utils.fieldTemplates.list.invalidate();
      // Auto-select the new tag using the input name
      setFields(prev => [...prev, { fieldName: variables.name, fieldValue: "" }]);
      setNewTagName("");
      setShowNewTag(false);
      toast.success(`已添加标签「${variables.name}」`);
    },
    onError: () => toast.error("添加标签失败"),
  });

  const handleAddNewTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    // Check if already exists in templates
    const existing = fieldTemplates?.find((t: any) => t.name === trimmed);
    if (existing) {
      // Just select it
      if (!selectedTemplateNames.has(trimmed)) {
        setFields(prev => [...prev, { fieldName: trimmed, fieldValue: "" }]);
      }
      setNewTagName("");
      setShowNewTag(false);
      return;
    }
    createTemplate.mutate({ name: trimmed });
  };

  // AI extraction state
  const extractInfo = trpc.projects.extractInfo.useMutation({
    onSuccess: (result) => {
      if (result.fields.length === 0) {
        toast.info("未能从文字中提取到有效信息，请尝试更详细的描述");
        return;
      }
      // Merge extracted fields into existing fields (avoid duplicates by fieldName)
      const existing = new Map(fields.map(f => [f.fieldName, f]));
      for (const f of result.fields) {
        if (f.fieldValue.trim()) existing.set(f.fieldName, f);
      }
      setFields(Array.from(existing.values()));
      setFreeText("");
      setShowFreeText(false);
      toast.success(`已提取 ${result.fields.length} 条信息`);
    },
    onError: () => toast.error("AI 提取失败，请重试"),
  });

  const createProject = trpc.projects.create.useMutation({
    onSuccess: async (result) => {
      // After creating project, save custom fields
      if (result?.id && fields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          if (f.fieldName.trim() && f.fieldValue.trim()) {
            await utils.client.projects.createCustomField.mutate({
              projectId: result.id,
              fieldName: f.fieldName,
              fieldValue: f.fieldValue,
              sortOrder: i,
            });
          }
        }
      }
      utils.projects.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("项目创建成功");
      if (result?.id) {
        setLocation(`/projects/${result.id}`);
      }
    },
    onError: () => toast.error("创建失败，请重试"),
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDeleteTarget(null);
      toast.success("项目已删除");
    },
    onError: () => toast.error("删除失败，请重试"),
  });

  const resetForm = () => {
    setName("");
    setCode("");
    setFields([]);
    setFreeText("");
    setShowFreeText(false);
    setShowNewTag(false);
    setNewTagName("");
  };

  const handleCreate = () => {
    if (!name.trim()) { toast.error("请输入项目名称"); return; }
    createProject.mutate({ name: name.trim(), code: code.trim() || undefined });
  };

  const toggleTemplate = (templateName: string) => {
    const exists = fields.find(f => f.fieldName === templateName);
    if (exists) {
      setFields(fields.filter(f => f.fieldName !== templateName));
    } else {
      setFields([...fields, { fieldName: templateName, fieldValue: "" }]);
    }
  };

  const updateFieldValue = (fieldName: string, value: string) => {
    setFields(fields.map(f => f.fieldName === fieldName ? { ...f, fieldValue: value } : f));
  };

  const removeField = (fieldName: string) => {
    setFields(fields.filter(f => f.fieldName !== fieldName));
  };

  const handleExtract = () => {
    if (!freeText.trim()) { toast.error("请输入项目描述文字"); return; }
    extractInfo.mutate({ text: freeText });
  };

  const selectedTemplateNames = new Set(fields.map(f => f.fieldName));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />新建项目</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
            <div className="space-y-5 pt-2">
              {/* Required fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>项目名称 <span className="text-destructive">*</span></Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：某科技园区总部办公楼" />
                </div>
                <div className="space-y-2">
                  <Label>项目编号</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例：NP-2026-001" />
                </div>
              </div>

              {/* Optional info section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">补充项目信息（可选）</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowFreeText(!showFreeText)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {showFreeText ? "收起 AI 提取" : "AI 提取"}
                  </Button>
                </div>

                {/* Template category selector - always visible */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">选择需要填写的信息类别：</p>
                  <div className="flex flex-wrap gap-2">
                    {(fieldTemplates || []).map((t: any) => {
                      const selected = selectedTemplateNames.has(t.name);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTemplate(t.name)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary hover:text-foreground"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                          {t.name}
                        </button>
                      );
                    })}
                    {/* Add new tag button */}
                    {showNewTag ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={newTagInputRef}
                          autoFocus
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); handleAddNewTag(); }
                            if (e.key === "Escape") { setShowNewTag(false); setNewTagName(""); }
                          }}
                          placeholder="标签名称"
                          className="h-6 px-2 text-xs border rounded-full bg-background outline-none focus:ring-1 focus:ring-primary w-24"
                        />
                        <button
                          type="button"
                          onClick={handleAddNewTag}
                          disabled={createTemplate.isPending}
                          className="px-2 py-1 rounded-full text-xs bg-primary text-primary-foreground border border-primary"
                        >
                          确定
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowNewTag(false); setNewTagName(""); }}
                          className="px-1.5 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground border border-border"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setShowNewTag(true); setTimeout(() => newTagInputRef.current?.focus(), 50); }}
                        className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" />新标签
                      </button>
                    )}
                  </div>
                </div>

                {/* AI free text input - toggleable */}
                {showFreeText && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">输入一段项目描述，AI 将自动提取关键信息并分类（与上方标签选择结果合并）</p>
                    <Textarea
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      placeholder="例：这是一个位于上海浦东的科技公司总部，建筑面积约 8000 平方米，甲方是某半导体企业，预算约 2000 万，希望体现科技感和开放协作氛围..."
                      rows={4}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleExtract}
                      disabled={extractInfo.isPending}
                      className="w-full"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      {extractInfo.isPending ? "AI 提取中..." : "AI 自动提取"}
                    </Button>
                  </div>
                )}

                {/* Selected fields input area */}
                {fields.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {fields.map((f) => (
                      <div key={f.fieldName} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{f.fieldName}</Label>
                          <button
                            type="button"
                            onClick={() => removeField(f.fieldName)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Textarea
                          value={f.fieldValue}
                          onChange={(e) => updateFieldValue(f.fieldName, e.target.value)}
                          placeholder={`填写${f.fieldName}...`}
                          rows={2}
                          className="resize-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleCreate} disabled={createProject.isPending} className="w-full">
                {createProject.isPending ? "创建中..." : "创建项目"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索项目..." className="pl-9" />
        </div>
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 min-w-[90px]">
              <Filter className="h-3.5 w-3.5" />
              {statusFilters.length === 0 ? "全部状态" : `已选 ${statusFilters.length} 项`}
              {statusFilters.length > 0 && (
                <span
                  className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setStatusFilters([]); }}
                >
                  ×
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="start">
            <p className="text-xs text-muted-foreground px-2 pb-1.5">筛选状态（可多选）</p>
            {STATUS_OPTIONS.map(opt => (
              <div
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                onClick={() => toggleStatusFilter(opt.value)}
              >
                <Checkbox
                  checked={statusFilters.includes(opt.value)}
                  onCheckedChange={() => toggleStatusFilter(opt.value)}
                  className="pointer-events-none"
                />
                <span className="text-sm">{opt.label}</span>
              </div>
            ))}
            {statusFilters.length > 0 && (
              <div className="border-t mt-1 pt-1">
                <button
                  className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1 text-left"
                  onClick={() => setStatusFilters([])}
                >
                  清除筛选
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex border rounded-md overflow-hidden">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            className="rounded-none h-9 px-3"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "gantt" ? "default" : "ghost"}
            size="sm"
            className="rounded-none h-9 px-3"
            onClick={() => setViewMode("gantt")}
          >
            <GanttChart className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-20 bg-muted rounded" /></CardContent></Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {projects.map((project: any) => (
              <Card
                key={project.id}
                className="hover:shadow-md transition-shadow cursor-pointer group relative"
                onClick={() => setLocation(`/projects/${project.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderKanban className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${statusBadgeProps(project.status).className}`}>{statusBadgeProps(project.status).label}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: project.id, name: project.name });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="font-medium text-sm group-hover:text-primary transition-colors">{project.name}</h3>
                  {project.code && <p className="text-xs text-muted-foreground mt-0.5">{project.code}</p>}
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{(project as any).summaryDisplay || "暂无描述"}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    {(project as any).clientNameDisplay && (
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{(project as any).clientNameDisplay}</span>
                    )}
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(project.createdAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderKanban className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">暂无项目</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />创建第一个项目
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        /* 甘特图视图 */
        <GanttView
          data={ganttData ?? []}
          isLoading={ganttLoading}
          onProjectClick={(id: number) => setLocation(`/projects/${id}`)}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除项目「{deleteTarget?.name}」吗？删除后该项目的所有任务、文档和自定义信息将一并移除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteProject.mutate({ id: deleteTarget.id })}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function statusBadgeProps(status: string): { label: string; className: string } {
  const configs: Record<string, { label: string; className: string }> = {
    planning:     { label: "待启动",   className: "border-slate-300 text-slate-500 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-400" },
    design:       { label: "设计中",   className: "border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
    construction: { label: "施工中",   className: "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" },
    paused:       { label: "已暂停",   className: "border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400" },
    completed:    { label: "已完成",   className: "border-green-400 text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400" },
    archived:     { label: "已归档",   className: "border-gray-300 text-gray-400 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-500" },
  };
  return configs[status] ?? { label: status, className: "" };
}
