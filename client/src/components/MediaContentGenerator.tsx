import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Download, Upload, X, Copy, Check, ImageIcon } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import ImportProjectInfo, { type ProjectContext } from "@/components/ImportProjectInfo";

type Platform = "xiaohongshu" | "wechat" | "instagram";

interface PlatformConfig {
  platform: Platform;
  name: string;
  icon: React.ReactNode;
  color: string;
  topicPlaceholder: string;
  notesPlaceholder: string;
  description: string;
}

interface MediaContentGeneratorProps {
  config: PlatformConfig;
}

export default function MediaContentGenerator({ config }: MediaContentGeneratorProps) {
  const [topic, setTopic] = useState("");
  const [projectName, setProjectName] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultHistoryId, setResultHistoryId] = useState<number | undefined>(undefined);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Reference image
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedProjectId, setImportedProjectId] = useState<number | null>(null);

  const uploadMutation = trpc.upload.file.useMutation();
  const generateMutation = trpc.media.generate.useMutation({
    onSuccess: (data) => {
      setResult(data.textContent);
      setResultHistoryId(data.historyId || undefined);
      setCoverImageUrl(data.coverImageUrl);
      setIsGenerating(false);
      toast.success(`${config.name}内容生成完成`);
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
    const reader = new FileReader();
    reader.onload = (ev) => setReferencePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const removeReference = useCallback(() => {
    setReferenceFile(null);
    setReferencePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("请输入内容主题");
      return;
    }
    setIsGenerating(true);

    let referenceImageUrl: string | undefined;

    // Upload reference image if provided
    if (referenceFile && referencePreview) {
      try {
        setIsUploading(true);
        const base64 = referencePreview.split(",")[1];
        const uploadResult = await uploadMutation.mutateAsync({
          fileName: referenceFile.name,
          fileData: base64,
          contentType: referenceFile.type,
          folder: "media-references",
        });
        referenceImageUrl = uploadResult.url;
        setIsUploading(false);
      } catch {
        setIsUploading(false);
        toast.error("参考图片上传失败");
        setIsGenerating(false);
        return;
      }
    }

    generateMutation.mutate({
      platform: config.platform,
      topic: topic.trim(),
      projectName: projectName.trim() || undefined,
      additionalNotes: additionalNotes.trim() || undefined,
      referenceImageUrl,
    });
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const downloadImage = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.platform}-cover.png`;
    a.target = "_blank";
    a.click();
  };

  // Render result based on platform
  const renderResult = () => {
    if (!result) return null;

    if (config.platform === "xiaohongshu") {
      return (
        <div className="space-y-4">
          {/* Title */}
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-medium">标题</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.title, "title")}>
                  {copiedField === "title" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-lg font-bold">{result.title}</p>
            </CardContent>
          </Card>

          {/* Content */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-medium">正文</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.content, "content")}>
                  {copiedField === "content" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.content}</div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-medium">标签</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.tags?.map((t: string) => `#${t}`).join(" ") || "", "tags")}>
                  {copiedField === "tags" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.tags?.map((tag: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">#{tag}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (config.platform === "wechat") {
      return (
        <div className="space-y-4">
          {/* Title */}
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-medium">文章标题</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.title, "title")}>
                  {copiedField === "title" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-lg font-bold">{result.title}</p>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-medium">摘要</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.summary, "summary")}>
                  {copiedField === "summary" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground italic">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Content */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground font-medium">正文</Label>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.content, "content")}>
                  {copiedField === "content" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.content}</div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Instagram
    return (
      <div className="space-y-4">
        {/* Caption */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground font-medium">Caption</Label>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.caption, "caption")}>
                {copiedField === "caption" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.caption}</div>
          </CardContent>
        </Card>

        {/* Hashtags */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground font-medium">Hashtags</Label>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(result.hashtags?.join(" ") || "", "hashtags")}>
                {copiedField === "hashtags" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.hashtags?.map((tag: string, i: number) => (
                <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{tag}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {config.icon}
          {config.name}内容生成
        </h1>
        <p className="text-muted-foreground mt-1">{config.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          {/* Import Project Info */}
          <ImportProjectInfo
            selectedProjectId={importedProjectId}
            onImport={(ctx: ProjectContext) => {
              setImportedProjectId(ctx.project.id);
              if (ctx.project.name) setProjectName(ctx.project.name);
              // Build topic hint from project info
              const parts: string[] = [];
              if (ctx.project.projectOverview) parts.push(ctx.project.projectOverview);
              if (ctx.project.businessGoal) parts.push(ctx.project.businessGoal);
              ctx.customFields.forEach(cf => {
                if (cf.fieldValue) parts.push(`${cf.fieldName}：${cf.fieldValue}`);
              });
              if (parts.length > 0 && !topic.trim()) {
                setTopic(parts.join("\n"));
              }
            }}
          />

          {/* Reference Image */}
          <div>
            <Label className="text-sm font-medium mb-2 block">参考图片（可选）</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {referencePreview ? (
              <div className="relative group">
                <img
                  src={referencePreview}
                  alt="参考图片"
                  className="w-full h-40 object-cover rounded-lg border"
                />
                <button
                  onClick={removeReference}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-28 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs">上传参考图片，AI 将基于图片风格生成封面</span>
              </button>
            )}
          </div>

          {/* Topic */}
          <div>
            <Label className="text-sm font-medium mb-2 block">内容主题 *</Label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={config.topicPlaceholder}
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Project Name */}
          <div>
            <Label className="text-sm font-medium mb-2 block">关联项目（可选）</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="输入项目名称，内容将围绕该项目展开"
            />
          </div>

          {/* Additional Notes */}
          <div>
            <Label className="text-sm font-medium mb-2 block">补充说明（可选）</Label>
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder={config.notesPlaceholder}
              className="min-h-[60px] resize-none"
            />
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isUploading ? "上传图片中..." : "AI 生成中..."}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                生成{config.name}内容
              </>
            )}
          </Button>
        </div>

        {/* Output Panel */}
        <div className="space-y-4">
          {/* Cover Image */}
          {coverImageUrl && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground font-medium">封面配图</Label>
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => downloadImage(coverImageUrl!)}>
                    <Download className="h-3 w-3 mr-1" />
                    <span className="text-xs">下载</span>
                  </Button>
                </div>
                <img
                  src={coverImageUrl}
                  alt="封面配图"
                  className="w-full rounded-lg"
                />
              </CardContent>
            </Card>
          )}

          {/* Text Content */}
          {renderResult()}

          {/* Empty State */}
          {!result && !isGenerating && (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
              <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">输入主题后点击生成</p>
              <p className="text-xs mt-1">AI 将自动生成{config.name}风格的图文内容</p>
            </div>
          )}

          {/* Loading State */}
          {isGenerating && !result && (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
              <Loader2 className="h-8 w-8 mb-3 animate-spin opacity-40" />
              <p className="text-sm">正在生成{config.name}内容...</p>
              <p className="text-xs mt-1">AI 正在撰写文案并生成配图，请稍候</p>
            </div>
          )}

          {/* Copy All Button */}
          {result && (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  let fullText = "";
                  if (config.platform === "xiaohongshu") {
                    fullText = `${result.title}\n\n${result.content}\n\n${result.tags?.map((t: string) => `#${t}`).join(" ") || ""}`;
                  } else if (config.platform === "wechat") {
                    fullText = `${result.title}\n\n${result.summary}\n\n${result.content}`;
                  } else {
                    fullText = `${result.caption}\n\n${result.hashtags?.join(" ") || ""}`;
                  }
                  copyToClipboard(fullText, "all");
                }}
              >
                {copiedField === "all" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                复制全部内容
              </Button>
              <div className="mt-4 pt-4 border-t">
                <FeedbackButtons module={`media_${config.platform}`} historyId={resultHistoryId} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
