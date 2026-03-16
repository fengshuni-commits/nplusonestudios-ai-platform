import { useState, useRef, useCallback } from "react";
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
} from "lucide-react";
import AiToolSelector from "@/components/AiToolSelector";

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

// ─── Main Page ────────────────────────────────────────────
export default function ColorPlan() {
  // Floor plan (base image)
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [isUploadingFloor, setIsUploadingFloor] = useState(false);

  // Reference image
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

  // AI tool selection
  const [toolId, setToolId] = useState<number | undefined>(undefined);

  // Style & extra prompt
  const [extraPrompt, setExtraPrompt] = useState("");

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultHistoryId, setResultHistoryId] = useState<number | undefined>(undefined);

  // Asset picker
  const [assetPickerTarget, setAssetPickerTarget] = useState<"floor" | "reference" | null>(null);

  const utils = trpc.useUtils();

  const uploadFloorPlan = trpc.colorPlan.uploadFloorPlan.useMutation();
  const generateMutation = trpc.colorPlan.generate.useMutation();
  const importAssetMutation = trpc.assets.importFromHistory.useMutation({
    onSuccess: () => toast.success("已导入素材库"),
    onError: (e) => toast.error(e.message || "导入失败"),
  });

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
        extraPrompt: extraPrompt.trim() || undefined,
        toolId,
      });
      setResultUrl(result.url || null);
      setResultHistoryId(result.historyId);
      toast.success("彩平图生成成功");
    } catch (e: any) {
      toast.error(e.message || "生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `彩平图-${Date.now()}.png`;
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">AI 彩平</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              上传平面底图，参考风格图，一键生成彩色平面图
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
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">

          {/* ── Left: Input Panel ─────────────────────── */}
          <div className="border-r border-border/40 px-6 py-5 space-y-6">

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
                  生成彩平图
                </>
              )}
            </Button>

            {/* Tips */}
            <div className="rounded-xl bg-muted/30 border border-border/30 p-4 space-y-1.5">
              <p className="text-xs font-medium text-foreground/70">使用建议</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>· 底图建议使用清晰的线稿或黑白平面图，墙线清晰效果更佳</li>
                <li>· 提供参考风格图可显著提升配色准确度</li>
                <li>· 在补充说明中描述空间风格、主色调，可进一步引导生成效果</li>
              </ul>
            </div>
          </div>

          {/* ── Right: Result Panel ───────────────────── */}
          <div className="px-6 py-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">生成结果</h2>
              {resultUrl && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={isGenerating || !canGenerate}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    重新生成
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportToAssets}
                    disabled={importAssetMutation.isPending}
                  >
                    {importAssetMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    导入素材库
                  </Button>
                  <Button size="sm" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    下载
                  </Button>
                </div>
              )}
            </div>

            {isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">AI 正在生成彩平图</p>
                  <p className="text-xs text-muted-foreground mt-1">通常需要 15–30 秒，请耐心等待</p>
                </div>
              </div>
            ) : resultUrl ? (
              <div className="flex-1 flex flex-col gap-3">
                <div className="rounded-xl overflow-hidden border border-border/40 bg-muted/10 flex-1 flex items-center justify-center">
                  <img
                    src={resultUrl}
                    alt="彩平图生成结果"
                    className="w-full h-full object-contain max-h-[600px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI 生成
                  </Badge>
                  {referenceUrl && (
                    <Badge variant="outline" className="text-xs">
                      参考风格图已应用
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="h-20 w-20 rounded-2xl bg-muted/40 flex items-center justify-center">
                  <ImageIcon className="h-9 w-9 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/50">彩平图将在此显示</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    上传底图后点击「生成彩平图」
                  </p>
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
        onSelect={(url, name) => {
          if (assetPickerTarget === "floor") {
            setFloorPlanPreview(url);
            setFloorPlanUrl(url);
          } else {
            setReferencePreview(url);
            setReferenceUrl(url);
          }
        }}
      />
    </div>
  );
}
