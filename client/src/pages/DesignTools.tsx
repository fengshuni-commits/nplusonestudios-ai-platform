import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AiToolSelector from "@/components/AiToolSelector";
import ImageMaskEditor from "@/components/ImageMaskEditor";
import { trpc } from "@/lib/trpc";
import {
  Loader2, Sparkles, Download, ImageIcon, Upload, X, ImagePlus,
  RefreshCw, Paintbrush, RatioIcon, MonitorIcon, FolderOpen, Search, Check,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { FeedbackButtons } from "@/components/FeedbackButtons";

export default function DesignTools() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("architectural-rendering");
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [resolution, setResolution] = useState("standard");
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string; historyId?: number }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reference image state
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mask editor state — now on the right-side result image
  const [editingImageIdx, setEditingImageIdx] = useState<number | null>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  // Track displayed image dimensions for the mask overlay
  const [editImgDims, setEditImgDims] = useState<{ dw: number; dh: number; nw: number; nh: number } | null>(null);
  const editImgRef = useRef<HTMLImageElement>(null);

  // Material (dual: asset library + local upload)
  const [materialUrl, setMaterialUrl] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState<string | null>(null);
  const [materialPreview, setMaterialPreview] = useState<string | null>(null);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const materialFileRef = useRef<HTMLInputElement>(null);

  // Edit chain tracking
  const [parentHistoryId, setParentHistoryId] = useState<number | undefined>(undefined);

  // Track reference image natural dimensions for adaptive display
  const [refImgDimensions, setRefImgDimensions] = useState<{ w: number; h: number } | null>(null);

  const uploadMutation = trpc.upload.file.useMutation();
  const createAssetMutation = trpc.assets.create.useMutation();
  const assetsUploadMutation = trpc.assets.upload.useMutation();

  // Fetch assets for the picker
  const { data: allAssets, refetch: refetchAssets } = trpc.assets.list.useQuery(undefined, {
    enabled: showAssetPicker,
  });

  // Filter assets to images only, with search
  const imageAssets = useMemo(() => {
    if (!allAssets) return [];
    return allAssets.filter((a: any) => {
      const isImage = a.fileType?.startsWith("image/") ||
        /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(a.fileUrl || "") ||
        a.category === "image";
      if (!isImage) return false;
      if (assetSearch.trim()) {
        const q = assetSearch.toLowerCase();
        return (a.name?.toLowerCase().includes(q) || a.tags?.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allAssets, assetSearch]);

  // Check URL params for reference image (from history page)
  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const refUrl = params.get("ref");
    const histId = params.get("historyId");
    if (refUrl) {
      setReferenceUrl(refUrl);
      setReferencePreview(refUrl);
      setReferenceName("来自历史记录");
      if (histId) setParentHistoryId(Number(histId));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchString]);

  const generateMutation = trpc.rendering.generate.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setGeneratedImages((prev) => [{ url: data.url!, prompt: data.prompt, historyId: data.historyId }, ...prev]);
        if (data.historyId) setParentHistoryId(data.historyId);
      }
      setIsGenerating(false);
      setEditingImageIdx(null);
      setMaskDataUrl(null);
      toast.success("图像生成完成");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "生成失败，请重试");
    },
  });

  // ─── File handling helpers ─────────────────────────────
  const validateImageFile = useCallback((file: File): boolean => {
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return false; }
    if (file.size > 10 * 1024 * 1024) { toast.error("图片大小不能超过 10MB"); return false; }
    return true;
  }, []);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
  }, []);

  // ─── Reference image handlers ─────────────────────────
  const handleRefFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    setReferenceFile(file);
    setReferenceUrl(null);
    setReferenceName(file.name);
    setParentHistoryId(undefined);
    setMaskDataUrl(null);
    setEditingImageIdx(null);
    const dataUrl = await readFileAsDataUrl(file);
    setReferencePreview(dataUrl);
  }, [validateImageFile, readFileAsDataUrl]);

  const handleRemoveReference = useCallback(() => {
    setReferenceFile(null);
    setReferencePreview(null);
    setReferenceUrl(null);
    setReferenceName(null);
    setParentHistoryId(undefined);
    setMaskDataUrl(null);
    setEditingImageIdx(null);
    setRefImgDimensions(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleRefDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file || !validateImageFile(file)) return;
    setReferenceFile(file);
    setReferenceUrl(null);
    setReferenceName(file.name);
    setParentHistoryId(undefined);
    setMaskDataUrl(null);
    setEditingImageIdx(null);
    const dataUrl = await readFileAsDataUrl(file);
    setReferencePreview(dataUrl);
  }, [validateImageFile, readFileAsDataUrl]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);

  // ─── Material handlers (dual: library + local upload) ──
  const handleSelectAsset = useCallback((asset: any) => {
    setMaterialUrl(asset.fileUrl);
    setMaterialPreview(asset.thumbnailUrl || asset.fileUrl);
    setMaterialName(asset.name);
    setMaterialFile(null);
    setShowAssetPicker(false);
    setAssetSearch("");
    toast.success(`已选择素材: ${asset.name}`);
  }, []);

  const handleMaterialFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    setMaterialFile(file);
    setMaterialUrl(null);
    setMaterialName(file.name);
    const dataUrl = await readFileAsDataUrl(file);
    setMaterialPreview(dataUrl);
  }, [validateImageFile, readFileAsDataUrl]);

  const handleRemoveMaterial = useCallback(() => {
    setMaterialUrl(null);
    setMaterialPreview(null);
    setMaterialName(null);
    setMaterialFile(null);
    if (materialFileRef.current) materialFileRef.current.value = "";
  }, []);

  // ─── Use generated image as reference ─────────────────
  const handleUseAsReference = useCallback((imageUrl: string, imagePrompt: string, historyId?: number) => {
    setReferenceUrl(imageUrl);
    setReferencePreview(imageUrl);
    setReferenceFile(null);
    setReferenceName("上一次生成结果");
    setMaskDataUrl(null);
    setEditingImageIdx(null);
    if (historyId) setParentHistoryId(historyId);
    if (!prompt.trim()) setPrompt(imagePrompt);
    toast.success("已将图片设为参考图，修改描述后再次生成");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [prompt]);

  // ─── Mask editing on result image ─────────────────────
  const handleStartMaskEdit = useCallback((idx: number) => {
    setEditingImageIdx(idx);
    setMaskDataUrl(null);
    // Also set this image as reference
    const img = generatedImages[idx];
    if (img) {
      setReferenceUrl(img.url);
      setReferencePreview(img.url);
      setReferenceFile(null);
      setReferenceName("标注编辑中");
      if (img.historyId) setParentHistoryId(img.historyId);
    }
  }, [generatedImages]);

  const handleMaskSave = useCallback((dataUrl: string) => {
    setMaskDataUrl(dataUrl);
    toast.success("标注区域已保存，修改描述后点击「局部重绘」");
  }, []);

  const handleMaskCancel = useCallback(() => {
    setEditingImageIdx(null);
    setMaskDataUrl(null);
  }, []);

  // Track result image load for mask overlay dimensions
  const handleEditImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setEditImgDims({
      dw: img.clientWidth,
      dh: img.clientHeight,
      nw: img.naturalWidth,
      nh: img.naturalHeight,
    });
  }, []);

  // ─── Reference image load for dimensions ──────────────
  const handleRefImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setRefImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // ─── Generate ─────────────────────────────────────────
  const hasReference = !!(referenceFile || referenceUrl);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("请输入场景描述"); return; }
    setIsGenerating(true);

    try {
      let referenceImageUrl: string | undefined;
      let materialImageUrl: string | undefined;
      let maskImageData: string | undefined;

      // Upload reference image if needed
      if (referenceUrl) {
        referenceImageUrl = referenceUrl;
      } else if (referenceFile) {
        setIsUploading(true);
        try {
          const base64 = await fileToBase64(referenceFile);
          const uploadResult = await uploadMutation.mutateAsync({
            fileName: referenceFile.name, fileData: base64, contentType: referenceFile.type, folder: "reference-images",
          });
          referenceImageUrl = uploadResult.url;
        } catch { toast.error("参考图片上传失败"); setIsGenerating(false); setIsUploading(false); return; }
        setIsUploading(false);
      }

      // Material image: upload local file if needed, and sync to asset library
      if (materialUrl) {
        materialImageUrl = materialUrl;
      } else if (materialFile) {
        setIsUploading(true);
        try {
          const base64 = await fileToBase64(materialFile);
          // Upload to assets storage
          const uploadResult = await assetsUploadMutation.mutateAsync({
            fileName: materialFile.name, fileData: base64, contentType: materialFile.type,
          });
          materialImageUrl = uploadResult.url;
          // Sync to asset library
          await createAssetMutation.mutateAsync({
            name: materialFile.name.replace(/\.[^.]+$/, ""),
            fileUrl: uploadResult.url,
            fileKey: uploadResult.key,
            fileType: materialFile.type,
            fileSize: materialFile.size,
            thumbnailUrl: uploadResult.url,
            category: "image",
            tags: "素材,设计工具上传",
          });
          toast.success("素材已同步到素材库");
          refetchAssets();
        } catch { toast.error("素材上传失败"); setIsGenerating(false); setIsUploading(false); return; }
        setIsUploading(false);
      }

      if (maskDataUrl) maskImageData = maskDataUrl;

      generateMutation.mutate({
        prompt, style, toolId,
        referenceImageUrl, parentHistoryId,
        materialImageUrl, maskImageData,
        aspectRatio: aspectRatio !== "auto" ? aspectRatio : undefined,
        resolution: resolution !== "standard" ? resolution : undefined,
      });
    } catch { setIsGenerating(false); setIsUploading(false); }
  };

  // ─── Options ──────────────────────────────────────────
  const styles = [
    { value: "architectural-rendering", label: "建筑渲染" },
    { value: "sketch", label: "手绘草图" },
    { value: "watercolor", label: "水彩风格" },
    { value: "minimal-line", label: "极简线稿" },
    { value: "photorealistic", label: "照片级写实" },
    { value: "conceptual", label: "概念设计" },
    { value: "axonometric", label: "轴测图" },
  ];

  const aspectRatios = [
    { value: "auto", label: "自动" },
    { value: "1:1", label: "1:1 正方形" },
    { value: "4:3", label: "4:3 标准" },
    { value: "3:2", label: "3:2 经典" },
    { value: "16:9", label: "16:9 宽屏" },
    { value: "9:16", label: "9:16 竖屏" },
    { value: "3:4", label: "3:4 竖版" },
  ];

  const resolutions = [
    { value: "standard", label: "标准 (1024px)" },
    { value: "hd", label: "高清 (1536px)" },
    { value: "ultra", label: "超高清 (2048px)" },
  ];

  // Compute reference image display style (adaptive)
  const refDisplayStyle = (() => {
    if (!refImgDimensions) return {};
    const ratio = refImgDimensions.w / refImgDimensions.h;
    if (ratio > 2) return { maxHeight: "120px" };
    if (ratio > 1.2) return { maxHeight: "200px" };
    if (ratio < 0.6) return { maxHeight: "280px" };
    if (ratio < 0.9) return { maxHeight: "240px" };
    return { maxHeight: "220px" };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">设计工具</h1>
          <p className="text-sm text-muted-foreground mt-1">AI 渲染与草图生成，支持图生图迭代与局部调整</p>
        </div>
        <AiToolSelector category="rendering" value={toolId} onChange={setToolId} label="AI 工具" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ─── Input Panel ─────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">生成参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ── Reference Image ── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" />
                参考图片
                <span className="text-xs text-muted-foreground font-normal">（可选）</span>
              </Label>

              {referencePreview ? (
                <div className="relative group rounded-lg overflow-hidden border border-border bg-muted">
                  <img
                    src={referencePreview}
                    alt="参考图片"
                    className="w-full object-contain bg-black/5"
                    style={refDisplayStyle}
                    onLoad={handleRefImageLoad}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  {maskDataUrl && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500/90 text-white text-[10px] px-2 py-0.5 rounded-full">
                      <Paintbrush className="h-2.5 w-2.5" />
                      已标注区域
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={handleRemoveReference}
                      className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                    <p className="text-xs text-white/90 truncate">{referenceName || "参考图片"}</p>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleRefDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-border/60 rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
                >
                  <Upload className="h-5 w-5 text-muted-foreground/60" />
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">点击或拖拽上传参考图片</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      也可点击右侧生成结果中的图片直接作为参考
                    </p>
                  </div>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefFileSelect} />
            </div>

            {/* ── Scene Description ── */}
            <div className="space-y-2">
              <Label>场景描述 *</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  hasReference
                    ? maskDataUrl
                      ? "描述标注区域需要做的调整，例如：将这个区域的材质改为木饰面，增加绿植..."
                      : "描述您希望基于参考图做出的改变，例如：将材质改为清水混凝土，增加绿植墙面..."
                    : "描述您想要生成的建筑场景，例如：一个现代科技公司的开放式办公空间，大面积落地窗..."
                }
                rows={4}
              />
            </div>

            {/* ── Material: dual entry (asset library + local upload) ── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                增加素材
                <span className="text-xs text-muted-foreground font-normal">（可选）</span>
              </Label>

              {materialPreview ? (
                <div className="relative group rounded-lg overflow-hidden border border-border bg-muted">
                  <img src={materialPreview} alt="素材图片" className="w-full h-24 object-contain bg-black/5" />
                  <button
                    type="button"
                    onClick={handleRemoveMaterial}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1">
                    <p className="text-[10px] text-white/90 truncate">{materialName || "素材"}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setShowAssetPicker(true)}
                    className="border border-dashed border-border/60 rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground/50" />
                    <span className="text-[11px] text-muted-foreground">素材库选择</span>
                  </div>
                  <div
                    onClick={() => materialFileRef.current?.click()}
                    className="border border-dashed border-border/60 rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-muted-foreground/50" />
                    <span className="text-[11px] text-muted-foreground">本地上传</span>
                  </div>
                </div>
              )}
              <input ref={materialFileRef} type="file" accept="image/*" className="hidden" onChange={handleMaterialFileSelect} />
            </div>

            {/* ── Style + Aspect Ratio + Resolution ── */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>渲染风格</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {styles.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <RatioIcon className="h-3 w-3" />
                    图片比例
                  </Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {aspectRatios.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <MonitorIcon className="h-3 w-3" />
                    分辨率
                  </Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {resolutions.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── Generate Button ── */}
            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isUploading ? "上传图片..." : "生成中..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {maskDataUrl ? "局部重绘" : hasReference ? "图生图" : "生成图像"}
                </>
              )}
            </Button>

            {(hasReference || maskDataUrl || materialPreview) && (
              <p className="text-[11px] text-muted-foreground/70 text-center">
                {maskDataUrl
                  ? "将只修改标注区域，保持其余部分不变"
                  : materialPreview && hasReference
                    ? "将结合参考图与素材图片共同生成新图像"
                    : hasReference
                      ? "将基于参考图片和描述共同生成新图像"
                      : "将基于描述生成新图像"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ─── Output Panel ────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">生成结果</CardTitle>
          </CardHeader>
          <CardContent>
            {generatedImages.length > 0 ? (
              <div className="space-y-4">
                {generatedImages.map((img, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="relative group rounded-lg overflow-hidden bg-muted">
                      <img
                        ref={editingImageIdx === idx ? editImgRef : undefined}
                        src={img.url}
                        alt={img.prompt}
                        className={`w-full h-auto ${editingImageIdx === idx ? "" : "cursor-pointer"} transition-transform`}
                        onClick={editingImageIdx === idx ? undefined : () => handleUseAsReference(img.url, img.prompt, img.historyId)}
                        title={editingImageIdx === idx ? undefined : "点击将此图片作为参考图"}
                        onLoad={editingImageIdx === idx ? handleEditImgLoad : undefined}
                      />

                      {/* Mask editor overlay on this image */}
                      {editingImageIdx === idx && editImgDims && (
                        <ImageMaskEditor
                          displayWidth={editImgDims.dw}
                          displayHeight={editImgDims.dh}
                          naturalWidth={editImgDims.nw}
                          naturalHeight={editImgDims.nh}
                          onSave={handleMaskSave}
                          onCancel={handleMaskCancel}
                        />
                      )}

                      {/* Hover actions (hidden during mask editing) */}
                      {editingImageIdx !== idx && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                          <div className="flex gap-2 pointer-events-auto">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleUseAsReference(img.url, img.prompt, img.historyId); }}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              继续编辑
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleStartMaskEdit(idx); }}
                            >
                              <Paintbrush className="h-3.5 w-3.5 mr-1.5" />
                              局部标注
                            </Button>
                            <Button variant="secondary" size="sm" asChild>
                              <a href={img.url} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                下载
                              </a>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Mask saved indicator */}
                      {maskDataUrl && editingImageIdx === null && idx === 0 && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500/90 text-white text-[10px] px-2 py-0.5 rounded-full">
                          <Paintbrush className="h-2.5 w-2.5" />
                          已标注 · 修改描述后点击局部重绘
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{img.prompt}</p>
                    {img.historyId && (
                      <FeedbackButtons module="ai_render" historyId={img.historyId} compact />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">输入场景描述后，点击生成图像</p>
                <p className="text-xs mt-1 opacity-60">
                  生成后可点击结果图片作为参考图，或使用「局部标注」进行精细编辑
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Asset Picker Dialog ──────────────────────── */}
      <Dialog open={showAssetPicker} onOpenChange={setShowAssetPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              从素材库选择
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="搜索素材名称或标签..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[50vh]">
            {imageAssets.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 p-1">
                {imageAssets.map((asset: any) => (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className="group relative rounded-lg overflow-hidden border border-border bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  >
                    <div className="aspect-square">
                      <img src={asset.thumbnailUrl || asset.fileUrl} alt={asset.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                      <p className="text-[11px] text-white/90 truncate">{asset.name}</p>
                      {asset.tags && <p className="text-[9px] text-white/60 truncate">{asset.tags}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">{assetSearch ? "没有找到匹配的素材" : "素材库中暂无图片素材"}</p>
                <p className="text-xs mt-1 opacity-60">请先在管理页面上传素材到素材库</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Convert File to base64 string (without data URI prefix) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
