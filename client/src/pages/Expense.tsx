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
import { toast } from "sonner";
import { Plus, Trash2, Upload, FileText, X, Paperclip } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

const CATEGORY_LABELS: Record<string, string> = {
  transport_local: "市内交通",
  transport_travel: "出差（机票/火车/酒店）",
  office_supplies: "办公杂费",
  meals: "餐费",
  other: "其他",
};

const CATEGORY_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6"];

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "待审批", variant: "secondary" },
  approved: { label: "已批准", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
  draft: { label: "草稿", variant: "outline" },
};

type InvoiceFile = {
  url: string;
  fileName: string;
  amount: number | null;
};

type ExpenseItem = {
  id: string;
  expenseDate: string;
  category: "transport_local" | "transport_travel" | "office_supplies" | "meals" | "other";
  description: string;
  amount: string;
  projectId: string;
  invoices: InvoiceFile[];
  uploading?: boolean;
  amountAutoFilled?: boolean;
};

function newItem(): ExpenseItem {
  return {
    id: Math.random().toString(36).slice(2),
    expenseDate: new Date().toISOString().slice(0, 10),
    category: "transport_local",
    description: "",
    amount: "",
    projectId: "",
    invoices: [],
  };
}

const currentYear = new Date().getFullYear();

export default function Expense() {
  useAuth();
  const utils = trpc.useUtils();

  // ── Submit form state ──────────────────────────────────
  const [purpose, setPurpose] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [statsYear, setStatsYear] = useState(currentYear);

  // ── Detail dialog ──────────────────────────────────────
  const [detailId, setDetailId] = useState<number | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Queries ────────────────────────────────────────────
  const { data: projects = [] } = trpc.projects.list.useQuery({ memberOnly: true });
  const { data: myReports, refetch: refetchReports } = trpc.expense.list.useQuery({ mine: true, limit: 100 });
  const { data: myStats } = trpc.expense.myStats.useQuery({ year: statsYear });
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
      utils.expense.myStats.invalidate();
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
      const result = await uploadInvoice.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });
      const newInvoice: InvoiceFile = {
        url: result.url,
        fileName: file.name,
        amount: (result as any).detectedAmount ?? null,
      };
      setItems(prev => prev.map(item => {
        if (item.id !== itemId) return item;
        const updatedInvoices = [...item.invoices, newInvoice];
        const detectedAmounts = updatedInvoices
          .map(inv => inv.amount)
          .filter((a): a is number => typeof a === "number" && a > 0);
        const autoAmount = detectedAmounts.length > 0
          ? detectedAmounts.reduce((s, a) => s + a, 0).toFixed(2)
          : item.amount;
        return { ...item, invoices: updatedInvoices, uploading: false, amount: autoAmount, amountAutoFilled: detectedAmounts.length > 0 };
      }));
      if ((result as any).detectedAmount) {
        toast.success(`发票上传成功，识别金额：¥${(result as any).detectedAmount.toFixed(2)}`);
      } else {
        toast.success("发票上传成功（未识别到金额，请手动填写）");
      }
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
            invoices: item.invoices.length > 0 ? item.invoices : undefined,
          };
        }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stats data ─────────────────────────────────────────
  const categoryData = (myStats?.byCategory ?? []).map((r: any, i: number) => ({
    name: CATEGORY_LABELS[r.category] ?? r.category,
    value: Math.round(r.totalAmount / 100),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const projectData = (myStats?.byProject ?? []).slice(0, 8).map((r: any) => ({
    name: r.projectName ?? `项目${r.projectId}`,
    金额: Math.round(r.totalAmount / 100),
  }));

  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <div className="flex gap-6 px-6 py-6 h-full min-h-0">
      {/* ── LEFT: Submit Form ── */}
      <div className="w-[52%] flex-shrink-0 overflow-y-auto space-y-5 pr-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">费用报销</h1>
          <p className="text-muted-foreground text-xs mt-0.5">提交报销申请，上传发票，关联项目</p>
        </div>

        {/* Basic info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">基本信息</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">报销用途 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="例：2026年1月日常办公费用+交通费报销"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">报销期间</Label>
              <div className="flex gap-2 items-center">
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="flex-1 text-sm" />
                <span className="text-muted-foreground text-xs">至</span>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="flex-1 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">备注</Label>
              <Textarea placeholder="其他说明（可选）" value={note} onChange={e => setNote(e.target.value)} rows={2} className="text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Expense items */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">费用明细</CardTitle>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setItems(prev => [...prev, newItem()])}>
              <Plus className="w-3 h-3 mr-1" /> 添加一行
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 space-y-2.5 relative">
                {/* Row 1: date + category + amount */}
                <div className="grid grid-cols-[120px_1fr_90px_28px] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">日期</Label>
                    <Input type="date" value={item.expenseDate} onChange={e => updateItem(item.id, { expenseDate: e.target.value })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">费用类别</Label>
                    <Select value={item.category} onValueChange={v => updateItem(item.id, { category: v as any })}>
                      <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">金额（元）</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={e => updateItem(item.id, { amount: e.target.value, amountAutoFilled: false })}
                      className="text-xs h-8"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-7 text-muted-foreground hover:text-destructive self-end"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Row 2: description + project */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">摘要</Label>
                    <Input
                      placeholder="写清楚几张票据"
                      value={item.description}
                      onChange={e => updateItem(item.id, { description: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">承担项目 <span className="text-destructive">*</span></Label>
                    <Select value={item.projectId} onValueChange={v => updateItem(item.id, { projectId: v })}>
                      <SelectTrigger className={`text-xs h-8 ${!item.projectId ? "border-destructive/50" : ""}`}>
                        <SelectValue placeholder="选择项目…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(projects as any[]).length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">您尚未加入任何项目</div>
                        )}
                        {(projects as any[]).map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                            {p.name}{p.clientNameDisplay ? ` · ${p.clientNameDisplay}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 3: invoices */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">发票</Label>
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
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {item.invoices.map((inv, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-xs text-primary bg-primary/5 rounded px-1.5 py-0.5 max-w-[160px]">
                        <Paperclip className="w-3 h-3 flex-shrink-0" />
                        <a href={inv.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex-1">
                          {inv.fileName}
                        </a>
                        {inv.amount != null && (
                          <span className="text-green-600 font-medium flex-shrink-0">¥{inv.amount.toFixed(2)}</span>
                        )}
                        <button
                          onClick={() => {
                            const updated = item.invoices.filter((_, i) => i !== idx);
                            const detectedAmounts = updated.map(i => i.amount).filter((a): a is number => typeof a === "number" && a > 0);
                            updateItem(item.id, {
                              invoices: updated,
                              amount: detectedAmounts.length > 0 ? detectedAmounts.reduce((s, a) => s + a, 0).toFixed(2) : item.amount,
                            });
                          }}
                          className="text-muted-foreground hover:text-destructive flex-shrink-0 ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      disabled={item.uploading}
                      onClick={() => fileInputRefs.current[item.id]?.click()}
                    >
                      {item.uploading ? "识别中…" : <><Upload className="w-3 h-3 mr-1" />{item.invoices.length > 0 ? "继续添加" : "上传发票"}</>}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="flex justify-end pt-1 border-t">
              <span className="text-sm text-muted-foreground mr-3">合计</span>
              <span className="text-base font-semibold">¥{totalAmount.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-4">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "提交中…" : "提交报销申请"}
          </Button>
        </div>
      </div>

      {/* ── RIGHT: History + Stats ── */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-5">
        {/* My reports */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">我的申请</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {!myReports?.reports?.length && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无报销记录</p>
              </div>
            )}
            {myReports?.reports?.map(report => {
              const statusInfo = STATUS_LABELS[report.status] ?? STATUS_LABELS.submitted;
              return (
                <div
                  key={report.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => setDetailId(report.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs truncate">{report.purpose}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(report.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-xs">¥{(report.totalAmount / 100).toFixed(2)}</span>
                    <Badge variant={statusInfo.variant} className="text-xs px-1.5 py-0">{statusInfo.label}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">费用统计（已批准）</CardTitle>
            <Select value={String(statsYear)} onValueChange={v => setStatsYear(Number(v))}>
              <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y} value={String(y)} className="text-xs">{y}年</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">已批准总额</div>
                <div className="text-lg font-semibold">¥{((myStats?.totalApproved ?? 0) / 100).toFixed(2)}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">待审批金额</div>
                <div className="text-lg font-semibold text-amber-600">¥{((myStats?.totalSubmitted ?? 0) / 100).toFixed(2)}</div>
              </div>
            </div>

            {/* Category pie chart */}
            {categoryData.length > 0 ? (
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-medium">按费用类别</div>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                        {categoryData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => `¥${v}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {categoryData.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                          <span className="text-muted-foreground truncate max-w-[90px]">{entry.name}</span>
                        </div>
                        <span className="font-medium">¥{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-muted-foreground">暂无已批准的费用数据</div>
            )}

            {/* Project bar chart */}
            {projectData.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-medium">按承担项目</div>
                <ResponsiveContainer width="100%" height={Math.max(80, projectData.length * 28)}>
                  <BarChart data={projectData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `¥${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(v: any) => `¥${v}`} />
                    <Bar dataKey="金额" fill="#6366f1" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                <div>
                  <span className="text-muted-foreground">状态：</span>
                  <Badge variant={STATUS_LABELS[detailReport.status]?.variant ?? "secondary"} className="ml-1">
                    {STATUS_LABELS[detailReport.status]?.label ?? detailReport.status}
                  </Badge>
                </div>
                <div><span className="text-muted-foreground">提交时间：</span>{new Date(detailReport.createdAt).toLocaleString("zh-CN")}</div>
                {detailReport.reviewNote && (
                  <div className="col-span-2"><span className="text-muted-foreground">审批意见：</span>{detailReport.reviewNote}</div>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">日期</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">摘要</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">类别</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">项目</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">金额</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">发票</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailReport.items.map(item => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(item.expenseDate).toLocaleDateString("zh-CN")}</td>
                        <td className="px-3 py-2 text-xs">{item.description}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{(item as any).projectName ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-medium text-xs">¥{(item.amount / 100).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          {(() => {
                            const invs: { url: string; fileName: string; amount?: number | null }[] =
                              (item as any).invoicesJson
                                ? (() => { try { return JSON.parse((item as any).invoicesJson); } catch { return []; } })()
                                : item.invoiceUrl
                                  ? [{ url: item.invoiceUrl, fileName: (item as any).invoiceFileName ?? "发票" }]
                                  : [];
                            return invs.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {invs.map((inv, i) => (
                                  <a key={i} href={inv.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                                    发票{invs.length > 1 ? i + 1 : ""}
                                    {inv.amount != null ? ` ¥${Number(inv.amount).toFixed(2)}` : ""}
                                  </a>
                                ))}
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground text-xs">合计</td>
                      <td className="px-3 py-2 text-right text-xs">¥{(detailReport.totalAmount / 100).toFixed(2)}</td>
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
