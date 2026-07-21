import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Search, Star, Phone, Tag, Globe,
  Pencil, Trash2, Archive, ArchiveRestore, ChevronRight,
} from "lucide-react";
import SupplierFormDialog, { EMPTY_FORM, type SupplierFormData } from "./SupplierFormDialog";

function StarRating({ score }: { score: number | null | undefined }) {
  if (!score) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3 w-3 ${i <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function SupplierCategoryPage() {
  const params = useParams<{ category: string }>();
  const category = decodeURIComponent(params.category ?? "");
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: suppliers = [], isLoading } = trpc.suppliers.list.useQuery({
    category,
    search: search.trim() || undefined,
    includeArchived: showArchived,
  });

  const archiveMutation = trpc.suppliers.archive.useMutation({
    onSuccess: () => { toast.success("已更新"); utils.suppliers.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.suppliers.list.invalidate();
      utils.suppliers.categorySummary.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (s: any) => { setEditingSupplier(s); setFormOpen(true); };
  const handleClose = () => { setFormOpen(false); setEditingSupplier(null); };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <button
          className="hover:text-foreground transition-colors flex items-center gap-1"
          onClick={() => navigate("/construction/suppliers")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          供应商产品库
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{category}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{category}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "加载中…" : `共 ${suppliers.length} 家供应商`}
          </p>
        </div>
        <Button onClick={() => { setEditingSupplier(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" />
          添加供应商
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="搜索名称、联系方式…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-base">暂无供应商</p>
          <p className="text-sm mt-1 opacity-60">点击右上角「添加供应商」开始录入</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s: any) => (
            <div
              key={s.id}
              className={`bg-card border rounded-xl p-4 transition-all ${s.isArchived ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                {/* Clickable name area */}
                <div
                  className="flex-1 min-w-0 cursor-pointer group"
                  onClick={() => navigate(`/construction/suppliers/${s.id}`)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors leading-tight">
                      {s.name}
                    </h3>
                    {s.subCategory && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {s.subCategory}
                      </span>
                    )}
                    {s.rating && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {s.rating}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <StarRating score={s.score} />
                    {s.recommender && (
                      <span className="text-[10px] text-muted-foreground">推荐人：{s.recommender}</span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                      {s.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                    {s.contact && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[160px]">{s.contact}</span>
                      </span>
                    )}
                    {s.sourceNote && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" />
                        {s.sourceNote}
                      </span>
                    )}
                    {s.websiteUrl && (
                      <span className="flex items-center gap-1 text-primary">
                        <Globe className="h-2.5 w-2.5" />
                        官网
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => navigate(`/construction/suppliers/${s.id}`)}
                    title="查看详情"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                    onClick={() => archiveMutation.mutate({ id: s.id, archived: !s.isArchived })}
                    title={s.isArchived ? "恢复" : "归档"}
                  >
                    {s.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
            category: editingSupplier.category ?? category,
            subCategory: editingSupplier.subCategory ?? "",
            address: editingSupplier.address ?? "",
            contact: editingSupplier.contact ?? "",
            description: editingSupplier.description ?? "",
            priceLevel: editingSupplier.priceLevel ?? "",
            sourceNote: editingSupplier.sourceNote ?? "",
            referenceUrl: editingSupplier.referenceUrl ?? "",
            websiteUrl: editingSupplier.websiteUrl ?? "",
            inspectionNote: editingSupplier.inspectionNote ?? "",
            cooperatedProjects: editingSupplier.cooperatedProjects ?? "",
            score: editingSupplier.score ? String(editingSupplier.score) : "none",
            rating: editingSupplier.rating ?? "none",
            recommender: editingSupplier.recommender ?? "",
          } : { ...EMPTY_FORM, category }}
          onSaved={() => {
            utils.suppliers.list.invalidate();
            utils.suppliers.categorySummary.invalidate();
          }}
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
