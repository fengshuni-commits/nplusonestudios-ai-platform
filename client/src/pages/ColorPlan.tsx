import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Sparkles,
  Download,
  ImageIcon,
  X,
  Loader2,
  Search,
  Check,
  FolderOpen,
  RefreshCw,
  Palette,
  PenLine,
  ScanLine,
  Paintbrush,
  LayoutGrid,
  Plus,
  Trash2,
  Edit3,
  MousePointer,
  Square,
} from "lucide-react";
import { AiToolSelector } from "@/components/AiToolSelector";
import { cn } from "@/lib/utils";
import ImageMaskEditor from "@/components/ImageMaskEditor";
import { useRef, useState, useCallback, useEffect } from "react";

// ─── Plan Style Config ─────────────────────────────────────
type PlanStyle = "colored" | "hand_drawn" | "line_drawing";
const PLAN_STYLES: Array<{ id: PlanStyle; label: string; desc: string; icon: React.ElementType }> = [
  { id: "colored", label: "彩色平面", desc: "写实材质色彩", icon: Palette },
  { id: "hand_drawn", label: "手绘平面", desc: "水彩笔绘风格", icon: PenLine },
  { id: "line_drawing", label: "平面线稿", desc: "黑白线条图纸", icon: ScanLine },
];

// ─── Zone Types ────────────────────────────────────────────
type Zone = {
  id: string;
  name: string;
  x: number; // 0-1 relative to image
  y: number;
  w: number;
  h: number;
  color: string;
};

// Preset zone colors
const ZONE_COLORS = [
  "#4A90D9", "#7ED321", "#F5A623", "#D0021B", "#9B59B6",
  "#1ABC9C", "#E67E22", "#3498DB", "#E74C3C", "#2ECC71",
];

function getZoneColor(idx: number) {
  return ZONE_COLORS[idx % ZONE_COLORS.length];
}

// ─── Types ────────────────────────────────────────────────
type AssetItem = {
  id: number;
  name: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  isFolder?: boolean;
};

