import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Upload, FileText, ChevronDown, ChevronUp, X, Paperclip } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  transport_local: "市内交通",
  transport_travel: "出差（机票/火车/酒店）",
  office_supplies: "办公杂费（水电/消耗品）",
  meals: "餐费",
  other: "其他",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "待审批", variant: "secondary" },
  approved: { label: "已批准", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
  draft: { label: "草稿", variant: "outline" },
};

type ExpenseItem = {
  id: string;
  expenseDate: string;
  category: "transport_local" | "transport_travel" | "office_supplies" | "meals" | "other";
  description: string;
  amount: string;
  projectId: string; // required
  invoiceUrl?: string;
  invoiceFileName?: string;
  uploading?: boolean;
};

function newItem(): ExpenseItem {
  return {
    id: Math.random().toString(36).slice(2),
    expenseDate: new Date().toISOString().slice(0, 10),
    category: "transport_local",
    description: "",
    amount: "",
    projectId: "",
  };
}

export default function Expense() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── Submit form state ──────────────────────────────────
  const [purpose, setPurpose] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);

  // ── Detail dialog ──────────────────────────────────────
  const [detailId, setDetailId] = useState<number | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Queries ────────────────────────────────────────────
  // Only show projects the current user is a member of
  const { data: projects = [] } = trpc.projects.list.useQuery({ memberOnly: true });

  const { data: myReports, refetch: refetchReports } = trpc.expense.list.useQuery({ mine: true, limit: 50 });
  const { data: detailReport } = trpc.expense.getById.useQuery(
    { id: detailId! },
    { enabled: detailId !== null }
  );

  // ── Mutations ──────────────────────────────────────────
  const uploadInvoice = trpc.expense.uploadInvoice.useMutation();
  const submitReport = trpc.expense.submit.useMutation({
    onSuccess: () => {
      toast.success("报销申请已提交，等待审批");
      setPurpose(""); setPeriodStart(""); setPeriodEnd(""); setNote("");
      setItems([newItem()]);
      refetchReports();
      utils.expense.list.invalidate();
    },
    onError: (e) => toast.error("提交失败：" + e.message),
  });

  // ── Item helpers ───────────────────────────────────────
  const updateItem = (id: string, patch: Partial<ExpenseItem>) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));

  const removeItem = (id: string) =>
    setItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);

  const handleInvoiceUpload = async (itemId: string, file: File) => {
    updateItem(itemId, { uploading: true });
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadInvoice.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });
      updateItem(itemId, { invoiceUrl: url, invoiceFileName: file.name, uploading: false });
      toast.success("发票上传成功");
    } catch {
      updateItem(itemId, { uploading: false });
      toast.error("发票上传失败");
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!purpose.trim()) { toast.error("请填写报销用途"); return; }
    const validItems = items.filter(i => i.description.trim() && parseFloat(i.amount) > 0);
    if (validItems.length === 0) { toast.error("请至少填写一条有效的费用明细"); return; }
    const missingProject = validItems.find(i => !i.projectId);
    if (missingProject) { toast.error("每条费用明细必须选择承担项目"); return; }

    setSubmitting(true);
    try {
      await submitReport.mutateAsync({
        purpose,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        note: note || undefined,
        items: validItems.map(item => {
          const proj = (projects as any[]).find((p: any) => p.id === parseInt(item.projectId));
          return {
            expenseDate: item.expenseDate,
            category: item.category,
            description: item.description,
            amount: parseFloat(item.amount),
            projectId: parseInt(item.projectId),
            projectName: proj?.name ?? proj?.clientNameDisplay ?? undefined,
            invoiceUrl: item.invoiceUrl,
            invoiceFileName: item.invoiceFileName,
          };
        }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">费用报销</h1>
        <p className="text-muted-foreground text-sm mt-1">提交报销申请，上传发票，关联项目</p>
      </div>

      <Tabs defaultValue="submit">
        <TabsList>
          <TabsTrigger value="submit">提交报销</TabsTrigger>
          <TabsTrigger value="history">我的申请</TabsTrigger>
        </TabsList>

        {/* ── Submit Tab ── */}
        <TabsContent value="submit" className="space-y-6 pt-4">
          {/* Basic info */}
          <Card>
            <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label>报销用途 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="例：2026年1月日常办公费用+交通费报销"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>报销期间</Label>
                <div className="flex gap-2 items-center">
                  <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="flex-1" />
                  <span className="text-muted-foreground text-sm">至</span>
                  <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="flex-1" />
                </div>
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>备注</Label>
                <Textarea placeholder="其他说明（可选）" value={note} onChange={e => setNote(e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>

          {/* Expense items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">费用明细</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, newItem()])}>
                <Plus className="w-4 h-4 mr-1" /> 添加一行
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Header row */}
              <div className="hidden md:grid grid-cols-[110px_1fr_1fr_140px_90px_120px_36px] gap-2 text-xs text-muted-foreground px-1">
                <span>日期</span><span>摘要</span><span>承担项目 <span className="text-destructive">*</span></span><span>费用类别</span><span>金额（元）</span><span>发票</span><span />
              </div>
              {items.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-[110px_1fr_1fr_140px_90px_120px_36px] gap-2 items-center border rounded-lg p-3 md:p-2 md:border-0 md:rounded-none md:border-b last:border-b-0">
                  <div className="space-y-1 md:space-y-0">
                    <Label className="md:hidden text-xs text-muted-foreground">日期</Label>
                    <Input type="date" value={item.expenseDate} onChange={e => updateItem(item.id, { expenseDate: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1 md:space-y-0">
                    <Label className="md:hidden text-xs text-muted-foreground">摘要</Label>
                    <Input
                      placeholder="摘要（写清楚几张票据）"
                      value={item.description}
                      onChange={e => updateItem(item.id, { description: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1 md:space-y-0">
                    <Label className="md:hidden text-xs text-muted-foreground">承担项目 <span className="text-destructive">*</span></Label>
                    <Select value={item.projectId} onValueChange={v => updateItem(item.id, { projectId: v })}>
                      <SelectTrigger className={`text-sm ${!item.projectId ? 'border-destructive/50' : ''}`}>
                        <SelectValue placeholder="选择项目…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(projects as any[]).length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">您尚未加入任何项目</div>
                        )}
                        {(projects as any[]).map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}{p.clientNameDisplay ? ` · ${p.clientNameDisplay}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:space-y-0">
                    <Label className="md:hidden text-xs text-muted-foreground">费用类别</Label>
                    <Select value={item.category} onValueChange={v => updateItem(item.id, { category: v as any })}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:space-y-0">
                    <Label className="md:hidden text-xs text-muted-foreground">金额（元）</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={e => updateItem(item.id, { amount: e.target.value })}
                      className="text-sm"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-1 md:space-y-0">
                    <Label className="md:hidden text-xs text-muted-foreground">发票</Label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      ref={el => { fileInputRefs.current[item.id] = el; }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleInvoiceUpload(item.id, file);
                        e.target.value = "";
                      }}
                    />
                    {item.invoiceUrl ? (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <Paperclip className="w-3 h-3 flex-shrink-0" />
                        <a href={item.invoiceUrl} target="_blank" rel="noopener noreferrer" className="truncate max-w-[100px] hover:underline">
                          {item.invoiceFileName ?? "发票"}
                        </a>
                        <button onClick={() => updateItem(item.id, { invoiceUrl: undefined, invoiceFileName: undefined })} className="text-muted-foreground hover:text-destructive ml-auto">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-8"
                        disabled={item.uploading}
                        onClick={() => fileInputRefs.current[item.id]?.click()}
                      >
                        {item.uploading ? "上传中…" : <><Upload className="w-3 h-3 mr-1" />上传发票</>}
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-end pt-2 border-t">
                <div className="text-sm text-muted-foreground mr-4">合计</div>
                <div className="text-lg font-semibold">¥{totalAmount.toFixed(2)}</div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting} size="lg">
              {submitting ? "提交中…" : "提交报销申请"}
            </Button>
          </div>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="pt-4">
          <div className="space-y-3">
            {!myReports?.reports?.length && (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>暂无报销记录</p>
              </div>
            )}
            {myReports?.reports?.map(report => {
              const statusInfo = STATUS_LABELS[report.status] ?? STATUS_LABELS.submitted;
              return (
                <Card
                  key={report.id}
                  className="cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => setDetailId(report.id)}
                >
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{report.purpose}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {report.projectName ? `项目：${report.projectName} · ` : "公司公共费用 · "}
                        {new Date(report.createdAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-semibold text-sm">¥{(report.totalAmount / 100).toFixed(2)}</span>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={open => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>报销单详情</DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">用途：</span>{detailReport.purpose}</div>
                <div><span className="text-muted-foreground">项目：</span>{detailReport.projectName ?? "公司公共费用"}</div>
                <div><span className="text-muted-foreground">提交时间：</span>{new Date(detailReport.createdAt).toLocaleString("zh-CN")}</div>
                <div><span className="text-muted-foreground">状态：</span>
                  <Badge variant={STATUS_LABELS[detailReport.status]?.variant ?? "secondary"} className="ml-1">
                    {STATUS_LABELS[detailReport.status]?.label ?? detailReport.status}
                  </Badge>
                </div>
                {detailReport.reviewNote && (
                  <div className="col-span-2"><span className="text-muted-foreground">审批意见：</span>{detailReport.reviewNote}</div>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">日期</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">摘要</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">类别</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">金额</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">发票</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailReport.items.map(item => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{new Date(item.expenseDate).toLocaleDateString("zh-CN")}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                        <td className="px-3 py-2 text-right font-medium">¥{(item.amount / 100).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          {item.invoiceUrl ? (
                            <a href={item.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                              查看
                            </a>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">合计</td>
                      <td className="px-3 py-2 text-right">¥{(detailReport.totalAmount / 100).toFixed(2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              {detailReport.note && (
                <div className="text-sm text-muted-foreground border rounded p-3">{detailReport.note}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
