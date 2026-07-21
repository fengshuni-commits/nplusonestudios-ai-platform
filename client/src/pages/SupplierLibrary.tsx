import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  Star,
  Phone,
  MapPin,
  Tag,
  ChevronDown,
  ChevronUp,
  Archive,
  ArchiveRestore,
} from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "施工方": "bg-orange-100 text-orange-700 border-orange-200",
  "建材": "bg-stone-100 text-stone-700 border-stone-200",
  "全屋订制": "bg-amber-100 text-amber-700 border-amber-200",
  "卫浴": "bg-cyan-100 text-cyan-700 border-cyan-200",
  "软装": "bg-pink-100 text-pink-700 border-pink-200",
  "灯具": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "平面供应商": "bg-violet-100 text-violet-700 border-violet-200",
  "LED软屏": "bg-blue-100 text-blue-700 border-blue-200",
  "设计分包": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "门窗五金": "bg-slate-100 text-slate-700 border-slate-200",
  "其他": "bg-gray-100 text-gray-600 border-gray-200",
};

type SupplierFormData = {
  name: string;
  category: string;
  subCategory: string;
  address: string;
  contact: string;
  description: string;
  priceLevel: string;
  sourceNote: string;
  referenceUrl: string;
  inspectionNote: string;
  cooperatedProjects: string;
  score: string;
  rating: string;
  recommender: string;
};

const EMPTY_FORM: SupplierFormData = {
  name: "", category: "建材", subCategory: "", address: "",
  contact: "", description: "", priceLevel: "", sourceNote: "",
  referenceUrl: "", inspectionNote: "", cooperatedProjects: "",
  score: "none", rating: "none", recommender: "",
};

const CATEGORIES = [
  "施工方", "建材", "全屋订制", "卫浴", "软装", "灯具",
  "平面供应商", "LED软屏", "设计分包", "门窗五金", "其他",
];

