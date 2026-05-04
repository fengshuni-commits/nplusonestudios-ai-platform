import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AiToolSelector } from "@/components/AiToolSelector";
import {
  Loader2, Upload, X, Download, ZoomIn, Layers, Sofa, ImageIcon,
  Sparkles, RefreshCw, Images,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FeedbackButtons } from "@/components/FeedbackButtons";

// ─── Constants ───────────────────────────────────────────────────────────────

const ANALYSIS_TYPES = [
  {
    id: "material" as const,
    label: "材质搭配图",
    icon: Layers,
    desc: "提取空间主要材质，生成专业材质板",
  },
  {
    id: "soft_furnishing" as const,
    label: "软装搭配图",
    icon: Sofa,
    desc: "提取软装元素，生成软装搭配情绪板",
  },
] as const;

type AnalysisType = "material" | "soft_furnishing";

// Aspect ratio options: label → "WxH" value
const ASPECT_RATIOS = [
  { label: "1:1", value: "1024x1024", desc: "方形" },
  { label: "4:3", value: "1024x768", desc: "横版" },
  { label: "3:2", value: "1024x683", desc: "横版" },
  { label: "16:9", value: "1024x576", desc: "宽屏" },
  { label: "3:4", value: "768x1024", desc: "竖版" },
  { label: "2:3", value: "683x1024", desc: "竖版" },
] as const;

type AspectRatioValue = typeof ASPECT_RATIOS[number]["value"];

const COUNT_OPTIONS = [
  { value: 1, label: "1 张" },
  { value: 3, label: "3 张" },
] as const;

// ─── Result item type ─────────────────────────────────────────────────────────
interface ResultItem {
  jobId: string;
  url?: string;
  type: AnalysisType;
  historyId?: number;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DesignAnalysis() {
  // Upload state
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generation options
  const [selectedType, setSelectedType] = useState<AnalysisType>("material");
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioValue>("1024x1024");
  const [count, setCount] = useState<1 | 3>(1);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);

