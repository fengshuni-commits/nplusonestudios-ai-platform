import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Sparkles, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { inferCapabilities, CAPABILITY_LABELS, type ToolCapability } from "@shared/toolCapabilities";

export default function AdminApiKeys() {
  const { data: tools, isLoading: toolsLoading } = trpc.aiTools.list.useQuery({});
  const utils = trpc.useUtils();
  const [toolDialogOpen, setToolDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showKeyId, setShowKeyId] = useState<number | null>(null);
  const [toolForm, setToolForm] = useState({
    name: "",
    apiEndpoint: "",
    apiKeyName: "",
    description: "",
  });

  // 实时预览推断能力
  const previewCapabilities = toolForm.name.trim()
    ? inferCapabilities(toolForm.name, toolForm.apiEndpoint)
    : [];

  const createTool = trpc.aiTools.create.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      setToolDialogOpen(false);
      setToolForm({ name: "", apiEndpoint: "", apiKeyName: "", description: "" });
      toast.success("AI 工具添加成功");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTool = trpc.aiTools.update.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      toast.success("状态已更新");
    },
  });

  const deleteTool = trpc.aiTools.delete.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      toast.success("工具已删除");
    },
    onError: (err) => toast.error(err.message),
  });

  const setDefault = trpc.aiTools.setDefault.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      // 清除所有功能模块的工具选择缓存，下次打开时自动采用新默认工具
      Object.keys(localStorage)
        .filter(k => k.startsWith("ai-tool-pref-"))
        .forEach(k => localStorage.removeItem(k));
      toast.success("已设为默认工具，各功能模块将自动采用");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 工具管理</h1>
          <p className="text-sm text-muted-foreground mt-1">添加外部 AI 模型 API，平台自动判断其适用功能模块</p>
        </div>
        <Dialog open={toolDialogOpen} onOpenChange={setToolDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />添加 AI 工具</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>添加 AI 工具</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              {/* 工具名称 */}
              <div className="space-y-2">
                <Label>模型名称 <span className="text-destructive">*</span></Label>
                <Input
                  value={toolForm.name}
                  onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })}
                  placeholder="例：GPT-4o、Gemini 2.0 Flash、Flux.1"
                />
                {/* 实时预览能力标签 */}
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

              {/* API 端点 */}
              <div className="space-y-2">
                <Label>API 端点</Label>
                <Input
                  value={toolForm.apiEndpoint}
                  onChange={(e) => setToolForm({ ...toolForm, apiEndpoint: e.target.value })}
                  placeholder="https://api.openai.com/v1/chat/completions"
                />
              </div>

              {/* API Key 环境变量名 */}
              <div className="space-y-2">
                <Label>API Key 环境变量名</Label>
                <Input
                  value={toolForm.apiKeyName}
                  onChange={(e) => setToolForm({ ...toolForm, apiKeyName: e.target.value })}
                  placeholder="例：OPENAI_API_KEY"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  填写服务器端环境变量名称，平台将从该变量读取密钥
                </p>
              </div>

              {/* 备注（可选） */}
              <div className="space-y-2">
                <Label>备注 <span className="text-muted-foreground text-xs">（可选）</span></Label>
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
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{tool.name}</p>
                            {tool.isDefault && (
                              <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-primary/20">默认</Badge>
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
                        {!tool.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 bg-background"
                            onClick={(e) => { e.stopPropagation(); setDefault.mutate({ id: tool.id }); }}
                            disabled={setDefault.isPending}
                          >
                            设为默认
                          </Button>
                        )}
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
                        {tool.apiKeyName && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">API Key 环境变量</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono bg-background rounded px-2 py-1 border flex-1">
                                {showKeyId === tool.id ? tool.apiKeyName : "•".repeat(Math.min(tool.apiKeyName.length, 20))}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setShowKeyId(showKeyId === tool.id ? null : tool.id)}
                              >
                                {showKeyId === tool.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        )}
                        {tool.description && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">备注</p>
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