function StarRating({ score }: { score: number | null | undefined }) {
  if (!score) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function SupplierCard({
  supplier,
  onEdit,
  onDelete,
  onArchive,
}: {
  supplier: any;
  onEdit: (s: any) => void;
  onDelete: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CATEGORY_COLORS[supplier.category] ?? CATEGORY_COLORS["其他"];

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-2.5 transition-all ${supplier.isArchived ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm text-foreground leading-tight">{supplier.name}</h3>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${catColor}`}>
              {supplier.category}
            </Badge>
            {supplier.subCategory && (
              <span className="text-[10px] text-muted-foreground">{supplier.subCategory}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <StarRating score={supplier.score} />
            {supplier.rating && (
              <span className="text-[10px] font-medium text-muted-foreground">评级 {supplier.rating}</span>
            )}
            {supplier.recommender && (
              <span className="text-[10px] text-muted-foreground">推荐人：{supplier.recommender}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(supplier)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
            onClick={() => onArchive(supplier.id, !supplier.isArchived)}
            title={supplier.isArchived ? "恢复" : "归档"}
          >
            {supplier.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(supplier.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Key info row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {supplier.contact && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[180px]">{supplier.contact}</span>
          </span>
        )}
        {supplier.address && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[200px]">{supplier.address}</span>
          </span>
        )}
        {supplier.sourceNote && (
          <span className="flex items-center gap-1">
            <Tag className="h-3 w-3 shrink-0" />
            {supplier.sourceNote}
          </span>
        )}
      </div>

      {/* Description */}
      {supplier.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{supplier.description}</p>
      )}

      {/* Expand for more details */}
      {(supplier.priceLevel || supplier.inspectionNote || supplier.cooperatedProjects || supplier.referenceUrl) && (
        <>
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "收起" : "更多信息"}
          </button>
          {expanded && (
            <div className="space-y-1.5 text-xs text-muted-foreground border-t pt-2">
              {supplier.priceLevel && (
                <div><span className="font-medium text-foreground/70">造价水平：</span>{supplier.priceLevel}</div>
              )}
              {supplier.inspectionNote && (
                <div><span className="font-medium text-foreground/70">考察情况：</span>{supplier.inspectionNote}</div>
              )}
              {supplier.cooperatedProjects && (
                <div><span className="font-medium text-foreground/70">合作项目：</span>{supplier.cooperatedProjects}</div>
              )}
              {supplier.referenceUrl && (
                <a
                  href={supplier.referenceUrl.startsWith("http") ? supplier.referenceUrl : `https://${supplier.referenceUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  参考链接
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SupplierFormDialog({
  open,
  onClose,
  initialData,
  supplierId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialData?: SupplierFormData;
  supplierId?: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SupplierFormData>(initialData ?? EMPTY_FORM);
  const isEdit = !!supplierId;

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => { toast.success("供应商已添加"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message || "添加失败"),
  });
  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => { toast.success("已保存"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const set = (k: keyof SupplierFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("请填写供应商名称"); return; }
    if (!form.category) { toast.error("请选择类别"); return; }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      subCategory: form.subCategory || undefined,
      address: form.address || undefined,
      contact: form.contact || undefined,
      description: form.description || undefined,
      priceLevel: form.priceLevel || undefined,
      sourceNote: form.sourceNote || undefined,
      referenceUrl: form.referenceUrl || undefined,
      inspectionNote: form.inspectionNote || undefined,
      cooperatedProjects: form.cooperatedProjects || undefined,
      score: (form.score && form.score !== "none") ? parseInt(form.score) : undefined,
      rating: (form.rating && form.rating !== "none") ? form.rating : undefined,
      recommender: form.recommender || undefined,
    };
    if (isEdit) {
      updateMutation.mutate({ id: supplierId!, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑供应商" : "添加供应商"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div className="col-span-2 space-y-1.5">
            <Label>供应商/品牌名称 <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="如：杜亚、科思顿…" />
          </div>
          {/* Category */}
          <div className="space-y-1.5">
            <Label>大类 <span className="text-destructive">*</span></Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* SubCategory */}
          <div className="space-y-1.5">
            <Label>细分类别</Label>
            <Input value={form.subCategory} onChange={(e) => set("subCategory", e.target.value)} placeholder="如：电动窗帘、木地板…" />
          </div>
          {/* Contact */}
          <div className="col-span-2 space-y-1.5">
            <Label>联系方式</Label>
            <Input value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="微信号、电话、淘宝店名…" />
          </div>
          {/* Address */}
          <div className="col-span-2 space-y-1.5">
            <Label>门店/工厂地址</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="城市、商场、具体地址…" />
          </div>
          {/* Description */}
          <div className="col-span-2 space-y-1.5">
            <Label>简介/主要产品</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="主营产品、特点、适用场景…" rows={3} />
          </div>
          {/* Price Level */}
          <div className="col-span-2 space-y-1.5">
            <Label>造价水平</Label>
            <Textarea value={form.priceLevel} onChange={(e) => set("priceLevel", e.target.value)} placeholder="大概价格区间、单价参考…" rows={2} />
          </div>
          {/* Inspection Note */}
          <div className="col-span-2 space-y-1.5">
            <Label>考察情况</Label>
            <Textarea value={form.inspectionNote} onChange={(e) => set("inspectionNote", e.target.value)} placeholder="是否实地考察、使用体验…" rows={2} />
          </div>
          {/* Cooperated Projects */}
          <div className="col-span-2 space-y-1.5">
            <Label>合作过的项目</Label>
            <Input value={form.cooperatedProjects} onChange={(e) => set("cooperatedProjects", e.target.value)} placeholder="如：OOHLiVE清华科技园项目…" />
          </div>
          {/* Source Note */}
          <div className="space-y-1.5">
            <Label>供应商来源</Label>
            <Input value={form.sourceNote} onChange={(e) => set("sourceNote", e.target.value)} placeholder="小红书、淘宝、朋友介绍…" />
          </div>
          {/* Recommender */}
          <div className="space-y-1.5">
            <Label>推荐人</Label>
            <Input value={form.recommender} onChange={(e) => set("recommender", e.target.value)} placeholder="团队成员姓名…" />
          </div>
          {/* Score */}
          <div className="space-y-1.5">
            <Label>评分（1-5）</Label>
            <Select value={form.score} onValueChange={(v) => set("score", v)}>
              <SelectTrigger><SelectValue placeholder="选择评分" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不评分</SelectItem>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {"★".repeat(n)}{"☆".repeat(5 - n)} {n}分
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Rating */}
          <div className="space-y-1.5">
            <Label>评级</Label>
            <Select value={form.rating} onValueChange={(v) => set("rating", v)}>
              <SelectTrigger><SelectValue placeholder="选择评级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不评级</SelectItem>
                {["A+", "A", "B+", "B", "C"].map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Reference URL */}
          <div className="col-span-2 space-y-1.5">
            <Label>参考链接</Label>
            <Input value={form.referenceUrl} onChange={(e) => set("referenceUrl", e.target.value)} placeholder="淘宝、小红书链接…" />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>取消</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "保存中…" : isEdit ? "保存" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SupplierLibrary() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: suppliers = [], isLoading } = trpc.suppliers.list.useQuery({
    category: categoryFilter === "all" ? undefined : categoryFilter,
    search: search.trim() || undefined,
    includeArchived: showArchived,
  });

  const archiveMutation = trpc.suppliers.archive.useMutation({
    onSuccess: () => { toast.success("已更新"); utils.suppliers.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.suppliers.list.invalidate(); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (s: any) => {
    setEditingSupplier(s);
    setFormOpen(true);
  };

  const handleClose = () => {
    setFormOpen(false);
    setEditingSupplier(null);
  };

  // Group by category
  const grouped = suppliers.reduce<Record<string, any[]>>((acc, s) => {
    const key = s.category || "其他";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const totalCount = suppliers.length;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">供应商产品库</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              N+1 STUDIOS 积累的供应商与产品资源，共 {totalCount} 条
            </p>
          </div>
          <Button onClick={() => { setEditingSupplier(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" />
            添加供应商
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="搜索供应商名称、产品、联系方式…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类别</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            {showArchived ? "隐藏归档" : "显示归档"}
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-base">暂无供应商数据</p>
            <p className="text-sm mt-1 opacity-60">点击右上角「添加供应商」开始录入</p>
          </div>
        ) : categoryFilter !== "all" ? (
          // Single category flat grid
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {suppliers.map((s) => (
              <SupplierCard
                key={s.id}
                supplier={s}
                onEdit={handleEdit}
                onDelete={setDeleteId}
                onArchive={(id, archived) => archiveMutation.mutate({ id, archived })}
              />
            ))}
          </div>
        ) : (
          // Grouped by category
          <div className="space-y-6">
            {CATEGORIES.filter((c) => grouped[c]?.length > 0).map((cat) => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className={`text-xs px-2 py-0.5 border ${CATEGORY_COLORS[cat]}`}>
                    {cat}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{grouped[cat].length} 家</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {grouped[cat].map((s) => (
                    <SupplierCard
                      key={s.id}
                      supplier={s}
                      onEdit={handleEdit}
                      onDelete={setDeleteId}
                      onArchive={(id, archived) => archiveMutation.mutate({ id, archived })}
                    />
                  ))}
                </div>
              </div>
            ))}
            {/* Uncategorized */}
            {Object.keys(grouped)
              .filter((c) => !CATEGORIES.includes(c))
              .map((cat) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="text-xs px-2 py-0.5">{cat}</Badge>
                    <span className="text-xs text-muted-foreground">{grouped[cat].length} 家</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped[cat].map((s) => (
                      <SupplierCard
                        key={s.id}
                        supplier={s}
                        onEdit={handleEdit}
                        onDelete={setDeleteId}
                        onArchive={(id, archived) => archiveMutation.mutate({ id, archived })}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      {/* Form dialog */}
      {formOpen && (
        <SupplierFormDialog
          open={formOpen}
          onClose={handleClose}
          supplierId={editingSupplier?.id}
          initialData={editingSupplier ? {
            name: editingSupplier.name ?? "",
            category: editingSupplier.category ?? "建材",
            subCategory: editingSupplier.subCategory ?? "",
            address: editingSupplier.address ?? "",
            contact: editingSupplier.contact ?? "",
            description: editingSupplier.description ?? "",
            priceLevel: editingSupplier.priceLevel ?? "",
            sourceNote: editingSupplier.sourceNote ?? "",
            referenceUrl: editingSupplier.referenceUrl ?? "",
            inspectionNote: editingSupplier.inspectionNote ?? "",
            cooperatedProjects: editingSupplier.cooperatedProjects ?? "",
            score: editingSupplier.score ? String(editingSupplier.score) : "none",
            rating: editingSupplier.rating ?? "none",
            recommender: editingSupplier.recommender ?? "",
          } : undefined}
          onSaved={() => utils.suppliers.list.invalidate()}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，建议使用「归档」代替删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
