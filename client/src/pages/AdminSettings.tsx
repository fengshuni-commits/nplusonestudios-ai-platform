import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Database, Server, Shield, ListOrdered, Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">平台配置与系统信息</p>
      </div>

      {/* Field Templates Management */}
      <FieldTemplatesManager />

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />系统信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="平台版本" value="1.0.0-beta" />
            <InfoRow label="运行环境" value="Production" />
            <InfoRow label="数据库状态" value="正常" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />安全设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="认证方式" value="OAuth 2.0" />
            <InfoRow label="会话有效期" value="7 天" />
            <InfoRow label="API 访问" value="已启用" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />数据统计
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="项目总数" value="—" />
            <InfoRow label="文档总数" value="—" />
            <InfoRow label="AI 调用次数" value="—" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />OpenClaw 集成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="API 端点" value="/api/v1/*" />
            <InfoRow label="Webhook" value="待配置" />
            <InfoRow label="状态" value="就绪" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FieldTemplatesManager() {
  const { data: templates, isLoading } = trpc.fieldTemplates.list.useQuery();
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const createTemplate = trpc.fieldTemplates.create.useMutation({
    onSuccess: () => {
      utils.fieldTemplates.list.invalidate();
      setAddOpen(false);
      setNewName("");
      setNewDesc("");
      toast.success("类别已添加");
    },
    onError: () => toast.error("添加失败"),
  });

  const updateTemplate = trpc.fieldTemplates.update.useMutation({
    onSuccess: () => {
      utils.fieldTemplates.list.invalidate();
      setEditingId(null);
      toast.success("类别已更新");
    },
    onError: () => toast.error("更新失败"),
  });

  const deleteTemplate = trpc.fieldTemplates.delete.useMutation({
    onSuccess: () => {
      utils.fieldTemplates.list.invalidate();
      toast.success("类别已删除");
    },
    onError: () => toast.error("删除失败"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />项目信息类别
          </CardTitle>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setNewName(""); setNewDesc(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />添加类别
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>添加信息类别</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>类别名称 <span className="text-destructive">*</span></Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例：项目面积、设计风格"
                    onKeyDown={(e) => e.key === "Enter" && !createTemplate.isPending && newName.trim() && createTemplate.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>说明（可选）</Label>
                  <Input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="对该类别的简短说明"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!newName.trim()) { toast.error("请输入类别名称"); return; }
                    createTemplate.mutate({ name: newName.trim(), description: newDesc.trim() || undefined });
                  }}
                  disabled={createTemplate.isPending}
                  className="w-full"
                >
                  {createTemplate.isPending ? "添加中..." : "添加"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          管理新建项目时可选择的信息类别，团队成员可在创建或编辑项目时从这些类别中选择填写
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="space-y-1">
            {templates.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 group">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                {editingId === t.id ? (
                  <>
                    <div className="flex-1 flex gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="说明（可选）"
                      />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          if (!editName.trim()) { toast.error("名称不能为空"); return; }
                          updateTemplate.mutate({ id: t.id, name: editName.trim(), description: editDesc.trim() || undefined });
                        }}
                        disabled={updateTemplate.isPending}
                      >
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{t.name}</span>
                      {t.description && (
                        <span className="text-xs text-muted-foreground ml-2">{t.description}</span>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingId(t.id);
                          setEditName(t.name);
                          setEditDesc(t.description || "");
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`确定删除类别「${t.name}」？已使用该类别的项目信息不受影响。`)) {
                            deleteTemplate.mutate({ id: t.id });
                          }
                        }}
                        disabled={deleteTemplate.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">暂无类别，点击上方按钮添加</p>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
