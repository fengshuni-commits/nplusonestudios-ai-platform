import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Download, ImageIcon, Upload, X, ImagePlus, RefreshCw } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

export default function DesignTools() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("architectural-rendering");
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string; historyId?: number }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reference image state - supports both file upload and URL
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit chain tracking
  const [parentHistoryId, setParentHistoryId] = useState<number | undefined>(undefined);

  const uploadMutation = trpc.upload.file.useMutation();

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
      if (histId) {
        setParentHistoryId(Number(histId));
      }
      // Clean up URL params without reload
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchString]);

  const generateMutation = trpc.rendering.generate.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setGeneratedImages((prev) => [{ url: data.url!, prompt: data.prompt, historyId: data.historyId }, ...prev]);
        // Update parentHistoryId for next iteration in the chain
        if (data.historyId) {
          setParentHistoryId(data.historyId);
        }
      }
      setIsGenerating(false);
      toast.success("图像生成完成");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "生成失败，请重试");
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    setReferenceUrl(null);
    setReferenceName(file.name);
    setParentHistoryId(undefined); // New file upload breaks the chain
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferencePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveReference = useCallback(() => {
    setReferenceFile(null);
    setReferencePreview(null);
    setReferenceUrl(null);
    setReferenceName(null);
    setParentHistoryId(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
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
    setReferenceUrl(null);
    setReferenceName(file.name);
    setParentHistoryId(undefined);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferencePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Click generated image to use as reference for further generation
  const handleUseAsReference = useCallback((imageUrl: string, imagePrompt: string, historyId?: number) => {
    setReferenceUrl(imageUrl);
    setReferencePreview(imageUrl);
    setReferenceFile(null);
    setReferenceName("上一次生成结果");
    if (historyId) {
      setParentHistoryId(historyId);
    }
    // Pre-fill prompt with previous prompt for easy editing
    if (!prompt.trim()) {
      setPrompt(imagePrompt);
    }
    toast.success("已将图片设为参考图，修改描述后再次生成");
    // Scroll to top of the form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [prompt]);

  const hasReference = !!(referenceFile || referenceUrl);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("请输入场景描述");
      return;
    }
    setIsGenerating(true);

    try {
      let referenceImageUrl: string | undefined;

      if (referenceUrl) {
        referenceImageUrl = referenceUrl;
      } else if (referenceFile) {
        setIsUploading(true);
        try {
          const base64 = await fileToBase64(referenceFile);
          const uploadResult = await uploadMutation.mutateAsync({
            fileName: referenceFile.name,
            fileData: base64,
            contentType: referenceFile.type,
            folder: "reference-images",
          });
          referenceImageUrl = uploadResult.url;
        } catch {
          toast.error("参考图片上传失败");
          setIsGenerating(false);
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }

      generateMutation.mutate({
        prompt,
        style,
        toolId,
        referenceImageUrl,
        parentHistoryId,
      });
    } catch {
      setIsGenerating(false);
      setIsUploading(false);
    }
  };

  const styles = [
    { value: "architectural-rendering", label: "建筑渲染" },
    { value: "sketch", label: "手绘草图" },
    { value: "watercolor", label: "水彩风格" },
    { value: "minimal-line", label: "极简线稿" },
    { value: "photorealistic", label: "照片级写实" },
    { value: "conceptual", label: "概念设计" },
    { value: "axonometric", label: "轴测图" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">设计工具</h1>
          <p className="text-sm text-muted-foreground mt-1">AI 渲染与草图生成，支持图生图迭代</p>
        </div>
        <AiToolSelector category="rendering" value={toolId} onChange={setToolId} label="AI 工具" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Input Panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">生成参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reference Image Upload */}
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
                    className="w-full h-36 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  <button
                    type="button"
                    onClick={handleRemoveReference}
                    className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                    <p className="text-xs text-white/90 truncate">{referenceName || "参考图片"}</p>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-border/60 rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-muted/50 transition-colors"
                >
                  <Upload className="h-5 w-5 text-muted-foreground/60" />
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">
                      点击或拖拽上传参考图片
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      也可点击右侧生成结果中的图片直接作为参考
                    </p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Scene Description */}
            <div className="space-y-2">
              <Label>场景描述 *</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  hasReference
                    ? "描述您希望基于参考图做出的改变，例如：将材质改为清水混凝土，增加绿植墙面，改为暖色调灯光..."
                    : "描述您想要生成的建筑场景，例如：一个现代科技公司的开放式办公空间，大面积落地窗，混凝土与木材结合的材质..."
                }
                rows={5}
              />
            </div>

            {/* Style */}
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

            {/* Generate Button */}
            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isUploading ? "上传参考图..." : "生成中..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {hasReference ? "图生图" : "生成图像"}
                </>
              )}
            </Button>

            {hasReference && (
              <p className="text-[11px] text-muted-foreground/70 text-center">
                将基于参考图片和描述共同生成新图像
              </p>
            )}
          </CardContent>
        </Card>

        {/* Output Panel */}
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
                        src={img.url}
                        alt={img.prompt}
                        className="w-full h-auto cursor-pointer transition-transform"
                        onClick={() => handleUseAsReference(img.url, img.prompt, img.historyId)}
                        title="点击将此图片作为参考图，进一步生成新图像"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                        <div className="flex gap-2 pointer-events-auto">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUseAsReference(img.url, img.prompt, img.historyId);
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            继续编辑
                          </Button>
                          <Button variant="secondary" size="sm" asChild>
                            <a
                              href={img.url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="h-3.5 w-3.5 mr-1.5" />
                              下载
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{img.prompt}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">输入场景描述后，点击生成图像</p>
                <p className="text-xs mt-1 opacity-60">
                  生成后可点击结果图片，作为参考图进一步迭代
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
