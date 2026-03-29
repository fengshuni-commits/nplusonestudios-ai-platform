import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Pencil, Trash2, GripVertical, ImagePlus, X, Loader2, Eye, EyeOff, Palette, Layout,
  Upload, Sparkles, CheckCircle2, AlertCircle, Clock, FileText, Image, FileUp, Trash, RefreshCw
} from "lucide-react";

// ─── PPT Layout Standards ─────────────────────────────────────────────────────

const PPT_LAYOUTS = [
  {
    id: "cover",
    name: "封面页",
    description: "演示文稿首页，大标题 + 副标题，右侧配图，左侧铜色竖线装饰",
    bg: "#1A1A2E",
    accent: "#B87333",
    textColor: "#FFFFFF",
    usage: "每份 PPT 必有，仅用于第 1 页",
    bullets: ["主标题（项目名称）", "副标题（汇报类型、日期）", "右侧全出血配图（可选）"],
  },
  {
    id: "toc",
    name: "目录页",
    description: "章节目录，编号列表，左侧铜色粗线装饰",
    bg: "#FAF8F5",
    accent: "#B87333",
    textColor: "#2C2C2C",
    usage: "PPT 第 2 页，列出所有章节标题",
    bullets: ["目录标题", "章节编号（01、02…）", "各章节名称"],
  },
  {
    id: "section_intro",
    name: "章节过渡页",
    description: "章节开篇，大标题 + 简短说明，右侧可配图",
    bg: "#F5F0EB",
    accent: "#B87333",
    textColor: "#2C2C2C",
    usage: "每个新章节的第一页",
    bullets: ["章节标题", "章节简介（1-2 句）", "右侧配图（可选）"],
  },
  {
    id: "case_study",
    name: "案例分析页",
    description: "左文右图布局，适合展示具体项目案例",
    bg: "#FAF8F5",
    accent: "#B87333",
    textColor: "#2C2C2C",
    usage: "项目案例、设计方案展示",
    bullets: ["案例标题", "案例说明（副标题）", "要点列表（3-5 条）", "右侧配图"],
  },
  {
    id: "insight",
    name: "洞察/分析页",
    description: "上图下文布局，适合数据分析和设计洞察",
    bg: "#F5F0EB",
    accent: "#B87333",
    textColor: "#2C2C2C",
    usage: "设计分析、市场洞察、研究结论",
    bullets: ["分析标题", "上方配图（可选）", "要点列表（3-5 条）"],
  },
  {
    id: "quote",
    name: "引言页",
    description: "深色全屏背景，大字引言，左侧铜色竖线，引号装饰",
    bg: "#1A1A2E",
    accent: "#B87333",
    textColor: "#FFFFFF",
    usage: "设计理念陈述、重要观点强调",
    bullets: ["引言正文（1-2 句话）", "来源说明（副标题）", "背景图（可选，半透明叠加）"],
  },
  {
    id: "comparison",
    name: "对比页",
    description: "左右分屏对比，中间铜色分隔线，两侧各有标题和要点",
    bg: "#FAF8F5",
    accent: "#B87333",
    textColor: "#2C2C2C",
    usage: "方案对比、前后对比、优劣分析",
    bullets: ["对比主题（标题）", "左侧标题 + 要点（方案A）", "右侧标题 + 要点（方案B）"],
  },
  {
    id: "timeline",
    name: "时间轴页",
    description: "深色背景，水平时间轴线，节点圆点，上方年份下方说明",
    bg: "#2D2D3F",
    accent: "#B87333",
    textColor: "#FFFFFF",
    usage: "项目进度、发展历程、设计阶段",
    bullets: ["时间轴标题", "节点格式：年份/阶段 — 说明文字", "最多 5 个节点"],
  },
  {
    id: "data_highlight",
    name: "数据展示页",
    description: "深色背景，超大铜色数字，2×2 网格布局",
    bg: "#1A1A2E",
    accent: "#B87333",
    textColor: "#FFFFFF",
    usage: "关键数据、项目指标、成果量化",
    bullets: ["数据标题", "数据格式：数字 — 说明（如：12,000㎡ — 总建筑面积）", "最多 4 组数据"],
  },
  {
    id: "summary",
    name: "总结页",
    description: "深色背景，左侧铜色竖线，底部品牌栏",
    bg: "#1A1A2E",
    accent: "#B87333",
    textColor: "#FFFFFF",
    usage: "PPT 最后一页，总结要点或致谢",
    bullets: ["总结标题", "总结要点（3-5 条）", "底部品牌栏（N+1 STUDIOS）"],
  },
];

