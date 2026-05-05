import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  User,
  Send,
  Trash2,
  ZoomIn,
  ZoomOut,
  X,
  ExternalLink,
  Loader2,
  ImageOff,
  ChevronLeft,
  FolderKanban,
  Paperclip,
  FolderOpen,
  Search,
  ImageIcon,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  navigateTo?: { path: string; name: string; project_id?: number | null } | null;
  createdAt?: string | Date;
  imageUrl?: string;
  generatedDocument?: { doc_type: string; title: string; content: string } | null;
}

// ─── Module path map (same as backend) ───────────────────────────────────────
const MODULE_PATHS: Record<string, string> = {
  "/design-brief": "/design/brief",
  "/meeting-minutes": "/meeting",
  "/design-tools": "/design/tools",
  "/case-study": "/design/planning",
  "/presentation": "/design/presentation",
  "/content-creation": "/media/xiaohongshu",
  "/projects": "/projects",
  "/construction": "/construction/docs",
};

function resolveNavPath(path: string): string {
  return MODULE_PATHS[path] ?? path;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Director() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceZoom, setWorkspaceZoom] = useState(1);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Image attachment state
  const [attachedImage, setAttachedImage] = useState<{ url: string; name: string; preview: string } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  // Load conversation history
  const { data: historyData, isLoading: historyLoading } = trpc.director.getHistory.useQuery(
    { limit: 50 },
    { staleTime: 0, refetchOnWindowFocus: false }
  );

  // Load workspace items
  const { data: workspaceItems, isLoading: workspaceLoading } = trpc.director.getWorkspaceItems.useQuery(
    { limit: 50 },
    { staleTime: 30 * 1000, refetchOnWindowFocus: false }
  );

  const uploadImageMutation = trpc.director.uploadImage.useMutation();

  // Asset list for picker
  const { data: allAssets } = trpc.assets.list.useQuery(undefined, { enabled: showAssetPicker });
  const imageAssets = useMemo(() => {
    if (!allAssets) return [];
    return (allAssets as any[]).filter((a) => {
      const isImage = a.fileType?.startsWith("image/") ||
        /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(a.fileUrl || "") ||
        a.category === "image" || a.category === "ai_render";
      if (!isImage) return false;
      if (assetSearch.trim()) {
        const q = assetSearch.toLowerCase();
        return a.name?.toLowerCase().includes(q) || a.tags?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allAssets, assetSearch]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setIsUploadingImage(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const preview = URL.createObjectURL(file);
      const result = await uploadImageMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
      });
      setAttachedImage({ url: result.url, name: file.name, preview });
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploadingImage(false);
    }
  }, [uploadImageMutation]);

  const handleSelectAsset = useCallback((asset: any) => {
    setAttachedImage({ url: asset.fileUrl, name: asset.name, preview: asset.thumbnailUrl || asset.fileUrl });
    setShowAssetPicker(false);
    setAssetSearch("");
  }, []);

  const chatMutation = trpc.director.chat.useMutation({
    onSuccess: (data) => {
      // If a new image was generated, refresh workspace
      if (data.generatedImageUrl) {
        utils.director.getWorkspaceItems.invalidate();
      }
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.content,
        navigateTo: data.navigateTo,
        generatedDocument: data.generatedDocument,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsLoading(false);
      utils.director.getHistory.invalidate();
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `抱歉，出现了错误：${err.message}`,
        },
      ]);
      setIsLoading(false);
    },
  });

  const clearHistoryMutation = trpc.director.clearHistory.useMutation({
    onSuccess: () => {
      setMessages([]);
      utils.director.getHistory.invalidate();
    },
  });

  const removeWorkspaceItem = trpc.director.removeWorkspaceItem.useMutation({
    onSuccess: () => {
      utils.director.getWorkspaceItems.invalidate();
      setSelectedItem(null);
    },
  });

  // Populate messages from history
  useEffect(() => {
    if (historyData && historyData.length > 0 && messages.length === 0) {
      const loaded: ChatMessage[] = historyData.map((r: any) => ({
        id: `history-${r.id}`,
        role: r.role as "user" | "assistant",
        content: r.content,
        createdAt: r.createdAt,
      }));
      setMessages(loaded);
    }
  }, [historyData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pick up prefill message from Home quick input
  useEffect(() => {
    const prefill = sessionStorage.getItem("director_prefill");
    if (prefill) {
      sessionStorage.removeItem("director_prefill");
      // Wait for history to load before auto-sending
      const send = () => {
        const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          content: prefill,
        };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);
        chatMutation.mutate({ message: prefill });
      };
      // Small delay to let history load first
      const timer = setTimeout(send, 300);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    const imageUrl = attachedImage?.url;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      imageUrl,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachedImage(null);
    setIsLoading(true);
    chatMutation.mutate({ message: text, imageUrl });
  }, [input, isLoading, attachedImage, chatMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const zoomIn = () => setWorkspaceZoom((z) => Math.min(z + 0.25, 2));
  const zoomOut = () => setWorkspaceZoom((z) => Math.max(z - 0.25, 0.5));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left: Chat Panel (1/3) ── */}
      <div className="w-1/3 shrink-0 flex flex-col border-r border-border bg-background">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeState userName={user?.name?.split(" ")[0] || "成员"} onSuggestion={(s) => { setInput(s); textareaRef.current?.focus(); }} />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onNavigate={(path) => setLocation(resolveNavPath(path))} />
            ))
          )}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          {/* Attached image preview */}
          {attachedImage && (
            <div className="mb-2 flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
              <img src={attachedImage.preview} alt={attachedImage.name} className="h-10 w-10 rounded object-cover shrink-0" />
              <span className="text-xs text-muted-foreground truncate flex-1">{attachedImage.name}</span>
              <button onClick={() => setAttachedImage(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="向所长提问或发出指令…"
              className="resize-none text-sm min-h-[60px] max-h-[120px]"
              rows={2}
              disabled={isLoading}
            />
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button
                size="sm"
                className="h-9 w-9 p-0"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0 bg-background"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isUploadingImage}
                title="上传参考图"
              >
                {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0 bg-background"
                onClick={() => setShowAssetPicker(true)}
                disabled={isLoading}
                title="从素材库选图"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => { if (messages.length > 0) clearHistoryMutation.mutate(); }}
                disabled={isLoading || messages.length === 0}
                title="清空对话"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Enter 发送，Shift+Enter 换行</p>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
          />
        </div>
      </div>

      {/* ── Right: Workspace (2/3) ── */}
      <div className="flex-1 flex flex-col bg-muted/20 overflow-hidden">
        {/* Workspace content */}
        <div className="flex-1 overflow-auto p-5">
          {workspaceLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !workspaceItems || workspaceItems.length === 0 ? (
            <WorkspaceEmpty />
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(200 * workspaceZoom)}px, 1fr))`,
              }}
            >
              {workspaceItems.map((item: any) => (
                <WorkspaceCard
                  key={item.id}
                  item={item}
                  isSelected={selectedItem === item.id}
                  onSelect={() => setSelectedItem(selectedItem === item.id ? null : item.id)}
                  onLightbox={() => setLightboxUrl(item.imageUrl)}
                  onRemove={() => removeWorkspaceItem.mutate({ id: item.id })}
                  zoom={workspaceZoom}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Asset Picker Dialog */}
      <Dialog open={showAssetPicker} onOpenChange={setShowAssetPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              从素材库选择
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="搜索素材名称或标签..."
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[50vh]">
            {imageAssets.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 p-1">
                {imageAssets.map((asset: any) => (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className="group relative rounded-lg overflow-hidden border border-border bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  >
                    <div className="aspect-square">
                      <img src={asset.thumbnailUrl || asset.fileUrl} alt={asset.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <Search className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                      <p className="text-[11px] text-white/90 truncate">{asset.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">{assetSearch ? "没有找到匹配的素材" : "素材库中暂无图片素材"}</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="工作区成果"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ─── Document Download Button ────────────────────────────────────────────────
const DOC_TYPE_LABELS: Record<string, string> = {
  design_brief: "设计任务书",
  case_study: "案例调研报告",
  xiaohongshu: "小红书文案",
  wechat_article: "公众号文章",
  instagram: "Instagram 文案",
  meeting_summary: "会议纪要",
  project_report: "项目进度报告",
};

function DocumentDownloadButton({ doc }: { doc: { doc_type: string; title: string; content: string } }) {
  const handleDownload = () => {
    const blob = new Blob([doc.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const label = DOC_TYPE_LABELS[doc.doc_type] || "文档";

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      下载{label}（.md）
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message, onNavigate }: { message: ChatMessage; onNavigate: (path: string) => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-primary/10" : "bg-primary/10"}`}>
        {isUser ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
      </div>
      <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border rounded-tl-sm"}`}>
          {isUser ? (
            <div>
              {message.imageUrl && (
                <img src={message.imageUrl} alt="参考图" className="max-w-[180px] rounded-lg mb-2 object-cover" />
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Streamdown>{message.content}</Streamdown>
            </div>
          )}
        </div>
        {/* Navigate action */}
        {message.navigateTo && (
          <button
            onClick={() => onNavigate(message.navigateTo!.path)}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <FolderKanban className="h-3 w-3" />
            前往「{message.navigateTo.name}」
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
        {/* Document download button */}
        {message.generatedDocument && (
          <DocumentDownloadButton doc={message.generatedDocument} />
        )}
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-3.5 py-3 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ─── Welcome State ────────────────────────────────────────────────────────────
function WelcomeState({ userName, onSuggestion }: { userName: string; onSuggestion: (s: string) => void }) {
  const suggestions = [
    "当前有哪些进行中的项目？",
    "我有哪些待处理任务？",
    "帮我生成一张工业风办公室效果图",
    "帮我生成一张展厅设计效果图，现代极简风格",
  ];
  return (
    <div className="py-4 space-y-4">
      <div className="flex gap-2.5">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]">
          <p>你好，{userName}。我是所长，N+1 STUDIOS 的 AI 工作助手。</p>
          <p className="mt-1.5 text-muted-foreground">我可以帮你查询项目状态、任务安排，直接生成 AI 效果图，或引导你使用各功能模块。上传参考图可进行图生图。</p>
        </div>
      </div>
      <div className="pl-9.5 space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent/50 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Workspace Empty ──────────────────────────────────────────────────────────
function WorkspaceEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-3">
      <div className="h-16 w-16 rounded-2xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
        <ImageOff className="h-7 w-7 opacity-30" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">工作区为空</p>
        <p className="text-xs mt-1 opacity-70">通过各功能模块生成的图片成果将在此显示</p>
      </div>
    </div>
  );
}

// ─── Workspace Card ───────────────────────────────────────────────────────────
function WorkspaceCard({
  item,
  isSelected,
  onSelect,
  onLightbox,
  onRemove,
  zoom,
}: {
  item: any;
  isSelected: boolean;
  onSelect: () => void;
  onLightbox: () => void;
  onRemove: () => void;
  zoom: number;
}) {
  const typeLabels: Record<string, string> = {
    effect: "效果图",
    plan: "平面图",
    color_plan: "彩平图",
    analysis: "分析图",
    other: "图片",
  };

  return (
    <div
      className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${isSelected ? "border-primary shadow-md" : "border-transparent hover:border-primary/30"}`}
      onClick={onSelect}
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-muted overflow-hidden">
        <img
          src={item.imageUrl}
          alt={item.title || typeLabels[item.type] || "图片"}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </div>

      {/* Overlay actions */}
      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-2 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onLightbox(); }}
          className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          title="放大查看"
        >
          <ZoomIn className="h-4 w-4 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/60 transition-colors"
          title="从工作区移除"
        >
          <X className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Footer */}
      <div className="px-2.5 py-2 bg-card border-t border-border">
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs font-medium truncate">{item.title || typeLabels[item.type] || "图片"}</p>
          <Badge variant="secondary" className="text-xs shrink-0 py-0 h-4">
            {typeLabels[item.type] || "图片"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
