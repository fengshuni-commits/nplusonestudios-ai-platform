import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Sparkles, Trash2, ChevronDown, ChevronUp, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Star, PlusCircle, RefreshCw, ShieldCheck, ShieldOff, Clock, Timer, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { inferCapabilities, CAPABILITY_LABELS, type ToolCapability } from "@shared/toolCapabilities";

// ─── Key 池卡片组件 ────────────────────────────────────────────────────────────

/** 格式化相对时间（秒数 → 人类可读） */
function formatRelativeTime(unixSec: number | null | undefined): string {
  if (!unixSec) return "从未";
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/** 冷却倒计时 hook */
function useCooldownTimer(cooldownUntil: number | null | undefined) {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!cooldownUntil) { setRemaining(0); return; }
    const update = () => {
      const r = cooldownUntil - Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, r));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  return remaining;
}

/** 格式化冷却剩余时间 */
function formatCooldown(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

type PoolKeyData = {
  id: number;
  apiKeyMasked: string;
  label?: string | null;
  isActive: boolean;
  successCount: number;
  failCount: number;
  lastSuccessAt?: number | null;
  lastFailAt?: number | null;
  cooldownUntil?: number | null;
  weight?: number;
};

function KeyPoolCard({
  k,
  onToggle,
  onResetCooldown,
  onDelete,
  onWeightChange,
}: {
  k: PoolKeyData;
  onToggle: () => void;
  onResetCooldown: () => void;
  onDelete: () => void;
  onWeightChange: (weight: number) => void;
}) {
  const cooldownRemaining = useCooldownTimer(k.cooldownUntil);
  const inCooldown = cooldownRemaining > 0;
  const total = k.successCount + k.failCount;
  const successRate = total > 0 ? Math.round((k.successCount / total) * 100) : null;

  // Status color
  const statusColor = !k.isActive
    ? "text-muted-foreground"
    : inCooldown
    ? "text-amber-500"
    : "text-green-600";

  const statusIcon = !k.isActive ? (
    <ShieldOff className={`h-3.5 w-3.5 ${statusColor} shrink-0`} />
  ) : inCooldown ? (
    <Timer className={`h-3.5 w-3.5 ${statusColor} shrink-0`} />
  ) : (
    <ShieldCheck className={`h-3.5 w-3.5 ${statusColor} shrink-0`} />
  );

  const statusLabel = !k.isActive ? "已停用" : inCooldown ? "冷却中" : "正常";
  const statusBg = !k.isActive
    ? "bg-muted/50 border-border"
    : inCooldown
    ? "bg-amber-50/50 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40"
    : "bg-green-50/30 border-green-200/50 dark:bg-green-950/10 dark:border-green-800/30";

  return (
    <div className={`rounded-md border p-2.5 text-xs ${statusBg}`}>
      {/* Row 1: Key + status badge + actions */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {statusIcon}
          <span className="font-mono text-muted-foreground truncate">{k.apiKeyMasked}</span>
          {k.label && (
            <span className="shrink-0 text-foreground/60 bg-muted/60 px-1 rounded">{k.label}</span>
          )}
          {/* Weight badge */}
          <span
            className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100/60 border border-blue-300/60 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700/50 dark:text-blue-300 cursor-pointer hover:bg-blue-200/60 transition-colors select-none"
            title="点击调整权重（1-10，越高被选中概率越大）"
            onClick={() => {
              const cur = k.weight ?? 1;
              const next = cur >= 10 ? 1 : cur + 1;
              onWeightChange(next);
            }}
          >
            <Star className="h-2.5 w-2.5" />{k.weight ?? 1}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${statusColor} ${
            !k.isActive ? "bg-muted/40 border-border" :
            inCooldown ? "bg-amber-100/60 border-amber-300/60 dark:bg-amber-900/30 dark:border-amber-700/50" :
            "bg-green-100/60 border-green-300/60 dark:bg-green-900/30 dark:border-green-700/50"
          }`}>{statusLabel}</span>
          <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={onToggle}
            title={k.isActive ? "停用" : "启用"}>
            {k.isActive ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
          </Button>
          {inCooldown && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={onResetCooldown} title="重置冷却">
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-destructive hover:text-destructive"
            onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Row 2: Stats */}
      <div className="mt-2 space-y-1.5">
        {/* Success rate bar */}
        {total > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="h-3 w-3" />调用成功率
              </span>
              <span className={`font-semibold ${
                successRate === null ? "text-muted-foreground" :
                successRate >= 90 ? "text-green-600" :
                successRate >= 70 ? "text-amber-600" : "text-red-500"
              }`}>
                {successRate !== null ? `${successRate}%` : "—"}
                <span className="font-normal text-muted-foreground ml-1">({k.successCount}/{total})</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  successRate === null ? "bg-muted" :
                  successRate >= 90 ? "bg-green-500" :
                  successRate >= 70 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${successRate ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Cooldown countdown */}
        {inCooldown && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-amber-600">
              <Timer className="h-3 w-3" />冷却剩余
            </span>
            <span className="font-mono font-semibold text-amber-600">{formatCooldown(cooldownRemaining)}</span>
          </div>
        )}

        {/* Last fail time */}
        {k.lastFailAt && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />最近失败
            </span>
            <span className="text-muted-foreground">{formatRelativeTime(k.lastFailAt)}</span>
          </div>
        )}

        {/* Last success time (only if no fail info) */}
        {!k.lastFailAt && k.lastSuccessAt && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Zap className="h-3 w-3" />最近成功
            </span>
            <span className="text-muted-foreground">{formatRelativeTime(k.lastSuccessAt)}</span>
          </div>
        )}

        {/* Weight info row */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Star className="h-3 w-3" />选取权重
          </span>
          <div className="flex items-center gap-1">
            {[1,2,3,4,5,6,7,8,9,10].map((w) => (
              <button
                key={w}
                className={`w-4 h-4 rounded-sm text-[9px] font-bold transition-colors ${
                  (k.weight ?? 1) >= w
                    ? "bg-blue-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-blue-200"
                }`}
                onClick={() => onWeightChange(w)}
                title={`设置权重为 ${w}`}
              >{w}</button>
            ))}
          </div>
        </div>
        {/* No calls yet */}
        {total === 0 && (
          <p className="text-muted-foreground/60 text-center py-0.5">尚未调用</p>
        )}
      </div>
    </div>
  );
}

// 需要在 UI 中展示的功能类别（与 toolCapabilities.ts 中的真实 capability 一一对应）
const DISPLAY_CAPABILITIES: { key: ToolCapability; label: string; desc: string }[] = [
  { key: "rendering", label: "AI 效果图 / 图像生成", desc: "AI 效果图、AI 彩平、图生图等图像生成功能" },
  { key: "video",     label: "AI 视频生成",             desc: "文生视频、图生视频等视频生成功能" },
  { key: "document",  label: "文档生成",             desc: "案例调研报告、演示文稿" },
  { key: "analysis", label: "分析理解",             desc: "多模态理解、数据分析" },
  { key: "media",    label: "媒体内容",             desc: "小红书、公众号、Instagram 文案" },
];

export default function AdminApiKeys() {
  const { data: tools, isLoading: toolsLoading } = trpc.aiTools.list.useQuery({});
  const { data: capabilityDefaults, isLoading: defaultsLoading } = trpc.aiTools.getCapabilityDefaults.useQuery();
  const utils = trpc.useUtils();
  const [toolDialogOpen, setToolDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editKeyId, setEditKeyId] = useState<number | null>(null);
  const [editKeyValue, setEditKeyValue] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [editModelNameId, setEditModelNameId] = useState<number | null>(null);
  const [editModelNameValue, setEditModelNameValue] = useState("");
  const [toolForm, setToolForm] = useState({
    name: "",
    apiEndpoint: "",
    apiKeyName: "",
    apiKey: "",
    description: "",
    accessKeyId: "", // 即梦 AI 专用
  });
  const [showFormKey, setShowFormKey] = useState(false);

  // 检测是否为即梦工具
  const isJimengTool = toolForm.name.toLowerCase().includes("即梦") || toolForm.name.toLowerCase().includes("jimeng") || toolForm.apiEndpoint.includes("volcengine");

  // 实时预览推断能力
  const previewCapabilities = toolForm.name.trim()
    ? inferCapabilities(toolForm.name, toolForm.apiEndpoint)
    : [];

  const createTool = trpc.aiTools.create.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      setToolDialogOpen(false);
      setToolForm({ name: "", apiEndpoint: "", apiKeyName: "", apiKey: "", description: "", accessKeyId: "" });
      setShowFormKey(false);
      toast.success("AI 工具添加成功");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTool = trpc.aiTools.update.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      setEditKeyId(null);
      setEditKeyValue("");
      toast.success("已更新");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteTool = trpc.aiTools.delete.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      toast.success("工具已删除");
    },
    onError: (err) => toast.error(err.message),
  });

  const setDefaultForCapability = trpc.aiTools.setDefaultForCapability.useMutation({
    onSuccess: () => {
      utils.aiTools.getCapabilityDefaults.invalidate();
      toast.success("已设为该类别的默认工具");
    },
    onError: (err) => toast.error(err.message),
  });

  // Key 池管理状态
  const [keyPoolOpenId, setKeyPoolOpenId] = useState<number | null>(null);
  const [addKeyForm, setAddKeyForm] = useState({ apiKey: "", label: "", weight: 1 });
  const [showAddKey, setShowAddKey] = useState(false);
  const [addingKeyToolId, setAddingKeyToolId] = useState<number | null>(null);

  const { data: poolKeys, refetch: refetchPoolKeys } = trpc.aiTools.listKeys.useQuery(
    { toolId: keyPoolOpenId! },
    { enabled: keyPoolOpenId !== null }
  );

  const addKey = trpc.aiTools.addKey.useMutation({
    onSuccess: () => {
      refetchPoolKeys();
      setAddKeyForm({ apiKey: "", label: "", weight: 1 });
      setAddingKeyToolId(null);
      toast.success("备用 Key 已添加");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateKey = trpc.aiTools.updateKey.useMutation({
    onSuccess: () => { refetchPoolKeys(); toast.success("已更新"); },
    onError: (err) => toast.error(err.message),
  });

  const deleteKey = trpc.aiTools.deleteKey.useMutation({
    onSuccess: () => { refetchPoolKeys(); toast.success("已删除"); },
    onError: (err) => toast.error(err.message),
  });

  const clearDefaultForCapability = trpc.aiTools.clearDefaultForCapability.useMutation({
    onSuccess: () => {
      utils.aiTools.getCapabilityDefaults.invalidate();
      toast.success("已恢复为内置 AI");
    },
    onError: (err) => toast.error(err.message),
  });

  // 获取某 capability 下有哪些工具
  const getToolsForCapability = (capKey: string) => {
    if (!tools) return [];
    return tools.filter((t: any) => {
      const caps: string[] = Array.isArray(t.capabilities) ? t.capabilities : [];
      return caps.includes(capKey) && t.isActive;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 工具管理</h1>
          <p className="text-sm text-muted-foreground mt-1">添加外部 AI 模型 API，按功能类别分别设置默认工具</p>
        </div>
        <Dialog open={toolDialogOpen} onOpenChange={setToolDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />添加 AI 工具</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>添加 AI 工具</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>模型名称 <span className="text-destructive">*</span></Label>
                <Input
                  value={toolForm.name}
                  onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })}
                  placeholder="例：GPT-4o、Gemini 2.0 Flash、百炼 qwen-max"
                />
                {previewCapabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-xs text-muted-foreground">自动识别为：</span>
                    {previewCapabilities.map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-xs h-5 px-1.5">
                        {CAPABILITY_LABELS[cap as ToolCapability]}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>API 端点</Label>
                <Input
                  value={toolForm.apiEndpoint}
                  onChange={(e) => setToolForm({ ...toolForm, apiEndpoint: e.target.value })}
                  placeholder="https://api.openai.com/v1/chat/completions"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  API Key
                  <span className="text-xs text-muted-foreground font-normal ml-1">（加密存储）</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showFormKey ? "text" : "password"}
                    value={toolForm.apiKey}
                    onChange={(e) => setToolForm({ ...toolForm, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowFormKey(!showFormKey)}
                  >
                    {showFormKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {isJimengTool && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    AccessKeyID
                    <span className="text-xs text-muted-foreground font-normal ml-1">（即梦 AI 专用）</span>
                  </Label>
                  <Input
                    type="text"
                    value={toolForm.accessKeyId}
                    onChange={(e) => setToolForm({ ...toolForm, accessKeyId: e.target.value })}
                    placeholder="即梦 AI AccessKeyID"
                    className="font-mono text-sm"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>备注名称 <span className="text-muted-foreground text-xs">（可选）</span></Label>
                <Input
                  value={toolForm.apiKeyName}
                  onChange={(e) => setToolForm({ ...toolForm, apiKeyName: e.target.value })}
                  placeholder="例：主账号、测试用"
                />
              </div>
              <div className="space-y-2">
                <Label>备注说明 <span className="text-muted-foreground text-xs">（可选）</span></Label>
                <Textarea
                  value={toolForm.description}
                  onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })}
                  placeholder="用途说明、版本备注等"
                  rows={2}
                />
              </div>
              <Button
                onClick={() => {
                  if (!toolForm.name.trim()) { toast.error("请输入模型名称"); return; }
                  createTool.mutate(toolForm);
                }}
                disabled={createTool.isPending}
                className="w-full"
              >
                {createTool.isPending ? "添加中..." : "添加工具"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── 按功能类别分组设置默认工具 ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Star className="h-4 w-4" />各功能类别默认工具
          </CardTitle>
          <p className="text-xs text-muted-foreground">每个功能类别可以独立指定默认工具，打开对应功能模块时自动选中</p>
        </CardHeader>
        <CardContent>
          {toolsLoading || defaultsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {DISPLAY_CAPABILITIES.map(({ key, label, desc }) => {
                const capTools = getToolsForCapability(key);
                const currentDefaultId = capabilityDefaults?.[key];
                const currentDefault = capTools.find((t: any) => t.id === currentDefaultId);
                return (
                  <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-xs text-muted-foreground">{desc}</span>
                      </div>
                      <div className="mt-1">
                        {currentDefault ? (
                          <div className="flex items-center gap-1.5">
                            <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-primary/20">
                              {currentDefault.name}
                            </Badge>
                            <span className="text-xs text-muted-foreground">为当前默认</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">使用内置 AI（未设置外部默认）</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {capTools.length > 0 ? (
                        <select
                          className="text-xs h-7 px-2 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          value={currentDefaultId?.toString() || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              clearDefaultForCapability.mutate({ capability: key });
                            } else {
                              setDefaultForCapability.mutate({ capability: key, toolId: parseInt(val) });
                            }
                          }}
                        >
                          <option value="">内置 AI</option>
                          {capTools.map((t: any) => (
                            <option key={t.id} value={t.id.toString()}>{t.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">暂无可用工具</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 已配置的 AI 工具列表 ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />已配置的 AI 工具
          </CardTitle>
        </CardHeader>
        <CardContent>
          {toolsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : tools && tools.length > 0 ? (
            <div className="space-y-2">
              {tools.map((tool: any) => {
                const caps: ToolCapability[] = Array.isArray(tool.capabilities) ? tool.capabilities : [];
                const isExpanded = expandedId === tool.id;
                const isEditingKey = editKeyId === tool.id;
                // 判断该工具是否是某个 capability 的默认工具
                const isAnyDefault = capabilityDefaults
                  ? Object.values(capabilityDefaults).includes(tool.id)
                  : false;
                const defaultForCaps = capabilityDefaults
                  ? DISPLAY_CAPABILITIES.filter(({ key }) => capabilityDefaults[key] === tool.id).map(c => c.label)
                  : [];

                return (
                  <div key={tool.id} className="rounded-lg border border-border overflow-hidden">
                    <div
                      className="flex items-center justify-between p-3 hover:bg-accent/40 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : tool.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Sparkles className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium truncate">{tool.name}</p>
                            {isAnyDefault && (
                              <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/15 text-amber-600 border-amber-500/20">
                                默认：{defaultForCaps.join("、")}
                              </Badge>
                            )}
                            {tool.hasApiKey ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" aria-label="已配置 API Key" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="未配置 API Key" />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {caps.length > 0 ? caps.map((cap) => (
                              <Badge key={cap} variant="secondary" className="text-[10px] h-4 px-1">
                                {CAPABILITY_LABELS[cap]}
                              </Badge>
                            )) : (
                              <span className="text-xs text-muted-foreground">未识别能力</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant={tool.isActive ? "secondary" : "outline"}
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); updateTool.mutate({ id: tool.id, isActive: !tool.isActive }); }}
                        >
                          {tool.isActive ? "已启用" : "已停用"}
                        </Button>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/30 space-y-3">
                        {tool.apiEndpoint && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">API 端点</p>
                            <p className="text-xs font-mono bg-background rounded px-2 py-1 border">{tool.apiEndpoint}</p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <KeyRound className="h-3 w-3" />API Key
                          </p>
                          {isEditingKey ? (
                            <div className="space-y-2">
                              <div className="relative">
                                <Input
                                  type={showNewKey ? "text" : "password"}
                                  value={editKeyValue}
                                  onChange={(e) => setEditKeyValue(e.target.value)}
                                  placeholder="输入新的 API Key（sk-...）"
                                  className="font-mono text-xs pr-10 h-8"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  onClick={() => setShowNewKey(!showNewKey)}
                                >
                                  {showNewKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    if (!editKeyValue.trim()) { toast.error("请输入 API Key"); return; }
                                    updateTool.mutate({ id: tool.id, apiKey: editKeyValue });
                                  }}
                                  disabled={updateTool.isPending}
                                >
                                  保存
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => { setEditKeyId(null); setEditKeyValue(""); setShowNewKey(false); }}
                                >
                                  取消
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono bg-background rounded px-2 py-1 border flex-1 text-muted-foreground">
                                {tool.apiKeyMasked || "未配置"}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditKeyId(tool.id);
                                  setEditKeyValue("");
                                  setShowNewKey(false);
                                }}
                              >
                                {tool.hasApiKey ? "更换" : "配置"}
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* ─── Key 池管理 ─── */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <KeyRound className="h-3 w-3" />
                              备用 Key 池
                              {keyPoolOpenId === tool.id && poolKeys && poolKeys.length > 0 && (
                                <span className="ml-1 text-primary font-medium">{poolKeys.length} 个</span>
                              )}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setKeyPoolOpenId(keyPoolOpenId === tool.id ? null : tool.id);
                              }}
                            >
                              {keyPoolOpenId === tool.id ? "收起" : "管理"}
                            </Button>
                          </div>

                          {keyPoolOpenId === tool.id && (
                            <div className="space-y-2 bg-background rounded border p-2">
                              {/* 已有备用 Key 列表 */}
                              {poolKeys && poolKeys.length > 0 ? (
                                <div className="space-y-2">
                                  {poolKeys.map((k: any) => (
                                    <KeyPoolCard
                                      key={k.id}
                                      k={k}
                                      onToggle={() => updateKey.mutate({ id: k.id, isActive: !k.isActive })}
                                      onResetCooldown={() => updateKey.mutate({ id: k.id, isActive: true })}
                                      onDelete={() => { if (confirm("确定删除此备用 Key？")) deleteKey.mutate({ id: k.id }); }}
                                      onWeightChange={(w) => updateKey.mutate({ id: k.id, weight: w })}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground py-1">暂无备用 Key，添加后将与主 Key 轮换使用</p>
                              )}

                              {/* 添加新 Key 表单 */}
                              {addingKeyToolId === tool.id ? (
                                <div className="space-y-1.5 pt-1 border-t border-border">
                                  <Input
                                    type="password"
                                    value={addKeyForm.apiKey}
                                    onChange={(e) => setAddKeyForm({ ...addKeyForm, apiKey: e.target.value })}
                                    placeholder="粘贴 API Key"
                                    className="font-mono text-xs h-7"
                                    autoFocus
                                  />
                                  <Input
                                    value={addKeyForm.label}
                                    onChange={(e) => setAddKeyForm({ ...addKeyForm, label: e.target.value })}
                                    placeholder="备注名称（可选，如：Key 2）"
                                    className="text-xs h-7"
                                  />
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" />选取权重</span>
                                    <div className="flex items-center gap-0.5">
                                      {[1,2,3,4,5,6,7,8,9,10].map((w) => (
                                        <button
                                          key={w}
                                          type="button"
                                          className={`w-4 h-4 rounded-sm text-[9px] font-bold transition-colors ${
                                            addKeyForm.weight >= w
                                              ? "bg-blue-500 text-white"
                                              : "bg-muted text-muted-foreground hover:bg-blue-200"
                                          }`}
                                          onClick={() => setAddKeyForm({ ...addKeyForm, weight: w })}
                                          title={`权重 ${w}`}
                                        >{w}</button>
                                      ))}
                                    </div>
                                    <span className="text-xs text-muted-foreground">（默认 1，主 Key 默认 3）</span>
                                  </div>
                                  <div className="flex gap-1.5">
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={addKey.isPending}
                                      onClick={() => {
                                        if (!addKeyForm.apiKey.trim()) { toast.error("请输入 API Key"); return; }
                                        addKey.mutate({ toolId: tool.id, apiKey: addKeyForm.apiKey.trim(), label: addKeyForm.label.trim() || undefined, weight: addKeyForm.weight });
                                      }}
                                    >
                                      确认添加
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => { setAddingKeyToolId(null); setAddKeyForm({ apiKey: "", label: "", weight: 1 }); }}
                                    >
                                      取消
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs w-full border border-dashed border-border hover:border-primary/50"
                                  onClick={() => setAddingKeyToolId(tool.id)}
                                >
                                  <PlusCircle className="h-3.5 w-3.5 mr-1" />添加备用 Key
                                </Button>
                              )}
                            </div>
                          )}
                        </div>

                        {tool.configJson?.accessKeyId && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">AccessKeyID</p>
                            <p className="text-xs font-mono bg-background rounded px-2 py-1 border text-muted-foreground">
                              {tool.configJson.accessKeyId.substring(0, 8)}...{tool.configJson.accessKeyId.substring(tool.configJson.accessKeyId.length - 4)}
                            </p>
                          </div>
                        )}

                        {/* 模型名称：仅 Gemini 工具显示 */}
                        {(tool.name.toLowerCase().includes("gemini") || tool.apiEndpoint?.includes("generativelanguage.googleapis.com")) && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">模型名称</p>
                            {editModelNameId === tool.id ? (
                              <div className="space-y-2">
                                <Input
                                  value={editModelNameValue}
                                  onChange={(e) => setEditModelNameValue(e.target.value)}
                                  placeholder="例：gemini-3.1-pro-preview"
                                  className="font-mono text-xs h-8"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      if (!editModelNameValue.trim()) { toast.error("请输入模型名称"); return; }
                                      updateTool.mutate({
                                        id: tool.id,
                                        configJson: { ...(tool.configJson || {}), modelName: editModelNameValue.trim() },
                                      });
                                      setEditModelNameId(null);
                                      setEditModelNameValue("");
                                    }}
                                    disabled={updateTool.isPending}
                                  >
                                    保存
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => { setEditModelNameId(null); setEditModelNameValue(""); }}
                                  >
                                    取消
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-mono bg-background rounded px-2 py-1 border flex-1 text-foreground/80">
                                  {tool.configJson?.modelName || <span className="text-muted-foreground italic">未设置（使用默认值）</span>}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditModelNameId(tool.id);
                                    setEditModelNameValue(tool.configJson?.modelName || "");
                                  }}
                                >
                                  {tool.configJson?.modelName ? "修改" : "设置"}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        {tool.apiKeyName && !tool.apiKeyName.startsWith('sk-') && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">备注名称</p>
                            <p className="text-xs text-foreground/80">{tool.apiKeyName}</p>
                          </div>
                        )}
                        {tool.description && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">备注说明</p>
                            <p className="text-xs text-foreground/80">{tool.description}</p>
                          </div>
                        )}
                        <div className="flex justify-end pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                            onClick={() => {
                              if (confirm(`确定删除工具「${tool.name}」？`)) {
                                deleteTool.mutate({ id: tool.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />删除
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p>暂未配置 AI 工具</p>
              <p className="text-xs mt-1">点击右上角「添加 AI 工具」接入外部模型</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