function LayoutCard({ layout }: { layout: typeof PPT_LAYOUTS[0] }) {
  return (
    <Card className="overflow-hidden">
      {/* Mini preview */}
      <div
        className="w-full relative"
        style={{ aspectRatio: '16/9', background: layout.bg }}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: layout.accent }} />
        {/* Left accent bar for some layouts */}
        {["toc", "quote", "summary"].includes(layout.id) && (
          <div className="absolute left-[8%] top-[10%] bottom-[10%] w-[3px]" style={{ background: layout.accent }} />
        )}
        {/* Center content preview */}
        <div className="absolute inset-0 flex flex-col justify-center px-6 py-4">
          <div
            className="font-bold text-sm mb-1 truncate"
            style={{ color: layout.textColor }}
          >
            {layout.name}
          </div>
          <div
            className="text-[10px] opacity-60 line-clamp-2"
            style={{ color: layout.textColor }}
          >
            {layout.description}
          </div>
          {/* Accent decoration */}
          <div className="mt-2 h-[2px] w-8" style={{ background: layout.accent }} />
          {/* Bullet preview */}
          <div className="mt-2 space-y-1">
            {layout.bullets.slice(0, 2).map((b, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="h-1 w-1 rounded-full flex-shrink-0" style={{ background: layout.accent }} />
                <span className="text-[9px] opacity-50 truncate" style={{ color: layout.textColor }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Right image placeholder for image layouts */}
        {["cover", "case_study", "section_intro"].includes(layout.id) && (
          <div
            className="absolute right-0 top-0 h-full w-2/5 opacity-20"
            style={{ background: `linear-gradient(to left, ${layout.accent}40, transparent)` }}
          />
        )}
        {/* Comparison divider */}
        {layout.id === "comparison" && (
          <div className="absolute left-1/2 top-[15%] bottom-[15%] w-[2px]" style={{ background: layout.accent }} />
        )}
        {/* Timeline line */}
        {layout.id === "timeline" && (
          <div className="absolute left-[10%] right-[10%] top-1/2 h-[2px]" style={{ background: layout.accent }} />
        )}
        {/* Data highlight grid */}
        {layout.id === "data_highlight" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-3 px-6">
              {["12K", "85%", "36", "A+"].map((n, i) => (
                <div key={i} className="text-center">
                  <div className="font-bold text-lg" style={{ color: layout.accent }}>{n}</div>
                  <div className="text-[8px] opacity-40" style={{ color: layout.textColor }}>指标说明</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Info */}
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">{layout.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{layout.description}</p>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">{layout.id}</Badge>
        </div>
        <div className="bg-muted/50 rounded p-2.5 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">使用场景</p>
          <p className="text-xs text-foreground">{layout.usage}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">内容要素</p>
          <ul className="space-y-0.5">
            {layout.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="text-primary mt-0.5">›</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="h-3 w-3 rounded-sm" style={{ background: layout.bg, border: '1px solid #ccc' }} />
          <span className="text-[10px] text-muted-foreground">背景 {layout.bg}</span>
          <div className="h-3 w-3 rounded-sm ml-2" style={{ background: layout.accent }} />
          <span className="text-[10px] text-muted-foreground">强调色 {layout.accent}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AI Layout Pack Component ───────────────────────────────────────────────

type LayoutPack = {
  id: number;
  name: string;
  description: string | null;
  sourceType: "pptx" | "images" | "pdf";
  sourceFileUrl: string | null;
  status: "pending" | "processing" | "done" | "failed";
  errorMessage: string | null;
  styleGuide: any;
  layouts: any;
  thumbnails: any;
  createdAt: Date;
  updatedAt: Date;
};

function LayoutPackCard({ pack, onDelete, onRefresh, onRetry }: { pack: LayoutPack; onDelete: () => void; onRefresh: () => void; onRetry: () => void }) {
  const styleGuide = pack.styleGuide as any;
  const layouts = (pack.layouts as any[]) || [];

  // Auto-refresh while processing
  useEffect(() => {
    if (pack.status === "pending" || pack.status === "processing") {
      const timer = setInterval(onRefresh, 3000);
      return () => clearInterval(timer);
    }
  }, [pack.status, onRefresh]);

  const statusIcon = {
    pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    processing: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
    done: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    failed: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
  }[pack.status];

  const statusLabel = {
    pending: "等待处理",
    processing: "AI 分析中…",
    done: "已完成",
    failed: "处理失败",
  }[pack.status];

  const sourceTypeIcon = {
    pptx: <FileText className="h-4 w-4" />,
    pdf: <FileText className="h-4 w-4" />,
    images: <Image className="h-4 w-4" />,
  }[pack.sourceType];

  const sourceTypeLabel = {
    pptx: "PPTX 文件",
    pdf: "PDF 文件",
    images: "图片集",
  }[pack.sourceType];

  return (
    <Card className="overflow-hidden">
      {/* Color preview strip */}
      {pack.status === "done" && styleGuide?.colorPalette ? (
        <div className="flex h-2">
          {[styleGuide.colorPalette.primary, styleGuide.colorPalette.secondary, styleGuide.colorPalette.background, styleGuide.colorPalette.accent].map((c: string, i: number) => (
            <div key={i} className="flex-1" style={{ background: c }} />
          ))}
        </div>
      ) : (
        <div className="h-2 bg-muted" />
      )}
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {sourceTypeIcon}
              <span className="text-[10px] text-muted-foreground">{sourceTypeLabel}</span>
            </div>
            <h3 className="font-semibold text-sm truncate">{pack.name}</h3>
            {pack.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pack.description}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {statusIcon}
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
          {pack.status === "failed" && pack.errorMessage && (
            <span className="text-xs text-red-500 truncate">: {pack.errorMessage}</span>
          )}
          {pack.status === "failed" && (
            <Button variant="outline" size="sm" className="h-5 text-[10px] px-2 ml-auto" onClick={onRetry}>
              <RefreshCw className="h-3 w-3 mr-1" />重试
            </Button>
          )}
        </div>

        {/* Style guide preview */}
        {pack.status === "done" && styleGuide && (
          <div className="space-y-2">
            {/* Keywords */}
            {styleGuide.styleKeywords?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {styleGuide.styleKeywords.map((kw: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px] py-0">{kw}</Badge>
                ))}
              </div>
            )}
            {/* Color palette */}
            {styleGuide.colorPalette && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">配色：</span>
                {Object.entries(styleGuide.colorPalette).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex items-center gap-0.5" title={`${k}: ${v}`}>
                    <div className="h-3 w-3 rounded-sm border border-border" style={{ background: v }} />
                  </div>
                ))}
              </div>
            )}
            {/* Typography */}
            {styleGuide.typography && (
              <p className="text-[10px] text-muted-foreground">
                字体：{styleGuide.typography.titleFont} · {styleGuide.typography.style}
              </p>
            )}
            {/* Layouts count */}
            {layouts.length > 0 && (
              <p className="text-[10px] text-muted-foreground">识别 {layouts.length} 种版式</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AILayoutLearning() {
  const utils = trpc.useUtils();
  const { data: packs = [], refetch } = trpc.layoutPacks.list.useQuery();
  const createMutation = trpc.layoutPacks.create.useMutation({
    onSuccess: () => { utils.layoutPacks.list.invalidate(); toast.success("版式包已创建，AI 正在分析…"); },
    onError: (e) => toast.error("创建失败: " + e.message),
  });
  const deleteMutation = trpc.layoutPacks.delete.useMutation({
    onSuccess: () => { utils.layoutPacks.list.invalidate(); toast.success("版式包已删除"); },
    onError: (e) => toast.error("删除失败: " + e.message),
  });
  const retryMutation = trpc.layoutPacks.retry.useMutation({
    onSuccess: () => { utils.layoutPacks.list.invalidate(); toast.success("AI 重新分析中…"); },
    onError: (e) => toast.error("重试失败: " + e.message),
  });
  const [uploading, setUploading] = useState(false);
  const [packName, setPackName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getSourceType(file: File): "pptx" | "images" | "pdf" {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "pptx" || ext === "ppt") return "pptx";
    if (ext === "pdf") return "pdf";
    return "images";
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!packName) setPackName(file.name.replace(/\.[^.]+$/, ""));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!packName) setPackName(file.name.replace(/\.[^.]+$/, ""));
  }

  async function handleUpload() {
    if (!selectedFile || !packName.trim()) {
      toast.error("请选择文件并填写版式包名称"); return;
    }
    setUploading(true);
    try {
      // Use multipart/form-data to avoid base64 size limits
      const formData = new FormData();
      formData.append("file", selectedFile, selectedFile.name);
      const uploadRes = await fetch("/api/upload/layout-pack", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || `上传失败 (${uploadRes.status})`);
      }
      const { url, key } = await uploadRes.json();
      await createMutation.mutateAsync({
        name: packName.trim(),
        sourceType: getSourceType(selectedFile),
        sourceFileUrl: url,
        sourceFileKey: key,
      });
      setSelectedFile(null);
      setPackName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast.error("上传失败: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  const processingCount = packs.filter(p => p.status === "pending" || p.status === "processing").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">AI 版式学习</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            上传 PPT、PDF 或图片，AI 自动提取设计风格，生成可复用的版式包。
          </p>
        </div>
        {packs.length > 0 && (
          <Badge variant="secondary" className="shrink-0">{packs.length} 个版式包</Badge>
        )}
      </div>

      {/* Upload area */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pptx,.ppt,.pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
            />
            {selectedFile ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <FileUp className="h-8 w-8" />
                </div>
                <p className="font-medium text-sm">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setPackName(""); }}>
                  <X className="h-3 w-3 mr-1" />更换文件
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">拖放文件到此处，或点击选择</p>
                <p className="text-xs text-muted-foreground">支持 PPTX、PDF、图片（JPG/PNG）</p>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">版式包名称</Label>
                <Input
                  placeholder="例如：科技感深色版式"
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleUpload}
                disabled={uploading || !packName.trim()}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />上传并分析中…</>
                ) : (
                  <><Sparkles className="h-4 w-4" />上传并让 AI 提取版式</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pack list */}
      {packs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">版式包库</h3>
            {processingCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />{processingCount} 个正在分析
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packs.map((pack) => (
              <LayoutPackCard
                key={pack.id}
                pack={pack as LayoutPack}
                onDelete={() => deleteMutation.mutate({ id: pack.id })}
                onRefresh={() => utils.layoutPacks.list.invalidate()}
                onRetry={() => retryMutation.mutate({ id: pack.id })}
              />
            ))}
          </div>
        </div>
      )}

      {packs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">还没有版式包</p>
          <p className="text-xs mt-1">上传 PPT 或图片，AI 将自动提取设计风格</p>
        </div>
      )}
    </div>
  );
}

type RenderStyle = {
  id: number;
  label: string;
  promptHint: string;
  referenceImageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type StyleFormData = {
  label: string;
  promptHint: string;
  referenceImageUrl: string | null;
  isActive: boolean;
};

const emptyForm: StyleFormData = {
  label: "",
  promptHint: "",
  referenceImageUrl: null,
  isActive: true,
};

export default function Standards() {
  const utils = trpc.useUtils();

  const { data: styles = [], isLoading } = trpc.renderStyles.list.useQuery({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StyleFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const createMutation = trpc.renderStyles.create.useMutation({
    onSuccess: () => { utils.renderStyles.list.invalidate(); closeDialog(); toast.success("风格已创建"); },
    onError: (e) => toast.error("创建失败: " + e.message),
  });
  const updateMutation = trpc.renderStyles.update.useMutation({
    onSuccess: () => { utils.renderStyles.list.invalidate(); closeDialog(); toast.success("风格已更新"); },
    onError: (e) => toast.error("更新失败: " + e.message),
  });
  const deleteMutation = trpc.renderStyles.delete.useMutation({
    onSuccess: () => { utils.renderStyles.list.invalidate(); setDeleteConfirmId(null); toast.success("风格已删除"); },
    onError: (e) => toast.error("删除失败: " + e.message),
  });
  const reorderMutation = trpc.renderStyles.reorder.useMutation({
    onSuccess: () => utils.renderStyles.list.invalidate(),
  });
  const uploadRefImageMutation = trpc.renderStyles.uploadRefImage.useMutation({
    onSuccess: (data) => {
      setForm(f => ({ ...f, referenceImageUrl: data.url }));
      setPendingImageFile(null);
      setUploadingImage(false);
      toast.success("参考图已上传");
    },
    onError: (e) => { setUploadingImage(false); toast.error("上传失败: " + e.message); },
  });

  function openCreate() {
    setEditingId(null); setForm(emptyForm); setPendingImageFile(null); setPendingImagePreview(null); setDialogOpen(true);
  }
  function openEdit(style: RenderStyle) {
    setEditingId(style.id);
    setForm({ label: style.label, promptHint: style.promptHint, referenceImageUrl: style.referenceImageUrl, isActive: style.isActive });
    setPendingImageFile(null); setPendingImagePreview(null); setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false); setEditingId(null); setForm(emptyForm); setPendingImageFile(null); setPendingImagePreview(null);
  }
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!form.label.trim() || !form.promptHint.trim()) {
      toast.error("请填写风格名称和提示词"); return;
    }
    if (editingId !== null) {
      if (pendingImageFile) {
        setUploadingImage(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(",")[1];
          uploadRefImageMutation.mutate({ styleId: editingId, fileName: pendingImageFile.name, fileData: base64, contentType: pendingImageFile.type });
        };
        reader.readAsDataURL(pendingImageFile);
        updateMutation.mutate({ id: editingId, label: form.label, promptHint: form.promptHint, isActive: form.isActive });
      } else {
        updateMutation.mutate({ id: editingId, label: form.label, promptHint: form.promptHint, referenceImageUrl: form.referenceImageUrl, isActive: form.isActive });
      }
    } else {
      const result = await createMutation.mutateAsync({ label: form.label, promptHint: form.promptHint, isActive: form.isActive });
      if (result?.id && pendingImageFile) {
        setUploadingImage(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(",")[1];
          uploadRefImageMutation.mutate({ styleId: result.id, fileName: pendingImageFile!.name, fileData: base64, contentType: pendingImageFile!.type });
        };
        reader.readAsDataURL(pendingImageFile);
      }
    }
  }

  function handleDragStart(id: number) { setDragId(id); }
  function handleDragOver(e: React.DragEvent, id: number) { e.preventDefault(); setDragOverId(id); }
  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const sorted = [...styles].sort((a, b) => a.sortOrder - b.sortOrder);
    const fromIdx = sorted.findIndex(s => s.id === dragId);
    const toIdx = sorted.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    reorderMutation.mutate({ orderedIds: reordered.map(s => s.id) });
    setDragId(null); setDragOverId(null);
  }

  const sortedStyles = [...styles].sort((a, b) => a.sortOrder - b.sortOrder);
  const isSaving = createMutation.isPending || updateMutation.isPending || uploadingImage;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">出品标准</h1>
        <p className="text-sm text-muted-foreground mt-1">管理 AI 效果图渲染风格库和演示文稿版式标准</p>
      </div>

      <Tabs defaultValue="render-styles">
        <TabsList className="mb-4">
          <TabsTrigger value="render-styles" className="gap-1.5">
            <Palette className="h-4 w-4" />渲染风格库
          </TabsTrigger>
          <TabsTrigger value="ppt-layouts" className="gap-1.5">
            <Layout className="h-4 w-4" />演示文稿版式标准
          </TabsTrigger>
          <TabsTrigger value="ai-layout-learning" className="gap-1.5">
            <Sparkles className="h-4 w-4" />AI 版式学习
          </TabsTrigger>
        </TabsList>

        {/* ─── 演示文稿版式标准 Tab ─── */}
        <TabsContent value="ppt-layouts">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold">演示文稿版式标准</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  共 {PPT_LAYOUTS.length} 种版式，AI 生成 PPT 时会从中选择合适的版式组合。版式 ID 与生成代码直接对应。
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">{PPT_LAYOUTS.length} 种版式</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PPT_LAYOUTS.map((layout) => (
                <LayoutCard key={layout.id} layout={layout} />
              ))}
            </div>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-2">版式使用规则</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">›</span>每份 PPT 必须以 <code className="text-xs bg-muted px-1 py-0.5 rounded">cover</code> 开头，以 <code className="text-xs bg-muted px-1 py-0.5 rounded">summary</code> 结尾</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">›</span>第 2 页固定为 <code className="text-xs bg-muted px-1 py-0.5 rounded">toc</code> 目录页</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">›</span>避免连续使用同一种版式，保持视觉节奏多样性</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">›</span><code className="text-xs bg-muted px-1 py-0.5 rounded">quote</code> / <code className="text-xs bg-muted px-1 py-0.5 rounded">data_highlight</code> / <code className="text-xs bg-muted px-1 py-0.5 rounded">timeline</code> 版式不需要配图，pexelsQuery 可留空</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">›</span>深色版式（cover / quote / timeline / data_highlight / summary）与浅色版式交替使用，形成节奏感</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── 渲染风格库 Tab ─── */}
        <TabsContent value="render-styles">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">渲染风格库</CardTitle>
              <CardDescription className="text-xs mt-0.5">配置 AI 效果图生成时可选的渲染风格，每个风格包含提示词和可选的参考图</CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />新增风格
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
            </div>
          ) : sortedStyles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Palette className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">暂无渲染风格，点击「新增风格」开始配置</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedStyles.map((style) => (
                <div
                  key={style.id}
                  draggable
                  onDragStart={() => handleDragStart(style.id)}
                  onDragOver={(e) => handleDragOver(e, style.id)}
                  onDrop={() => handleDrop(style.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-all
                    ${dragOverId === style.id ? "border-primary bg-primary/5" : "border-border"}
                    ${dragId === style.id ? "opacity-50" : ""}
                  `}
                >
                  <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0 border border-border">
                    {style.referenceImageUrl ? (
                      <img src={style.referenceImageUrl} alt={style.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImagePlus className="h-4 w-4 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{style.label}</span>
                      {!style.isActive && <Badge variant="secondary" className="text-xs py-0">已停用</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{style.promptHint}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title={style.isActive ? "停用" : "启用"}
                      onClick={() => updateMutation.mutate({ id: style.id, isActive: !style.isActive })}>
                      {style.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(style)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteConfirmId(style.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId !== null ? "编辑渲染风格" : "新增渲染风格"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>风格名称 <span className="text-destructive">*</span></Label>
              <Input placeholder="例如：建筑渲染" value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>生成提示词 <span className="text-destructive">*</span></Label>
              <Textarea placeholder="输入注入到 AI 生成 prompt 中的风格描述词，建议使用英文..." value={form.promptHint}
                onChange={(e) => setForm(f => ({ ...f, promptHint: e.target.value }))} rows={3} className="resize-none" />
              <p className="text-xs text-muted-foreground">此文字将追加到生成 prompt 末尾，用于控制图像风格</p>
            </div>
            <div className="space-y-1.5">
              <Label>参考图（可选）</Label>
              <div className="flex gap-3 items-start">
                <div className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0">
                  {pendingImagePreview ? (
                    <img src={pendingImagePreview} alt="预览" className="w-full h-full object-cover" />
                  ) : form.referenceImageUrl ? (
                    <img src={form.referenceImageUrl} alt="参考图" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImagePlus className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="h-3.5 w-3.5" />{form.referenceImageUrl || pendingImagePreview ? "更换参考图" : "上传参考图"}
                  </Button>
                  {(form.referenceImageUrl || pendingImagePreview) && (
                    <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => { setForm(f => ({ ...f, referenceImageUrl: null })); setPendingImageFile(null); setPendingImagePreview(null); }}>
                      <X className="h-3.5 w-3.5" />移除参考图
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">参考图将作为 style reference 传给 AI，引导生成风格</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>启用此风格</Label>
                <p className="text-xs text-muted-foreground mt-0.5">停用后不会在效果图生成页面的下拉框中显示</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>取消</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editingId !== null ? "保存修改" : "创建风格"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">删除后无法恢复，已使用此风格生成的历史图片不受影响。确定要删除这个渲染风格吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        {/* ─── AI 版式学习 Tab ─── */}
        <TabsContent value="ai-layout-learning">
          <AILayoutLearning />
        </TabsContent>
      </Tabs>
    </div>
  );
}
