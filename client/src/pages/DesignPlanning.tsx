import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Compass, FileText, Loader2, Sparkles, Send, MessageSquare, ChevronDown, Copy, Check, HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ImportProjectInfo, { type ProjectContext } from "@/components/ImportProjectInfo";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { ReportMarkdown } from "@/components/ReportMarkdown";
import { FeedbackButtons } from "@/components/FeedbackButtons";

// 复制到飞书按钮组件
function CopyToFeishuButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("已复制到剪贴板，在飞书文档中粘贴即可");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级方案
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      toast.success("已复制到剪贴板，在飞书文档中粘贴即可");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 text-xs"
    >
      {copied ? (
        <><Check className="h-3.5 w-3.5 text-primary" />已复制</>
      ) : (
        <><Copy className="h-3.5 w-3.5" />复制到飞书</>
      )}
    </Button>
  );
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
  const [benchmarkJobId, setBenchmarkJobId] = useState<string | null>(null);
  const benchmarkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Conversation / refine state
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineJobId, setRefineJobId] = useState<string | null>(null);
  const refinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // Track which assistant messages are collapsed (by index); original report collapse
  const [collapsedMessages, setCollapsedMessages] = useState<Set<number>>(new Set());
  const [isReportCollapsed, setIsReportCollapsed] = useState(false);

  const stopBenchmarkTimer = () => {
    if (generateTimerRef.current) { clearInterval(generateTimerRef.current); generateTimerRef.current = null; }
    setGenerateElapsed(0);
  };

  const refineMutation = trpc.benchmark.refine.useMutation({
    onSuccess: (data) => {
      // Now returns { jobId } - start polling
      setRefineJobId(data.jobId);
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
      parentHistoryId: reportHistoryId,
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

  // Poll refine job status
  const pollRefineStatus = useCallback(async (jobId: string) => {
    try {
      const result = await utils.benchmark.pollStatus.fetch({ jobId });
      if (result.status === "done") {
        const content = (result as any).content || "";
        // Append new assistant message and auto-collapse all previous assistant messages + original report
        setChatHistory(prev => {
          const newHistory = [...prev, { role: "assistant" as const, content }];
          // Collapse all previous assistant messages (all except the last one we just added)
          const newCollapsed = new Set<number>();
          newHistory.forEach((msg, idx) => {
            if (msg.role === "assistant" && idx < newHistory.length - 1) {
              newCollapsed.add(idx);
            }
          });
          setCollapsedMessages(newCollapsed);
          return newHistory;
        });
        // Also collapse the original report when first revision appears
        setIsReportCollapsed(true);
        setIsRefining(false);
        setRefineJobId(null);
        // Update reportHistoryId so next refine uses the latest history record
        // which contains the caseRefs needed to lock links
        if ((result as any).historyId) {
          setReportHistoryId((result as any).historyId);
        }
        toast.success("修订版报告已生成，已自动保存到生成历史");
        return true;
      } else if (result.status === "failed") {
        setIsRefining(false);
        setRefineJobId(null);
        toast.error((result as any).error || "调整失败，请重试");
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Refine Poll] Error:", err);
      return false;
    }
  }, [utils]);

  // Start/stop refine polling when refineJobId changes
  useEffect(() => {
    if (!refineJobId) {
      if (refinePollRef.current) { clearInterval(refinePollRef.current); refinePollRef.current = null; }
      return;
    }
    const poll = async () => {
      const shouldStop = await pollRefineStatus(refineJobId);
      if (shouldStop && refinePollRef.current) { clearInterval(refinePollRef.current); refinePollRef.current = null; }
    };
    const t = setTimeout(poll, 2000);
    refinePollRef.current = setInterval(poll, 3000);
    return () => {
      clearTimeout(t);
      if (refinePollRef.current) { clearInterval(refinePollRef.current); refinePollRef.current = null; }
    };
  }, [refineJobId, pollRefineStatus]);



  const handleGenerate = () => {
    if (!form.projectName.trim()) { toast.error("请输入项目名称"); return; }
    if (!form.requirements.trim()) { toast.error("请输入项目需求"); return; }
    setIsGenerating(true);
    setReport("");
    setChatHistory([]);
    setGenerateElapsed(0);
    if (generateTimerRef.current) clearInterval(generateTimerRef.current);
    generateTimerRef.current = setInterval(() => setGenerateElapsed(s => s + 1), 1000);
    generateMutation.mutate({ ...form, toolId });
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
        <div className="flex items-center gap-2">
          <AiToolSelector category="analysis" value={toolId} onChange={setToolId} label="AI 工具" />
        </div>
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
                      {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
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
                      {/* Original report - collapsible when revisions exist */}
                      <div className="rounded-lg border overflow-hidden">
                        <div
                          className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b cursor-pointer hover:bg-muted/60 transition-colors"
                          onClick={() => setIsReportCollapsed(v => !v)}
                        >
                          <span className="text-xs font-medium text-foreground/60">
                            {chatHistory.some(m => m.role === "assistant") ? "原始报告" : "调研报告"}
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isReportCollapsed ? '' : 'rotate-180'}`} />
                        </div>
                        {!isReportCollapsed && (
                          <div className="p-4 prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                            <ReportMarkdown>{cleanedReport}</ReportMarkdown>
                          </div>
                        )}
                        {isReportCollapsed && (
                          <div className="px-3 py-2 text-xs text-muted-foreground/60 italic">
                            {cleanedReport.slice(0, 120).replace(/#+\s/g, '').replace(/\*\*/g, '')}…
                          </div>
                        )}
                      </div>
                      {!isGenerating && (
                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <FeedbackButtons module="benchmark_report" historyId={reportHistoryId} />
                          <CopyToFeishuButton content={chatHistory.filter(m => m.role === "assistant").length > 0 ? chatHistory.filter(m => m.role === "assistant").at(-1)!.content : report} />
                        </div>
                      )}

                      {/* Conversation refinement area */}
                      {!isGenerating && (
                        <div className="mt-4 pt-4 border-t space-y-4">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground/70">
                            <MessageSquare className="h-4 w-4" />
                            对话调整报告
                          </div>

                          {/* Chat messages */}
                          {chatHistory.length > 0 && (
                            <div className="space-y-3 pr-1">
                              {chatHistory.map((msg, i) => (
                                <div key={i} className={`flex flex-col ${ msg.role === "user" ? "items-end" : "items-start" } gap-1`}>
                                  {msg.role === "user" ? (
                                    <div className="rounded-lg px-3 py-2 text-sm max-w-[85%] bg-primary text-primary-foreground">
                                      {msg.content}
                                    </div>
                                  ) : (
                                    <div className="w-full rounded-lg border bg-muted/30 overflow-hidden">
                                      <div
                                        className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b cursor-pointer hover:bg-muted/60 transition-colors"
                                        onClick={() => setCollapsedMessages(prev => {
                                          const next = new Set(prev);
                                          if (next.has(i)) next.delete(i); else next.add(i);
                                          return next;
                                        })}
                                      >
                                        <span className="text-xs font-medium text-foreground/60">
                                          第 {chatHistory.filter((m, idx) => m.role === "assistant" && idx <= i).length} 次修订版本（已自动保存）
                                        </span>
                                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${collapsedMessages.has(i) ? '' : 'rotate-180'}`} />
                                      </div>
                                      {!collapsedMessages.has(i) ? (
                                        <>
                                          <div className="p-4 prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80">
                                            <ReportMarkdown>{msg.content}</ReportMarkdown>
                                          </div>
                                          <div className="px-4 pb-3 flex justify-end border-t pt-3">
                                            <CopyToFeishuButton content={msg.content} />
                                          </div>
                                        </>
                                      ) : (
                                        <div className="px-3 py-2 text-xs text-muted-foreground/60 italic">
                                          {msg.content.slice(0, 120).replace(/#+\s/g, '').replace(/\*\*/g, '')}…
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                              <div ref={chatEndRef} />
                            </div>
                          )}

                          {/* Input area */}
                          {isRefining && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              AI 正在根据反馈调整报告，通常需要 2-3 分钒…
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
                          <p className="text-xs text-muted-foreground">按 Enter 发送，Shift+Enter 换行。每次修改生成后将自动保存到生成历史，可在历史记录中查看各版本。</p>
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


            </div>
          </div>
      </div>
    </div>
  );
}
