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
import { toast } from "sonner";
import {
  FileText, Plus, Trash2, Link, Upload, FolderOpen, BookOpen,
  Sparkles, Clock, RefreshCw, Download, Copy, X,
  Loader2, AlertCircle
} from "lucide-react";
import { Streamdown } from "streamdown";

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

function DocumentPickerDialog({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void;
  onAdd: (source: InputSource) => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const { data: projects = [] } = trpc.projects.list.useQuery({});
  const { data: allDocs = [] } = trpc.meeting.listDrafts.useQuery();
  const { data: projectDocs = [] } = trpc.documents.listByProject.useQuery(
    { projectId: Number(selectedProjectId) },
    { enabled: selectedProjectId !== "all" && !isNaN(Number(selectedProjectId)) }
  );
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
            {docs.map((doc: any) => (
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

function VersionHistory({ versions, selectedHistoryId, onSelect }: {
  versions: any[]; selectedHistoryId?: number; onSelect: (v: any) => void;
}) {
  if (versions.length === 0) return null;
  return (
    <div className="space-y-1">
      {versions.map((v, i) => (
        <button key={v.id} onClick={() => onSelect(v)}
          className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${selectedHistoryId === v.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-muted-foreground"}`}>
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium text-foreground/80">V{versions.length - i}</span>
            <span className="text-muted-foreground">
              {new Date(v.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {v.summary && <div className="mt-0.5 truncate">{v.summary}</div>}
        </button>
      ))}
    </div>
  );
}

export default function DesignBrief() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedBriefId, setSelectedBriefId] = useState<number | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [instructions, setInstructions] = useState("");
  const [sources, setSources] = useState<InputSource[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [briefTitle, setBriefTitle] = useState("");
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [showAssetDialog, setShowAssetDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNewBrief, setShowNewBrief] = useState(false);

  const { data: projects = [] } = trpc.projects.list.useQuery({});
  const { data: briefs = [], refetch: refetchBriefs } = trpc.designBriefs.list.useQuery({});
  const { data: briefDetail, refetch: refetchDetail } = trpc.designBriefs.get.useQuery(
    { id: selectedBriefId! }, { enabled: !!selectedBriefId }
  );
  const generateMutation = trpc.designBriefs.generate.useMutation();
  const deleteMutation = trpc.designBriefs.delete.useMutation();
  const uploadAsset = trpc.assets.upload.useMutation();

  const versions = briefDetail?.versions ?? [];
  const currentVersion = selectedHistoryId ? versions.find(v => v.id === selectedHistoryId) : versions[0];
  const displayContent = viewContent ?? currentVersion?.outputContent ?? null;

  const handleSelectBrief = (brief: any) => {
    setSelectedBriefId(brief.id); setSelectedHistoryId(null); setViewContent(null); setShowNewBrief(false);
  };
  const handleSelectVersion = (v: any) => {
    setSelectedHistoryId(v.id); setViewContent(v.outputContent || "");
  };
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

  const handleGenerate = async () => {
    const hasInput = textInput.trim() || sources.some(s => s.extractedText || s.textContent);
    if (!hasInput) { toast.error("请至少提供一项输入内容"); return; }
    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        briefId: selectedBriefId ?? undefined,
        projectId: selectedProjectId && selectedProjectId !== "none" ? Number(selectedProjectId) : undefined,
        title: briefTitle.trim() || undefined,
        textInput: textInput.trim() || undefined,
        inputs: sources.map(s => ({
          inputType: s.inputType, label: s.label, textContent: s.textContent,
          fileUrl: s.fileUrl, webUrl: s.webUrl, extractedText: s.extractedText,
          assetId: s.assetId, documentId: s.documentId,
        })),
        instructions: instructions.trim() || undefined,
      });
      setSelectedBriefId(result.briefId!); setSelectedHistoryId(result.historyId); setViewContent(result.content);
      setTextInput(""); setInstructions(""); setSources([]); setBriefTitle(""); setShowNewBrief(false);
      await refetchBriefs(); await refetchDetail();
      toast.success(`任务书生成成功：${result.title} · V${result.version}`);
    } catch (err: any) {
      toast.error(err.message || "生成失败");
    } finally { setIsGenerating(false); }
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
  const handleDelete = async (id: number) => {
    if (!confirm("确认删除此任务书？")) return;
    await deleteMutation.mutateAsync({ id });
    if (selectedBriefId === id) { setSelectedBriefId(null); setViewContent(null); }
    await refetchBriefs();
  };

  return (
    <TooltipProvider>
      <div className="flex h-full gap-4 pb-6">
        {/* Left: Brief List */}
        <div className="w-56 shrink-0 flex flex-col gap-2">
          <Button size="sm" className="w-full justify-start gap-2"
            onClick={() => { setShowNewBrief(true); setSelectedBriefId(null); setViewContent(null); }}>
            <Plus className="h-4 w-4" />新建任务书
          </Button>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {briefs.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8 px-2">暂无任务书，点击上方按钮新建</div>
            )}
            {briefs.map((brief: any) => (
              <div key={brief.id}
                className={`group relative rounded-md transition-colors cursor-pointer ${selectedBriefId === brief.id ? "bg-accent" : "hover:bg-accent/50"}`}
                onClick={() => handleSelectBrief(brief)}>
                <div className="px-3 py-2">
                  <div className="flex items-start gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{brief.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        V{brief.currentVersion} · {new Date(brief.updatedAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(brief.id); }}
                  className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Output + Input */}
        <div className="flex-1 flex flex-col min-w-0 gap-3">
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {displayContent ? (
              <>
                <CardHeader className="pb-2 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">{briefDetail?.brief.title || "设计任务书"}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        V{versions.length - (selectedHistoryId ? versions.findIndex(v => v.id === selectedHistoryId) : 0)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
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
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                    <Streamdown>{displayContent}</Streamdown>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex flex-col items-center justify-center h-full py-24">
                <FileText className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-sm text-muted-foreground">从左侧选择任务书查看内容，或新建任务书</p>
              </CardContent>
            )}
          </Card>

          {(showNewBrief || selectedBriefId) && (
            <Card className="shrink-0">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedBriefId ? (
                      <><RefreshCw className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">迭代更新</span>
                      <Badge variant="outline" className="text-xs">将整合上一版本</Badge></>
                    ) : (
                      <><Sparkles className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">新建任务书</span></>
                    )}
                  </div>
                  {showNewBrief && !selectedBriefId && (
                    <Button size="sm" variant="ghost" onClick={() => setShowNewBrief(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {!selectedBriefId && (
                  <div className="flex gap-2">
                    <Input placeholder="任务书标题（可选，自动生成）" value={briefTitle}
                      onChange={e => setBriefTitle(e.target.value)} className="flex-1 text-sm h-8" />
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger className="w-40 h-8 text-sm">
                        <SelectValue placeholder="绑定项目（可选）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不绑定项目</SelectItem>
                        {projects.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Textarea
                  placeholder={selectedBriefId
                    ? "输入本次迭代的补充信息或修改说明..."
                    : "直接输入项目背景、需求描述、甲方要求等文字信息..."}
                  value={textInput} onChange={e => setTextInput(e.target.value)}
                  className="text-sm resize-none min-h-[80px]" rows={3} />
                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map(s => <SourceBadge key={s.id} source={s} onRemove={() => removeSource(s.id)} />)}
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">添加输入：</span>
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
                {selectedBriefId && (
                  <Input placeholder="特别说明（可选，如：重点补充空间需求章节）"
                    value={instructions} onChange={e => setInstructions(e.target.value)} className="text-sm h-8" />
                )}
                <Button className="w-full gap-2" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating
                    ? <><Loader2 className="h-4 w-4 animate-spin" />正在生成任务书...</>
                    : <><Sparkles className="h-4 w-4" />{selectedBriefId ? "迭代生成" : "生成任务书"}</>
                  }
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Version History */}
        {selectedBriefId && versions.length > 0 && (
          <div className="w-44 shrink-0 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
              <Clock className="h-3.5 w-3.5" /><span>版本历史</span>
            </div>
            <VersionHistory
              versions={versions}
              selectedHistoryId={selectedHistoryId ?? currentVersion?.id}
              onSelect={handleSelectVersion}
            />
          </div>
        )}

        <UrlInputDialog open={showUrlDialog} onClose={() => setShowUrlDialog(false)} onAdd={addSource} />
        <DocumentPickerDialog open={showDocDialog} onClose={() => setShowDocDialog(false)} onAdd={addSource} />
        <AssetPickerDialog open={showAssetDialog} onClose={() => setShowAssetDialog(false)} onAdd={addSource} />
      </div>
    </TooltipProvider>
  );
}
