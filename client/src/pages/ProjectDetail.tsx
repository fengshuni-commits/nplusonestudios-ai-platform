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
import { ArrowLeft, Plus, Calendar, Save, X, Trash2,
  Compass, Ruler, FileText, Megaphone,
  Image as ImageIcon, BookMarked, MessageCircle, Camera,
  ExternalLink, Check, Layers, RefreshCw, Copy, ArrowRight, Download, Loader2,
  Presentation, Users, UserPlus, UserMinus, Crown, User, Link2Off,
  Sparkles, ChevronDown, ChevronUp, Pencil, BarChart3, Edit2,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ─── Module labels for generation history ───────────────
const moduleLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  benchmark_report: { label: "案例调研", icon: Compass, color: "bg-blue-100 text-blue-700" },
  benchmark_ppt: { label: "调研PPT", icon: Compass, color: "bg-blue-100 text-blue-700" },
  ai_render: { label: "AI 渲染", icon: ImageIcon, color: "bg-violet-100 text-violet-700" },
  meeting_minutes: { label: "会议纪要", icon: FileText, color: "bg-green-100 text-green-700" },
  media_xiaohongshu: { label: "小红书", icon: BookMarked, color: "bg-red-100 text-red-700" },
  media_wechat: { label: "公众号", icon: MessageCircle, color: "bg-emerald-100 text-emerald-700" },
  media_instagram: { label: "Instagram", icon: Camera, color: "bg-pink-100 text-pink-700" },
};

