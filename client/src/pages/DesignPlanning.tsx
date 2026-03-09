import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AiToolSelector from "@/components/AiToolSelector";
import { trpc } from "@/lib/trpc";
import { Compass, FileText, Download, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

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
  const [isExporting, setIsExporting] = useState(false);

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

  const exportMutation = trpc.benchmark.exportPpt.useMutation({
    onSuccess: (data) => {
      setIsExporting(false);
      toast.success(`PPT 已生成（${data.slideCount} 页），正在下载...`);
      // Download the PPTX file from S3 URL
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `${data.title}-对标调研.pptx`;
      a.target = "_blank";
      a.click();
    },
    onError: () => {
      setIsExporting(false);
      toast.error("PPT 导出失败");
    },
  });

  const handleGenerate = () => {
    if (!form.projectName.trim()) { toast.error("请输入项目名称"); return; }
    if (!form.requirements.trim()) { toast.error("请输入项目需求"); return; }
    setIsGenerating(true);
    generateMutation.mutate({ ...form, toolId });
  };

  const handleExportPpt = () => {
    if (!report) { toast.error("请先生成调研报告"); return; }
    setIsExporting(true);
    exportMutation.mutate({ content: report, title: form.projectName });
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
            <Card className="lg:col-span-3">
              <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-medium">调研报告</CardTitle>
                {report && (
                  <Button variant="outline" size="sm" onClick={handleExportPpt} disabled={isExporting}>
                    {isExporting ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Download className="h-3 w-3 mr-1.5" />}
                    导出 PPT
                  </Button>
                )}
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
