import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const CATEGORIES = [
  "施工方", "建材", "全屋订制", "卫浴", "软装", "灯具",
  "平面供应商", "LED软屏", "设计分包", "门窗五金", "其他",
] as const;

export type SupplierFormData = {
  name: string;
  category: string;
  subCategory: string;
  address: string;
  contact: string;
  description: string;
  priceLevel: string;
  sourceNote: string;
  referenceUrl: string;
  websiteUrl: string;
  inspectionNote: string;
  cooperatedProjects: string;
  score: string;
  rating: string;
  recommender: string;
};

export const EMPTY_FORM: SupplierFormData = {
  name: "", category: "建材", subCategory: "", address: "",
  contact: "", description: "", priceLevel: "", sourceNote: "",
  referenceUrl: "", websiteUrl: "", inspectionNote: "", cooperatedProjects: "",
  score: "none", rating: "none", recommender: "",
};

export default function SupplierFormDialog({
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
      websiteUrl: form.websiteUrl || undefined,
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
          <div className="col-span-2 space-y-1.5">
            <Label>供应商/品牌名称 <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="如：杜亚、科思顿…" />
          </div>
          <div className="space-y-1.5">
            <Label>大类 <span className="text-destructive">*</span></Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>细分类别</Label>
            <Input value={form.subCategory} onChange={(e) => set("subCategory", e.target.value)} placeholder="如：电动窗帘、木地板…" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>联系方式</Label>
            <Input value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="微信号、电话、淘宝店名…" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>门店/工厂地址</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="城市、商场、具体地址…" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>官网主页</Label>
            <Input value={form.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>简介/主要产品</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="主营产品、特点、适用场景…" rows={3} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>造价水平</Label>
            <Textarea value={form.priceLevel} onChange={(e) => set("priceLevel", e.target.value)} placeholder="大概价格区间、单价参考…" rows={2} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>考察情况</Label>
            <Textarea value={form.inspectionNote} onChange={(e) => set("inspectionNote", e.target.value)} placeholder="是否实地考察、使用体验…" rows={2} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>合作过的项目</Label>
            <Input value={form.cooperatedProjects} onChange={(e) => set("cooperatedProjects", e.target.value)} placeholder="如：OOHLiVE清华科技园项目…" />
          </div>
          <div className="space-y-1.5">
            <Label>供应商来源</Label>
            <Input value={form.sourceNote} onChange={(e) => set("sourceNote", e.target.value)} placeholder="小红书、淘宝、朋友介绍…" />
          </div>
          <div className="space-y-1.5">
            <Label>推荐人</Label>
            <Input value={form.recommender} onChange={(e) => set("recommender", e.target.value)} placeholder="团队成员姓名…" />
          </div>
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
          <div className="col-span-2 space-y-1.5">
            <Label>参考链接（淘宝/小红书等）</Label>
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