// ─── Built-in project info fields (only core fields; others are in custom fields)
const builtInFields = [
  { key: "name", label: "项目名称", type: "input" as const, required: true },
  { key: "code", label: "项目编号", type: "input" as const },
];

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("info");

  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const { data: project, isLoading: projectLoading } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: customFields } = trpc.projects.listCustomFields.useQuery({ projectId });
  const { data: generationHistory } = trpc.projects.listGenerationHistory.useQuery({ projectId });

  // Derive clientName from custom fields (migrated from standard field)
  const clientNameFromCustom = customFields?.find((f: any) => f.fieldName === '甲方名称')?.fieldValue;

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
            <Badge variant="outline" className={statusBadgeProps(project.status).className}>{statusBadgeProps(project.status).label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.code && `${project.code} · `}{clientNameFromCustom || project.clientName || "未指定甲方"}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">项目信息</TabsTrigger>
          <TabsTrigger value="documents">项目文档</TabsTrigger>
          <TabsTrigger value="members">项目成员</TabsTrigger>
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

        {/* ═══ Tab: 项目成员 ═══ */}
        <TabsContent value="members" className="mt-4">
          <ProjectMembersTab projectId={projectId} isAdmin={isAdmin} currentUserId={currentUser?.id} />
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
// ProjectInfoTab: Editable project info + custom fields (no AI import buttons)
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
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // New custom field dialog
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [showAiExtract, setShowAiExtract] = useState(false);
  const [freeText, setFreeText] = useState("");

  // Editing custom field
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editFieldName, setEditFieldName] = useState("");
  const [editFieldValue, setEditFieldValue] = useState("");

  const { data: fieldTemplates } = trpc.fieldTemplates.list.useQuery();

  // New tag state
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const createTemplate = trpc.fieldTemplates.create.useMutation({
    onSuccess: (_created, variables) => {
      utils.fieldTemplates.list.invalidate();
      setNewFieldName(variables.name);
      setNewTagName("");
      setShowNewTag(false);
      toast.success(`已添加标签「${variables.name}」`);
    },
    onError: () => toast.error("添加标签失败"),
  });

  const handleAddNewTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const existing = fieldTemplates?.find((t: any) => t.name === trimmed);
    if (existing) {
      setNewFieldName(trimmed);
      setNewTagName("");
      setShowNewTag(false);
      return;
    }
    createTemplate.mutate({ name: trimmed });
  };

  const extractInfo = trpc.projects.extractInfo.useMutation({
    onSuccess: async (result) => {
      if (result.fields.length === 0) {
        toast.info("未能提取到有效信息，请尝试更详细的描述");
        return;
      }
      // Batch create extracted fields
      for (let i = 0; i < result.fields.length; i++) {
        const f = result.fields[i];
        if (f.fieldName.trim() && f.fieldValue.trim()) {
          await utils.client.projects.createCustomField.mutate({
            projectId,
            fieldName: f.fieldName,
            fieldValue: f.fieldValue,
            sortOrder: (customFields?.length || 0) + i,
          });
        }
      }
      utils.projects.listCustomFields.invalidate({ projectId });
      setFreeText("");
      setAddFieldOpen(false);
      toast.success(`已提取并添加 ${result.fields.length} 条信息`);
    },
    onError: () => toast.error("AI 提取失败，请重试"),
  });

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
    // 处理状态字段（使用 _status 临时 key 避免与 builtInFields 冲突）
    if (form._status) {
      payload.status = form._status;
    }
    updateProject.mutate(payload as any);
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
      </div>

      {/* Unified project info card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">项目信息</CardTitle>
            {!editing && (
              <Dialog open={addFieldOpen} onOpenChange={(open) => { setAddFieldOpen(open); if (!open) { setNewFieldName(""); setNewFieldValue(""); setFreeText(""); setShowAiExtract(false); setShowNewTag(false); setNewTagName(""); } }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />添加信息
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>添加项目信息</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    {/* Template category selector + add new tag */}
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">点击选择信息类别，或手动输入自定义名称</p>
                      <div className="flex flex-wrap gap-2">
                        {(fieldTemplates || []).map((t: any) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setNewFieldName(t.name)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                              newFieldName === t.name
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary hover:text-foreground"
                            }`}
                          >
                            {t.name}
                          </button>
                        ))}
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

                    <div className="space-y-2">
                      <Label>信息名称 <span className="text-destructive">*</span></Label>
                      <Input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="选择上方类别或手动输入" />
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

                    {/* AI free text extraction - toggleable */}
                    <div className="border-t pt-3">
                      <button
                        type="button"
                        onClick={() => setShowAiExtract(!showAiExtract)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {showAiExtract ? "收起 AI 批量提取" : "AI 批量提取（输入描述文字，自动识别并添加多个字段）"}
                      </button>
                      {showAiExtract && (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-muted-foreground">输入一段项目描述，AI 将自动提取关键信息并批量添加到项目中</p>
                          <Textarea
                            value={freeText}
                            onChange={(e) => setFreeText(e.target.value)}
                            placeholder="例：这是一个位于上海浦东的科技公司总部，建筑面积约 8000 平方米，甲方是某半导体企业，预算约 2000 万，希望体现科技感和开放协作氛围..."
                            rows={4}
                          />
                          <Button
                            onClick={() => {
                              if (!freeText.trim()) { toast.error("请输入项目描述文字"); return; }
                              extractInfo.mutate({ text: freeText, projectId });
                            }}
                            disabled={extractInfo.isPending}
                            className="w-full"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            {extractInfo.isPending ? "AI 提取中..." : "AI 自动提取并添加"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Project name and code - always shown */}
          <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
            <Label className="text-sm text-muted-foreground pt-2">项目名称 <span className="text-destructive">*</span></Label>
            {editing ? (
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-sm" />
            ) : (
              <p className="text-sm pt-2 font-medium">{project.name}</p>
            )}
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
            <Label className="text-sm text-muted-foreground pt-2">项目编号</Label>
            {editing ? (
              <Input value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} className="text-sm" />
            ) : (
              <p className="text-sm pt-2">{project.code || <span className="text-muted-foreground">-</span>}</p>
            )}
          </div>

          {/* Status */}
          <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
            <Label className="text-sm text-muted-foreground pt-2">项目状态</Label>
            {editing ? (
              <Select value={form._status || project.status} onValueChange={(v) => setForm({ ...form, _status: v })}>
                <SelectTrigger className="w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">待启动</SelectItem>
                  <SelectItem value="design">设计中</SelectItem>
                  <SelectItem value="construction">施工中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm pt-2"><Badge variant="outline" className={statusBadgeProps(project.status).className}>{statusBadgeProps(project.status).label}</Badge></p>
            )}
          </div>

          {/* Custom fields */}
          {customFields && customFields.length > 0 && (
            <>
              {customFields.map((cf: any) => (
                <div key={cf.id} className="grid grid-cols-[120px_1fr_auto] gap-4 items-start group">
                  {editingFieldId === cf.id ? (
                    <>
                      <Input value={editFieldName} onChange={(e) => setEditFieldName(e.target.value)} className="text-sm" />
                      <Textarea value={editFieldValue} onChange={(e) => setEditFieldValue(e.target.value)} rows={2} className="text-sm" />
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
                          <Pencil className="h-3.5 w-3.5" />
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
            </>
          )}

          {/* Empty state */}
          {!editing && (!customFields || customFields.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">暂无项目信息，点击「添加信息」添加</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ProjectDocumentsTab: View AI-generated outputs grouped by TYPE
// - Design outputs (ai_render): thumbnail grid → click to open edit chain dialog
// - Document outputs (benchmark, meeting): list with actions
// - Media outputs (xiaohongshu, wechat, instagram): list with actions
// ═══════════════════════════════════════════════════════════

// Category definitions for grouping modules
const CATEGORY_DESIGN = ["ai_render"];
const CATEGORY_DOCUMENT = ["benchmark_report", "benchmark_ppt", "meeting_minutes"];
const CATEGORY_MEDIA = ["media_xiaohongshu", "media_wechat", "media_instagram"];

function formatDocTime(dateStr: string | Date): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function ProjectDocumentsTab({
  projectId,
  generationHistory,
}: {
  projectId: number;
  generationHistory: any[];
}) {
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const utils = trpc.useUtils();
  const { data: documents } = trpc.documents.listByProject.useQuery({ projectId });

  const deleteHistory = trpc.history.delete.useMutation({
    onSuccess: () => {
      utils.projects.listGenerationHistory.invalidate({ projectId });
      toast.success("成果已删除");
    },
    onError: () => toast.error("删除失败，您可能没有权限删除此条记录"),
  });

  const adminDeleteHistory = trpc.history.adminDelete.useMutation({
    onSuccess: () => {
      utils.projects.listGenerationHistory.invalidate({ projectId });
      toast.success("成果已删除");
    },
    onError: () => toast.error("删除失败"),
  });

  const unlinkProject = trpc.history.updateProject.useMutation({
    onSuccess: () => {
      utils.projects.listGenerationHistory.invalidate({ projectId });
      toast.success("已解除项目关联");
    },
    onError: () => toast.error("操作失败"),
  });

  const handleDelete = (id: number, ownerId: number) => {
    if (isAdmin) {
      adminDeleteHistory.mutate({ id });
    } else if (currentUser?.id === ownerId) {
      deleteHistory.mutate({ id });
    } else {
      toast.error("您只能删除自己创建的成果");
    }
  };

  // Edit chain dialog state
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const chainQuery = trpc.history.getEditChain.useQuery(
    { rootId: selectedRootId! },
    { enabled: !!selectedRootId && detailOpen }
  );

  // Group by category
  const { designItems, documentItems, mediaItems } = useMemo(() => {
    const design: any[] = [];
    const doc: any[] = [];
    const media: any[] = [];
    for (const item of generationHistory) {
      const mod = item.module || "other";
      if (CATEGORY_DESIGN.includes(mod)) design.push(item);
      else if (CATEGORY_DOCUMENT.includes(mod)) doc.push(item);
      else if (CATEGORY_MEDIA.includes(mod)) media.push(item);
      else doc.push(item); // fallback to document
    }
    return { designItems: design, documentItems: doc, mediaItems: media };
  }, [generationHistory]);

  // Group document items by module
  const documentGrouped = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const item of documentItems) {
      const mod = item.module || "other";
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push(item);
    }
    return grouped;
  }, [documentItems]);

  // Group media items by module
  const mediaGrouped = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const item of mediaItems) {
      const mod = item.module || "other";
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push(item);
    }
    return grouped;
  }, [mediaItems]);

  const handleContinueEdit = useCallback((imageUrl: string, historyId: number) => {
    navigate(`/design/tools?ref=${encodeURIComponent(imageUrl)}&historyId=${historyId}`);
  }, [navigate]);

  const handleCopyPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => {
      toast.success("提示词已复制到剪贴板");
    }).catch(() => toast.error("复制失败"));
  }, []);

  if (generationHistory.length === 0 && (!documents || documents.length === 0)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">暂无生成记录</p>
          <p className="text-xs text-muted-foreground mt-1">在 AI 模块中导入此项目信息并生成内容后，记录将显示在这里</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Design Outputs: Thumbnail Grid ─── */}
      {designItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-violet-100 text-violet-700">
              <ImageIcon className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-medium">设计辅助</h3>
            <span className="text-xs text-muted-foreground">{designItems.length} 张</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {designItems.map((item: any) => (
              <div key={item.id} className="group relative aspect-square rounded-lg overflow-hidden bg-muted border border-border/40 hover:border-primary/50 transition-all hover:shadow-md">
                {/* Thumbnail - clickable to open edit chain */}
                <div
                  className="absolute inset-0 cursor-pointer"
                  onClick={() => { setSelectedRootId(item.id); setDetailOpen(true); }}
                >
                  {item.outputUrl ? (
                    <img src={item.outputUrl} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                {/* Hover overlay with creator info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-[11px] text-white/90 line-clamp-1 leading-tight">{item.title}</p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      {item.userName || item.createdByName || "未知"} · {formatDocTime(item.createdAt)}
                    </p>
                  </div>
                </div>
                {/* Action buttons - only visible on hover */}
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {/* Unlink button */}
                  <Button
                    size="icon" variant="secondary"
                    className="h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 text-white border-0"
                    title="解除项目关联"
                    disabled={unlinkProject.isPending}
                    onClick={(e) => { e.stopPropagation(); unlinkProject.mutate({ historyId: item.id, projectId: null }); }}
                  >
                    <Link2Off className="h-3 w-3" />
                  </Button>
                  {/* Delete button */}
                  {(isAdmin || currentUser?.id === item.userId) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="destructive" className="h-6 w-6 rounded-full" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认删除</AlertDialogTitle>
                          <AlertDialogDescription>将删除此条生成记录及其全部编辑历史，不可恢复。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(item.id, item.userId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Document Outputs: Grouped List ─── */}
      {Object.keys(documentGrouped).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-blue-100 text-blue-700">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-medium">项目文档</h3>
            <span className="text-xs text-muted-foreground">{documentItems.length} 份</span>
          </div>
          <div className="space-y-4">
            {Object.entries(documentGrouped).map(([mod, items]) => {
              const info = moduleLabels[mod] || { label: mod, icon: FileText, color: "bg-gray-100 text-gray-700" };
              const Icon = info.icon;
              return (
                <Card key={mod}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded flex items-center justify-center ${info.color}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <CardTitle className="text-sm">{info.label}</CardTitle>
                      <span className="text-xs text-muted-foreground">{items.length} 份</span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-1.5">
                      {items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors group">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <span className="font-medium">{item.userName || item.createdByName || "未知"}</span>
                              {" · "}{formatDocTime(item.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.outputUrl && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(item.outputUrl!, "_blank")} title={mod === "benchmark_ppt" ? "下载" : "查看"}>
                                {mod === "benchmark_ppt" ? <Download className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            {/* Unlink button */}
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                              title="解除项目关联"
                              disabled={unlinkProject.isPending}
                              onClick={() => unlinkProject.mutate({ historyId: item.id, projectId: null })}
                            >
                              <Link2Off className="h-3.5 w-3.5" />
                            </Button>
                            {(isAdmin || currentUser?.id === item.userId) && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>确认删除</AlertDialogTitle>
                                    <AlertDialogDescription>将删除此条生成记录，不可恢复。</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.id, item.userId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Media Outputs: Grouped List ─── */}
      {Object.keys(mediaGrouped).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-pink-100 text-pink-700">
              <Megaphone className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-medium">媒体传播</h3>
            <span className="text-xs text-muted-foreground">{mediaItems.length} 篇</span>
          </div>
          <div className="space-y-4">
            {Object.entries(mediaGrouped).map(([mod, items]) => {
              const info = moduleLabels[mod] || { label: mod, icon: FileText, color: "bg-gray-100 text-gray-700" };
              const Icon = info.icon;
              return (
                <Card key={mod}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded flex items-center justify-center ${info.color}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <CardTitle className="text-sm">{info.label}</CardTitle>
                      <span className="text-xs text-muted-foreground">{items.length} 篇</span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="space-y-1.5">
                      {items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors group">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <span className="font-medium">{item.userName || item.createdByName || "未知"}</span>
                              {" · "}{formatDocTime(item.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.outputUrl && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(item.outputUrl!, "_blank")} title="查看">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Unlink button */}
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                              title="解除项目关联"
                              disabled={unlinkProject.isPending}
                              onClick={() => unlinkProject.mutate({ historyId: item.id, projectId: null })}
                            >
                              <Link2Off className="h-3.5 w-3.5" />
                            </Button>
                            {(isAdmin || currentUser?.id === item.userId) && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>确认删除</AlertDialogTitle>
                                    <AlertDialogDescription>将删除此条生成记录，不可恢复。</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.id, item.userId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Traditional documents ─── */}
      {documents && documents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-gray-100 text-gray-700">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-medium">其他文档</h3>
          </div>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-1.5">
                {documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/50">
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
        </div>
      )}

      {/* ─── Edit Chain Dialog for AI Render ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-violet-600" />
              编辑历史
            </DialogTitle>
          </DialogHeader>

          {chainQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chainQuery.data && chainQuery.data.length > 0 ? (
            <div className="px-6 pb-6">
              <div className="space-y-0">
                {chainQuery.data.map((chainItem: any, idx: number) => {
                  const isFirst = idx === 0;
                  const isLast = idx === chainQuery.data!.length - 1;
                  const inputParams = chainItem.inputParams as any;
                  const promptText = inputParams?.prompt || chainItem.summary || "";

                  return (
                    <div key={chainItem.id} className="relative">
                      {!isLast && (
                        <div className="absolute left-[23px] top-[calc(100%-8px)] w-px h-8 bg-border z-0" />
                      )}
                      <div className={`relative flex gap-4 ${!isFirst ? "pt-4" : ""} ${!isLast ? "pb-4" : ""}`}>
                        <div className="flex flex-col items-center shrink-0 z-10">
                          <div className={`h-[46px] w-[46px] rounded-lg overflow-hidden border-2 ${isLast ? "border-violet-500" : "border-border"}`}>
                            {chainItem.outputUrl ? (
                              <img src={chainItem.outputUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-muted flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isFirst ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                                  {isFirst ? "初始生成" : `第 ${idx + 1} 次编辑`}
                                </span>
                                <span className="text-[11px] text-muted-foreground/60">
                                  {formatDocTime(chainItem.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{promptText}</p>
                              {inputParams?.style && (
                                <span className="inline-block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1">
                                  风格: {inputParams.style}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => handleCopyPrompt(promptText)} title="复制提示词">
                                <Copy className="h-3 w-3" />
                              </Button>
                              {chainItem.outputUrl && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => { setDetailOpen(false); handleContinueEdit(chainItem.outputUrl!, chainItem.id); }} title="使用此图片继续生成">
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {chainItem.outputUrl && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-border/50 bg-muted">
                              <img src={chainItem.outputUrl} alt={chainItem.title} className="w-full h-auto max-h-[300px] object-contain" />
                            </div>
                          )}
                        </div>
                      </div>
                      {!isLast && (
                        <div className="flex items-center justify-center py-1 pl-[23px]">
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40 rotate-90" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">共 {chainQuery.data.length} 次生成</p>
                <Button size="sm" className="h-8" onClick={() => {
                  const lastItem = chainQuery.data![chainQuery.data!.length - 1];
                  if (lastItem?.outputUrl) {
                    setDetailOpen(false);
                    handleContinueEdit(lastItem.outputUrl, lastItem.id);
                  }
                }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />继续编辑最新版本
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">暂无编辑记录</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TaskKanbanTab: Task kanban board
// ═══════════════════════════════════════════════════════════

const statusColumns = [
  { key: "backlog", label: "待排期", color: "bg-gray-100" },
  { key: "todo", label: "待开始", color: "bg-blue-50" },
  { key: "in_progress", label: "进行中", color: "bg-amber-50" },
  { key: "review", label: "待审核", color: "bg-violet-50" },
  { key: "done", label: "已完成", color: "bg-green-50" },
];

function TaskKanbanTab({ projectId }: { projectId: number }) {
  const { currentUser } = useAuth();
  const { data: project } = trpc.projects.getById.useQuery({ id: projectId });
  const isCreator = project?.createdBy === currentUser?.id;
  const canCreateTask = isCreator;
  const canEditTask = (task: any) => isCreator || task.assigneeId === currentUser?.id;
  const canDeleteTask = isCreator;

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [subTaskTitle, setSubTaskTitle] = useState("");
  const [editingSubTaskId, setEditingSubTaskId] = useState<number | null>(null);
  const [editingSubTaskTitle, setEditingSubTaskTitle] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "gantt">("kanban");
  const { data: tasks } = trpc.tasks.listByProject.useQuery({ projectId });
  const { data: members } = trpc.projects.listMembers.useQuery({ projectId });
  const utils = trpc.useUtils();

  const { data: subTasks } = trpc.tasks.listSubTasks.useQuery(
    { parentId: selectedTask?.id ?? 0 },
    { enabled: !!selectedTask?.id }
  );

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      setTaskDialogOpen(false);
      setTaskForm({ title: "", description: "", priority: "medium", category: "design", assigneeId: "", reviewerId: "", startDate: "", dueDate: "" });
      toast.success("任务创建成功");
    },
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.listByProject.invalidate({ projectId });
      if (selectedTask) utils.tasks.listSubTasks.invalidate({ parentId: selectedTask.id });
    },
  });

  const createSubTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      if (selectedTask) utils.tasks.listSubTasks.invalidate({ parentId: selectedTask.id });
      utils.tasks.listByProject.invalidate({ projectId });
      setSubTaskTitle("");
      toast.success("子任务已添加");
    },
  });

  const [taskForm, setTaskForm] = useState({
    title: "", description: "", priority: "medium" as string, category: "design" as string,
    assigneeId: "", reviewerId: "", startDate: "", dueDate: "",
  });

  const memberOptions = (members || []).map((m: any) => ({
    id: m.userId,
    name: m.userName || m.userEmail || "未知用户",
    avatar: m.userAvatar,
  }));

  const topLevelTasks = (tasks || []).filter((t: any) => !t.parentId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{topLevelTasks.length} 个任务</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            <Button
              size="sm"
              variant={viewMode === "kanban" ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode("kanban")}
            >
              看板
            </Button>
            <Button
              size="sm"
              variant={viewMode === "gantt" ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode("gantt")}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1" />甘特图
            </Button>
          </div>
          {canCreateTask && (
          <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />新建任务</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>新建任务</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>任务标题 *</Label>
                <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="任务标题" />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>负责人</Label>
                  <Select value={taskForm.assigneeId} onValueChange={(v) => setTaskForm({ ...taskForm, assigneeId: v })}>
                    <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                    <SelectContent>
                      {memberOptions.map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={m.avatar} />
                              <AvatarFallback className="text-[9px]">{(m.name || "?").charAt(0)}</AvatarFallback>
                            </Avatar>
                            {m.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>审核人</Label>
                  <Select value={taskForm.reviewerId} onValueChange={(v) => setTaskForm({ ...taskForm, reviewerId: v })}>
                    <SelectTrigger><SelectValue placeholder="选择审核人" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不设审核人</SelectItem>
                      {memberOptions.map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={m.avatar} />
                              <AvatarFallback className="text-[9px]">{(m.name || "?").charAt(0)}</AvatarFallback>
                            </Avatar>
                            {m.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>开始日期</Label>
                  <Input type="date" value={taskForm.startDate} onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>截止日期</Label>
                  <Input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
                </div>
              </div>
              <Button onClick={() => {
                if (!taskForm.title.trim()) { toast.error("请输入任务标题"); return; }
                createTask.mutate({
                  projectId,
                  title: taskForm.title,
                  description: taskForm.description || undefined,
                  priority: taskForm.priority as any,
                  category: taskForm.category as any,
                  assigneeId: taskForm.assigneeId ? Number(taskForm.assigneeId) : undefined,
                  reviewerId: (taskForm.reviewerId && taskForm.reviewerId !== "none") ? Number(taskForm.reviewerId) : undefined,
                  startDate: taskForm.startDate || undefined,
                  dueDate: taskForm.dueDate || undefined,
                });
              }} disabled={createTask.isPending} className="w-full">
                {createTask.isPending ? "创建中..." : "创建任务"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
          )}
        </div>
      </div>

      {/* View Mode */}
      {viewMode === "kanban" ? (
      <div>
      {/* Kanban Board */}
      <div className="grid grid-cols-5 gap-3 overflow-x-auto">
        {statusColumns.map((col) => {
          const columnTasks = topLevelTasks.filter((t: any) => t.status === col.key);
          return (
            <div key={col.key} className={`rounded-lg p-3 min-h-[300px] ${col.color}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-foreground/70">{col.label}</span>
                <Badge variant="secondary" className="text-xs h-5">{columnTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {columnTasks.map((task: any) => {
                  const daysLeft = task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000) : null;
                  const isUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;
                  const isOverdue = daysLeft !== null && daysLeft < 0;
                  return (
                    <Card key={task.id}
                      className={`shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
                        isOverdue ? 'border-red-300' : isUrgent ? 'border-amber-300' : ''
                      }`}
                      onClick={() => { setSelectedTask(task); setTaskDetailOpen(true); }}
                    >
                      <CardContent className="p-3">
                        <p className="text-sm font-medium leading-snug">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <PriorityBadge priority={task.priority} />
                          <CategoryBadge category={task.category} />
                        </div>
                        {(task.progress ?? 0) > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                              <span>进度</span><span>{task.progress}%</span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          {task.dueDate && (
                            <p className={`text-[10px] flex items-center gap-0.5 ${
                              isOverdue ? 'text-red-500' : isUrgent ? 'text-amber-600' : 'text-muted-foreground'
                            }`}>
                              <Calendar className="h-2.5 w-2.5" />
                              {isOverdue
                                ? `超期 ${Math.abs(daysLeft!)}d`
                                : isUrgent
                                  ? `还剩 ${daysLeft}d`
                                  : new Date(task.dueDate).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
                              }
                            </p>
                          )}
                          {task.assigneeId && (
                            <Avatar className="h-5 w-5 ml-auto">
                              <AvatarImage src={task.assigneeAvatar} />
                              <AvatarFallback className="text-[8px]">{(task.assigneeName || "?").charAt(0)}</AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      ) : (
      <div>
      {/* Gantt Chart View */}
      <div className="overflow-x-auto border rounded-lg bg-white">
        <div className="min-w-max">
          {/* Timeline Header */}
          <div className="flex border-b bg-muted/50 sticky top-0">
            <div className="w-40 p-2 border-r text-xs font-medium flex-shrink-0 sticky left-0 bg-muted/50">任务名称</div>
            <div className="flex flex-1">
              {Array.from({ length: 30 }).map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - 14 + i);
                const isToday = date.toDateString() === new Date().toDateString();
                return (
                  <div key={i} className={`w-8 h-8 border-r text-[10px] flex items-center justify-center flex-shrink-0 ${isToday ? 'bg-red-100 text-red-700 font-bold' : 'text-muted-foreground'}`}>
                    {date.getDate()}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Tasks */}
          {topLevelTasks.map((task: any) => {
            const startDate = task.startDate ? new Date(task.startDate) : null;
            const dueDate = task.dueDate ? new Date(task.dueDate) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let startOffset = 0;
            let duration = 0;
            
            if (startDate && dueDate) {
              const baseDate = new Date(today);
              baseDate.setDate(baseDate.getDate() - 14);
              baseDate.setHours(0, 0, 0, 0);
              startOffset = Math.max(0, Math.floor((startDate.getTime() - baseDate.getTime()) / 86400000));
              duration = Math.max(1, Math.ceil((dueDate.getTime() - startDate.getTime()) / 86400000));
            }
            
            return (
              <div key={task.id} className="flex border-b hover:bg-muted/30 transition-colors">
                <div className="w-40 p-2 border-r text-xs truncate flex-shrink-0 sticky left-0 bg-white cursor-pointer hover:text-primary" onClick={() => { setSelectedTask(task); setTaskDetailOpen(true); }}>
                  {task.title}
                </div>
                <div className="flex flex-1 relative h-8">
                  {/* Task bar */}
                  {startDate && dueDate && (
                    <div
                      className="absolute top-1 bottom-1 bg-primary/70 rounded text-[9px] text-white flex items-center px-1 overflow-hidden cursor-pointer hover:bg-primary transition-colors"
                      style={{
                        left: `${startOffset * 32}px`,
                        width: `${Math.max(20, duration * 32)}px`,
                      }}
                      onClick={() => { setSelectedTask(task); setTaskDetailOpen(true); }}
                      title={task.title}
                    >
                      <div className="truncate flex-1">{task.title}</div>
                      {(task.progress ?? 0) > 0 && (
                        <div className="absolute inset-0 bg-primary/40 rounded" style={{ width: `${task.progress}%` }} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
      )}

      {/* Task Detail Dialog */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="max-w-lg">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    {selectedTask.isEditingTitle ? (
                      <Input
                        value={selectedTask.title}
                        onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                        onBlur={() => {
                          updateTask.mutate({ id: selectedTask.id, title: selectedTask.title });
                          setSelectedTask({ ...selectedTask, isEditingTitle: false });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            updateTask.mutate({ id: selectedTask.id, title: selectedTask.title });
                            setSelectedTask({ ...selectedTask, isEditingTitle: false });
                          } else if (e.key === "Escape") {
                            setSelectedTask({ ...selectedTask, isEditingTitle: false });
                          }
                        }}
                        autoFocus
                        className="text-base font-medium h-8"
                      />
                    ) : (
                      <DialogTitle className="text-base pr-6 text-left cursor-pointer hover:text-primary" onClick={() => canEditTask(selectedTask) && setSelectedTask({ ...selectedTask, isEditingTitle: true })}>
                        {selectedTask.title}
                      </DialogTitle>
                    )}
                  </div>
                  {canEditTask(selectedTask) && !selectedTask.isEditingTitle && (
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </DialogHeader>
              <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
                {/* Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedTask.status} onValueChange={(v) => {
                    updateTask.mutate({ id: selectedTask.id, status: v as any });
                    setSelectedTask({ ...selectedTask, status: v });
                  }}>
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="backlog">待排期</SelectItem>
                      <SelectItem value="todo">待开始</SelectItem>
                      <SelectItem value="in_progress">进行中</SelectItem>
                      <SelectItem value="review">待审核</SelectItem>
                      <SelectItem value="done">已完成</SelectItem>
                    </SelectContent>
                  </Select>
                  <PriorityBadge priority={selectedTask.priority} />
                  <CategoryBadge category={selectedTask.category} />
                </div>

                {/* Assignee */}
                <div className="space-y-1">
                  <Label className="text-xs">负责人</Label>
                  <Select
                    value={selectedTask.assigneeId ? String(selectedTask.assigneeId) : "none"}
                    onValueChange={(v) => {
                      const newId = v === "none" ? null : Number(v);
                      updateTask.mutate({ id: selectedTask.id, assigneeId: newId });
                      setSelectedTask({ ...selectedTask, assigneeId: newId });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="未分配" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未分配</SelectItem>
                      {memberOptions.map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={m.avatar} />
                              <AvatarFallback className="text-[8px]">{(m.name || "?").charAt(0)}</AvatarFallback>
                            </Avatar>
                            {m.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Reviewer */}
                <div className="space-y-1">
                  <Label className="text-xs">审核人</Label>
                  <Select
                    value={selectedTask.reviewerId ? String(selectedTask.reviewerId) : "none"}
                    onValueChange={(v) => {
                      const newId = v === "none" ? null : Number(v);
                      updateTask.mutate({ id: selectedTask.id, reviewerId: newId });
                      setSelectedTask({ ...selectedTask, reviewerId: newId });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="不设审核人" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不设审核人</SelectItem>
                      {memberOptions.map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={m.avatar} />
                              <AvatarFallback className="text-[8px]">{(m.name || "?").charAt(0)}</AvatarFallback>
                            </Avatar>
                            {m.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">开始日期</Label>
                    <Input type="date" className="h-8 text-xs"
                      value={selectedTask.startDate ? new Date(selectedTask.startDate).toISOString().split('T')[0] : ""}
                      onChange={(e) => {
                        updateTask.mutate({ id: selectedTask.id, startDate: e.target.value || null });
                        setSelectedTask({ ...selectedTask, startDate: e.target.value ? new Date(e.target.value) : null });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">截止日期</Label>
                    <Input type="date" className="h-8 text-xs"
                      value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : ""}
                      onChange={(e) => {
                        updateTask.mutate({ id: selectedTask.id, dueDate: e.target.value || null });
                        setSelectedTask({ ...selectedTask, dueDate: e.target.value ? new Date(e.target.value) : null });
                      }}
                    />
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">完成进度</Label>
                    <span className="text-xs font-medium text-primary">{selectedTask.progress ?? 0}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={selectedTask.progress ?? 0}
                    onChange={(e) => setSelectedTask({ ...selectedTask, progress: Number(e.target.value) })}
                    onMouseUp={(e) => updateTask.mutate({ id: selectedTask.id, progress: Number((e.target as HTMLInputElement).value) })}
                    onTouchEnd={(e) => updateTask.mutate({ id: selectedTask.id, progress: Number((e.target as HTMLInputElement).value) })}
                    className="w-full accent-primary"
                  />
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${selectedTask.progress ?? 0}%` }} />
                  </div>
                </div>

                {/* Sub-tasks */}
                <div className="space-y-2">
                  <Label className="text-xs">子任务 ({subTasks?.length ?? 0})</Label>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {(subTasks || []).map((st: any) => (
                      <div key={st.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                        <button
                          onClick={() => {
                            const newStatus = st.status === "done" ? "todo" : "done";
                            updateTask.mutate({ id: st.id, status: newStatus });
                          }}
                          className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            st.status === "done" ? "bg-primary border-primary" : "border-muted-foreground/40"
                          }`}
                        >
                          {st.status === "done" && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </button>
                        <span className={`text-xs flex-1 cursor-pointer hover:text-primary ${st.status === "done" ? "line-through text-muted-foreground" : ""}`} onClick={() => canEditTask(selectedTask) && setEditingSubTaskId(st.id)}>{st.title}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="h-7 text-xs" placeholder="添加子任务..."
                      value={subTaskTitle}
                      onChange={(e) => setSubTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && subTaskTitle.trim()) {
                          createSubTask.mutate({ projectId, title: subTaskTitle.trim(), parentId: selectedTask.id });
                        }
                      }}
                    />
                    <Button size="sm" className="h-7 px-2" disabled={!subTaskTitle.trim() || createSubTask.isPending}
                      onClick={() => createSubTask.mutate({ projectId, title: subTaskTitle.trim(), parentId: selectedTask.id })}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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

function docTypeLabel(s: string) {
  const m: Record<string, string> = { brief: "任务书", report: "报告", minutes: "会议纪要", specification: "规范", checklist: "检查清单", schedule: "排期", other: "其他" };
  return m[s] || s;
}

// ═══════════════════════════════════════════════════════════
// ProjectMembersTab: Project member management
// ═══════════════════════════════════════════════════════════

function ProjectMembersTab({
  projectId,
  isAdmin,
  currentUserId,
}: {
  projectId: number;
  isAdmin: boolean;
  currentUserId?: number;
}) {
  const utils = trpc.useUtils();
  const [searchOpen, setSearchOpen] = useState(false);

  // Get project members
  const { data: members, isLoading } = trpc.projects.listMembers.useQuery({ projectId });

  // Get all approved users (for admin to add)
  const { data: allUsers } = trpc.admin.listUsers.useQuery(undefined, { enabled: isAdmin });

  const addMember = trpc.projects.addMember.useMutation({
    onSuccess: () => {
      utils.projects.listMembers.invalidate({ projectId });
      toast.success("成员已添加");
      setSearchOpen(false);
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const removeMember = trpc.projects.removeMember.useMutation({
    onSuccess: () => {
      utils.projects.listMembers.invalidate({ projectId });
      toast.success("成员已移除");
    },
    onError: (e) => toast.error(e.message || "移除失败"),
  });

  // Users not yet in project
  const memberIds = new Set((members || []).map((m: any) => m.userId));
  const availableUsers = (allUsers || []).filter((u: any) => !memberIds.has(u.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{members?.length || 0} 位项目成员</span>
        </div>
        {isAdmin && (
          <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-1.5" />添加成员
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加项目成员</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                {availableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    所有已批准的成员都已加入此项目
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {availableUsers.map((user: any) => (
                      <div key={user.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="text-xs">
                  {(user.name || user.email || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                <p className="text-xs text-muted-foreground">{user.role === "admin" ? "管理员" : "成员"}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addMember.mutate({ projectId, userId: user.id })}
                          disabled={addMember.isPending}
                        >
                          添加
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Member list */}
      {!members || members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">暂无项目成员</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">点击"添加成员"为此项目分配团队成员</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {members.map((member: any) => (
            <div key={member.userId} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
              <Avatar className="h-9 w-9">
                <AvatarImage src={member.userAvatar} />
                <AvatarFallback className="text-xs">
                  {(member.userName || member.userEmail || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{member.userName || member.userEmail || "未知用户"}</p>
                  {member.role === "admin" && (
                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <Crown className="h-2.5 w-2.5" />管理员
                    </span>
                  )}
                  {member.userId === currentUserId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">我</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  加入于 {new Date(member.joinedAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
              {isAdmin && member.userId !== currentUserId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>移除项目成员</AlertDialogTitle>
                      <AlertDialogDescription>
                        将 {member.userName || "此成员"} 从项目中移除后，他们将无法访问此项目信息，但其历史生成成果仍然保留。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => removeMember.mutate({ projectId, userId: member.userId })}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        移除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
