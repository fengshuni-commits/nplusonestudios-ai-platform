import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, GripVertical, ImagePlus, X, Loader2, Eye, EyeOff, Palette
} from "lucide-react";

type RenderStyle = {
  id: number;
  label: string;
  promptHint: string;
  referenceImageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type StyleFormData = {
  label: string;
  promptHint: string;
  referenceImageUrl: string | null;
  isActive: boolean;
};

const emptyForm: StyleFormData = {
  label: "",
  promptHint: "",
  referenceImageUrl: null,
  isActive: true,
};

export default function Standards() {
  const utils = trpc.useUtils();

  const { data: styles = [], isLoading } = trpc.renderStyles.list.useQuery({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StyleFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const createMutation = trpc.renderStyles.create.useMutation({
    onSuccess: () => { utils.renderStyles.list.invalidate(); closeDialog(); toast.success("风格已创建"); },
    onError: (e) => toast.error("创建失败: " + e.message),
  });
  const updateMutation = trpc.renderStyles.update.useMutation({
    onSuccess: () => { utils.renderStyles.list.invalidate(); closeDialog(); toast.success("风格已更新"); },
    onError: (e) => toast.error("更新失败: " + e.message),
  });
  const deleteMutation = trpc.renderStyles.delete.useMutation({
    onSuccess: () => { utils.renderStyles.list.invalidate(); setDeleteConfirmId(null); toast.success("风格已删除"); },
    onError: (e) => toast.error("删除失败: " + e.message),
  });
  const reorderMutation = trpc.renderStyles.reorder.useMutation({
    onSuccess: () => utils.renderStyles.list.invalidate(),
  });
  const uploadRefImageMutation = trpc.renderStyles.uploadRefImage.useMutation({
    onSuccess: (data) => {
      setForm(f => ({ ...f, referenceImageUrl: data.url }));
      setPendingImageFile(null);
      setUploadingImage(false);
      toast.success("参考图已上传");
    },
    onError: (e) => { setUploadingImage(false); toast.error("上传失败: " + e.message); },
  });

  function openCreate() {
    setEditingId(null); setForm(emptyForm); setPendingImageFile(null); setPendingImagePreview(null); setDialogOpen(true);
  }
  function openEdit(style: RenderStyle) {
    setEditingId(style.id);
    setForm({ label: style.label, promptHint: style.promptHint, referenceImageUrl: style.referenceImageUrl, isActive: style.isActive });
    setPendingImageFile(null); setPendingImagePreview(null); setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false); setEditingId(null); setForm(emptyForm); setPendingImageFile(null); setPendingImagePreview(null);
  }
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!form.label.trim() || !form.promptHint.trim()) {
      toast.error("请填写风格名称和提示词"); return;
    }
    if (editingId !== null) {
      if (pendingImageFile) {
        setUploadingImage(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(",")[1];
          uploadRefImageMutation.mutate({ styleId: editingId, fileName: pendingImageFile.name, fileData: base64, contentType: pendingImageFile.type });
        };
        reader.readAsDataURL(pendingImageFile);
        updateMutation.mutate({ id: editingId, label: form.label, promptHint: form.promptHint, isActive: form.isActive });
      } else {
        updateMutation.mutate({ id: editingId, label: form.label, promptHint: form.promptHint, referenceImageUrl: form.referenceImageUrl, isActive: form.isActive });
      }
    } else {
      const result = await createMutation.mutateAsync({ label: form.label, promptHint: form.promptHint, isActive: form.isActive });
      if (result?.id && pendingImageFile) {
        setUploadingImage(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(",")[1];
          uploadRefImageMutation.mutate({ styleId: result.id, fileName: pendingImageFile!.name, fileData: base64, contentType: pendingImageFile!.type });
        };
        reader.readAsDataURL(pendingImageFile);
      }
    }
  }

  function handleDragStart(id: number) { setDragId(id); }
  function handleDragOver(e: React.DragEvent, id: number) { e.preventDefault(); setDragOverId(id); }
  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const sorted = [...styles].sort((a, b) => a.sortOrder - b.sortOrder);
    const fromIdx = sorted.findIndex(s => s.id === dragId);
    const toIdx = sorted.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    reorderMutation.mutate({ orderedIds: reordered.map(s => s.id) });
    setDragId(null); setDragOverId(null);
  }

  const sortedStyles = [...styles].sort((a, b) => a.sortOrder - b.sortOrder);
  const isSaving = createMutation.isPending || updateMutation.isPending || uploadingImage;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">出品标准</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 AI 效果图的渲染风格库，包括风格名称、提示词和参考图</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">渲染风格库</CardTitle>
              <CardDescription className="text-xs mt-0.5">配置 AI 效果图生成时可选的渲染风格，每个风格包含提示词和可选的参考图</CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />新增风格
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
            </div>
          ) : sortedStyles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Palette className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">暂无渲染风格，点击「新增风格」开始配置</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedStyles.map((style) => (
                <div
                  key={style.id}
                  draggable
                  onDragStart={() => handleDragStart(style.id)}
                  onDragOver={(e) => handleDragOver(e, style.id)}
                  onDrop={() => handleDrop(style.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-all
                    ${dragOverId === style.id ? "border-primary bg-primary/5" : "border-border"}
                    ${dragId === style.id ? "opacity-50" : ""}
                  `}
                >
                  <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0 border border-border">
                    {style.referenceImageUrl ? (
                      <img src={style.referenceImageUrl} alt={style.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImagePlus className="h-4 w-4 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{style.label}</span>
                      {!style.isActive && <Badge variant="secondary" className="text-xs py-0">已停用</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{style.promptHint}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title={style.isActive ? "停用" : "启用"}
                      onClick={() => updateMutation.mutate({ id: style.id, isActive: !style.isActive })}>
                      {style.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(style)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteConfirmId(style.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId !== null ? "编辑渲染风格" : "新增渲染风格"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>风格名称 <span className="text-destructive">*</span></Label>
              <Input placeholder="例如：建筑渲染" value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>生成提示词 <span className="text-destructive">*</span></Label>
              <Textarea placeholder="输入注入到 AI 生成 prompt 中的风格描述词，建议使用英文..." value={form.promptHint}
                onChange={(e) => setForm(f => ({ ...f, promptHint: e.target.value }))} rows={3} className="resize-none" />
              <p className="text-xs text-muted-foreground">此文字将追加到生成 prompt 末尾，用于控制图像风格</p>
            </div>
            <div className="space-y-1.5">
              <Label>参考图（可选）</Label>
              <div className="flex gap-3 items-start">
                <div className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0">
                  {pendingImagePreview ? (
                    <img src={pendingImagePreview} alt="预览" className="w-full h-full object-cover" />
                  ) : form.referenceImageUrl ? (
                    <img src={form.referenceImageUrl} alt="参考图" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImagePlus className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" />{form.referenceImageUrl || pendingImagePreview ? "更换参考图" : "上传参考图"}
                  </Button>
                  {(form.referenceImageUrl || pendingImagePreview) && (
                    <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => { setForm(f => ({ ...f, referenceImageUrl: null })); setPendingImageFile(null); setPendingImagePreview(null); }}>
                      <X className="h-3.5 w-3.5" />移除参考图
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">参考图将作为 style reference 传给 AI，引导生成风格</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>启用此风格</Label>
                <p className="text-xs text-muted-foreground mt-0.5">停用后不会在效果图生成页面的下拉框中显示</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>取消</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editingId !== null ? "保存修改" : "创建风格"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">删除后无法恢复，已使用此风格生成的历史图片不受影响。确定要删除这个渲染风格吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
