import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Compass, FileText, Download, Loader2, Sparkles, Presentation, ImageIcon, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type PptStage = "idle" | "structuring" | "generating_images" | "building_pptx" | "done";

export default function DesignPlanning() {
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState({
    projectName: "",
    projectType: "office",
    requirements: "",
    referenceCount: 5,
  });
  const [report, setReport] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pptStage, setPptStage] = useState<PptStage>("idle");
  const [pptProgress, setPptProgress] = useState(0);
  const [pptJobId, setPptJobId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateMutation = trpc.benchmark.generate.useMutation({
    onSuccess: (data) => {
      setReport(data.content);
      setIsGenerating(false);
      toast.success("调研报告生成完成");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "生成失败，请重试");
    },
  });

  const startExportMutation = trpc.benchmark.startExportPpt.useMutation({
    onSuccess: (data) => {
      setPptJobId(data.jobId);
      // Polling will start via useEffect below
    },
    onError: () => {
      setPptStage("idle");
      setPptProgress(0);
      toast.error("PPT 生成启动失败，请重试");
    },
  });

  const utils = trpc.useUtils();

  // Poll for PPT job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const result = await utils.benchmark.exportPptStatus.fetch({ jobId });
      if (result.status === "done") {
        setPptStage("done");
        setPptProgress(100);
        toast.success(`PPT 已生成（${result.slideCount} 页，含 ${result.imageCount} 张配图），正在下载...`);
        // Trigger download
        const a = document.createElement("a");
        a.href = result.url!;
        a.download = `${result.title}-对标调研.pptx`;
        a.target = "_blank";
        a.click();
        // Reset after a delay
        setTimeout(() => {
          setPptStage("idle");
          setPptProgress(0);
          setPptJobId(null);
        }, 3000);
        return true; // Stop polling
      } else if (result.status === "failed") {
        setPptStage("idle");
        setPptProgress(0);
        setPptJobId(null);
        toast.error(result.error || "PPT 生成失败，请重试");
        return true; // Stop polling
      } else if (result.status === "not_found") {
        setPptStage("idle");
        setPptProgress(0);
        setPptJobId(null);
        toast.error("PPT 任务未找到，请重试");
        return true; // Stop polling
      } else {
        // Still processing - update progress from server
        setPptProgress(result.progress || 0);
        const stage = result.stage as PptStage;
        if (stage && stage !== "idle" && stage !== "done") {
          setPptStage(stage);
        }
        return false; // Continue polling
      }
    } catch (err) {
      console.error("[PPT Poll] Error:", err);
      // Don't stop polling on transient errors - just log and retry
      return false;
    }
  }, [utils]);

  // Start/stop polling when jobId changes
  useEffect(() => {
    if (!pptJobId) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    // Poll every 3 seconds
    const poll = async () => {
      const shouldStop = await pollJobStatus(pptJobId);
      if (shouldStop && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    // Initial poll after a short delay
    const initialTimeout = setTimeout(poll, 1500);
    pollTimerRef.current = setInterval(poll, 3000);

    return () => {
      clearTimeout(initialTimeout);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [pptJobId, pollJobStatus]);

  const handleGenerate = () => {
    if (!form.projectName.trim()) { toast.error("请输入项目名称"); return; }
    if (!form.requirements.trim()) { toast.error("请输入项目需求"); return; }
    setIsGenerating(true);
    setReport("");
    generateMutation.mutate({ ...form, toolId });
  };

  const handleExportPpt = () => {
    if (!report) { toast.error("请先生成调研报告"); return; }
    setPptStage("structuring");
    setPptProgress(5);
    startExportMutation.mutate({ content: report, title: form.projectName, projectType: form.projectType });
  };

  const projectTypes = [
    { value: "office", label: "办公空间" },
    { value: "exhibition", label: "展厅展馆" },
    { value: "lab", label: "研发实验室" },
    { value: "factory", label: "工厂厂房" },
    { value: "commercial", label: "商业空间" },
    { value: "cultural", label: "文化空间" },
    { value: "other", label: "其他" },
  ];

  const pptStageLabels: Record<PptStage, string> = {
    idle: "",
    structuring: "正在分析报告结构，规划 PPT 页面...",
    generating_images: "正在获取真实案例照片与设计配图...",
    building_pptx: "正在组装 PPT 文件并上传...",
    done: "PPT 生成完成！",
  };

  const isPptGenerating = pptStage !== "idle" && pptStage !== "done";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">项目策划</h1>
          <p className="text-sm text-muted-foreground mt-1">对标调研与设计任务书生成</p>
        </div>
        <AiToolSelector category="analysis" value={toolId} onChange={setToolId} label="AI 工具" />
      </div>

      <Tabs defaultValue="benchmark">
        <TabsList>
          <TabsTrigger value="benchmark">
            <Compass className="h-4 w-4 mr-1.5" />对标调研
          </TabsTrigger>
          <TabsTrigger value="brief">
            <FileText className="h-4 w-4 mr-1.5" />设计任务书
          </TabsTrigger>
        </TabsList>

        <TabsContent value="benchmark" className="mt-4">
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Input Panel */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-medium">调研参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>项目名称 *</Label>
                  <Input
                    value={form.projectName}
                    onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                    placeholder="例：某科技园区总部办公楼"
                  />
                </div>
                <div className="space-y-2">
                  <Label>项目类型</Label>
                  <Select value={form.projectType} onValueChange={(v) => setForm({ ...form, projectType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {projectTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>项目需求与描述 *</Label>
                  <Textarea
                    value={form.requirements}
                    onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                    placeholder="描述项目的核心需求、面积、功能要求、风格偏好等..."
                    rows={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>对标案例数量</Label>
                  <Select value={form.referenceCount.toString()} onValueChange={(v) => setForm({ ...form, referenceCount: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 5, 8, 10].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n} 个案例</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" />生成调研报告</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Output Panel */}
            <div className="lg:col-span-3 space-y-4">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-medium">调研报告</CardTitle>
                </CardHeader>
                <CardContent>
                  {report ? (
                    <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                      <Streamdown>{report}</Streamdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Compass className="h-12 w-12 mb-3 opacity-20" />
                      <p className="text-sm">填写项目信息后，点击生成调研报告</p>
                      <p className="text-xs mt-1 opacity-60">AI 将为您分析对标案例并生成专业报告</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* PPT Generation Section - Only visible after report is generated */}
              {report && (
                <Card className="border-2 border-dashed border-accent/30 bg-accent/5">
                  <CardContent className="py-6">
                    {pptStage === "idle" ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-3 text-center">
                          <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Presentation className="h-6 w-6 text-accent" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-medium text-foreground">生成对标案例 PPT</h3>
                            <p className="text-sm text-muted-foreground">
                              约 15 页图文并茂的 PPTX，案例页含真实项目照片，设计思路页含 Pexels 配图
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={handleExportPpt}
                          size="lg"
                          className="bg-accent hover:bg-accent/90 text-white px-8"
                        >
                          <Presentation className="h-4 w-4 mr-2" />
                          生成 PPT
                        </Button>
                      </div>
                    ) : pptStage === "done" ? (
                      <div className="flex flex-col items-center gap-3">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                        <p className="font-medium text-green-700">PPT 生成完成，已开始下载</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-accent" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{pptStageLabels[pptStage]}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {pptStage === "generating_images" && (
                                <span className="flex items-center gap-1">
                                  <ImageIcon className="h-3 w-3" />
                                  正在从来源网站抓取真实案例照片，并从 Pexels 获取设计配图...
                                </span>
                              )}
                              {pptStage === "structuring" && "分析报告内容，规划封面、目录、案例分析、总结等页面"}
                              {pptStage === "building_pptx" && "将文字和图片组装为 PPTX 文件并上传"}
                            </p>
                          </div>
                          <span className="text-sm font-mono text-muted-foreground">{pptProgress}%</span>
                        </div>
                        <Progress value={pptProgress} className="h-2" />
                        <div className="flex justify-center gap-6 text-xs text-muted-foreground">
                          <span className={pptStage === "structuring" ? "text-accent font-medium" : pptProgress > 25 ? "text-foreground" : ""}>
                            ① 结构化
                          </span>
                          <span className={pptStage === "generating_images" ? "text-accent font-medium" : pptProgress > 65 ? "text-foreground" : ""}>
                            ② 获取照片
                          </span>
                          <span className={pptStage === "building_pptx" ? "text-accent font-medium" : pptProgress > 90 ? "text-foreground" : ""}>
                            ③ 组装导出
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="brief" className="mt-4">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <h3 className="text-lg font-medium text-foreground/70 mb-1">设计任务书生成</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                该功能正在开发中，将支持根据项目信息自动生成标准化设计任务书。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
