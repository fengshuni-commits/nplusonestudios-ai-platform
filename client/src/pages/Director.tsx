import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  navigateTo?: { path: string; name: string; project_id?: number | null } | null;
  createdAt?: string | Date;
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

  const chatMutation = trpc.director.chat.useMutation({
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.content,
        navigateTo: data.navigateTo,
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

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    chatMutation.mutate({ message: text });
  }, [input, isLoading, chatMutation]);

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
      <div className="w-[340px] shrink-0 flex flex-col border-r border-border bg-background">
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
            <Button
              size="sm"
              className="h-9 w-9 p-0 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Enter 发送，Shift+Enter 换行</p>
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
            <p className="whitespace-pre-wrap">{message.content}</p>
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
    "帮我查看工作室成员情况",
    "打开设计任务书",
  ];
  return (
    <div className="py-4 space-y-4">
      <div className="flex gap-2.5">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]">
          <p>你好，{userName}。我是所长，N+1 STUDIOS 的 AI 工作助手。</p>
          <p className="mt-1.5 text-muted-foreground">我可以帮你查询项目状态、任务安排，或引导你使用各功能模块。</p>
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
