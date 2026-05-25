import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Sparkles,
  Trash2,
  Edit,
  ExternalLink,
  Upload,
  X,
  Library,
  Tag,
  Building2,
  Ruler,
} from "lucide-react";


const PROJECT_TYPES = [
  "办公空间",
  "展厅展馆",
  "商业空间",
  "文化空间",
  "教育空间",
  "酒店民宿",
  "住宅空间",
  "工业厂房",
  "公共空间",
  "其他",
];

const CLIENT_TYPES = [
  "科技企业",
  "制造业企业",
  "金融机构",
  "政府机构",
  "文化机构",
  "教育机构",
  "地产开发商",
  "个人业主",
  "其他",
];

type CaseItem = {
  id: number;
  title: string;
  description?: string | null;
  projectType?: string | null;
  styleTags?: string | null;
  aiTags?: unknown;
  areaSqm?: number | null;
  clientType?: string | null;
  coverImageUrl?: string | null;
  imageUrls?: unknown;
  sourceUrl?: string | null;
  completionYear?: number | null;
  designerName?: string | null;
  aiTagsGenerated?: boolean | null;
  createdAt: Date;
};

type FormData = {
  title: string;
  description: string;
  projectType: string;
  styleTags: string;
  areaSqm: string;
  clientType: string;
  coverImageUrl: string;
  sourceUrl: string;
  completionYear: string;
  designerName: string;
};

const emptyForm: FormData = {
  title: "",
  description: "",
  projectType: "",
  styleTags: "",
  areaSqm: "",
  clientType: "",
  coverImageUrl: "",
  sourceUrl: "",
  completionYear: "",
  designerName: "",
};

