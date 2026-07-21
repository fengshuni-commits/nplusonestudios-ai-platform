import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ChevronRight, Star, Phone, MapPin, Tag, Globe,
  ExternalLink, Plus, Pencil, Trash2, Upload, X, ImageIcon, Package,
} from "lucide-react";
import SupplierFormDialog, { EMPTY_FORM } from "./SupplierFormDialog";

function StarRating({ score }: { score: number | null | undefined }) {
  if (!score) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

type ProductFormData = {
  name: string;
  detailUrl: string;
  imageUrl: string;
  spec: string;
  price: string;
  notes: string;
};

const EMPTY_PRODUCT: ProductFormData = {
  name: "", detailUrl: "", imageUrl: "", spec: "", price: "", notes: "",
};

function ProductFormDialog({
  open,
  onClose,
  supplierId,
  productId,
  initialData,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: number;
  productId?: number;
  initialData?: ProductFormData;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductFormData>(initialData ?? EMPTY_PRODUCT);
  const [uploading, setUploading] = useState(false);
  const [imageMode, setImageMode] = useState<"url" | "upload">("url");
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!productId;
  const utils = trpc.useUtils();

  const createMutation = trpc.supplierProducts.create.useMutation({
    onSuccess: () => {
      toast.success("产品已添加");
      utils.supplierProducts.listBySupplier.invalidate({ supplierId });
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const updateMutation = trpc.supplierProducts.update.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      utils.supplierProducts.listBySupplier.invalidate({ supplierId });
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const uploadImageMutation = trpc.supplierProducts.uploadImage.useMutation({
    onSuccess: (data) => {
      setForm((f) => ({ ...f, imageUrl: data.url }));
      setUploading(false);
      toast.success("图片已上传");
    },
    onError: (e) => {
      setUploading(false);
      toast.error(e.message || "上传失败");
    },
  });

  const set = (k: keyof ProductFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("图片不能超过 10MB"); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadImageMutation.mutate({ fileName: file.name, fileType: file.type, fileBase64: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("请填写产品名称"); return; }
    const payload = {
      supplierId,
      name: form.name.trim(),
      detailUrl: form.detailUrl || undefined,
      imageUrl: form.imageUrl || undefined,
      spec: form.spec || undefined,
      price: form.price || undefined,
      notes: form.notes || undefined,
    };
    if (isEdit) {
      updateMutation.mutate({ id: productId!, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || uploading;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑产品" : "添加产品"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>产品名称 <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="如：哑光黑岩板 1200×2400…" />
          </div>
          <div className="space-y-1.5">
            <Label>产品详情页链接</Label>
            <Input value={form.detailUrl} onChange={(e) => set("detailUrl", e.target.value)} placeholder="淘宝商品链接、官网产品页…" />
          </div>
          <div className="space-y-1.5">
            <Label>产品图片</Label>
            <div className="flex gap-2 mb-2">
              <Button type="button" variant={imageMode === "url" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setImageMode("url")}>
                填写 URL
              </Button>
              <Button type="button" variant={imageMode === "upload" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setImageMode("upload")}>
                <Upload className="h-3 w-3 mr-1" />上传图片
              </Button>
            </div>
            {imageMode === "url" ? (
              <Input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
            ) : (
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" />
                  {uploading ? "上传中…" : "选择图片文件"}
                </Button>
              </div>
            )}
            {form.imageUrl && (
              <div className="relative w-full mt-2">
                <img src={form.imageUrl} alt="预览" className="w-full max-h-48 object-contain rounded-lg border bg-muted/30" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 bg-background/80" onClick={() => set("imageUrl", "")}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>规格参数</Label>
            <Textarea value={form.spec} onChange={(e) => set("spec", e.target.value)} placeholder="尺寸、材质、型号、颜色…" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>价格参考</Label>
            <Input value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="如：¥1200/㎡、¥3800/件…" />
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="使用体验、注意事项…" rows={2} />
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

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const supplierId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: supplier, isLoading: supplierLoading } = trpc.suppliers.get.useQuery(
    { id: supplierId },
    { enabled: !!supplierId }
  );
  const { data: products = [], isLoading: productsLoading } = trpc.supplierProducts.listBySupplier.useQuery(
    { supplierId },
    { enabled: !!supplierId }
  );

  const deleteProductMutation = trpc.supplierProducts.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.supplierProducts.listBySupplier.invalidate({ supplierId });
      setDeleteProductId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (supplierLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>供应商不存在</p>
        <Button variant="link" onClick={() => navigate("/construction/suppliers")}>返回供应商库</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <button className="hover:text-foreground transition-colors flex items-center gap-1" onClick={() => navigate("/construction/suppliers")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          供应商产品库
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button className="hover:text-foreground transition-colors" onClick={() => navigate(`/construction/suppliers/category/${encodeURIComponent(supplier.category)}`)}>
          {supplier.category}
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{supplier.name}</span>
      </div>

      {/* Supplier Info Card */}
      <div className="bg-card border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold">{supplier.name}</h1>
              <Badge variant="outline" className="text-xs">{supplier.category}</Badge>
              {supplier.subCategory && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{supplier.subCategory}</span>
              )}
              {supplier.rating && (
                <Badge variant="secondary" className="text-xs">{supplier.rating}</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <StarRating score={supplier.score} />
              {supplier.recommender && (
                <span className="text-sm text-muted-foreground">推荐人：{supplier.recommender}</span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            编辑
          </Button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {supplier.contact && (
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">联系方式</p>
                <p>{supplier.contact}</p>
              </div>
            </div>
          )}
          {supplier.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">地址</p>
                <p>{supplier.address}</p>
              </div>
            </div>
          )}
          {supplier.websiteUrl && (
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">官网</p>
                <a
                  href={supplier.websiteUrl.startsWith("http") ? supplier.websiteUrl : `https://${supplier.websiteUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  {supplier.websiteUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
          {supplier.sourceNote && (
            <div className="flex items-start gap-2">
              <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">来源</p>
                <p>{supplier.sourceNote}</p>
              </div>
            </div>
          )}
        </div>

        {supplier.description && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-1">简介/主要产品</p>
            <p className="text-sm leading-relaxed">{supplier.description}</p>
          </div>
        )}

        {(supplier.priceLevel || supplier.inspectionNote || supplier.cooperatedProjects) && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {supplier.priceLevel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">造价水平</p>
                <p className="leading-relaxed">{supplier.priceLevel}</p>
              </div>
            )}
            {supplier.inspectionNote && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">考察情况</p>
                <p className="leading-relaxed">{supplier.inspectionNote}</p>
              </div>
            )}
            {supplier.cooperatedProjects && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">合作项目</p>
                <p className="leading-relaxed">{supplier.cooperatedProjects}</p>
              </div>
            )}
          </div>
        )}

        {supplier.referenceUrl && (
          <div className="mt-4 pt-4 border-t">
            <a
              href={supplier.referenceUrl.startsWith("http") ? supplier.referenceUrl : `https://${supplier.referenceUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              参考链接（淘宝/小红书）
            </a>
          </div>
        )}
      </div>

      {/* Products Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            产品列表
            {!productsLoading && (
              <span className="text-sm font-normal text-muted-foreground">({products.length})</span>
            )}
          </h2>
          <Button size="sm" onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            添加产品
          </Button>
        </div>

        {productsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-xl bg-muted/20">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无产品记录</p>
            <p className="text-xs mt-1 opacity-60">点击「添加产品」录入产品图片和详情</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {(products as any[]).map((p) => (
              <div key={p.id} className="bg-card border rounded-xl overflow-hidden group">
                {/* Image */}
                <div
                  className="relative aspect-square bg-muted/30 cursor-pointer"
                  onClick={() => p.imageUrl && setLightboxImg(p.imageUrl)}
                >
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                      }}
                    />
                  ) : null}
                  {!p.imageUrl && (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Hover actions */}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="secondary" size="icon" className="h-6 w-6 bg-background/90" onClick={(e) => { e.stopPropagation(); setEditingProduct(p); setProductFormOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="secondary" size="icon" className="h-6 w-6 bg-background/90 hover:bg-destructive hover:text-destructive-foreground" onClick={(e) => { e.stopPropagation(); setDeleteProductId(p.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 space-y-1">
                  <p className="text-xs font-medium leading-tight line-clamp-2">{p.name}</p>
                  {p.price && <p className="text-xs text-foreground/70 font-medium">{p.price}</p>}
                  {p.spec && <p className="text-[11px] text-muted-foreground line-clamp-1">{p.spec}</p>}
                  {p.detailUrl && (
                    <a
                      href={p.detailUrl.startsWith("http") ? p.detailUrl : `https://${p.detailUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      详情页
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit supplier dialog */}
      {editOpen && supplier && (
        <SupplierFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          supplierId={supplier.id}
          initialData={{
            name: supplier.name ?? "",
            category: supplier.category ?? "",
            subCategory: supplier.subCategory ?? "",
            address: supplier.address ?? "",
            contact: supplier.contact ?? "",
            description: supplier.description ?? "",
            priceLevel: supplier.priceLevel ?? "",
            sourceNote: supplier.sourceNote ?? "",
            referenceUrl: supplier.referenceUrl ?? "",
            websiteUrl: supplier.websiteUrl ?? "",
            inspectionNote: supplier.inspectionNote ?? "",
            cooperatedProjects: supplier.cooperatedProjects ?? "",
            score: supplier.score ? String(supplier.score) : "none",
            rating: supplier.rating ?? "none",
            recommender: supplier.recommender ?? "",
          }}
          onSaved={() => {
            utils.suppliers.get.invalidate({ id: supplierId });
          }}
        />
      )}

      {/* Product form dialog */}
      {productFormOpen && (
        <ProductFormDialog
          open={productFormOpen}
          onClose={() => { setProductFormOpen(false); setEditingProduct(null); }}
          supplierId={supplierId}
          productId={editingProduct?.id}
          initialData={editingProduct ? {
            name: editingProduct.name ?? "",
            detailUrl: editingProduct.detailUrl ?? "",
            imageUrl: editingProduct.imageUrl ?? "",
            spec: editingProduct.spec ?? "",
            price: editingProduct.price ?? "",
            notes: editingProduct.notes ?? "",
          } : undefined}
          onSaved={() => {}}
        />
      )}

      {/* Delete product confirm */}
      <AlertDialog open={deleteProductId !== null} onOpenChange={(v) => { if (!v) setDeleteProductId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除产品</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProductId && deleteProductMutation.mutate({ id: deleteProductId })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setLightboxImg(null)}
          >
            <X className="h-5 w-5" />
          </Button>
          <img
            src={lightboxImg}
            alt="产品大图"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
