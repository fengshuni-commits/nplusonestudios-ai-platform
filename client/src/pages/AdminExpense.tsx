import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, FileText, BarChart3, TrendingUp,
  Download, FileSpreadsheet, Archive, Trash2, List, Search,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const CATEGORY_LABELS: Record<string, string> = {
  transport_local: "市内交通",
  transport_travel: "出差",
  office_supplies: "办公杂费",
  meals: "餐费",
  project_purchase: "项目采购",
  other: "其他",
};

const CATEGORY_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "待审批", variant: "secondary" },
  approved: { label: "已批准", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
  draft: { label: "草稿", variant: "outline" },
};

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2];

export default function AdminExpense() {
  const utils = trpc.useUtils();

  // ── Review tab state ───────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>("submitted");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ excelUrl: string; zipUrl: string; reportCount: number; totalAmount: number; invoiceCount: number } | null>(null);

  // ── Stats tab state ────────────────────────────────────
  const [statsYear, setStatsYear] = useState<number>(currentYear);

  // ── List tab state ─────────────────────────────────────
  const [listStatus, setListStatus] = useState<string>("all");
  const [listSearch, setListSearch] = useState("");
  const [listDateFrom, setListDateFrom] = useState("");
  const [listDateTo, setListDateTo] = useState("");
  const [listSelected, setListSelected] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleExportResults, setSingleExportResults] = useState<Record<number, { excelUrl: string; zipUrl: string }>>({});
  const [singleExporting, setSingleExporting] = useState<Set<number>>(new Set());
  const [bulkListExporting, setBulkListExporting] = useState(false);
  const [bulkListExportResult, setBulkListExportResult] = useState<{ excelUrl: string; zipUrl: string; reportCount: number; totalAmount: number; invoiceCount: number } | null>(null);

  // ── Queries ────────────────────────────────────────────
  const { data: reportsData, refetch: refetchReports } = trpc.expense.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
  });
  const reports = reportsData?.reports ?? [];

  const { data: detailReport } = trpc.expense.getById.useQuery(
    { id: detailId! },
    { enabled: detailId !== null }
  );

  const { data: statsData } = trpc.expense.projectStats.useQuery({ year: statsYear });

  // List tab query
  const listQueryInput = useMemo(() => ({
    status: listStatus === "all" ? undefined : listStatus,
    dateFrom: listDateFrom || undefined,
    dateTo: listDateTo || undefined,
    limit: 200,
  }), [listStatus, listDateFrom, listDateTo]);

  const { data: listData, refetch: refetchList } = trpc.expense.listAll.useQuery(listQueryInput);
  const allListReports = listData?.reports ?? [];

  // Client-side name search filter
  const listReports = useMemo(() => {
    if (!listSearch.trim()) return allListReports;
    const q = listSearch.trim().toLowerCase();
    return allListReports.filter((r: any) =>
      (r.submitterName ?? "").toLowerCase().includes(q) ||
      (r.purpose ?? "").toLowerCase().includes(q)
    );
  }, [allListReports, listSearch]);

  // ── Mutations ──────────────────────────────────────────
  const reviewMutation = trpc.expense.review.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approved" ? "已批准报销申请" : "已拒绝报销申请");
      setDetailId(null);
      setReviewNote("");
      refetchReports();
      utils.expense.list.invalidate();
    },
    onError: (e) => toast.error("操作失败：" + e.message),
  });

  const exportMutation = trpc.expense.export.useMutation({
    onSuccess: (data) => {
      setExportResult(data);
      toast.success(`导出成功：${data.reportCount} 份报销单，${data.invoiceCount} 张发票`);
    },
    onError: (e) => toast.error("导出失败：" + e.message),
  });

  const deleteMutation = trpc.expense.deleteReports.useMutation({
    onSuccess: (data) => {
      toast.success(`已删除 ${data.deleted} 份报销单`);
      setListSelected(new Set());
      setDeleteConfirmOpen(false);
      refetchList();
      utils.expense.listAll.invalidate();
    },
    onError: (e) => toast.error("删除失败：" + e.message),
  });

  const exportSingleMutation = trpc.expense.exportSingle.useMutation({
    onError: (e) => toast.error("导出失败：" + e.message),
  });

  const [editingCategoryItemId, setEditingCategoryItemId] = useState<number | null>(null);

  const updateItemCategoryMutation = trpc.expense.updateItemCategory.useMutation({
    onSuccess: () => {
      toast.success("费用类别已更新");
      setEditingCategoryItemId(null);
      utils.expense.getById.invalidate({ id: detailId! });
    },
    onError: (e) => toast.error("更新失败：" + e.message),
  });

  const bulkListExportMutation = trpc.expense.export.useMutation({
    onSuccess: (data) => {
      setBulkListExportResult(data);
      // Auto-download both files
      const ts = new Date().toISOString().slice(0, 10);
      const bulkAmountLabel = data.totalAmount != null ? `_${(data.totalAmount / 100).toFixed(2)}元` : "";
      const a1 = document.createElement("a"); a1.href = data.excelUrl; a1.download = `费用清单-${ts}${bulkAmountLabel}.xlsx`; a1.target = "_blank"; document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);
      setTimeout(() => { const a2 = document.createElement("a"); a2.href = data.zipUrl; a2.download = `发票-${ts}${bulkAmountLabel}.zip`; a2.target = "_blank"; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }, 500);
      toast.success(`导出成功：${data.reportCount} 份报销单，文件已开始下载`);
    },
    onError: (e) => toast.error("导出失败：" + e.message),
  });

  // ── Handlers ───────────────────────────────────────────
  const handleReview = async (action: "approved" | "rejected") => {
    if (!detailId) return;
    setReviewing(true);
    try {
      await reviewMutation.mutateAsync({ id: detailId, action, reviewNote: reviewNote || undefined });
    } finally {
      setReviewing(false);
    }
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) { toast.error("请先勾选要导出的报销单"); return; }
    setExporting(true);
    setExportResult(null);
    try {
      await exportMutation.mutateAsync({ reportIds: Array.from(selectedIds) });
    } finally {
      setExporting(false);
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === reports.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(reports.map((r: any) => r.id)));
  };

  // List tab handlers
  const toggleListSelect = (id: number) => {
    setListSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleListSelectAll = () => {
    if (listSelected.size === listReports.length) setListSelected(new Set());
    else setListSelected(new Set(listReports.map((r: any) => r.id)));
  };

  const handleDeleteSelected = () => {
    if (listSelected.size === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate({ ids: Array.from(listSelected) });
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSingleExport = async (id: number, reportPurpose?: string) => {
    setSingleExporting(prev => new Set(prev).add(id));
    try {
      const result = await exportSingleMutation.mutateAsync({ id });
      setSingleExportResults(prev => ({ ...prev, [id]: { excelUrl: result.excelUrl, zipUrl: result.zipUrl } }));
      // Auto-download both files
      const safeName = (reportPurpose ?? String(id)).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "_").slice(0, 20);
      const amountLabel = result.totalAmount != null ? `_${(result.totalAmount / 100).toFixed(2)}元` : "";
      triggerDownload(result.excelUrl, `费用清单-${safeName}${amountLabel}.xlsx`);
      setTimeout(() => triggerDownload(result.zipUrl, `发票-${safeName}${amountLabel}.zip`), 500);
      toast.success("导出成功，文件已开始下载");
    } finally {
      setSingleExporting(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleBulkListExport = async () => {
    if (listSelected.size === 0) { toast.error("请先勾选要导出的报销单"); return; }
    setBulkListExporting(true);
    setBulkListExportResult(null);
    try {
      await bulkListExportMutation.mutateAsync({ reportIds: Array.from(listSelected) });
    } finally {
      setBulkListExporting(false);
    }
  };

  // ── Stats derived data ─────────────────────────────────
  const byPerson = (statsData?.byPerson ?? []).map((row: any) => ({
    name: row.submitterName ?? `用户${row.userId}`,
    amount: Number(row.totalAmount) / 100,
    count: Number(row.reportCount),
  }));

  const byProject = (statsData?.byProject ?? []).map((row: any) => ({
    name: row.projectName ?? "公司公共费用",
    amount: Number(row.totalAmount) / 100,
    count: Number(row.itemCount),
  }));

  const byCategory = (statsData?.byCategory ?? []).map((row: any) => ({
    name: CATEGORY_LABELS[row.category] ?? row.category,
    amount: Number(row.totalAmount) / 100,
    count: Number(row.itemCount),
  }));

  const totalApproved = Number(statsData?.totalApproved ?? 0) / 100;

  const approvedSelected = reports.filter((r: any) => selectedIds.has(r.id) && r.status === "approved");
  const allSelected = reports.length > 0 && selectedIds.size === reports.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < reports.length;

  const listAllSelected = listReports.length > 0 && listSelected.size === listReports.length;
  const listSomeSelected = listSelected.size > 0 && listSelected.size < listReports.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">报销管理</h1>
        <p className="text-muted-foreground text-sm mt-1">审批报销申请，查看项目支出统计，导出费用清单</p>
      </div>

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">审批队列</TabsTrigger>
          <TabsTrigger value="list"><List className="w-3.5 h-3.5 mr-1.5" />报销列表</TabsTrigger>
          <TabsTrigger value="stats">项目成本统计</TabsTrigger>
        </TabsList>

        {/* ── Review Tab ── */}
        <TabsContent value="review" className="pt-4 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setSelectedIds(new Set()); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="submitted">待审批</SelectItem>
                <SelectItem value="approved">已批准</SelectItem>
                <SelectItem value="rejected">已拒绝</SelectItem>
                <SelectItem value="all">全部</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{reports.length} 条</span>

            {reports.length > 0 && (
              <div className="flex items-center gap-1.5 ml-2">
                <Checkbox
                  checked={allSelected}
                  ref={el => { if (el) (el as any).indeterminate = someSelected; }}
                  onCheckedChange={toggleSelectAll}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-sm cursor-pointer select-none">全选</label>
              </div>
            )}

            {selectedIds.size > 0 && (
              <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting} className="ml-auto gap-1.5">
                <Download className="w-4 h-4" />
                {exporting ? "生成中…" : `导出已选 (${selectedIds.size})`}
              </Button>
            )}
          </div>

          {exportResult && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm mb-1">
                      导出完成：{exportResult.reportCount} 份报销单 · {exportResult.invoiceCount} 张发票 · 合计 ¥{(exportResult.totalAmount / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">文件已生成，点击下载（链接 24 小时内有效）</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" asChild>
                      <a href={exportResult.excelUrl} download target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <FileSpreadsheet className="w-4 h-4" /> 费用清单 .xlsx
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={exportResult.zipUrl} download target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <Archive className="w-4 h-4" /> 发票压缩包 .zip
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {reports.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>暂无{statusFilter === "submitted" ? "待审批" : ""}报销申请</p>
            </div>
          )}

          <div className="space-y-3">
            {reports.map((report: any) => {
              const statusInfo = STATUS_LABELS[report.status] ?? STATUS_LABELS.submitted;
              const isSelected = selectedIds.has(report.id);
              return (
                <Card
                  key={report.id}
                  className={`cursor-pointer hover:bg-accent/40 transition-colors ${isSelected ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                  onClick={() => { setDetailId(report.id); setReviewNote(""); }}
                >
                  <CardContent className="py-4 flex items-center gap-3">
                    <div onClick={e => toggleSelect(report.id, e)} className="flex-shrink-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(report.id)) next.delete(report.id); else next.add(report.id);
                            return next;
                          });
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{report.purpose}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">{report.submitterName ?? "未知"}</span>
                        {report.projectName ? ` · ${report.projectName}` : " · 公司公共费用"}
                        {" · "}
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

          {selectedIds.size > 0 && (
            <div className="text-sm text-muted-foreground pt-1">
              已选 {selectedIds.size} 份，其中已批准 {approvedSelected.length} 份
              {approvedSelected.length < selectedIds.size && (
                <span className="text-amber-600 ml-1">（未批准的报销单也会包含在导出中）</span>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── List Tab ── */}
        <TabsContent value="list" className="pt-4 space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={listStatus} onValueChange={v => { setListStatus(v); setListSelected(new Set()); }}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="submitted">待审批</SelectItem>
                <SelectItem value="approved">已批准</SelectItem>
                <SelectItem value="rejected">已拒绝</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索报销人/事由"
                value={listSearch}
                onChange={e => setListSearch(e.target.value)}
                className="pl-8 w-48"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">从</span>
              <Input type="date" value={listDateFrom} onChange={e => setListDateFrom(e.target.value)} className="w-36 text-sm" />
              <span className="text-xs text-muted-foreground">到</span>
              <Input type="date" value={listDateTo} onChange={e => setListDateTo(e.target.value)} className="w-36 text-sm" />
            </div>

            <span className="text-sm text-muted-foreground">{listReports.length} 条</span>

            {/* Bulk actions */}
            <div className="ml-auto flex items-center gap-2">
              {listSelected.size > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={handleBulkListExport} disabled={bulkListExporting} className="gap-1.5">
                    <Download className="w-4 h-4" />
                    {bulkListExporting ? "生成中…" : `批量导出 (${listSelected.size})`}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleDeleteSelected} className="gap-1.5">
                    <Trash2 className="w-4 h-4" />
                    删除 ({listSelected.size})
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Bulk export result */}
          {bulkListExportResult && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium">
                    导出完成：{bulkListExportResult.reportCount} 份 · 合计 ¥{(bulkListExportResult.totalAmount / 100).toFixed(2)}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={bulkListExportResult.excelUrl} download target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <FileSpreadsheet className="w-4 h-4" /> .xlsx
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={bulkListExportResult.zipUrl} download target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <Archive className="w-4 h-4" /> .zip
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          {listReports.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>暂无报销记录</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={listAllSelected}
                        ref={el => { if (el) (el as any).indeterminate = listSomeSelected; }}
                        onCheckedChange={toggleListSelectAll}
                      />
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">报销人</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">报销事由</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">提交时间</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">金额</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">状态</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {listReports.map((report: any) => {
                    const statusInfo = STATUS_LABELS[report.status] ?? STATUS_LABELS.submitted;
                    const isSelected = listSelected.has(report.id);
                    const exportRes = singleExportResults[report.id];
                    const isExporting = singleExporting.has(report.id);
                    return (
                      <tr
                        key={report.id}
                        className={`border-t hover:bg-accent/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-2.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleListSelect(report.id)}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                          {report.submitterName ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 max-w-xs">
                          <div className="truncate">{report.purpose}</div>
                          {report.projectName && (
                            <div className="text-xs text-muted-foreground truncate">{report.projectName}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {new Date(report.createdAt).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                          ¥{(report.totalAmount / 100).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {exportRes ? (
                              <>
                                <Button size="sm" variant="ghost" asChild className="h-7 px-2 gap-1 text-xs">
                                  <a href={exportRes.excelUrl} download target="_blank" rel="noopener noreferrer">
                                    <FileSpreadsheet className="w-3.5 h-3.5" /> xlsx
                                  </a>
                                </Button>
                                <Button size="sm" variant="ghost" asChild className="h-7 px-2 gap-1 text-xs">
                                  <a href={exportRes.zipUrl} download target="_blank" rel="noopener noreferrer">
                                    <Archive className="w-3.5 h-3.5" /> zip
                                  </a>
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSingleExport(report.id, report.purpose)}
                                disabled={isExporting}
                                className="h-7 px-2 gap-1 text-xs"
                              >
                                <Download className="w-3.5 h-3.5" />
                                {isExporting ? "…" : "导出"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setListSelected(new Set([report.id])); setDeleteConfirmOpen(true); }}
                              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Stats Tab ── */}
        <TabsContent value="stats" className="pt-4 space-y-6">
          <div className="flex items-center gap-3">
            <Select value={String(statsYear)} onValueChange={v => setStatsYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(y => (
                  <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              已批准报销总额：<span className="font-semibold text-foreground">¥{totalApproved.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> 按报销人支出
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byPerson.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">暂无数据</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={byPerson} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `¥${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip formatter={(v: any) => [`¥${Number(v).toFixed(2)}`, "金额"]} />
                      <Bar dataKey="amount" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> 费用类别分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byCategory.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">暂无数据</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="amount"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {byCategory.map((_: any, i: number) => (
                          <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`¥${Number(v).toFixed(2)}`, "金额"]} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> 按承担项目支出
              </CardTitle>
            </CardHeader>
            <CardContent>
              {byProject.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byProject} margin={{ top: 4, right: 8, bottom: 48, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `¥${v}`} />
                    <Tooltip formatter={(v: any) => [`¥${Number(v).toFixed(2)}`, "金额"]} />
                    <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {byPerson.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">报销人明细</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">姓名</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">报销单数</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">已批准金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPerson.map((row: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">{row.name}</td>
                          <td className="py-2 text-right text-muted-foreground">{row.count} 份</td>
                          <td className="py-2 text-right font-semibold">¥{row.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold bg-muted/30">
                        <td className="py-2 text-muted-foreground">合计</td>
                        <td className="py-2 text-right text-muted-foreground">{byPerson.reduce((s: number, r: any) => s + r.count, 0)} 份</td>
                        <td className="py-2 text-right">¥{totalApproved.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {byProject.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">项目支出明细</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">项目</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">费用条数</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">已批准金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byProject.map((row: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">{row.name}</td>
                          <td className="py-2 text-right text-muted-foreground">{row.count} 条</td>
                          <td className="py-2 text-right font-semibold">¥{row.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold bg-muted/30">
                        <td className="py-2 text-muted-foreground">合计</td>
                        <td className="py-2 text-right text-muted-foreground">{byProject.reduce((s: number, r: any) => s + r.count, 0)} 条</td>
                        <td className="py-2 text-right">¥{byProject.reduce((s: number, r: any) => s + r.amount, 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail / Review Dialog */}
      <Dialog open={detailId !== null} onOpenChange={open => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>报销单详情</DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">提交人：</span>{detailReport.submitterName ?? "—"}</div>
                <div><span className="text-muted-foreground">项目：</span>{detailReport.projectName ?? "公司公共费用"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">用途：</span>{detailReport.purpose}</div>
                {(detailReport as any).payeeName && (
                  <div><span className="text-muted-foreground">收款人：</span>{(detailReport as any).payeeName}</div>
                )}
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
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">承担项目</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">金额</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">发票</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailReport.items.map((item: any) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{new Date(item.expenseDate).toLocaleDateString("zh-CN")}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2">
                          {detailReport.status === "approved" ? (
                            editingCategoryItemId === item.id ? (
                              <Select
                                value={item.category}
                                onValueChange={(val) => {
                                  updateItemCategoryMutation.mutate({ itemId: item.id, category: val as any });
                                }}
                                onOpenChange={(open) => { if (!open) setEditingCategoryItemId(null); }}
                              >
                                <SelectTrigger className="h-7 text-xs w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <button
                                onClick={() => setEditingCategoryItemId(item.id)}
                                className="text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                                title="点击修改类别"
                              >
                                {CATEGORY_LABELS[item.category] ?? item.category}
                              </button>
                            )
                          ) : (
                            <span className="text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{item.projectName ?? "公司公共费用"}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {item.correctionAmount != null
                            ? <><span className="line-through text-muted-foreground text-xs mr-1">¥{(item.amount / 100).toFixed(2)}</span>¥{(item.correctionAmount / 100).toFixed(2)}</>  
                            : <>¥{(item.amount / 100).toFixed(2)}</>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {(() => {
                            const invs: { url: string; fileName: string; amount?: number | null }[] =
                              (item as any).invoicesJson
                                ? (() => { try { return JSON.parse((item as any).invoicesJson); } catch { return []; } })()
                                : item.invoiceUrl
                                  ? [{ url: item.invoiceUrl, fileName: "发票" }]
                                  : [];
                            const didiUrl = (item as any).didiTripReceiptUrl;
                            const didiName = (item as any).didiTripReceiptFileName ?? "行程报销单";
                            return (
                              <div className="flex flex-col gap-0.5">
                                {invs.map((inv, i) => (
                                  <a key={i} href={inv.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                                    发票{invs.length > 1 ? i + 1 : ""}
                                    {inv.amount != null ? ` ¥${Number(inv.amount).toFixed(2)}` : ""}
                                  </a>
                                ))}
                                {didiUrl && (
                                  <a href={didiUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline text-xs">
                                    🚖 {didiName}
                                  </a>
                                )}
                                {invs.length === 0 && !didiUrl && <span className="text-muted-foreground text-xs">—</span>}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">合计</td>
                      <td className="px-3 py-2 text-right">¥{(detailReport.totalAmount / 100).toFixed(2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {detailReport.status === "submitted" && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="审批意见（可选）"
                    value={reviewNote}
                    onChange={e => setReviewNote(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {detailReport?.status === "submitted" && (
              <>
                <Button variant="destructive" onClick={() => handleReview("rejected")} disabled={reviewing}>
                  <XCircle className="w-4 h-4 mr-1" /> 拒绝
                </Button>
                <Button onClick={() => handleReview("approved")} disabled={reviewing}>
                  <CheckCircle className="w-4 h-4 mr-1" /> 批准
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            即将删除 <span className="font-semibold text-foreground">{listSelected.size}</span> 份报销单及其所有明细记录，此操作不可撤销。
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