export default function CaseLibrary() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [generatingTagsFor, setGeneratingTagsFor] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: cases, isLoading } = trpc.caseLibrary.list.useQuery({
    search: search || undefined,
    projectType: filterType !== "all" ? filterType : undefined,
  });

  const createMutation = trpc.caseLibrary.create.useMutation({
    onSuccess: () => {
      utils.caseLibrary.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success("案例已添加");
    },
    onError: (e) => toast.error(`添加失败: ${e.message}`),
  });

  const updateMutation = trpc.caseLibrary.update.useMutation({
    onSuccess: () => {
      utils.caseLibrary.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success("案例已更新");
    },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });

  const deleteMutation = trpc.caseLibrary.delete.useMutation({
    onSuccess: () => {
      utils.caseLibrary.list.invalidate();
      setDeletingId(null);
      toast.success("案例已删除");
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const generateTagsMutation = trpc.caseLibrary.generateAiTags.useMutation({
    onSuccess: (data) => {
      utils.caseLibrary.list.invalidate();
      setGeneratingTagsFor(null);
      toast.success(`已生成 ${data.tags.length} 个 AI 标签`);
    },
    onError: (e) => {
      setGeneratingTagsFor(null);
      toast.error(`标签生成失败: ${e.message}`);
    },
  });



  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(item: CaseItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description || "",
      projectType: item.projectType || "",
      styleTags: item.styleTags || "",
      areaSqm: item.areaSqm?.toString() || "",
      clientType: item.clientType || "",
      coverImageUrl: item.coverImageUrl || "",
      sourceUrl: item.sourceUrl || "",
      completionYear: item.completionYear?.toString() || "",
      designerName: item.designerName || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      title: form.title.trim(),
      description: form.description || undefined,
      projectType: form.projectType || undefined,
      styleTags: form.styleTags || undefined,
      areaSqm: form.areaSqm ? parseFloat(form.areaSqm) : undefined,
      clientType: form.clientType || undefined,
      coverImageUrl: form.coverImageUrl || undefined,
      sourceUrl: form.sourceUrl || undefined,
      completionYear: form.completionYear ? parseInt(form.completionYear) : undefined,
      designerName: form.designerName || undefined,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/case-cover", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error(`上传失败 ${res.status}`);
      const data = await res.json() as { url: string };
      setForm((f) => ({ ...f, coverImageUrl: data.url }));
    } catch (err: unknown) {
      toast.error(`图片上传失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingCover(false);
    }
  }

  function getAiTagsArray(item: CaseItem): string[] {
    if (!item.aiTags) return [];
    try {
      const parsed = typeof item.aiTags === "string" ? JSON.parse(item.aiTags) : item.aiTags;
      return Array.isArray(parsed) ? parsed.filter((t: unknown) => typeof t === "string") : [];
    } catch {
      return [];
    }
  }

  function getStyleTagsArray(item: CaseItem): string[] {
    if (!item.styleTags) return [];
    return item.styleTags.split(/[,，、\s]+/).filter(Boolean);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950">
            <Library className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">案例库</h1>
            <p className="text-sm text-muted-foreground">积累自有案例，AI 自动提取标签，支持检索</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          添加案例
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索案例名称、描述、设计师..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="项目类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {PROJECT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      {cases && (
        <p className="text-sm text-muted-foreground mb-4">
          共 <span className="font-medium text-foreground">{cases.length}</span> 个案例
          {search && `，搜索"${search}"`}
          {filterType !== "all" && `，类型：${filterType}`}
        </p>
      )}

      {/* Case Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : cases && cases.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((item) => {
            const aiTags = getAiTagsArray(item);
            const styleTags = getStyleTagsArray(item);
            return (
              <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                {/* Cover Image */}
                {item.coverImageUrl ? (
                  <div className="relative h-44 overflow-hidden bg-muted">
                    <img
                      src={item.coverImageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {item.projectType && (
                      <Badge className="absolute top-2 left-2 bg-black/60 text-white border-0 text-xs">
                        {item.projectType}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="h-44 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 flex items-center justify-center">
                    <Building2 className="w-12 h-12 text-amber-300 dark:text-amber-700" />
                    {item.projectType && (
                      <Badge className="absolute top-2 left-2 text-xs">{item.projectType}</Badge>
                    )}
                  </div>
                )}

                <CardContent className="p-4">
                  {/* Title & Meta */}
                  <div className="mb-2">
                    <h3 className="font-semibold text-foreground line-clamp-1">{item.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {item.designerName && <span>{item.designerName}</span>}
                      {item.areaSqm && (
                        <span className="flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          {item.areaSqm}㎡
                        </span>
                      )}
                      {item.completionYear && <span>{item.completionYear}</span>}
                    </div>
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {styleTags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">{tag}</Badge>
                    ))}
                    {aiTags.slice(0, 4).map((tag) => (
                      <Badge key={tag} className="text-xs px-2 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-0">
                        {tag}
                      </Badge>
                    ))}
                    {aiTags.length === 0 && !item.aiTagsGenerated && (
                      <button
                        onClick={() => {
                          setGeneratingTagsFor(item.id);
                          generateTagsMutation.mutate({ id: item.id });
                        }}
                        disabled={generatingTagsFor === item.id}
                        className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3" />
                        {generatingTagsFor === item.id ? "生成中..." : "AI 生成标签"}
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEdit(item)}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      编辑
                    </Button>
                    {aiTags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-amber-600"
                        onClick={() => {
                          setGeneratingTagsFor(item.id);
                          generateTagsMutation.mutate({ id: item.id });
                        }}
                        disabled={generatingTagsFor === item.id}
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        {generatingTagsFor === item.id ? "生成中..." : "重新生成标签"}
                      </Button>
                    )}
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto"
                      >
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive ml-auto"
                      onClick={() => setDeletingId(item.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-full bg-amber-50 dark:bg-amber-950 mb-4">
            <Library className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            {search || filterType !== "all" ? "没有找到匹配的案例" : "案例库还是空的"}
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {search || filterType !== "all"
              ? "试试调整搜索关键词或筛选条件"
              : "添加你们做过的或收藏的优秀案例，AI 会自动提取标签，方便后续在对标研究和汇报中快速调用"}
          </p>
          {!search && filterType === "all" && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              添加第一个案例
            </Button>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "编辑案例" : "添加案例"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="title">案例名称 *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例：华为松山湖园区办公楼"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>项目类型</Label>
                <Select value={form.projectType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, projectType: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定</SelectItem>
                    {PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>甲方类型</Label>
                <Select value={form.clientType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, clientType: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定</SelectItem>
                    {CLIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="areaSqm">面积（㎡）</Label>
                <Input
                  id="areaSqm"
                  type="number"
                  value={form.areaSqm}
                  onChange={(e) => setForm((f) => ({ ...f, areaSqm: e.target.value }))}
                  placeholder="例：2500"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="completionYear">完成年份</Label>
                <Input
                  id="completionYear"
                  type="number"
                  value={form.completionYear}
                  onChange={(e) => setForm((f) => ({ ...f, completionYear: e.target.value }))}
                  placeholder="例：2023"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="designerName">设计师/事务所</Label>
              <Input
                id="designerName"
                value={form.designerName}
                onChange={(e) => setForm((f) => ({ ...f, designerName: e.target.value }))}
                placeholder="例：Foster + Partners"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="styleTags">风格标签</Label>
              <Input
                id="styleTags"
                value={form.styleTags}
                onChange={(e) => setForm((f) => ({ ...f, styleTags: e.target.value }))}
                placeholder="用逗号分隔，例：极简主义, 工业风, 混凝土"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">案例描述</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="简要描述案例的设计亮点、空间特征、材料运用等..."
                rows={3}
                className="mt-1"
              />
            </div>

            <div>
              <Label>封面图片</Label>
              <div className="mt-1 space-y-2">
                {form.coverImageUrl ? (
                  <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted">
                    <img src={form.coverImageUrl} alt="封面" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setForm((f) => ({ ...f, coverImageUrl: "" }))}
                      className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    className="w-full h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-xs">{uploadingCover ? "上传中..." : "点击上传封面图"}</span>
                  </button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                />
                <Input
                  value={form.coverImageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                  placeholder="或直接粘贴图片 URL"
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sourceUrl">来源链接</Label>
              <Input
                id="sourceUrl"
                value={form.sourceUrl}
                onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                placeholder="例：https://www.archdaily.com/..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.title.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">删除后无法恢复，确定要删除这个案例吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => deletingId !== null && deleteMutation.mutate({ id: deletingId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
