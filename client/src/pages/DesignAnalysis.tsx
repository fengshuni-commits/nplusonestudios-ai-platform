import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AiToolSelector } from "@/components/AiToolSelector";
import {
  Loader2, Upload, X, Download, ZoomIn, Layers, Sofa, ImageIcon,
  Sparkles, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FeedbackButtons } from "@/components/FeedbackButtons";

// ─── Type constants ──────────────────────────────────────────────────────────
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

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function DesignAnalysis() {
  // Upload state
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [selectedType, setSelectedType] = useState<AnalysisType>("material");
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Results state
  const [results, setResults] = useState<Array<{ url: string; type: AnalysisType; historyId?: number }>>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Polling
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const utils = trpc.useUtils();

  const uploadMutation = trpc.upload.file.useMutation();
  const submitMutation = trpc.analysisImage.submit.useMutation();

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
    // Local preview
    const reader = new FileReader();
    reader.onload = (ev) => setReferencePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to S3
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

  // ─── Generation ──────────────────────────────────────────────────────────
  const startPolling = (jobId: string, type: AnalysisType) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const result = await utils.analysisImage.pollJob.fetch({ jobId });
        if (result.status === "done") {
          clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setIsGenerating(false);
          setCurrentJobId(null);
          setResults(prev => [{ url: result.url, type, historyId: result.historyId ?? undefined }, ...prev]);
          toast.success("生成完成");
        } else if (result.status === "failed") {
          clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setIsGenerating(false);
          setCurrentJobId(null);
          toast.error(`生成失败：${result.error}`);
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000);
  };

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
      const { jobId } = await submitMutation.mutateAsync({
        type: selectedType,
        toolId,
        referenceImageUrl: referenceUrl,
        extraPrompt: extraPrompt.trim() || undefined,
      });
      setCurrentJobId(jobId);
      startPolling(jobId, selectedType);
    } catch (err: unknown) {
      setIsGenerating(false);
      const msg = err instanceof Error ? err.message : "提交失败";
      toast.error(msg);
    }
  };

  // ─── Download ────────────────────────────────────────────────────────────
  const handleDownload = async (url: string, type: AnalysisType) => {
    const label = type === "material" ? "材质搭配图" : "软装搭配图";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}-${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  };

  const selectedTypeInfo = ANALYSIS_TYPES.find(t => t.id === selectedType)!;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">AI 分析图</h1>
        <p className="text-sm text-muted-foreground mt-1">上传空间参考图，一键生成材质搭配图或软装搭配图</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        {/* ─── Left panel: controls ─── */}
        <div className="flex flex-col gap-4">
          {/* Reference image upload */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">参考图片</CardTitle>
            </CardHeader>
            <CardContent>
              {referencePreview ? (
                <div className="relative group">
                  <img
                    src={referencePreview}
                    alt="参考图"
                    className="w-full rounded-md object-cover max-h-64"
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
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">搭配图类型</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
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

          {/* AI tool selector */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">生图 AI 工具</CardTitle>
            </CardHeader>
            <CardContent>
              <AiToolSelector
                capability="image_generation"
                value={toolId}
                onChange={setToolId}
                showBuiltIn={true}
              />
            </CardContent>
          </Card>

          {/* Extra prompt */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">附加说明（可选）</CardTitle>
            </CardHeader>
            <CardContent>
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
            disabled={isGenerating || isUploading || !referenceUrl}
            className="w-full gap-2"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成{selectedTypeInfo.label}…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                生成{selectedTypeInfo.label}
              </>
            )}
          </Button>
        </div>

        {/* ─── Right panel: results ─── */}
        <div className="flex flex-col gap-4">
          {isGenerating && results.length === 0 && (
            <Card className="border-border flex-1">
              <CardContent className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">AI 正在生成{selectedTypeInfo.label}，请稍候…</p>
                <p className="text-xs">通常需要 20–60 秒</p>
              </CardContent>
            </Card>
          )}

          {results.length === 0 && !isGenerating && (
            <Card className="border-border flex-1">
              <CardContent className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-30" />
                <p className="text-sm">上传参考图片并点击生成</p>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && (
            <div className="flex flex-col gap-4">
              {isGenerating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  正在生成新的{selectedTypeInfo.label}…
                </div>
              )}
              {results.map((result, idx) => {
                const typeInfo = ANALYSIS_TYPES.find(t => t.id === result.type)!;
                return (
                  <Card key={idx} className="border-border overflow-hidden">
                    <CardHeader className="pb-2 flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <typeInfo.icon className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-medium">{typeInfo.label}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        {result.historyId && (
                          <FeedbackButtons historyId={result.historyId} module="analysis_image" />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setLightboxUrl(result.url)}
                          title="放大查看"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDownload(result.url, result.type)}
                          title="下载"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <img
                        src={result.url}
                        alt={typeInfo.label}
                        className="w-full object-contain cursor-zoom-in"
                        onClick={() => setLightboxUrl(result.url)}
                      />
                    </CardContent>
                  </Card>
                );
              })}

              {/* Re-generate button */}
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || isUploading || !referenceUrl}
                className="gap-2 self-start"
              >
                <RefreshCw className="h-4 w-4" />
                重新生成
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
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
