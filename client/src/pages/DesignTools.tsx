import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { PenTool, Loader2, Sparkles, Download, RotateCcw, ImageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function DesignTools() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("architectural-rendering");
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handleGenerate = () => {
    if (!prompt.trim()) { toast.error("请输入描述"); return; }
    setIsGenerating(true);
    generateMutation.mutate({ prompt, style, toolId });
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
          <p className="text-sm text-muted-foreground mt-1">AI 渲染与草图生成</p>
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
            <div className="space-y-2">
              <Label>场景描述 *</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述您想要生成的建筑场景，例如：一个现代科技公司的开放式办公空间，大面积落地窗，混凝土与木材结合的材质..."
                rows={6}
              />
            </div>
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
            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />生成图像</>
              )}
            </Button>
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
                <p className="text-xs mt-1 opacity-60">AI 将根据您的描述生成建筑渲染图或草图</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