  // Results: keyed by jobId, accumulates across sessions
  const [results, setResults] = useState<ResultItem[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Polling
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const utils = trpc.useUtils();

  const uploadMutation = trpc.upload.file.useMutation();
  const submitMutation = trpc.analysisImage.submit.useMutation();

  // ─── Prefill from URL params (e.g. from History "重新生成") ──────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type') as AnalysisType | null;
    const refImageUrl = params.get('referenceImageUrl');
    const toolIdParam = params.get('toolId');
    if (typeParam && (typeParam === 'material' || typeParam === 'soft_furnishing')) {
      setSelectedType(typeParam);
    }
    if (refImageUrl) {
      setReferenceUrl(refImageUrl);
      setReferencePreview(refImageUrl);
    }
    if (toolIdParam) {
      setToolId(Number(toolIdParam));
    }
  }, []);

  // ─── Cleanup polling on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ─── File upload ─────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    setReferenceFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setReferencePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });
      setReferenceUrl(result.url);
      toast.success("图片上传成功");
    } catch {
      toast.error("图片上传失败，请重试");
      setReferenceFile(null);
      setReferencePreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveReference = () => {
    setReferenceFile(null);
    setReferencePreview(null);
    setReferenceUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Polling logic ────────────────────────────────────────────────────────
  const startPolling = (jobIds: string[], type: AnalysisType) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    // Track which jobs are still pending
    const pendingSet = new Set(jobIds);

    pollTimerRef.current = setInterval(async () => {
      if (pendingSet.size === 0) {
        clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        setIsGenerating(false);
        setActiveJobIds([]);
        return;
      }

      try {
        const pollResults = await utils.analysisImage.pollJobs.fetch({
          jobIds: Array.from(pendingSet),
        });

        let anyCompleted = false;

        for (const r of pollResults) {
          if (r.status === "done") {
            pendingSet.delete(r.jobId);
            anyCompleted = true;
            setResults(prev => {
              // Update existing placeholder or prepend
              const idx = prev.findIndex(x => x.jobId === r.jobId);
              const newItem: ResultItem = {
                jobId: r.jobId,
                url: r.url,
                type,
                historyId: r.historyId ?? undefined,
                status: "done",
              };
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = newItem;
                return next;
              }
              return [newItem, ...prev];
            });
          } else if (r.status === "failed") {
            pendingSet.delete(r.jobId);
            anyCompleted = true;
            setResults(prev => {
              const idx = prev.findIndex(x => x.jobId === r.jobId);
              const newItem: ResultItem = {
                jobId: r.jobId,
                type,
                status: "failed",
                error: r.error,
              };
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = newItem;
                return next;
              }
              return [newItem, ...prev];
            });
            toast.error(`第 ${pollResults.indexOf(r) + 1} 张生成失败：${r.error}`);
          }
        }

        if (anyCompleted && pendingSet.size === 0) {
          clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setIsGenerating(false);
          setActiveJobIds([]);
          toast.success("全部生成完成");
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000);
  };

  // ─── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!referenceUrl) {
      toast.error("请先上传参考图片");
      return;
    }
    if (isUploading) {
      toast.error("图片正在上传中，请稍候");
      return;
    }

    setIsGenerating(true);
    try {
      const { jobIds } = await submitMutation.mutateAsync({
        type: selectedType,
        toolId,
        referenceImageUrl: referenceUrl,
        referenceImageContentType: referenceFile?.type || undefined,
        extraPrompt: extraPrompt.trim() || undefined,
        aspectRatio,
        count,
      });

      setActiveJobIds(jobIds);

      // Insert pending placeholders at the top
      const placeholders: ResultItem[] = jobIds.map(jobId => ({
        jobId,
        type: selectedType,
        status: "pending" as const,
      }));
      setResults(prev => [...placeholders, ...prev]);

      startPolling(jobIds, selectedType);
    } catch (err: unknown) {
      setIsGenerating(false);
      const msg = err instanceof Error ? err.message : "提交失败";
      toast.error(msg);
    }
  };

  // ─── Download ─────────────────────────────────────────────────────────────
  const handleDownload = (url: string, type: AnalysisType) => {
    const label = type === "material" ? "材质搭配图" : "软装搭配图";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}-${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  };

  const selectedTypeInfo = ANALYSIS_TYPES.find(t => t.id === selectedType)!;
  const selectedRatioInfo = ASPECT_RATIOS.find(r => r.value === aspectRatio)!;

  // Count pending/processing jobs in current batch
  const pendingCount = results.filter(
    r => activeJobIds.includes(r.jobId) && (r.status === "pending" || r.status === "processing")
  ).length;

  return (
    <div className="pb-6 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center justify-end mb-2">
          <AiToolSelector capability="rendering" value={toolId} onChange={setToolId} label="AI 工具" showBuiltIn={false} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        {/* ─── Left panel: controls ─── */}
        <div className="flex flex-col gap-4">
          {/* Reference image upload */}
          <Card className="border-border py-0 gap-0">
            <CardContent className="px-4 py-4">
              {referencePreview ? (
                <div className="relative group">
                  <img
                    src={referencePreview}
                    alt="参考图"
                    className="w-full rounded-md object-contain"
                  />
                  {isUploading && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-md">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                  <button
                    onClick={handleRemoveReference}
                    className="absolute top-2 right-2 bg-background/80 hover:bg-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4 text-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-md p-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary/70 transition-colors"
                >
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">点击上传参考图片</span>
                  <span className="text-xs">支持 JPG、PNG，最大 10MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </CardContent>
          </Card>

          {/* Analysis type selection */}
          <Card className="border-border py-0 gap-0">
            <CardContent className="flex flex-col gap-2 px-4 py-4">
              {ANALYSIS_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`flex items-start gap-3 p-3 rounded-md border text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isSelected ? "text-primary" : ""}`} />
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-foreground" : ""}`}>{type.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{type.desc}</p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Aspect ratio & size */}
          <Card className="border-border py-0 gap-0">
            <CardContent className="px-4 py-4">
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => {
                  const isSelected = aspectRatio === ratio.value;
                  return (
                    <button
                      key={ratio.value}
                      onClick={() => setAspectRatio(ratio.value)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-md border text-center transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {/* Visual ratio preview */}
                      <div className="flex items-center justify-center w-8 h-8">
                        <RatioPreview ratio={ratio.label} />
                      </div>
                      <span className={`text-xs font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {ratio.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{ratio.desc}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                当前：{selectedRatioInfo.label}（{aspectRatio.replace("x", " × ")} px）
              </p>
            </CardContent>
          </Card>

          {/* Generation count */}
          <Card className="border-border py-0 gap-0">
            <CardContent className="px-4 py-4">
              <div className="flex gap-2">
                {COUNT_OPTIONS.map((opt) => {
                  const isSelected = count === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setCount(opt.value as 1 | 3)}
                      className={`flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.value === 3 && <Images className="h-3.5 w-3.5" />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {count === 3 && (
                <p className="text-xs text-muted-foreground mt-2">
                  将并行生成 3 张，消耗约 3 倍 AI 调用额度
                </p>
              )}
            </CardContent>
          </Card>



          {/* Extra prompt */}
          <Card className="border-border py-0 gap-0">
            <CardContent className="px-4 py-4">
              <Textarea
                placeholder={`在内置提示词基础上补充额外要求，例如：\n"重点突出石材纹理" 或 "风格偏向日式侘寂"`}
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                内置提示词可在「出品标准 → 分析图提示词」中编辑
              </p>
            </CardContent>
          </Card>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || isUploading || !referenceUrl || !toolId}
            className="w-full gap-2"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成{count > 1 ? ` ${pendingCount}/${count} 张` : ""}…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                生成{selectedTypeInfo.label}{count > 1 ? ` ×${count}` : ""}
              </>
            )}
          </Button>
        </div>

        {/* ─── Right panel: results ─── */}
        <div className="flex flex-col gap-4">
          {/* Empty state */}
          {results.length === 0 && !isGenerating && (
            <Card className="border-border flex-1">
              <CardContent className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-30" />
                <p className="text-sm">上传参考图片并点击生成</p>
              </CardContent>
            </Card>
          )}

          {/* Results grid */}
          {results.length > 0 && (
            <div className="flex flex-col gap-4">
              {isGenerating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  正在生成新的{selectedTypeInfo.label}，已完成 {count - pendingCount}/{count} 张…
                </div>
              )}

              {/* Grid: 1 col normally, 2 col when count=3 and multiple done */}
              <div className={`grid gap-4 ${results.filter(r => r.status === "done").length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                {results.map((result, idx) => {
                  const typeInfo = ANALYSIS_TYPES.find(t => t.id === result.type)!;
                  const isPending = result.status === "pending" || result.status === "processing";
                  const isFailed = result.status === "failed";

                  return (
                    <Card key={result.jobId} className="border-border overflow-hidden">
                      <CardHeader className="pb-2 flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <typeInfo.icon className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm font-medium">{typeInfo.label}</CardTitle>
                          {isPending && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              生成中
                            </span>
                          )}
                          {isFailed && (
                            <span className="text-xs text-destructive">生成失败</span>
                          )}
                        </div>
                        {result.status === "done" && result.url && (
                          <div className="flex items-center gap-1">
                            {result.historyId && (
                              <FeedbackButtons historyId={result.historyId} module="analysis_image" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setLightboxUrl(result.url!)}
                              title="放大查看"
                            >
                              <ZoomIn className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDownload(result.url!, result.type)}
                              title="下载"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="p-0">
                        {isPending && (
                          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground bg-muted/20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-xs">AI 正在生成，通常需要 20–60 秒</p>
                          </div>
                        )}
                        {isFailed && (
                          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground bg-destructive/5">
                            <p className="text-xs text-destructive">{result.error || "生成失败，请重试"}</p>
                          </div>
                        )}
                        {result.status === "done" && result.url && (
                          <img
                            src={result.url}
                            alt={typeInfo.label}
                            className="w-full object-contain cursor-zoom-in"
                            onClick={() => setLightboxUrl(result.url!)}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Re-generate button */}
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || isUploading || !referenceUrl || !toolId}
                className="gap-2 self-start"
              >
                <RefreshCw className="h-4 w-4" />
                重新生成{count > 1 ? ` ×${count}` : ""}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-5xl p-2 bg-background">
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="放大查看"
              className="w-full h-full object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
// ─── RatioPreview: visual aspect ratio indicator ──────────────────────────────
function RatioPreview({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const maxSize = 24;
  let boxW: number, boxH: number;
  if (w >= h) {
    boxW = maxSize;
    boxH = Math.round((h / w) * maxSize);
  } else {
    boxH = maxSize;
    boxW = Math.round((w / h) * maxSize);
  }
  return (
    <div
      className="border-2 border-current rounded-sm opacity-60"
      style={{ width: boxW, height: boxH }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
