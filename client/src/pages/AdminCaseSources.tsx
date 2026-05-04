import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Globe, Plus, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CaseSourceForm {
  name: string;
  baseUrl: string;
  description: string;
  imageSelector: string;
  titleSelector: string;
  descSelector: string;
  imageDomain: string;
  preferredSize: string;
}

const emptyForm: CaseSourceForm = {
  name: "",
  baseUrl: "",
  description: "",
  imageSelector: "",
  titleSelector: "",
  descSelector: "",
  imageDomain: "",
  preferredSize: "",
};

export default function AdminCaseSources() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CaseSourceForm>(emptyForm);

  const utils = trpc.useUtils();
  const { data: sources, isLoading } = trpc.admin.listCaseSources.useQuery();

  const createMutation = trpc.admin.createCaseSource.useMutation({
    onSuccess: () => {
      toast.success("来源网站已添加");
      utils.admin.listCaseSources.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.updateCaseSource.useMutation({
    onSuccess: () => {
      toast.success("来源网站已更新");
      utils.admin.listCaseSources.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteCaseSource.useMutation({
    onSuccess: () => {
      toast.success("来源网站已删除");
      utils.admin.listCaseSources.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleEdit = (source: any) => {
    setEditingId(source.id);
    setForm({
      name: source.name || "",
      baseUrl: source.baseUrl || "",
      description: source.description || "",
      imageSelector: source.imageSelector || "",
      titleSelector: source.titleSelector || "",
      descSelector: source.descSelector || "",
      imageDomain: source.imageDomain || "",
      preferredSize: source.preferredSize || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.error("名称和网址为必填项");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleToggleActive = (id: number, currentActive: boolean) => {
    updateMutation.mutate({ id, isActive: !currentActive });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mt-1">
            管理对标调研 PPT 中案例照片的抓取来源，系统会从这些网站获取真实项目照片
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingId(null); setForm(emptyForm); }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />添加来源
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "编辑来源网站" : "添加来源网站"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>网站名称 *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例：ArchDaily"
                  />
                </div>
                <div className="space-y-2">
                  <Label>网站地址 *</Label>
                  <Input
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder="https://www.archdaily.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="网站简介..."
                  rows={2}
                />
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3 text-muted-foreground">抓取配置（高级）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">图片选择器</Label>
                    <Input
                      value={form.imageSelector}
                      onChange={(e) => setForm({ ...form, imageSelector: e.target.value })}
                      placeholder='例：.gallery-thumbs img'
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">标题选择器</Label>
                    <Input
                      value={form.titleSelector}
                      onChange={(e) => setForm({ ...form, titleSelector: e.target.value })}
                      placeholder='例：h1.title'
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">描述选择器</Label>
                    <Input
                      value={form.descSelector}
                      onChange={(e) => setForm({ ...form, descSelector: e.target.value })}
                      placeholder='例：.article-body p'
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">图片域名</Label>
                    <Input
                      value={form.imageDomain}
                      onChange={(e) => setForm({ ...form, imageDomain: e.target.value })}
                      placeholder='例：images.adsttc.com'
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">首选图片尺寸</Label>
                    <Input
                      value={form.preferredSize}
                      onChange={(e) => setForm({ ...form, preferredSize: e.target.value })}
                      placeholder='例：large_jpg'
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "保存" : "添加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !sources || sources.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">暂无案例来源网站</p>
            <p className="text-xs text-muted-foreground/60 mt-1">点击上方"添加来源"按钮添加常用建筑案例网站</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources.map((source: any) => (
            <Card key={source.id} className={!source.isActive ? "opacity-50" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="h-4 w-4 text-accent shrink-0" />
                      <h3 className="font-medium text-sm truncate">{source.name}</h3>
                      <a
                        href={source.baseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-accent flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{source.baseUrl}</p>
                    {source.description && (
                      <p className="text-xs text-muted-foreground/70 mt-1">{source.description}</p>
                    )}
                    {source.imageSelector && (
                      <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground/50">
                        <span>图片: {source.imageSelector}</span>
                        {source.imageDomain && <span>域名: {source.imageDomain}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={source.isActive}
                      onCheckedChange={() => handleToggleActive(source.id, source.isActive)}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(source)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("确定删除此来源网站？")) deleteMutation.mutate({ id: source.id });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">
            <strong>使用说明：</strong>添加常用的建筑设计案例网站后，对标调研生成 PPT 时会自动从这些网站抓取真实项目照片。
            系统已预置了 ArchDaily、Dezeen、谷德设计网和 Designboom 的抓取配置。
            如需添加其他网站，请填写正确的 CSS 选择器以确保图片抓取准确。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
