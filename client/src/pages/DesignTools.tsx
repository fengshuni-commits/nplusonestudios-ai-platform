import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Download, ImageIcon, Upload, X, ImagePlus } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

export default function DesignTools() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("architectural-rendering");
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reference image state
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.upload.file.useMutation();

  const generateMutation = trpc.rendering.generate.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setGeneratedImages((prev) => [{ url: data.url!, prompt: data.prompt }, ...prev]);
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

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    setReferenceFile(file);
    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferencePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveReference = useCallback(() => {
    setReferenceFile(null);
    setReferencePreview(null);
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("请输入场景描述");
      return;
    }
    setIsGenerating(true);

    try {
      let referenceImageUrl: string | undefined;

      // Upload reference image if provided
      if (referenceFile) {
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
          <p className="text-sm text-muted-foreground mt-1">AI 渲染与草图生成，支持图生图</p>
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
                    <p className="text-xs text-white/90 truncate">{referenceFile?.name}</p>
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
                      上传后 AI 将基于参考图 + 描述生成新图像
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
                  referenceFile
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
                  {referenceFile ? "图生图" : "生成图像"}
                </>
              )}
            </Button>

            {referenceFile && (
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
                      <img src={img.url} alt={img.prompt} className="w-full h-auto" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button variant="secondary" size="sm" asChild>
                          <a href={img.url} download target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-1.5" />下载
                          </a>
                        </Button>
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
                  可上传参考图片进行图生图，或直接用文字描述生成
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
      // Remove "data:image/png;base64," prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
