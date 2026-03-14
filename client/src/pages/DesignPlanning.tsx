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
import { Compass, FileText, Download, Loader2, Sparkles, Presentation, ImageIcon, CheckCircle2, RefreshCw, Send, MessageSquare } from "lucide-react";
import ImportProjectInfo, { type ProjectContext } from "@/components/ImportProjectInfo";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { FeedbackButtons } from "@/components/FeedbackButtons";

type PptStage = "idle" | "structuring" | "generating_images" | "building_pptx" | "done";

interface PptResult {
  url: string;
  title: string;
  slideCount: number;
  imageCount: number;
}

export default function DesignPlanning() {
  const [location] = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const historyIdParam = searchParams.get("historyId");
  const [toolId, setToolId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState({
    projectName: "",
    projectType: "office",
    requirements: "",
    referenceCount: 5,
  });
  const [importedProjectId, setImportedProjectId] = useState<number | null>(null);
  const [report, setReport] = useState<string>("");
  const [reportHistoryId, setReportHistoryId] = useState<number | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const generateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pptStage, setPptStage] = useState<PptStage>("idle");
  const [pptProgress, setPptProgress] = useState(0);
  const [pptJobId, setPptJobId] = useState<string | null>(null);
  const [pptResult, setPptResult] = useState<PptResult | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [benchmarkJobId, setBenchmarkJobId] = useState<string | null>(null);
  const benchmarkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Conversation / refine state
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const stopBenchmarkTimer = () => {
    if (generateTimerRef.current) { clearInterval(generateTimerRef.current); generateTimerRef.current = null; }
    setGenerateElapsed(0);
  };

  const refineMutation = trpc.benchmark.refine.useMutation({
    onSuccess: (data) => {
      setReport(data.content);
      setChatHistory(prev => [...prev, { role: "assistant", content: data.content }]);
      setIsRefining(false);
    },
    onError: (err) => {
      setIsRefining(false);
      toast.error(err.message || "调整失败，请重试");
    },
  });

  const handleChatSubmit = () => {
    if (!chatInput.trim() || isRefining || !report) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", content: userMsg }]);
    setIsRefining(true);
    refineMutation.mutate({
      currentReport: report,
      feedback: userMsg,
      projectName: form.projectName,
      projectType: form.projectType,
      toolId,
    });
  };

  const generateMutation = trpc.benchmark.generate.useMutation({
    onSuccess: (data) => {
      setBenchmarkJobId(data.jobId);
    },
    onError: (err) => {
      setIsGenerating(false);
      stopBenchmarkTimer();
      toast.error(err.message || "生成失败，请重试");
    },
  });

  const utils = trpc.useUtils();

  // Load history record when historyId param is present
  const historyQuery = trpc.history.getById.useQuery(
    { id: Number(historyIdParam) },
    { enabled: !!historyIdParam && !isNaN(Number(historyIdParam)) }
  );

  useEffect(() => {
    if (historyQuery.data && historyQuery.data.outputContent) {
      const rec = historyQuery.data;
      setReport(rec.outputContent ?? "");
      setReportHistoryId(rec.id);
      // Try to restore form fields from title
      if (rec.title) setForm(prev => ({ ...prev, projectName: rec.title }));
      toast.success("已加载历史报告，可继续编辑");
    }
  }, [historyQuery.data?.id]);

  // Poll benchmark job status
  const pollBenchmarkStatus = useCallback(async (jobId: string) => {
    try {
      const result = await utils.benchmark.pollStatus.fetch({ jobId });
      if (result.status === "done") {
        setReport(result.content || "");
        setReportHistoryId((result as any).historyId || undefined);
        setIsGenerating(false);
        stopBenchmarkTimer();
        setBenchmarkJobId(null);
        toast.success("调研报告生成完成");
        return true;
      } else if (result.status === "failed") {
        setIsGenerating(false);
        stopBenchmarkTimer();
        setBenchmarkJobId(null);
        toast.error((result as any).error || "生成失败，请重试");
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Benchmark Poll] Error:", err);
      return false;
    }
  }, [utils]);

  // Start/stop polling when benchmarkJobId changes
  useEffect(() => {
    if (!benchmarkJobId) {
      if (benchmarkPollRef.current) { clearInterval(benchmarkPollRef.current); benchmarkPollRef.current = null; }
      return;
    }
    const poll = async () => {
      const shouldStop = await pollBenchmarkStatus(benchmarkJobId);
      if (shouldStop && benchmarkPollRef.current) { clearInterval(benchmarkPollRef.current); benchmarkPollRef.current = null; }
    };
    const t = setTimeout(poll, 2000);
    benchmarkPollRef.current = setInterval(poll, 3000);
    return () => {
      clearTimeout(t);
      if (benchmarkPollRef.current) { clearInterval(benchmarkPollRef.current); benchmarkPollRef.current = null; }
    };
  }, [benchmarkJobId, pollBenchmarkStatus]);

  const startExportMutation = trpc.benchmark.startExportPpt.useMutation({
    onSuccess: (data) => {
      setPptJobId(data.jobId);
    },
    onError: () => {
      setPptStage("idle");
      setPptProgress(0);
      toast.error("PPT 生成启动失败，请重试");
    },
  });

  // Poll for PPT job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const result = await utils.benchmark.exportPptStatus.fetch({ jobId });
      if (result.status === "done") {
        setPptStage("done");
        setPptProgress(100);
        const pptData: PptResult = {
          url: result.url!,
          title: result.title || form.projectName,
          slideCount: result.slideCount || 0,
          imageCount: result.imageCount || 0,
        };
        setPptResult(pptData);
        toast.success(`PPT 已生成（${pptData.slideCount} 页，含 ${pptData.imageCount} 张配图）`);
        // Auto-trigger download
        triggerDownload(pptData.url, pptData.title);
        return true; // Stop polling
      } else if (result.status === "failed") {
        setPptStage("idle");
        setPptProgress(0);
        setPptJobId(null);
        toast.error(result.error || "PPT 生成失败，请重试");
        return true;
      } else if (result.status === "not_found") {
        setPptStage("idle");
        setPptProgress(0);
        setPptJobId(null);
        toast.error("PPT 任务未找到，请重试");
        return true;
      } else {
        setPptProgress(result.progress || 0);
        const stage = result.stage as PptStage;
        if (stage && stage !== "idle" && stage !== "done") {
          setPptStage(stage);
        }
        return false;
      }
    } catch (err) {
      console.error("[PPT Poll] Error:", err);
      return false;
    }
  }, [utils, form.projectName]);

  // Start/stop polling when jobId changes
  useEffect(() => {
    if (!pptJobId) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const shouldStop = await pollJobStatus(pptJobId);
      if (shouldStop && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

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

  const triggerDownload = (url: string, title: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}-对标调研.pptx`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleGenerate = () => {
    if (!form.projectName.trim()) { toast.error("请输入项目名称"); return; }
    if (!form.requirements.trim()) { toast.error("请输入项目需求"); return; }
    setIsGenerating(true);
    setReport("");
    setChatHistory([]);
    setGenerateElapsed(0);
    if (generateTimerRef.current) clearInterval(generateTimerRef.current);
    generateTimerRef.current = setInterval(() => setGenerateElapsed(s => s + 1), 1000);
    // Reset PPT state when generating a new report
    setPptStage("idle");
    setPptProgress(0);
    setPptJobId(null);
    setPptResult(null);
    generateMutation.mutate({ ...form, toolId, projectId: importedProjectId || undefined });
  };

  const handleExportPpt = () => {
    if (!report) { toast.error("请先生成调研报告"); return; }
    setPptStage("structuring");
    setPptProgress(5);
    setPptResult(null);
    startExportMutation.mutate({ content: report, title: form.projectName, projectType: form.projectType });
  };

  const handleRedownload = () => {
    if (pptResult) {
      triggerDownload(pptResult.url, pptResult.title);
      toast.success("正在重新下载 PPT");
    }
  };

  const handleRegeneratePpt = () => {
    setPptStage("idle");
    setPptProgress(0);
    setPptJobId(null);
    setPptResult(null);
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
    generating_images: "正在从 Pexels 获取高质量建筑设计配图...",
    building_pptx: "正在组装 PPT 文件并上传...",
    done: "PPT 生成完成！",
  };

  const isPptGenerating = pptStage !== "idle" && pptStage !== "done";

  // Clean report: remove empty source links like [来源]() or [来源](#)
  const cleanedReport = useMemo(() => {
    if (!report) return "";
    return report
      .replace(/\s*\[来源\]\(\s*\)/g, "")
      .replace(/\s*\[来源\]\(#\)/g, "")
      .replace(/\s*\[来源\]\(https?:\/\/\)/g, "");
  }, [report]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">案例调研</h1>
          <p className="text-sm text-muted-foreground mt-1">AI 生成对标案例分析报告</p>
        </div>
        <AiToolSelector category="analysis" value={toolId} onChange={setToolId} label="AI 工具" />
      </div>

      <div className="mt-4">
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Input Panel */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-medium">调研参数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Import project info button */}
                <ImportProjectInfo
                  selectedProjectId={importedProjectId}
                  onImport={(ctx: ProjectContext) => {
                    setImportedProjectId(ctx.project.id);
                    const newForm = { ...form };
                    if (ctx.project.name) newForm.projectName = ctx.project.name;
                    // Map project overview / business goal to requirements
                    const reqParts: string[] = [];
                    if (ctx.project.companyProfile) reqParts.push(`公司概况：${ctx.project.companyProfile}`);
                    if (ctx.project.businessGoal) reqParts.push(`业务目标：${ctx.project.businessGoal}`);
                    if (ctx.project.clientProfile) reqParts.push(`客户情况：${ctx.project.clientProfile}`);
                    if (ctx.project.projectOverview) reqParts.push(`项目概况：${ctx.project.projectOverview}`);
                    // Append custom fields
                    ctx.customFields.forEach(cf => {
                      if (cf.fieldValue) reqParts.push(`${cf.fieldName}：${cf.fieldValue}`);
                    });
                    if (reqParts.length > 0) {
                      newForm.requirements = reqParts.join("\n");
                    }
                    setForm(newForm);
                  }}
                />

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
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中… {generateElapsed > 0 && <span className="ml-1 opacity-70">({generateElapsed}s)</span>}</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" />生成调研报告</>
                  )}
                </Button>
                {isGenerating && generateElapsed >= 10 && (
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    {generateElapsed < 60 ? '推理模型思考中，请耐心等待…' : `已用时 ${Math.floor(generateElapsed/60)} 分 ${generateElapsed%60} 秒，即将完成`}
                  </p>
                )}
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
                    <>
                      <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                        <Streamdown>{cleanedReport}</Streamdown>
                      </div>
                      {!isGenerating && (
                        <div className="mt-6 pt-4 border-t">
                          <FeedbackButtons module="benchmark_report" historyId={reportHistoryId} />
                        </div>
                      )}

                      {/* Conversation refinement area */}
                      {!isGenerating && (
                        <div className="mt-6 pt-4 border-t space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground/70">
                            <MessageSquare className="h-4 w-4" />
                            对话调整报告
                          </div>
                          {chatHistory.length > 0 && (
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {chatHistory.map((msg, i) => (
                                <div key={i} className={`flex ${ msg.role === "user" ? "justify-end" : "justify-start" }`}>
                                  <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                                    msg.role === "user"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-foreground"
                                  }`}>
                                    {msg.role === "assistant" ? "报告已更新" : msg.content}
                                  </div>
                                </div>
                              ))}
                              <div ref={chatEndRef} />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Textarea
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }}
                              placeholder="描述你的修改意见，例如：增加更多中国本土案例、重点分析材料工艺、调整报告结构…"
                              className="resize-none text-sm"
                              rows={2}
                              disabled={isRefining}
                            />
                            <Button
                              onClick={handleChatSubmit}
                              disabled={!chatInput.trim() || isRefining}
                              size="sm"
                              className="self-end px-3"
                            >
                              {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">按 Enter 发送，Shift+Enter 换行</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Compass className="h-12 w-12 mb-3 opacity-20" />
                      <p className="text-sm">填写项目信息后，点击生成调研报告</p>
                      <p className="text-xs mt-1 opacity-60">AI 将为您分析对标案例并生成专业报告</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* PPT Generation Section */}
              {report && (
                <Card className={`border-2 border-dashed ${pptStage === "done" ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/10" : "border-accent/30 bg-accent/5"}`}>
                  <CardContent className="py-6">
                    {pptStage === "idle" && !pptResult ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-3 text-center">
                          <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Presentation className="h-6 w-6 text-accent" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-medium text-foreground">生成对标案例 PPT</h3>
                            <p className="text-sm text-muted-foreground">
                              约 10-15 页图文并茂的 PPTX，含高质量建筑设计配图
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
                    ) : pptStage === "done" || pptResult ? (
                      /* Done state - persistent with download button */
                      <div className="flex flex-col items-center gap-4">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                        <div className="text-center">
                          <p className="font-medium text-green-700 dark:text-green-400">PPT 生成完成</p>
                          {pptResult && (
                            <p className="text-sm text-muted-foreground mt-1">
                              共 {pptResult.slideCount} 页，含 {pptResult.imageCount} 张配图
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            onClick={handleRedownload}
                            size="lg"
                            className="bg-green-600 hover:bg-green-700 text-white px-6"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            下载 PPT
                          </Button>
                          <Button
                            onClick={handleRegeneratePpt}
                            variant="outline"
                            size="lg"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            重新生成
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Processing state with progress */
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-accent" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{pptStageLabels[pptStage]}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {pptStage === "generating_images" && (
                                <span className="flex items-center gap-1">
                                  <ImageIcon className="h-3 w-3" />
                                  正在从 Pexels 获取高质量建筑与设计照片...
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
      </div>
    </div>
  );
}