// ─── Asset Picker Dialog ──────────────────────────────────
function AssetPickerDialog({
  open,
  onClose,
  onSelect,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, name: string) => void;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<number | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<Array<{ id: number | undefined; name: string }>>([]);

  const { data: assetsData } = trpc.assets.listByParent.useQuery(
    { parentId: folderId },
    { enabled: open }
  );

  const assets = (assetsData || []) as AssetItem[];
  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenFolder = (id: number, name: string) => {
    setFolderPath((p) => [...p, { id: folderId, name: folderPath.length === 0 ? "素材库" : folderPath[folderPath.length - 1].name }]);
    setFolderId(id);
  };

  const handleBreadcrumb = (idx: number) => {
    const target = folderPath[idx];
    setFolderPath(folderPath.slice(0, idx));
    setFolderId(target.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb */}
        {folderPath.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            <button className="hover:text-foreground" onClick={() => { setFolderPath([]); setFolderId(undefined); }}>
              素材库
            </button>
            {folderPath.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                <span>/</span>
                <button className="hover:text-foreground" onClick={() => handleBreadcrumb(i + 1)}>
                  {p.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索素材…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto">
          {filtered.map((asset) => (
            <button
              key={asset.id}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border/40 hover:border-primary/60 transition-colors bg-muted/30"
              onClick={() => {
                if (asset.isFolder) {
                  handleOpenFolder(asset.id, asset.name);
                } else {
                  onSelect(asset.fileUrl, asset.name);
                  onClose();
                }
              }}
            >
              {asset.isFolder ? (
                <div className="flex flex-col items-center justify-center h-full gap-1">
                  <FolderOpen className="h-8 w-8 text-amber-500" />
                  <span className="text-xs text-muted-foreground truncate px-1 w-full text-center">{asset.name}</span>
                </div>
              ) : (
                <>
                  <img
                    src={asset.thumbnailUrl || asset.fileUrl}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Check className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">{asset.name}</p>
                  </div>
                </>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-4 flex flex-col items-center justify-center h-32 text-muted-foreground">
              <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">暂无素材</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Image Upload Zone ─────────────────────────────────────
function ImageUploadZone({
  label,
  hint,
  previewUrl,
  onFile,
  onClear,
  onPickFromAssets,
  isUploading,
  required,
}: {
  label: string;
  hint: string;
  previewUrl: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  onPickFromAssets: () => void;
  isUploading?: boolean;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) onFile(file);
    },
    [onFile]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={onPickFromAssets}
        >
          <FolderOpen className="h-3 w-3 mr-1" />
          从素材库选择
        </Button>
      </div>

      {previewUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-border/40 bg-muted/20">
          <img
            src={previewUrl}
            alt={label}
            className="w-full object-contain max-h-52"
          />
          <button
            className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
          {isUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors min-h-[140px]"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {isUploading ? (
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground text-center">{hint}</p>
              <p className="text-xs text-muted-foreground/60">支持 PNG、JPG、WEBP</p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Zone Canvas Overlay ───────────────────────────────────
// Renders zone rectangles on top of the floor plan image.
// In "draw" mode, user drags to create a new zone.
type ZoneCanvasMode = "view" | "draw";

function ZoneCanvas({
  zones,
  mode,
  onAddZone,
  onSelectZone,
  selectedZoneId,
  nextColor,
}: {
  zones: Zone[];
  mode: ZoneCanvasMode;
  onAddZone: (zone: Omit<Zone, "id" | "name" | "color">) => void;
  onSelectZone: (id: string | null) => void;
  selectedZoneId: string | null;
  nextColor: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const getRelativePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== "draw") return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setDragging(true);
    setDragStart(pos);
    setDragCurrent(pos);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart) return;
    setDragCurrent(getRelativePos(e));
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!dragging || !dragStart || !dragCurrent) {
      setDragging(false);
      return;
    }
    setDragging(false);
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    if (w > 0.02 && h > 0.02) {
      onAddZone({ x, y, w, h });
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  // Preview rect while dragging
  const previewRect = dragging && dragStart && dragCurrent
    ? {
        x: Math.min(dragStart.x, dragCurrent.x),
        y: Math.min(dragStart.y, dragCurrent.y),
        w: Math.abs(dragCurrent.x - dragStart.x),
        h: Math.abs(dragCurrent.y - dragStart.y),
      }
    : null;

  return (
    <div
      ref={canvasRef}
      className={cn(
        "absolute inset-0",
        mode === "draw" ? "cursor-crosshair" : "cursor-default"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (dragging) {
          setDragging(false);
          setDragStart(null);
          setDragCurrent(null);
        }
      }}
    >
      {/* Existing zones */}
      {zones.map((zone) => (
        <div
          key={zone.id}
          className={cn(
            "absolute border-2 transition-all",
            selectedZoneId === zone.id ? "border-white ring-2 ring-offset-0" : "border-white/70",
            mode === "view" ? "cursor-pointer hover:border-white" : "pointer-events-none"
          )}
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.w * 100}%`,
            height: `${zone.h * 100}%`,
            backgroundColor: zone.color + "40",
            borderColor: zone.color,
            boxShadow: selectedZoneId === zone.id ? `0 0 0 2px ${zone.color}` : undefined,
          }}
          onClick={(e) => {
            if (mode !== "view") return;
            e.stopPropagation();
            onSelectZone(selectedZoneId === zone.id ? null : zone.id);
          }}
        >
          {/* Zone label */}
          <div
            className="absolute top-1 left-1 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded leading-tight max-w-[90%] truncate"
            style={{ backgroundColor: zone.color + "CC" }}
          >
            {zone.name || "未命名"}
          </div>
        </div>
      ))}

      {/* Preview rect while drawing */}
      {previewRect && (
        <div
          className="absolute border-2 border-dashed pointer-events-none"
          style={{
            left: `${previewRect.x * 100}%`,
            top: `${previewRect.y * 100}%`,
            width: `${previewRect.w * 100}%`,
            height: `${previewRect.h * 100}%`,
            backgroundColor: nextColor + "30",
            borderColor: nextColor,
          }}
        />
      )}
    </div>
  );
}

// ─── Zone Name Dialog ──────────────────────────────────────
function ZoneNameDialog({
  open,
  initialName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  initialName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">命名功能分区</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="例如：客厅、主卧、厨房、卫生间…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
            className="text-sm"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
            <Button size="sm" onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}>
              确认
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function ColorPlan() {
  const [location] = useLocation();

  // Parse URL query params for "re-edit" from history
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const initFloorPlanUrl = urlParams.get('floorPlanUrl') || null;
  const initReferenceUrl = urlParams.get('referenceUrl') || null;
  const initPlanStyle = (urlParams.get('planStyle') as PlanStyle) || 'colored';
  const initExtraPrompt = urlParams.get('extraPrompt') || '';
  // Restore previous generation result so user can continue editing (inpainting) directly
  const initResultUrl = urlParams.get('resultUrl') || null;
  // Restore historyId so "import to assets" still works after restore
  const initHistoryId = urlParams.get('historyId') ? Number(urlParams.get('historyId')) : undefined;

  // Floor plan (base image)
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(initFloorPlanUrl);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(initFloorPlanUrl);
  const [isUploadingFloor, setIsUploadingFloor] = useState(false);

  // Reference image
  const [referencePreview, setReferencePreview] = useState<string | null>(initReferenceUrl);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(initReferenceUrl);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // AI tool selection
  const [toolId, setToolId] = useState<number | undefined>(undefined);

  // Plan style selection
  const [planStyle, setPlanStyle] = useState<PlanStyle>(initPlanStyle);

  // Style & extra prompt
  const [extraPrompt, setExtraPrompt] = useState(initExtraPrompt);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(initResultUrl);
  const [resultHistoryId, setResultHistoryId] = useState<number | undefined>(initHistoryId);

  // Asset picker
  const [assetPickerTarget, setAssetPickerTarget] = useState<"floor" | "reference" | null>(null);

  // Mask editor state — directly on result image (same as DesignTools)
  const [editingMask, setEditingMask] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [editImgDims, setEditImgDims] = useState<{ dw: number; dh: number; nw: number; nh: number } | null>(null);
  const editImgRef = useRef<HTMLImageElement>(null);
  const [inpaintPrompt, setInpaintPrompt] = useState("");
  const [isInpainting, setIsInpainting] = useState(false);
  const inpaintMutation = trpc.colorPlan.inpaint.useMutation();
  const [inpaintJobId, setInpaintJobId] = useState<string | null>(null);

  // 底图原始尺寸（用于保留比例）
  const [floorPlanDims, setFloorPlanDims] = useState<{ w: number; h: number } | null>(null);

  // ─── Zone state ────────────────────────────────────────────────
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneMode, setZoneMode] = useState<"view" | "draw">("view");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  // Pending zone: drawn but not yet named
  const [pendingZone, setPendingZone] = useState<Omit<Zone, "id" | "name" | "color"> | null>(null);
  const [showZoneNameDialog, setShowZoneNameDialog] = useState(false);

  const nextZoneColor = getZoneColor(zones.length);

  // Poll inpaint job status
  const { data: inpaintJobStatus } = trpc.colorPlan.jobStatus.useQuery(
    { jobId: inpaintJobId! },
    {
      enabled: !!inpaintJobId && isInpainting,
      refetchInterval: 2000,
      refetchIntervalInBackground: true,
    }
  );

  useEffect(() => {
    if (!inpaintJobStatus) return;
    if (inpaintJobStatus.status === "done") {
      toast.success("局部修改完成");
      const newUrl = inpaintJobStatus.url;
      setResultUrl(newUrl);
      setResultHistoryId(inpaintJobStatus.historyId);
      // Update floor plan preview/url so the left-side thumbnail reflects the latest result
      if (newUrl) {
        setFloorPlanPreview(newUrl);
        setFloorPlanUrl(newUrl);
      }
      setIsInpainting(false);
      setInpaintJobId(null);
      // Reset mask state
      setEditingMask(false);
      setMaskDataUrl(null);
      setMaskPreviewUrl(null);
      setEditImgDims(null);
      setInpaintPrompt("");
    } else if (inpaintJobStatus.status === "failed") {
      toast.error(inpaintJobStatus.error || "局部修改失败，请稍后重试");
      setIsInpainting(false);
      setInpaintJobId(null);
    }
  }, [inpaintJobStatus]);

  const uploadFloorPlan = trpc.colorPlan.uploadFloorPlan.useMutation();
  const generateMutation = trpc.colorPlan.generate.useMutation();
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const importAssetMutation = trpc.assets.importFromHistory.useMutation({
    onSuccess: () => toast.success("已导入素材库"),
    onError: (e) => toast.error(e.message || "导入失败"),
  });

  // Poll job status
  const { data: jobStatusData } = trpc.colorPlan.jobStatus.useQuery(
    { jobId: generateJobId! },
    {
      enabled: !!generateJobId && isGenerating,
      refetchInterval: 2000,
      refetchIntervalInBackground: true,
    }
  );

  // Handle job status updates
  useEffect(() => {
    if (!jobStatusData) return;
    if (jobStatusData.status === "done") {
      setResultUrl(jobStatusData.url);
      setResultHistoryId(jobStatusData.historyId);
      setIsGenerating(false);
      setGenerateJobId(null);
      toast.success("彩平图生成成功");
    } else if (jobStatusData.status === "failed") {
      setIsGenerating(false);
      setGenerateJobId(null);
      toast.error(jobStatusData.error || "生成失败，请稍后重试");
    }
  }, [jobStatusData]);

  // ── Upload helpers ─────────────────────────────────────
  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFloorPlanFile = async (file: File) => {
    setFloorPlanFile(file);
    const objectUrl = URL.createObjectURL(file);
    setFloorPlanPreview(objectUrl);
    setFloorPlanUrl(null);
    setIsUploadingFloor(true);
    // Clear zones when new floor plan is uploaded
    setZones([]);
    setResultUrl(null);
    setResultHistoryId(undefined);
    // Read natural dimensions to preserve aspect ratio during generation
    const img = new Image();
    img.onload = () => {
      setFloorPlanDims({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.src = objectUrl;
    try {
      const base64 = await readFileAsBase64(file);
      const { url } = await uploadFloorPlan.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });
      setFloorPlanUrl(url);
    } catch (e: any) {
      toast.error("底图上传失败：" + (e.message || "未知错误"));
      setFloorPlanPreview(null);
      setFloorPlanFile(null);
    } finally {
      setIsUploadingFloor(false);
    }
  };

  const handleReferenceFile = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setReferencePreview(objectUrl);
    setReferenceUrl(null);
    setIsUploadingRef(true);
    try {
      const base64 = await readFileAsBase64(file);
      const { url } = await uploadFloorPlan.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });
      setReferenceUrl(url);
    } catch (e: any) {
      toast.error("参考图上传失败：" + (e.message || "未知错误"));
      setReferencePreview(null);
    } finally {
      setIsUploadingRef(false);
    }
  };

  // ── Zone handlers ──────────────────────────────────────
  const handleAddZoneDraw = (partial: Omit<Zone, "id" | "name" | "color">) => {
    setPendingZone(partial);
    setShowZoneNameDialog(true);
    setZoneMode("view"); // exit draw mode after drawing
  };

  const handleZoneNameConfirm = (name: string) => {
    if (!pendingZone) return;
    const newZone: Zone = {
      id: Math.random().toString(36).slice(2),
      name,
      color: nextZoneColor,
      ...pendingZone,
    };
    setZones((prev) => [...prev, newZone]);
    setPendingZone(null);
    setShowZoneNameDialog(false);
  };

  const handleZoneNameCancel = () => {
    setPendingZone(null);
    setShowZoneNameDialog(false);
  };

  const handleDeleteZone = (id: string) => {
    setZones((prev) => prev.filter((z) => z.id !== id));
    if (selectedZoneId === id) setSelectedZoneId(null);
  };

  const handleRenameZone = (id: string, name: string) => {
    setZones((prev) => prev.map((z) => z.id === id ? { ...z, name } : z));
  };

  // ── Generate ───────────────────────────────────────────
  const handleGenerate = async () => {
    if (!floorPlanUrl) {
      toast.error("请先上传平面底图");
      return;
    }
    if (isUploadingFloor || isUploadingRef) {
      toast.error("图片上传中，请稍候");
      return;
    }
    setIsGenerating(true);
    setResultUrl(null);
    try {
      const result = await generateMutation.mutateAsync({
        floorPlanUrl,
        referenceUrl: referenceUrl || undefined,
        planStyle,
        extraPrompt: extraPrompt.trim() || undefined,
        toolId,
        zones: zones.length > 0 ? zones.map(({ name, x, y, w, h, color }) => ({ name, x, y, w, h, color })) : undefined,
        floorPlanWidth: floorPlanDims?.w,
        floorPlanHeight: floorPlanDims?.h,
      });
      // Backend now returns jobId immediately; polling handles result
      setGenerateJobId(result.jobId);
    } catch (e: any) {
      toast.error(e.message || "生成失败，请稍后重试");
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `平面图-${Date.now()}.png`;
    a.click();
  };

  const handleImportToAssets = () => {
    if (!resultHistoryId) return;
    importAssetMutation.mutate({ historyId: resultHistoryId });
  };

  const handleRegenerate = () => {
    setResultUrl(null);
    setResultHistoryId(undefined);
    handleGenerate();
  };

  const canGenerate = !!floorPlanUrl && !isUploadingFloor && !isUploadingRef && !isGenerating;

  // ── Right panel state ──────────────────────────────────
  // Show floor plan in workspace as soon as it's uploaded
  const showFloorPlanInWorkspace = !!floorPlanPreview && !resultUrl && !isGenerating && !isInpainting;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">AI 平面图</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              上传平面底图，标注功能分区，一键生成彩色平面图
            </p>
          </div>
          <AiToolSelector
            capability="rendering"
            value={toolId}
            onChange={setToolId}
            label="AI 工具"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex">
        <div className="flex flex-col lg:flex-row w-full">

          {/* ── Left: Input Panel ───────────────────────────── */}
          <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0 border-r border-border/40 px-5 py-5 space-y-5">
            {/* Plan style selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">平面风格</label>
              <div className="grid grid-cols-3 gap-2">
                {PLAN_STYLES.map(({ id, label, desc, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setPlanStyle(id); setResultUrl(null); setResultHistoryId(undefined); }}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                      planStyle === id
                        ? "border-primary bg-primary/8 text-primary"
                        : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", planStyle === id ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-medium leading-tight">{label}</span>
                    <span className="text-[10px] leading-tight opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

          {/* Floor plan upload */}
            <ImageUploadZone
              label="平面底图"
              hint="拖拽或点击上传平面底图（线稿或黑白平面图）"
              previewUrl={floorPlanPreview}
              onFile={handleFloorPlanFile}
              onClear={() => {
                setFloorPlanFile(null);
                setFloorPlanPreview(null);
                setFloorPlanUrl(null);
                setZones([]);
                setResultUrl(null);
              }}
              onPickFromAssets={() => setAssetPickerTarget("floor")}
              isUploading={isUploadingFloor}
              required
            />

            {/* Reference image upload */}
            <ImageUploadZone
              label="参考风格图（可选）"
              hint="上传一张彩平参考图，AI 将模仿其配色和材质风格"
              previewUrl={referencePreview}
              onFile={handleReferenceFile}
              onClear={() => {
                setReferencePreview(null);
                setReferenceUrl(null);
              }}
              onPickFromAssets={() => setAssetPickerTarget("reference")}
              isUploading={isUploadingRef}
            />

            {/* Extra prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                补充说明（可选）
              </label>
              <Textarea
                placeholder="例如：北欧风格，以浅木色和白色为主，卫生间用灰色石材…"
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                className="resize-none text-sm min-h-[80px]"
              />
            </div>

            {/* Generate button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  生成中，请稍候…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {planStyle === "colored" ? "生成彩平图" : planStyle === "hand_drawn" ? "生成手绘平面" : "生成平面线稿"}
                  {zones.length > 0 && <span className="ml-1 text-xs opacity-80">（含 {zones.length} 个功能区）</span>}
                </>
              )}
            </Button>

            {/* Tips */}
            <div className="rounded-xl bg-muted/30 border border-border/30 p-4 space-y-1.5">
              <p className="text-xs font-medium text-foreground/70">使用建议</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>· 底图建议使用清晰的线稿或黑白平面图，墙线清晰效果更佳</li>
                <li>· 上传底图后，在右侧工作区使用「功能分区」工具标注各房间功能</li>
                <li>· AI 将根据功能区名称（客厅、主卧等）自动布置对应家具和材质</li>
                <li>· 提供参考风格图可显著提升配色准确度</li>
                <li>· 生成后可使用「局部修改」对特定区域进行迭代调整</li>
              </ul>
            </div>
          </div>

          {/* ── Right: Workspace Panel ── */}
          <div className="flex-1 min-w-0 px-5 py-5 flex flex-col">
            {/* Header with actions */}
            <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-3">
              <span className="text-sm font-medium text-foreground/70">
                {resultUrl ? "生成结果" : showFloorPlanInWorkspace ? "工作区" : "工作区"}
              </span>

              {/* Zone toolbar — shown when floor plan is loaded and no result yet */}
              {showFloorPlanInWorkspace && !editingMask && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-muted-foreground mr-1">功能分区</span>
                  <Button
                    variant={zoneMode === "view" ? "outline" : "default"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setZoneMode(zoneMode === "draw" ? "view" : "draw")}
                    title={zoneMode === "draw" ? "退出绘制模式" : "绘制功能分区"}
                  >
                    {zoneMode === "draw" ? (
                      <><MousePointer className="h-3 w-3" />退出绘制</>
                    ) : (
                      <><Square className="h-3 w-3" />框选分区</>
                    )}
                  </Button>
                  {zones.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => { setZones([]); setSelectedZoneId(null); }}
                      title="清除所有分区"
                    >
                      <Trash2 className="h-3 w-3" />
                      清除全部
                    </Button>
                  )}
                </div>
              )}

              {resultUrl && !editingMask && !isInpainting && (
                <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
                  <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isGenerating || !canGenerate}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    重新生成
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleImportToAssets} disabled={importAssetMutation.isPending}>
                    {importAssetMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5 mr-1.5" />}
                    导入素材库
                  </Button>
                  <Button size="sm" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    下载
                  </Button>
                </div>
              )}
            </div>

            {/* Loading state */}
            {isGenerating ? (
              <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-primary animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">AI 正在生成彩平图</p>
                  <p className="text-xs text-muted-foreground mt-1">通常需要 15–30 秒，请耐心等待</p>
                  {zones.length > 0 && (
                    <p className="text-xs text-primary/70 mt-1">已传入 {zones.length} 个功能分区信息</p>
                  )}
                </div>
              </div>
            ) : isInpainting ? (
              <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <Paintbrush className="h-7 w-7 text-amber-500 animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">AI 正在局部修改</p>
                  <p className="text-xs text-muted-foreground mt-1">通常需要 30–60 秒，请耐心等待</p>
                </div>
              </div>
            ) : resultUrl ? (
              /* Result with inline mask editor — same pattern as DesignTools */
              <div className="flex flex-col gap-3">
                <div className="relative group rounded-xl overflow-hidden border border-border/40 bg-muted/10">
                  <img
                    ref={editImgRef}
                    src={resultUrl}
                    alt="彩平图生成结果"
                    className="w-full h-auto"
                    onLoad={editingMask ? (e) => {
                      const img = e.currentTarget;
                      setEditImgDims({
                        dw: img.clientWidth,
                        dh: img.clientHeight,
                        nw: img.naturalWidth || img.clientWidth,
                        nh: img.naturalHeight || img.clientHeight,
                      });
                    } : undefined}
                  />

                  {/* Mask editor overlay */}
                  {editingMask && editImgDims && (
                    <ImageMaskEditor
                      displayWidth={editImgDims.dw}
                      displayHeight={editImgDims.dh}
                      naturalWidth={editImgDims.nw}
                      naturalHeight={editImgDims.nh}
                      onSave={(dataUrl, displayDataUrl) => {
                        setMaskDataUrl(dataUrl);
                        if (displayDataUrl) setMaskPreviewUrl(displayDataUrl);
                        setEditingMask(false);
                        toast.success("标注区域已保存，请填写修改说明后点击「局部修改」");
                      }}
                      onCancel={() => {
                        setEditingMask(false);
                        setMaskDataUrl(null);
                        setMaskPreviewUrl(null);
                        setEditImgDims(null);
                      }}
                    />
                  )}

                  {/* Mask preview overlay */}
                  {maskPreviewUrl && !editingMask && (
                    <img
                      src={maskPreviewUrl}
                      alt="标注范围"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                    />
                  )}

                  {/* Hover actions (hidden during mask editing) */}
                  {!editingMask && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                      <div className="flex gap-2 pointer-events-auto">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMaskDataUrl(null);
                            setMaskPreviewUrl(null);
                            setEditImgDims(null);
                            const readDims = () => {
                              const imgEl = editImgRef.current;
                              if (imgEl && imgEl.clientWidth > 0) {
                                setEditImgDims({
                                  dw: imgEl.clientWidth,
                                  dh: imgEl.clientHeight,
                                  nw: imgEl.naturalWidth || imgEl.clientWidth,
                                  nh: imgEl.naturalHeight || imgEl.clientHeight,
                                });
                                setEditingMask(true);
                              }
                            };
                            requestAnimationFrame(() => requestAnimationFrame(readDims));
                            setTimeout(readDims, 100);
                          }}
                        >
                          <Paintbrush className="h-3.5 w-3.5 mr-1.5" />
                          {maskDataUrl ? "重新标注" : "局部标注"}
                        </Button>
                        <Button variant="secondary" size="sm" asChild>
                          <a href={resultUrl} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            下载
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Mask saved indicator */}
                  {maskDataUrl && !editingMask && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500/90 text-white text-[10px] px-2 py-0.5 rounded-full z-30">
                      <Paintbrush className="h-2.5 w-2.5" />
                      已标注 · 填写修改说明后点击局部修改
                    </div>
                  )}
                </div>

                {/* Style badges */}
                {!editingMask && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {PLAN_STYLES.find(s => s.id === planStyle)?.label ?? "AI 生成"}
                    </Badge>
                    {referenceUrl && (
                      <Badge variant="outline" className="text-xs">参考风格图已应用</Badge>
                    )}
                    {zones.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <LayoutGrid className="h-3 w-3 mr-1" />
                        {zones.length} 个功能分区
                      </Badge>
                    )}
                  </div>
                )}

                {/* Prompt + submit (shown after mask is saved) */}
                {maskDataUrl && !editingMask && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="描述需要修改的内容，例如：将客厅区域改为深色木地板，沙发换成L形布艺沙发…"
                      value={inpaintPrompt}
                      onChange={(e) => setInpaintPrompt(e.target.value)}
                      className="resize-none text-sm min-h-[72px]"
                    />
                    <Button
                      className="w-full"
                      disabled={!inpaintPrompt.trim()}
                      onClick={async () => {
                        if (!maskDataUrl || !inpaintPrompt.trim() || !resultUrl) return;
                        setIsInpainting(true);
                        try {
                           const result = await inpaintMutation.mutateAsync({
                             imageUrl: resultUrl,
                             maskImageData: maskDataUrl,
                             prompt: inpaintPrompt.trim(),
                             toolId,
                             parentHistoryId: resultHistoryId,
                             // Pass floor plan as structural reference for AI inpainting
                             floorPlanUrl: floorPlanUrl || undefined,
                           });
                          setInpaintJobId(result.jobId);
                        } catch (e: any) {
                          toast.error(e.message || "局部修改失败，请稍后重试");
                          setIsInpainting(false);
                        }
                      }}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      局部修改
                    </Button>
                  </div>
                )}

                {/* Hint when no mask yet */}
                {!maskDataUrl && !editingMask && (
                  <p className="text-xs text-muted-foreground text-center">
                    悬停图片可使用「局部标注」工具圈出需要修改的区域
                  </p>
                )}
              </div>

            ) : showFloorPlanInWorkspace ? (
              /* ── Floor plan with zone drawing overlay ── */
              <div className="flex flex-col gap-3">
                {/* Zone mode hint */}
                {zoneMode === "draw" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/8 border border-primary/20 text-xs text-primary shrink-0">
                    <Square className="h-3.5 w-3.5 flex-shrink-0" />
                    在底图上拖拽框选区域，松开后填写功能名称（如：客厅、主卧、厨房）
                  </div>
                )}

                {/* Image with zone overlay */}
                <div className="relative rounded-xl overflow-hidden border border-border/40 bg-muted/10 select-none shrink-0">
                  <img
                    src={floorPlanPreview}
                    alt="平面底图"
                    className="w-full h-auto block"
                    draggable={false}
                  />
                  {isUploadingFloor && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                  <ZoneCanvas
                    zones={zones}
                    mode={zoneMode}
                    onAddZone={handleAddZoneDraw}
                    onSelectZone={setSelectedZoneId}
                    selectedZoneId={selectedZoneId}
                    nextColor={nextZoneColor}
                  />
                </div>

                {/* Zone list */}
                {zones.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground/70 flex items-center gap-1">
                        <LayoutGrid className="h-3.5 w-3.5" />
                        功能分区（{zones.length} 个）
                      </p>
                    </div>
                    <div className="space-y-1">
                      {zones.map((zone, idx) => (
                        <ZoneListItem
                          key={zone.id}
                          zone={zone}
                          isSelected={selectedZoneId === zone.id}
                          onSelect={() => setSelectedZoneId(selectedZoneId === zone.id ? null : zone.id)}
                          onDelete={() => handleDeleteZone(zone.id)}
                          onRename={(name) => handleRenameZone(zone.id, name)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {zones.length === 0 && zoneMode === "view" && (
                  <div className="text-center py-3">
                    <p className="text-xs text-muted-foreground">
                      点击「框选分区」工具，在底图上划定功能区域
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      也可直接生成，AI 将根据平面形状自动判断功能布局
                    </p>
                  </div>
                )}
              </div>

            ) : (
              /* Empty state */
              <div className="min-h-[400px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="h-20 w-20 rounded-2xl bg-muted/40 flex items-center justify-center">
                  <ImageIcon className="h-9 w-9 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/50">上传底图后在此标注功能分区</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">支持框选区域并填写功能名称（客厅、主卧等）</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Asset Picker */}
      <AssetPickerDialog
        open={assetPickerTarget !== null}
        onClose={() => setAssetPickerTarget(null)}
        title={assetPickerTarget === "floor" ? "从素材库选择底图" : "从素材库选择参考图"}
        onSelect={(url, _name) => {
          if (assetPickerTarget === "floor") {
            setFloorPlanPreview(url);
            setFloorPlanUrl(url);
            setZones([]);
            // Read dimensions from asset URL
            const assetImg = new Image();
            assetImg.onload = () => setFloorPlanDims({ w: assetImg.naturalWidth, h: assetImg.naturalHeight });
            assetImg.src = url;
          } else {
            setReferencePreview(url);
            setReferenceUrl(url);
          }
        }}
      />

      {/* Zone name dialog */}
      <ZoneNameDialog
        open={showZoneNameDialog}
        initialName=""
        onConfirm={handleZoneNameConfirm}
        onCancel={handleZoneNameCancel}
      />
    </div>
  );
}

// ─── Zone List Item ────────────────────────────────────────
function ZoneListItem({
  zone,
  isSelected,
  onSelect,
  onDelete,
  onRename,
}: {
  zone: Zone;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(zone.name);

  const handleSave = () => {
    if (editName.trim()) {
      onRename(editName.trim());
    } else {
      setEditName(zone.name);
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer",
        isSelected
          ? "border-primary/40 bg-primary/5"
          : "border-border/40 hover:border-border/70 bg-muted/10"
      )}
      onClick={onSelect}
    >
      {/* Color dot */}
      <div
        className="h-3 w-3 rounded-sm flex-shrink-0"
        style={{ backgroundColor: zone.color }}
      />

      {/* Name (editable) */}
      {editing ? (
        <input
          className="flex-1 bg-transparent outline-none text-foreground text-xs min-w-0"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setEditName(zone.name); setEditing(false); }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span className="flex-1 text-foreground/80 truncate">{zone.name}</span>
      )}

      {/* Position hint */}
      <span className="text-muted-foreground/50 text-[10px] flex-shrink-0">
        {Math.round(zone.w * 100)}×{Math.round(zone.h * 100)}%
      </span>

      {/* Actions */}
      <button
        className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(zone.name); }}
        title="重命名"
      >
        <Edit3 className="h-3 w-3" />
      </button>
      <button
        className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="删除分区"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
