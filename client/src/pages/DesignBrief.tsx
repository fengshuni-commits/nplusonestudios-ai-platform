import React, { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText, Link, Upload, FolderOpen, BookOpen,
  Sparkles, Download, Copy, X, ChevronDown,
  Loader2, AlertCircle, RefreshCw, MessageSquarePlus, Send
} from "lucide-react";
import { Streamdown } from "streamdown";
import { AiToolSelector } from "@/components/AiToolSelector";

type InputSource = {
  id: string;
  inputType: "text" | "file" | "url" | "asset" | "document";
  label: string;
  textContent?: string;
  fileUrl?: string;
  webUrl?: string;
  extractedText?: string;
  assetId?: number;
  documentId?: number;
  isLoading?: boolean;
  error?: string;
};

function SourceBadge({ source, onRemove }: { source: InputSource; onRemove: () => void }) {
  const typeIcons: Record<string, React.ReactElement> = {
    text: <FileText className="h-3 w-3" />,
    file: <Upload className="h-3 w-3" />,
    url: <Link className="h-3 w-3" />,
    asset: <FolderOpen className="h-3 w-3" />,
    document: <BookOpen className="h-3 w-3" />,
  };
  const typeColors: Record<string, string> = {
    text: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    file: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    url: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    asset: "bg-green-500/10 text-green-400 border-green-500/20",
    document: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${typeColors[source.inputType]} max-w-[200px]`}>
      {source.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : typeIcons[source.inputType]}
      <span className="truncate">{source.label}</span>
      {source.error && <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />}
      <button onClick={onRemove} className="ml-0.5 hover:opacity-70 shrink-0">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function UrlInputDialog({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void;
  onAdd: (source: InputSource) => void;
}) {
  const [url, setUrl] = useState("");
  const extractUrl = trpc.designBriefs.extractUrl.useMutation();
  const handleAdd = async () => {
    if (!url.trim()) return;
    const tempId = `url-${Date.now()}`;
    onAdd({ id: tempId, inputType: "url", label: url, webUrl: url, isLoading: true });
    onClose(); setUrl("");
    try {
      const result = await extractUrl.mutateAsync({ url });
      onAdd({ id: tempId, inputType: "url", label: result.title || url, webUrl: url, extractedText: result.extractedText, isLoading: false });
    } catch {
      onAdd({ id: tempId, inputType: "url", label: url, webUrl: url, isLoading: false, error: "提取失败" });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>添加网页链接</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} autoFocus />
          <p className="text-xs text-muted-foreground">系统将自动提取页面文字内容作为输入素材</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleAdd} disabled={!url.trim()}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentPickerDialog({ open, onClose, onAdd, defaultProjectId }: {
  open: boolean; onClose: () => void;
  onAdd: (source: InputSource) => void;
  defaultProjectId?: string;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || "all");
  const { data: projects = [] } = trpc.projects.list.useQuery({});
  const { data: allDocs = [] } = trpc.meeting.listDrafts.useQuery();
  const { data: projectHistory = [] } = trpc.projects.listGenerationHistory.useQuery(
    { projectId: Number(selectedProjectId) },
    { enabled: selectedProjectId !== "all" && !isNaN(Number(selectedProjectId)) }
  );
  const TEXT_MODULES = ["meeting_minutes", "design_brief", "benchmark_report", "layout_design"];
  const projectDocs = projectHistory
    .filter((item: any) => TEXT_MODULES.includes(item.module) && item.outputContent)
    .map((item: any) => ({ id: item.id, title: item.title || `${item.module} #${item.id}`, content: item.outputContent }));
  const docs = selectedProjectId === "all" ? allDocs : projectDocs;
  const handleSelect = (doc: { id: number; title: string; content?: string | null }) => {
    onAdd({ id: `doc-${doc.id}`, inputType: "document", label: doc.title, documentId: doc.id, extractedText: doc.content || "" });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>从项目文档选取</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">会议纪要草稿</SelectItem>
              {projects.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {docs.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">暂无文档</p>}
            {(docs as any[]).map((doc: any) => (
              <button key={doc.id} onClick={() => handleSelect(doc)} className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{doc.title}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetPickerDialog({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void;
  onAdd: (source: InputSource) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: assets = [] } = trpc.assets.listAll.useQuery({ limit: 200 });
  const filtered = assets.filter((a: any) => !search || a.name?.toLowerCase().includes(search.toLowerCase()));
  const handleSelect = (asset: any) => {
    onAdd({ id: `asset-${asset.id}`, inputType: "asset", label: asset.name, assetId: asset.id, fileUrl: asset.fileUrl, extractedText: asset.description || `素材：${asset.name}` });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>从素材库选取</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="搜索素材..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">暂无素材</p>}
            {filtered.map((asset: any) => (
              <button key={asset.id} onClick={() => handleSelect(asset)} className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="truncate">
                  <div className="font-medium truncate">{asset.name}</div>
                  {asset.category && <div className="text-xs text-muted-foreground">{asset.category}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DesignBrief() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Project & brief selection
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");
  const [selectedBriefId, setSelectedBriefId] = useState<number | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  // Input state
  const [textInput, setTextInput] = useState("");
  const [sources, setSources] = useState<InputSource[]>([]);
  const [briefTitle, setBriefTitle] = useState("");

  // Output state
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // AI revision state
  const [revisionInput, setRevisionInput] = useState("");
  const [isRevising, setIsRevising] = useState(false);

  // Dialog state
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [showAssetDialog, setShowAssetDialog] = useState(false);

  // Tool selector
  const [toolId, setToolId] = useState<number | undefined>(undefined);

  // Data queries
  const { data: projects = [] } = trpc.projects.list.useQuery({});
  const { data: projectBriefs = [], refetch: refetchProjectBriefs } = trpc.designBriefs.list.useQuery(
    { projectId: Number(selectedProjectId) },
    { enabled: selectedProjectId !== "none" && !isNaN(Number(selectedProjectId)) }
  );
  const { data: allBriefs = [], refetch: refetchAllBriefs } = trpc.designBriefs.list.useQuery(
    {},
    { enabled: selectedProjectId === "none" }
  );

  // Latest brief for the selected project (sorted by updatedAt desc)
  const briefs = selectedProjectId !== "none" ? projectBriefs : allBriefs;
  const latestBrief = (briefs as any[])[0] ?? null;

  const { data: briefDetail, refetch: refetchDetail } = trpc.designBriefs.get.useQuery(
    { id: selectedBriefId! }, { enabled: !!selectedBriefId }
  );
  const versions = briefDetail?.versions ?? [];
  const currentVersion = selectedHistoryId ? versions.find((v: any) => v.id === selectedHistoryId) : versions[0];
  const displayContent = generatedContent ?? currentVersion?.outputContent ?? null;

  const generateMutation = trpc.designBriefs.generate.useMutation();
  const uploadAsset = trpc.assets.upload.useMutation();

  const addSource = (source: InputSource) => {
    setSources(prev => {
      const idx = prev.findIndex(s => s.id === source.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = source; return next; }
      return [...prev, source];
    });
  };
  const removeSource = (id: string) => setSources(prev => prev.filter(s => s.id !== id));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const tempId = `file-${Date.now()}`;
    addSource({ id: tempId, inputType: "file", label: file.name, isLoading: true });
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const base64 = btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(""));
      const result = await uploadAsset.mutateAsync({ fileName: file.name, fileData: base64, contentType: file.type });
      const extractedText = (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md"))
        ? await file.text()
        : `文件：${file.name}（${(file.size / 1024).toFixed(0)} KB）`;
      addSource({ id: tempId, inputType: "file", label: file.name, fileUrl: result.url, extractedText, isLoading: false });
    } catch {
      addSource({ id: tempId, inputType: "file", label: file.name, isLoading: false, error: "上传失败" });
    }
    e.target.value = "";
  };

  // When project changes, auto-select the latest design brief for that project
  const handleProjectChange = (val: string) => {
    setSelectedProjectId(val);
    setSelectedBriefId(null);
    setSelectedHistoryId(null);
    setGeneratedContent(null);
  };

  // After briefs load, auto-select the latest brief for the project
  React.useEffect(() => {
    if (briefs.length > 0 && !selectedBriefId) {
      setSelectedBriefId((briefs as any[])[0].id);
    }
  }, [briefs.length, selectedProjectId]);

  const handleGenerate = async () => {
    if (selectedProjectId === "none") {
      toast.error("请先选择项目");
      return;
    }
    const hasInput = textInput.trim() || sources.some(s => s.extractedText || s.textContent);
    if (!hasInput && !latestBrief) {
      toast.error("请至少提供一项输入内容");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        briefId: selectedBriefId ?? undefined,
        projectId: Number(selectedProjectId),
        title: briefTitle.trim() || undefined,
        textInput: textInput.trim() || undefined,
        inputs: sources.map(s => ({
          inputType: s.inputType, label: s.label, textContent: s.textContent,
          fileUrl: s.fileUrl, webUrl: s.webUrl, extractedText: s.extractedText,
          assetId: s.assetId, documentId: s.documentId,
        })),
        toolId: toolId ?? undefined,
      });
      setSelectedBriefId(result.briefId!);
      setSelectedHistoryId(result.historyId);
      setGeneratedContent(result.content);
      setTextInput("");
      setSources([]);
      setBriefTitle("");
      await refetchProjectBriefs();
      await refetchAllBriefs();
      await refetchDetail();
      toast.success(`任务书生成成功：${result.title} · V${result.version}`);
    } catch (err: any) {
      toast.error(err.message || "生成失败");
    } finally { setIsGenerating(false); }
  };

  const handleRevise = async () => {
    if (!revisionInput.trim()) return;
    if (!displayContent) { toast.error("请先生成任务书"); return; }
    setIsRevising(true);
    try {
      const result = await generateMutation.mutateAsync({
        briefId: selectedBriefId ?? undefined,
        projectId: selectedProjectId !== "none" ? Number(selectedProjectId) : undefined,
        textInput: `【修订意见】${revisionInput.trim()}`,
        inputs: [],
        toolId: toolId ?? undefined,
      });
      setSelectedBriefId(result.briefId!);
      setSelectedHistoryId(result.historyId);
      setGeneratedContent(result.content);
      setRevisionInput("");
      await refetchProjectBriefs();
      await refetchAllBriefs();
      await refetchDetail();
      toast.success("修订完成");
    } catch (err: any) {
      toast.error(err.message || "修订失败");
    } finally { setIsRevising(false); }
  };

  const handleCopy = () => {
    if (displayContent) { navigator.clipboard.writeText(displayContent); toast.success("已复制到剪贴板"); }
  };
  const handleDownload = () => {
    if (!displayContent) return;
    const blob = new Blob([displayContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${briefDetail?.brief.title || "设计任务书"}.md`; a.click(); URL.revokeObjectURL(url);
  };

  const selectedProject = (projects as any[]).find((p: any) => String(p.id) === selectedProjectId);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 pb-8 max-w-4xl mx-auto w-full">

        {/* AI Tool Selector - top right */}
        <div className="flex items-center justify-end">
          <AiToolSelector capability="document" value={toolId} onChange={setToolId} label="AI 工具" />
        </div>

        {/* Input Card */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            {/* Project selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">选择项目</Label>
              <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择要生成任务书的项目..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— 不绑定项目 —</SelectItem>
                  {(projects as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProjectId !== "none" && latestBrief && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  已找到该项目最新任务书（{latestBrief.title}），将整合新输入生成新版本
                </p>
              )}
              {selectedProjectId !== "none" && !latestBrief && briefs.length === 0 && (
                <p className="text-xs text-muted-foreground">该项目暂无任务书，将生成第一版</p>
              )}
            </div>

            {/* Title (optional) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">任务书标题 <span className="text-muted-foreground font-normal">（可选，自动生成）</span></Label>
              <Input placeholder="例：文心仪海办公室设计任务书 V2" value={briefTitle}
                onChange={e => setBriefTitle(e.target.value)} className="text-sm" />
            </div>

            {/* Text input */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {latestBrief ? "描述本次需求变更或补充信息" : "项目背景与需求描述"}
              </Label>
              <Textarea
                placeholder={latestBrief
                  ? "输入本次变更内容，例如：甲方新增了展厅面积要求，需要调整空间分区方案..."
                  : "输入项目背景、甲方需求、设计目标等信息..."}
                value={textInput} onChange={e => setTextInput(e.target.value)}
                className="text-sm resize-none min-h-[100px]" rows={4} />
            </div>

            {/* Attached sources */}
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sources.map(s => <SourceBadge key={s.id} source={s} onRemove={() => removeSource(s.id)} />)}
              </div>
            )}

            {/* Add input buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">添加附件：</span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowUrlDialog(true)}>
                <Link className="h-3 w-3" />网页链接
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3" />上传文件
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowDocDialog(true)}>
                <BookOpen className="h-3 w-3" />项目文档
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowAssetDialog(true)}>
                <FolderOpen className="h-3 w-3" />素材库
              </Button>
              <input ref={fileInputRef} type="file" className="hidden"
                accept=".txt,.md,.pdf,.doc,.docx" onChange={handleFileUpload} />
            </div>

            {/* Generate button */}
            <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={isGenerating || selectedProjectId === "none"}>
              {isGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin" />正在生成任务书...</>
                : <><Sparkles className="h-4 w-4" />{latestBrief ? "整合更新，生成新版任务书" : "生成设计任务书"}</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* Output Card */}
        {displayContent && (
          <Card>
            <CardHeader className="pb-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">
                    {briefDetail?.brief.title || selectedProject?.name ? `${selectedProject?.name} · 设计任务书` : "设计任务书"}
                  </CardTitle>
                  {versions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      V{versions.length - (selectedHistoryId ? versions.findIndex((v: any) => v.id === selectedHistoryId) : 0)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Version history dropdown */}
                  {versions.length > 1 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2"
                          onClick={() => setShowVersionHistory(v => !v)}>
                          <span>版本历史</span>
                          <ChevronDown className={`h-3 w-3 transition-transform ${showVersionHistory ? "rotate-180" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>查看历史版本</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopy}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>复制内容</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>下载 Markdown</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Version history list */}
              {showVersionHistory && versions.length > 1 && (
                <div className="mt-2 border rounded-md divide-y">
                  {versions.map((v: any, i: number) => (
                    <button key={v.id}
                      onClick={() => { setSelectedHistoryId(v.id); setGeneratedContent(v.outputContent || ""); setShowVersionHistory(false); }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-accent transition-colors ${(selectedHistoryId === v.id || (!selectedHistoryId && i === 0)) ? "bg-accent/50" : ""}`}>
                      <span className="font-medium">V{versions.length - i}</span>
                      <span className="text-muted-foreground">
                        {new Date(v.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>

            {/* Full content display */}
            <CardContent className="pt-0">
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed border rounded-lg p-4 bg-muted/20">
                <Streamdown>{displayContent}</Streamdown>
              </div>
            </CardContent>

            {/* AI Revision dialog at bottom */}
            <CardContent className="pt-0 pb-5">
              <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <span>AI 修订</span>
                  <span className="text-muted-foreground/60">— 输入修改意见，AI 将基于当前版本润色或补充</span>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="例：请在第三章补充智能化系统需求，并将预算章节改为概算范围..."
                    value={revisionInput}
                    onChange={e => setRevisionInput(e.target.value)}
                    className="text-sm resize-none min-h-[60px] flex-1"
                    rows={2}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRevise();
                    }}
                  />
                  <Button
                    className="self-end gap-1.5"
                    size="sm"
                    onClick={handleRevise}
                    disabled={isRevising || !revisionInput.trim()}
                  >
                    {isRevising
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    {isRevising ? "修订中..." : "提交修订"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dialogs */}
        <UrlInputDialog open={showUrlDialog} onClose={() => setShowUrlDialog(false)} onAdd={addSource} />
        <DocumentPickerDialog
          open={showDocDialog}
          onClose={() => setShowDocDialog(false)}
          onAdd={addSource}
          defaultProjectId={selectedProjectId !== "none" ? selectedProjectId : undefined}
        />
        <AssetPickerDialog open={showAssetDialog} onClose={() => setShowAssetDialog(false)} onAdd={addSource} />
      </div>
    </TooltipProvider>
  );
}
