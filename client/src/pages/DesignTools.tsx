import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AiToolSelector } from "@/components/AiToolSelector";
import ImageMaskEditor, { ImageMaskToolbar, type ImageMaskEditorHandle } from "@/components/ImageMaskEditor";
import { trpc } from "@/lib/trpc";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, Sparkles, Download, ImageIcon, Upload, X, ImagePlus,
  RefreshCw, Paintbrush, RatioIcon, MonitorIcon, FolderOpen, Search, Check,
  Wand2, ChevronDown, ChevronUp, LayoutList, Columns2,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link2, Link2Off } from "lucide-react";

export default function DesignTools() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState<number | undefined>(undefined);
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [resolution, setResolution] = useState("standard");
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string; historyId?: number }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateCount, setGenerateCount] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  // Progress tracking
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [jobProgress, setJobProgress] = useState<Record<number, number>>({}); // index -> 0-100
  const [pendingJobCount, setPendingJobCount] = useState(0); // how many skeletons still showing

  // Mask editor imperative ref + toolbar state (lifted so toolbar can live outside the image)
  const maskEditorRef = useRef<ImageMaskEditorHandle>(null);
  const [maskBrushSize, setMaskBrushSize] = useState(30);
  const [maskTool, setMaskTool] = useState<"brush" | "eraser">("brush");
  const [maskHasDrawn, setMaskHasDrawn] = useState(false);

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

  // Material (multi: up to 4 images, each can be from asset library or local upload)
  interface MaterialItem {
    url: string | null;      // S3 URL (from asset library or after upload)
    file: File | null;       // local file (before upload)
    preview: string;         // data URL or S3 URL for display
    name: string;
  }
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const materialFileRef = useRef<HTMLInputElement>(null);
  const MAX_MATERIALS = 4;

  // Edit chain tracking
  const [parentHistoryId, setParentHistoryId] = useState<number | undefined>(undefined);

  // ─── Magnific enhancement state ───────────────────────
  const [enhancingId, setEnhancingId] = useState<number | null>(null);
  const [showEnhancePanel, setShowEnhancePanel] = useState<number | null>(null);
  const [enhanceScale, setEnhanceScale] = useState<"x2" | "x4">("x2");
  const [enhanceOptimizedFor, setEnhanceOptimizedFor] = useState("3d_renders");
  const [enhanceCreativity, setEnhanceCreativity] = useState(0);
  const [enhanceDetail, setEnhanceDetail] = useState(0);
  const [enhanceResemblance, setEnhanceResemblance] = useState(0);
  const [enhancedResults, setEnhancedResults] = useState<Record<number, { status: string; url?: string }>>({});
  // ─── Direct URL enhancement (for uploaded reference images) ───
  const [directEnhanceTaskId, setDirectEnhanceTaskId] = useState<string | null>(null);
  const [directEnhanceStatus, setDirectEnhanceStatus] = useState<"idle" | "processing" | "done" | "failed">("idle");
  const [directEnhancedUrl, setDirectEnhancedUrl] = useState<string | null>(null);
  const [showDirectEnhancePanel, setShowDirectEnhancePanel] = useState(false);
  const enhanceMutation = trpc.enhance.submit.useMutation();
  const enhanceUrlMutation = trpc.enhance.submitUrl.useMutation();
  const utils = trpc.useUtils();

  // Project association
  const { data: projectsData } = trpc.projects.list.useQuery({});
  const allProjects = Array.isArray(projectsData) ? projectsData : [];
  const updateProjectMutation = trpc.history.updateProject.useMutation({
    onSuccess: () => {
      utils.history.listGrouped.invalidate();
      toast.success("项目关联已更新");
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });
  // Track current projectId per generated image historyId
  const [imageProjectIds, setImageProjectIds] = useState<Record<number, number | null>>({});
  const handleAssociateProject = useCallback((historyId: number, projectId: number | null) => {
    updateProjectMutation.mutate({ historyId, projectId });
    setImageProjectIds(prev => ({ ...prev, [historyId]: projectId }));
  }, [updateProjectMutation]);
  const enhanceStatusQuery = trpc.enhance.status.useQuery(
    { historyId: enhancingId! },
    {
      enabled: enhancingId !== null,
      // Keep polling until done or failed (including idle/processing/no-data)
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 3000;
        if (data.status === "done" || data.status === "failed") return false;
        return 3000;
      },
      staleTime: 0, // always refetch fresh data
    }
  );
  useEffect(() => {
    if (!enhancingId || !enhanceStatusQuery.data) return;
    const { status, enhancedImageUrl } = enhanceStatusQuery.data;
    if (status === "done" && enhancedImageUrl) {
      setEnhancedResults(prev => ({ ...prev, [enhancingId]: { status: "done", url: enhancedImageUrl } }));
      setEnhancingId(null);
      toast.success("画质增强完成！");
    } else if (status === "failed") {
      setEnhancedResults(prev => ({ ...prev, [enhancingId]: { status: "failed" } }));
      setEnhancingId(null);
      toast.error("画质增强失败，请重试");
    }
  }, [enhancingId, enhanceStatusQuery.data]);

  const handleEnhanceSubmit = useCallback(async (historyId: number) => {
    setEnhancedResults(prev => ({ ...prev, [historyId]: { status: "processing" } }));
    setShowEnhancePanel(null);
    try {
      // Submit first, THEN start polling to avoid race condition
      // (if we set enhancingId before submit, the first status query may return
      //  "idle" from DB and stop the refetchInterval)
      await enhanceMutation.mutateAsync({
        historyId,
        scale: enhanceScale,
        optimizedFor: enhanceOptimizedFor as any,
        creativity: enhanceCreativity,
        hdr: enhanceDetail,
        resemblance: enhanceResemblance,
      });
      // Invalidate any stale cached status, then enable polling
      await utils.enhance.status.invalidate({ historyId });
      setEnhancingId(historyId);
    } catch (err: any) {
      setEnhancedResults(prev => ({ ...prev, [historyId]: { status: "failed" } }));
      toast.error(err?.message || "提交增强任务失败");
    }
  }, [enhanceMutation, enhanceScale, enhanceOptimizedFor, enhanceCreativity, enhanceDetail, enhanceResemblance, utils]);

  // ─── Direct URL enhance polling ───
  const directEnhancePollQuery = trpc.enhance.pollTaskId.useQuery(
    { taskId: directEnhanceTaskId! },
    {
      enabled: directEnhanceTaskId !== null && directEnhanceStatus === "processing",
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 3000;
        if (data.status === "done" || data.status === "failed") return false;
        return 3000;
      },
      staleTime: 0,
    }
  );
  useEffect(() => {
    if (!directEnhanceTaskId || !directEnhancePollQuery.data) return;
    const { status, enhancedImageUrl } = directEnhancePollQuery.data;
    if (status === "done" && enhancedImageUrl) {
      setDirectEnhancedUrl(enhancedImageUrl);
      setDirectEnhanceStatus("done");
      toast.success("画质增强完成！");
    } else if (status === "failed") {
      setDirectEnhanceStatus("failed");
      toast.error("画质增强失败，请重试");
    }
  }, [directEnhanceTaskId, directEnhancePollQuery.data]);

  const handleDirectEnhanceSubmit = useCallback(async () => {
    setDirectEnhanceStatus("processing");
    setDirectEnhancedUrl(null);
    setShowDirectEnhancePanel(false);
    try {
      // Resolve image URL: use referenceUrl directly, or upload local file first
      let imageUrl = referenceUrl;
      if (!imageUrl && referenceFile) {
        const base64 = await fileToBase64(referenceFile);
        const uploadResult = await uploadMutation.mutateAsync({
          fileName: referenceFile.name, fileData: base64, contentType: referenceFile.type, folder: "reference-images",
        });
        imageUrl = uploadResult.url;
        // Cache the URL so we don’t re-upload on retry
        setReferenceUrl(imageUrl);
      }
      if (!imageUrl) { toast.error("请先上传图片"); setDirectEnhanceStatus("idle"); return; }
      const result = await enhanceUrlMutation.mutateAsync({
        imageUrl,
        scale: enhanceScale,
        optimizedFor: enhanceOptimizedFor as any,
        creativity: enhanceCreativity,
        hdr: enhanceDetail,
        resemblance: enhanceResemblance,
      });
      setDirectEnhanceTaskId(result.taskId);
    } catch (err: any) {
      setDirectEnhanceStatus("failed");
      toast.error(err?.message || "提交增强任务失败");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enhanceUrlMutation, enhanceScale, enhanceOptimizedFor, enhanceCreativity, enhanceDetail, enhanceResemblance, referenceUrl, referenceFile, setReferenceUrl]);

  // Track reference image natural dimensions for adaptive display
  const [refImgDimensions, setRefImgDimensions] = useState<{ w: number; h: number } | null>(null);

  // Store the display-resolution mask canvas data URL for preview overlay on the base image
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);

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

  // Async rendering job polling (supports 1-3 parallel jobs)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentJobIds, setCurrentJobIds] = useState<string[]>([]);
  // Track which jobs have already been added to generatedImages to avoid duplicates
  const completedJobIdsRef = useRef<Set<string>>(new Set());

  // Single-job poll (kept for mask edit / inpaint which always produce 1 job)
  const pollJobQuery = trpc.rendering.pollJob.useQuery(
    { jobId: currentJobId! },
    {
      enabled: currentJobId !== null && currentJobIds.length <= 1,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2000;
        if (data.status === "done" || data.status === "failed" || data.status === "not_found") return false;
        return 2000;
      },
      staleTime: 0,
    }
  );
  useEffect(() => {
    if (!currentJobId || currentJobIds.length > 1 || !pollJobQuery.data) return;
    const data = pollJobQuery.data;
    if (data.status === "done") {
      const url = (data as any).url as string;
      const prompt = (data as any).prompt as string;
      const historyId = (data as any).historyId as number | undefined;
      setGeneratedImages((prev) => [{ url, prompt, historyId }, ...prev]);
      if (historyId) setParentHistoryId(historyId);
      setCurrentJobId(null);
      setCurrentJobIds([]);
      setIsGenerating(false);
      setPendingJobCount(0);
      setEditingImageIdx(null);
      setMaskDataUrl(null);
      completedJobIdsRef.current.clear();
      toast.success("图像生成完成");
    } else if (data.status === "failed") {
      const error = (data as any).error as string;
      setCurrentJobId(null);
      setCurrentJobIds([]);
      setIsGenerating(false);
      completedJobIdsRef.current.clear();
      toast.error(error || "生成失败，请重试");
    }
  }, [currentJobId, currentJobIds.length, pollJobQuery.data]);

  // Multi-job poll (for count >= 2)
  const pollJobsQuery = trpc.rendering.pollJobs.useQuery(
    { jobIds: currentJobIds },
    {
      enabled: currentJobIds.length >= 2,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2000;
        const allDone = data.every((j: any) => j.status === "done" || j.status === "failed" || j.status === "not_found");
        return allDone ? false : 2000;
      },
      staleTime: 0,
    }
  );
  useEffect(() => {
    if (currentJobIds.length < 2 || !pollJobsQuery.data) return;
    const results = pollJobsQuery.data as Array<{ jobId: string; status: string; url?: string; prompt?: string; historyId?: number; error?: string }>;
    let newlyDoneCount = 0;
    for (const r of results) {
      if (r.status === "done" && r.url && !completedJobIdsRef.current.has(r.jobId)) {
        completedJobIdsRef.current.add(r.jobId);
        setGeneratedImages((prev) => [{ url: r.url!, prompt: r.prompt || "", historyId: r.historyId }, ...prev]);
        if (r.historyId) setParentHistoryId(r.historyId);
        newlyDoneCount++;
      }
    }
    // Reduce skeleton count as images complete
    if (newlyDoneCount > 0) {
      setPendingJobCount((prev) => Math.max(0, prev - newlyDoneCount));
    }
    const allFinished = results.every((r: any) => r.status === "done" || r.status === "failed" || r.status === "not_found");
    if (allFinished) {
      const failedCount = results.filter((r: any) => r.status === "failed").length;
      const doneCount = results.filter((r: any) => r.status === "done").length;
      setCurrentJobId(null);
      setCurrentJobIds([]);
      setIsGenerating(false);
      setPendingJobCount(0);
      setEditingImageIdx(null);
      setMaskDataUrl(null);
      completedJobIdsRef.current.clear();
      if (doneCount > 0) toast.success(`生成完成，共 ${doneCount} 张`);
      if (failedCount > 0) toast.error(`${failedCount} 张生成失败`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollJobsQuery.data]);

  const generateMutation = trpc.rendering.generate.useMutation({
    onSuccess: (data) => {
      const ids = data.jobIds ?? [data.jobId];
      setCurrentJobId(ids[0]);
      setCurrentJobIds(ids);
      completedJobIdsRef.current.clear();
      setGenerationStartTime(Date.now());
      setJobProgress({});
      setPendingJobCount(ids.length);
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "生成失败，请重试");
    },
  });

  // Simulate progress for each generating job (0→90% over ~25s, then hold until done)
  useEffect(() => {
    if (!isGenerating || generationStartTime === null) return;
    const count = currentJobIds.length || 1;
    const TOTAL_MS = 25000; // estimated 25s to reach 90%
    const interval = setInterval(() => {
      const elapsed = Date.now() - generationStartTime;
      setJobProgress((prev) => {
        const next = { ...prev };
        for (let i = 0; i < count; i++) {
          const current = prev[i] ?? 0;
          if (current >= 90) continue; // hold at 90 until real completion
          // Ease-out: fast at start, slow near 90
          const target = Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / TOTAL_MS * 2.5))));
          next[i] = Math.max(current, target);
        }
        return next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isGenerating, generationStartTime, currentJobIds.length]);

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
    setMaskPreviewUrl(null);
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

  // ─── Material handlers (multi: up to 4 images) ──
  const handleSelectAsset = useCallback((asset: any) => {
    setMaterials(prev => {
      if (prev.length >= MAX_MATERIALS) { toast.error(`最多添加 ${MAX_MATERIALS} 张素材图片`); return prev; }
      if (prev.some(m => m.url === asset.fileUrl)) { toast.error("该素材已添加"); return prev; }
      return [...prev, { url: asset.fileUrl, file: null, preview: asset.thumbnailUrl || asset.fileUrl, name: asset.name }];
    });
    setShowAssetPicker(false);
    setAssetSearch("");
    toast.success(`已添加素材: ${asset.name}`);
  }, []);

  const handleMaterialFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      if (!validateImageFile(file)) continue;
      const dataUrl = await readFileAsDataUrl(file);
      setMaterials(prev => {
        if (prev.length >= MAX_MATERIALS) { toast.error(`最多添加 ${MAX_MATERIALS} 张素材图片`); return prev; }
        return [...prev, { url: null, file, preview: dataUrl, name: file.name }];
      });
    }
    if (materialFileRef.current) materialFileRef.current.value = "";
  }, [validateImageFile, readFileAsDataUrl]);

  const handleRemoveMaterial = useCallback((index: number) => {
    setMaterials(prev => prev.filter((_, i) => i !== index));
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
    setMaskPreviewUrl(null);
    toast.success("已将图片设为基础图，修改描述后再次生成");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [prompt]);

  // ─── Mask editing on result image ─────────────────────
  const handleStartMaskEdit = useCallback((idx: number) => {
    setEditingImageIdx(idx);
    setMaskDataUrl(null);
    setEditImgDims(null);
    // Also set this image as reference
    const img = generatedImages[idx];
    if (img) {
      setReferenceUrl(img.url);
      setReferencePreview(img.url);
      setReferenceFile(null);
      setReferenceName("标注编辑中");
      setMaskPreviewUrl(null);
      if (img.historyId) setParentHistoryId(img.historyId);
    }
    // After React commits, find the img element by data-editidx attribute and read its dims
    const readDims = () => {
      // First try via ref (if already bound)
      let imgEl: HTMLImageElement | null = editImgRef.current;
      // Fallback: query by data attribute in case ref hasn't been bound yet
      if (!imgEl || imgEl.clientWidth === 0) {
        imgEl = document.querySelector<HTMLImageElement>(`[data-editidx="${idx}"]`);
      }
      if (imgEl && imgEl.clientWidth > 0) {
        setEditImgDims({
          dw: imgEl.clientWidth,
          dh: imgEl.clientHeight,
          nw: imgEl.naturalWidth || imgEl.clientWidth,
          nh: imgEl.naturalHeight || imgEl.clientHeight,
        });
        // Also update the ref so handleEditImgLoad can use it
        (editImgRef as React.MutableRefObject<HTMLImageElement | null>).current = imgEl;
      }
    };
    // Double rAF to wait for React commit + browser paint
    requestAnimationFrame(() => requestAnimationFrame(readDims));
    // Also try after a short delay as fallback
    setTimeout(readDims, 150);
  }, [generatedImages]);

  const handleMaskSave = useCallback((dataUrl: string, displayDataUrl?: string) => {
    setMaskDataUrl(dataUrl);
    if (displayDataUrl) setMaskPreviewUrl(displayDataUrl);
    setMaskHasDrawn(false);
    setEditingImageIdx(null);
    setEditImgDims(null);
    toast.success("标注区域已保存，修改描述后点击「局部重绘」");
  }, []);

  const handleMaskCancel = useCallback(() => {
    setEditingImageIdx(null);
    setEditImgDims(null);
    setMaskDataUrl(null);
    setMaskPreviewUrl(null);
    setMaskHasDrawn(false);
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

      // Material images: upload local files if needed, sync to asset library
      const resolvedMaterialUrls: string[] = [];
      if (materials.length > 0) {
        setIsUploading(true);
        try {
          for (const mat of materials) {
            if (mat.url) {
              resolvedMaterialUrls.push(mat.url);
            } else if (mat.file) {
              const base64 = await fileToBase64(mat.file);
              const uploadResult = await assetsUploadMutation.mutateAsync({
                fileName: mat.file.name, fileData: base64, contentType: mat.file.type,
              });
              resolvedMaterialUrls.push(uploadResult.url);
              // Sync to asset library
              await createAssetMutation.mutateAsync({
                name: mat.file.name.replace(/\.[^.]+$/, ""),
                fileUrl: uploadResult.url,
                fileKey: uploadResult.key,
                fileType: mat.file.type,
                fileSize: mat.file.size,
                thumbnailUrl: uploadResult.url,
                category: "image",
                tags: "素材,AI效果图上传",
              });
            }
          }
          if (resolvedMaterialUrls.length > 0) {
            toast.success("素材已同步到素材库");
            refetchAssets();
          }
        } catch { toast.error("素材上传失败"); setIsGenerating(false); setIsUploading(false); return; }
        setIsUploading(false);
      }

      if (maskDataUrl) maskImageData = maskDataUrl;

      generateMutation.mutate({
        prompt, styleId, toolId,
        referenceImageUrl, parentHistoryId,
        materialImageUrls: resolvedMaterialUrls.length > 0 ? resolvedMaterialUrls : undefined,
        maskImageData,
        aspectRatio: aspectRatio !== "auto" ? aspectRatio : undefined,
        resolution: resolution !== "standard" ? resolution : undefined,
        // Only allow multi-generation when not doing inpaint/mask edit
        count: maskDataUrl ? 1 : generateCount,
      });
    } catch { setIsGenerating(false); setIsUploading(false); }
  };

  // ─── Options ──────────────────────────────────────────
  const { data: renderStylesData } = trpc.renderStyles.list.useQuery({ activeOnly: true });
  const styles = renderStylesData ?? [];

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

  // Compute reference image display style (adaptive aspect ratio)
  const refDisplayStyle = (() => {
    if (!refImgDimensions) return {};
    const ratio = refImgDimensions.w / refImgDimensions.h;
    // Use aspect-ratio CSS to match the actual image proportions
    return { aspectRatio: `${ratio}`, maxHeight: "300px" };
  })();

  return (
    <div className="space-y-1">
       <div className="space-y-1">
          <div className="flex items-center justify-end">
            <AiToolSelector capability="rendering" value={toolId} onChange={setToolId} label="AI 工具" showBuiltIn={false} />
          </div>
          <div className="grid lg:grid-cols-5 gap-6">
        {/* ─── Input Panel ───────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1 pt-1.5 px-4">
            <CardTitle className="text-sm font-medium">生成参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ── Base Image ── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" />
                基础图片
                <span className="text-xs text-muted-foreground font-normal">（可选）</span>
              </Label>

              {referencePreview ? (
                <div className="relative group rounded-lg overflow-hidden border border-border bg-muted">
                  <img
                    src={referencePreview}
                    alt="基础图片"
                    className="w-full object-contain bg-black/5"
                    style={refDisplayStyle}
                    onLoad={handleRefImageLoad}
                  />
                  {/* Mask preview overlay on the base image */}
                  {maskPreviewUrl && (
                    <img
                      src={maskPreviewUrl}
                      alt="标注范围"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors z-20" />
                  {maskDataUrl && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500/90 text-white text-[10px] px-2 py-0.5 rounded-full z-30">
                      <Paintbrush className="h-2.5 w-2.5" />
                      已标注区域
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                    <button
                      type="button"
                      onClick={handleRemoveReference}
                      className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 z-20">
                    <p className="text-xs text-white/90 truncate">{referenceName || "基础图片"}</p>
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
                    <p className="text-xs text-muted-foreground">点击或拖拽上传基础图片</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      也可点击右侧生成结果中的图片直接作为基础图
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

            {/* ── Material: multi-image (up to 4) ── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                增加素材
                <span className="text-xs text-muted-foreground font-normal">（可选，最多 {MAX_MATERIALS} 张）</span>
              </Label>

              {/* Existing materials grid */}
              {materials.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {materials.map((mat, idx) => (
                    <div key={idx} className="relative group rounded-md overflow-hidden border border-border bg-muted aspect-square">
                      <img src={mat.preview} alt={mat.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(idx)}
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                        <p className="text-[9px] text-white/90 truncate">{mat.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add buttons (shown when under limit) */}
              {materials.length < MAX_MATERIALS && (
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setShowAssetPicker(true)}
                    className="border border-dashed border-border/60 rounded-lg p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <span className="text-[10px] text-muted-foreground">素材库选择</span>
                  </div>
                  <div
                    onClick={() => materialFileRef.current?.click()}
                    className="border border-dashed border-border/60 rounded-lg p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <span className="text-[10px] text-muted-foreground">本地上传</span>
                  </div>
                </div>
              )}
              <input ref={materialFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleMaterialFileSelect} />
            </div>

            {/* ── Style + Aspect Ratio + Resolution ── */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>渲染风格</Label>
                <Select
                  value={styleId !== undefined ? String(styleId) : ""}
                  onValueChange={(v) => setStyleId(v ? Number(v) : undefined)}
                >
                  <SelectTrigger><SelectValue placeholder="选择风格（可选）" /></SelectTrigger>
                  <SelectContent>
                    {styles.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
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

            {/* ── Generate Count Selector ── */}
            {!maskDataUrl && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">生成数量</Label>
                <div className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => setGenerateCount(n)}
                      disabled={isGenerating}
                      className={`w-8 h-7 rounded text-xs font-medium transition-colors border ${
                        generateCount === n
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Generate Button ── */}
            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isUploading ? "上传图片..." : currentJobIds.length > 1 ? `生成中... (${completedJobIdsRef.current.size}/${currentJobIds.length})` : "生成中..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {maskDataUrl ? "局部重绘" : hasReference ? `图生图${generateCount > 1 ? ` ×${generateCount}` : ""}` : `生成图像${generateCount > 1 ? ` ×${generateCount}` : ""}`}
                </>
              )}
            </Button>

            {(hasReference || maskDataUrl || materials.length > 0) && (
              <p className="text-[11px] text-muted-foreground/70 text-center">
                {maskDataUrl
                  ? "将只修改标注区域，保持其余部分不变"
                  : materials.length > 0 && hasReference
                    ? "将结合基础图与素材图片共同生成新图像"
                    : hasReference
                      ? "将基于基础图片和描述共同生成新图像"
                      : "将基于描述生成新图像"}
              </p>
            )}
            {/* ── Direct Enhance Button (shown when reference image is uploaded) ── */}
            {hasReference && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">或</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button
                  variant="outline"
                  className="w-full text-sm"
                  onClick={() => setShowDirectEnhancePanel(v => !v)}
                  disabled={directEnhanceStatus === "processing"}
                >
                  {directEnhanceStatus === "processing" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />增强中...</>
                  ) : (
                    <><Wand2 className="h-4 w-4 mr-2" />增强上传图片画质</>
                  )}
                </Button>
                {showDirectEnhancePanel && directEnhanceStatus !== "processing" && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">放大倍数</Label>
                        <Select value={enhanceScale} onValueChange={(v) => setEnhanceScale(v as "x2" | "x4")}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="x2">2x</SelectItem>
                            <SelectItem value="x4">4x</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">优化场景</Label>
                        <Select value={enhanceOptimizedFor} onValueChange={setEnhanceOptimizedFor}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3d_renders">3D渲染</SelectItem>
                            <SelectItem value="standard">通用</SelectItem>
                            <SelectItem value="films_n_photography">摄影</SelectItem>
                            <SelectItem value="nature_n_landscapes">建筑</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between mb-1">
                          <Label className="text-xs">创意度</Label>
                          <span className="text-xs text-muted-foreground">{enhanceCreativity > 0 ? `+${enhanceCreativity}` : enhanceCreativity}</span>
                        </div>
                        <Slider min={-5} max={5} step={1} value={[enhanceCreativity]} onValueChange={([v]) => setEnhanceCreativity(v)} className="h-4" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <Label className="text-xs">细节度</Label>
                          <span className="text-xs text-muted-foreground">{enhanceDetail > 0 ? `+${enhanceDetail}` : enhanceDetail}</span>
                        </div>
                        <Slider min={-5} max={5} step={1} value={[enhanceDetail]} onValueChange={([v]) => setEnhanceDetail(v)} className="h-4" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <Label className="text-xs">相似度</Label>
                          <span className="text-xs text-muted-foreground">{enhanceResemblance > 0 ? `+${enhanceResemblance}` : enhanceResemblance}</span>
                        </div>
                        <Slider min={-5} max={5} step={1} value={[enhanceResemblance]} onValueChange={([v]) => setEnhanceResemblance(v)} className="h-4" />
                      </div>
                    </div>
                    <Button size="sm" className="w-full" onClick={() => handleDirectEnhanceSubmit()}>
                      <Wand2 className="h-3 w-3 mr-1" />开始增强
                    </Button>
                  </div>
                )}
                {directEnhanceStatus === "done" && directEnhancedUrl && (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
                      <span className="text-xs font-medium text-primary">❆ 增强完成</span>
                      <a href={directEnhancedUrl} download="enhanced.jpg" target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2">
                          <Download className="h-3 w-3 mr-1" />下载
                        </Button>
                      </a>
                    </div>
                    <img src={directEnhancedUrl} alt="增强结果" className="w-full object-contain max-h-48" />
                  </div>
                )}
                {directEnhanceStatus === "failed" && (
                  <p className="text-xs text-destructive text-center">增强失败，请重试</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Output Panel ────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-1 pt-1.5 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {generatedImages.length > 0 ? "生成结果" : referencePreview ? "基础图片预览" : "工作区"}
              </CardTitle>
              {generatedImages.length > 1 && (
                <div className="flex items-center gap-1 rounded-md border p-0.5">
                  <button
                    onClick={() => setCompareMode(false)}
                    title="列表视图"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                      !compareMode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">列表</span>
                  </button>
                  <button
                    onClick={() => setCompareMode(true)}
                    title="并排对比"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                      compareMode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">对比</span>
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {generatedImages.length > 0 ? (
              <div className={compareMode ? "overflow-x-auto" : "space-y-4"}>
                <div className={compareMode ? "flex gap-4 pb-2" : "space-y-4"}>
                {generatedImages.map((img, idx) => (
                  <div key={idx} className={compareMode ? "flex-none w-[min(80vw,480px)] space-y-2" : "space-y-2"}>
                    <div className="relative group rounded-lg overflow-hidden bg-muted">
                      <img
                        ref={(el) => { if (editingImageIdx === idx) (editImgRef as React.MutableRefObject<HTMLImageElement | null>).current = el; }}
                        data-editidx={idx}
                        src={img.url}
                        alt={img.prompt}
                        className={`w-full h-auto ${editingImageIdx === idx ? "" : "cursor-pointer"} transition-transform`}
                        onClick={editingImageIdx === idx ? undefined : () => handleUseAsReference(img.url, img.prompt, img.historyId)}
                        title={editingImageIdx === idx ? undefined : "点击将此图片作为基础图"}
                        onLoad={editingImageIdx === idx ? handleEditImgLoad : undefined}
                      />

                      {/* Mask editor overlay on this image */}
                      {editingImageIdx === idx && editImgDims && (
                        <ImageMaskEditor
                          ref={maskEditorRef}
                          displayWidth={editImgDims.dw}
                          displayHeight={editImgDims.dh}
                          naturalWidth={editImgDims.nw}
                          naturalHeight={editImgDims.nh}
                          onSave={handleMaskSave}
                          onCancel={handleMaskCancel}
                          onHasDrawnChange={setMaskHasDrawn}
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
                    {/* Mask toolbar — outside the image container, below it */}
                    {editingImageIdx === idx && editImgDims && (
                      <ImageMaskToolbar
                        brushSize={maskBrushSize}
                        setBrushSize={(v) => { setMaskBrushSize(v); maskEditorRef.current?.setBrushSize(v); }}
                        tool={maskTool}
                        setTool={(t) => { setMaskTool(t); maskEditorRef.current?.setTool(t); }}
                        hasDrawn={maskHasDrawn}
                        onClear={() => maskEditorRef.current?.clear()}
                        onSave={() => maskEditorRef.current?.save()}
                        onCancel={handleMaskCancel}
                      />
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2">{img.prompt}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {img.historyId && (
                        <FeedbackButtons module="ai_render" historyId={img.historyId} compact />
                      )}
                      {img.historyId && (() => {
                        const hid = img.historyId!;
                        const currentProjectId = imageProjectIds[hid] ?? null;
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-7 text-xs ${currentProjectId ? 'border-primary/50 text-primary' : ''}`}
                              >
                                <Link2 className="h-3 w-3 mr-1" />
                                {currentProjectId ? allProjects.find((p: any) => p.id === currentProjectId)?.name || '已关联' : '关联项目'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-2" side="top" align="start">
                              <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">关联到项目</p>
                              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                {currentProjectId && (
                                  <button
                                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-destructive/80 hover:text-destructive"
                                    onClick={() => handleAssociateProject(hid, null)}>
                                    <Link2Off className="h-3 w-3 inline mr-1.5" />
                                    解除关联
                                  </button>
                                )}
                                {allProjects.length === 0 && (
                                  <p className="text-xs text-muted-foreground px-2 py-1.5">暂无项目</p>
                                )}
                                {allProjects.map((p: any) => (
                                  <button
                                    key={p.id}
                                    className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors ${
                                      currentProjectId === p.id ? 'bg-primary/10 text-primary font-medium' : ''
                                    }`}
                                    onClick={() => handleAssociateProject(hid, p.id)}>
                                    {p.name}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                      {/* Magnific enhance button */}
                      {img.historyId && (() => {
                        const hid = img.historyId!;
                        const eResult = enhancedResults[hid];
                        const isThisEnhancing = enhancingId === hid;
                        if (eResult?.status === "done" && eResult.url) {
                          return (
                            <Button variant="outline" size="sm" className="h-7 text-xs border-primary/50 text-primary" asChild>
                              <a href={eResult.url} download target="_blank" rel="noopener noreferrer">
                                <Download className="h-3 w-3 mr-1" />
                                下载增强版
                              </a>
                            </Button>
                          );
                        }
                        if (isThisEnhancing || eResult?.status === "processing") {
                          return (
                            <Button variant="outline" size="sm" className="h-7 text-xs" disabled>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              增强中...
                            </Button>
                          );
                        }
                        return (
                          <div className="relative">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => setShowEnhancePanel(showEnhancePanel === hid ? null : hid)}
                            >
                              <Wand2 className="h-3 w-3" />
                              增强画质
                              {showEnhancePanel === hid ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Magnific enhance panel */}
                    {img.historyId && showEnhancePanel === img.historyId && (
                      <div className="mt-2 p-3 rounded-lg border border-border bg-muted/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium flex items-center gap-1.5">
                            <Wand2 className="h-3.5 w-3.5 text-primary" />
                            Magnific AI 画质增强
                          </p>
                          <p className="text-[10px] text-muted-foreground">Powered by Magnific</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">放大倍数</Label>
                            <Select value={enhanceScale} onValueChange={(v) => setEnhanceScale(v as "x2" | "x4")}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="x2">2倍 (2x)</SelectItem>
                                <SelectItem value="x4">4倍 (4x)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">优化场景</Label>
                            <Select value={enhanceOptimizedFor} onValueChange={setEnhanceOptimizedFor}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="3d_renders">3D渲染</SelectItem>
                                <SelectItem value="architecture">建筑</SelectItem>
                                <SelectItem value="photography">摄影</SelectItem>
                                <SelectItem value="default">通用</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-[11px]">创意度 {enhanceCreativity > 0 ? "+" : ""}{enhanceCreativity}</Label>
                            <span className="text-[10px] text-muted-foreground">AI 补全细节程度</span>
                          </div>
                          <Slider value={[enhanceCreativity]} onValueChange={([v]) => setEnhanceCreativity(v)} min={-5} max={5} step={1} className="w-full" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-[11px]">细节度 {enhanceDetail > 0 ? "+" : ""}{enhanceDetail}</Label>
                            <span className="text-[10px] text-muted-foreground">纹理清晰度</span>
                          </div>
                          <Slider value={[enhanceDetail]} onValueChange={([v]) => setEnhanceDetail(v)} min={-5} max={5} step={1} className="w-full" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-[11px]">相似度 {enhanceResemblance > 0 ? "+" : ""}{enhanceResemblance}</Label>
                            <span className="text-[10px] text-muted-foreground">与原图接近程度</span>
                          </div>
                          <Slider value={[enhanceResemblance]} onValueChange={([v]) => setEnhanceResemblance(v)} min={-5} max={5} step={1} className="w-full" />
                        </div>
                        <Button
                          size="sm"
                          className="w-full h-8 text-xs"
                          onClick={() => handleEnhanceSubmit(img.historyId!)}
                        >
                          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                          开始增强
                        </Button>
                      </div>
                    )}
                    {/* Show enhanced image if done */}
                    {img.historyId && enhancedResults[img.historyId]?.status === "done" && enhancedResults[img.historyId]?.url && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-primary font-medium flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          增强完成
                        </p>
                        <div className="rounded-lg overflow-hidden border border-primary/20">
                          <img src={enhancedResults[img.historyId!].url} alt="增强后效果图" className="w-full h-auto" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              </div>
            ) : referencePreview ? (
              /* ── Base image enlarged preview with mask editing support ── */
              <div className="space-y-3">
                <div className="relative group rounded-lg overflow-hidden bg-muted">
                  <img
                    ref={(el) => { (editImgRef as React.MutableRefObject<HTMLImageElement | null>).current = el; }}
                    src={referencePreview}
                    alt="基础图片放大预览"
                    className="w-full h-auto"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (editingImageIdx === -1) {
                        setEditImgDims({
                          dw: img.clientWidth,
                          dh: img.clientHeight,
                          nw: img.naturalWidth || img.clientWidth,
                          nh: img.naturalHeight || img.clientHeight,
                        });
                      }
                    }}
                  />

                  {/* Mask editor overlay on the base image preview */}
                  {editingImageIdx === -1 && editImgDims && (
                    <ImageMaskEditor
                      ref={maskEditorRef}
                      displayWidth={editImgDims.dw}
                      displayHeight={editImgDims.dh}
                      naturalWidth={editImgDims.nw}
                      naturalHeight={editImgDims.nh}
                      onSave={handleMaskSave}
                      onCancel={handleMaskCancel}
                      onHasDrawnChange={setMaskHasDrawn}
                    />
                  )}

                  {/* Mask preview overlay */}
                  {maskPreviewUrl && editingImageIdx !== -1 && (
                    <img
                      src={maskPreviewUrl}
                      alt="标注范围"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                    />
                  )}

                  {/* Hover actions (hidden during mask editing) */}
                  {editingImageIdx !== -1 && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                      <div className="flex gap-2 pointer-events-auto">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingImageIdx(-1);
                            setMaskDataUrl(null);
                            setMaskPreviewUrl(null);
                            setEditImgDims(null);
                            // Read dims after React commit
                            requestAnimationFrame(() => requestAnimationFrame(() => {
                              const imgEl = editImgRef.current;
                              if (imgEl && imgEl.clientWidth > 0) {
                                setEditImgDims({
                                  dw: imgEl.clientWidth,
                                  dh: imgEl.clientHeight,
                                  nw: imgEl.naturalWidth || imgEl.clientWidth,
                                  nh: imgEl.naturalHeight || imgEl.clientHeight,
                                });
                              }
                            }));
                            setTimeout(() => {
                              const imgEl = editImgRef.current;
                              if (imgEl && imgEl.clientWidth > 0) {
                                setEditImgDims({
                                  dw: imgEl.clientWidth,
                                  dh: imgEl.clientHeight,
                                  nw: imgEl.naturalWidth || imgEl.clientWidth,
                                  nh: imgEl.naturalHeight || imgEl.clientHeight,
                                });
                              }
                            }, 100);
                          }}
                        >
                          <Paintbrush className="h-3.5 w-3.5 mr-1.5" />
                          局部标注
                        </Button>
                        <Button variant="secondary" size="sm" asChild>
                          <a href={referencePreview} download target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            下载
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Mask saved indicator */}
                  {maskDataUrl && editingImageIdx !== -1 && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500/90 text-white text-[10px] px-2 py-0.5 rounded-full z-30">
                      <Paintbrush className="h-2.5 w-2.5" />
                      已标注 · 修改描述后点击局部重绘
                    </div>
                  )}
                </div>
                {/* Mask toolbar — outside the image container, below it */}
                {editingImageIdx === -1 && editImgDims && (
                  <ImageMaskToolbar
                    brushSize={maskBrushSize}
                    setBrushSize={(v) => { setMaskBrushSize(v); maskEditorRef.current?.setBrushSize(v); }}
                    tool={maskTool}
                    setTool={(t) => { setMaskTool(t); maskEditorRef.current?.setTool(t); }}
                    hasDrawn={maskHasDrawn}
                    onClear={() => maskEditorRef.current?.clear()}
                    onSave={() => maskEditorRef.current?.save()}
                    onCancel={handleMaskCancel}
                  />
                )}
                <p className="text-xs text-muted-foreground text-center">
                  悬停图片可使用「局部标注」工具圈出需要修改的区域
                </p>
              </div>
            ) : isGenerating ? (
              /* ── Generating skeleton with progress ── */
              <div className="space-y-4">
                {Array.from({ length: pendingJobCount || 1 }).map((_, i) => {
                  const pct = jobProgress[i] ?? 0;
                  const elapsed = generationStartTime ? Math.floor((Date.now() - generationStartTime) / 1000) : 0;
                  // Estimate remaining: assume 90% takes ~25s total
                  const estTotal = 30;
                  const remaining = Math.max(0, estTotal - elapsed);
                  const stage =
                    pct < 10 ? "初始化任务..."
                    : pct < 30 ? "解析提示词..."
                    : pct < 60 ? "生成图像中..."
                    : pct < 85 ? "细化渲染中..."
                    : "即将完成...";
                  return (
                    <div key={i} className="space-y-2">
                      <div className="relative rounded-lg overflow-hidden bg-muted aspect-video flex flex-col items-center justify-center gap-4">
                        {/* Subtle shimmer overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_ease-in-out_infinite] bg-[length:200%_100%]" />
                        <Loader2 className="h-8 w-8 text-muted-foreground/40 animate-spin" />
                        <div className="flex flex-col items-center gap-2 w-48">
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {/* Stage text + percent */}
                          <div className="flex items-center justify-between w-full">
                            <p className="text-[11px] text-muted-foreground/70">{stage}</p>
                            <p className="text-[11px] text-muted-foreground/50">{pct}%</p>
                          </div>
                          {/* Estimated time */}
                          {remaining > 0 && pct < 90 && (
                            <p className="text-[10px] text-muted-foreground/40">
                              预计剩余 {remaining < 60 ? `${remaining}s` : `${Math.ceil(remaining / 60)}min`}
                            </p>
                          )}
                          {currentJobIds.length > 1 && (
                            <p className="text-[10px] text-muted-foreground/40">剩余 {pendingJobCount} 张等待中</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">上传基础图片或输入场景描述后，点击生成图像</p>
                <p className="text-xs mt-1 opacity-60">
                  上传基础图片后可在此处放大预览，并使用「局部标注」进行精细编辑
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
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
