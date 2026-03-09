import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Key, Plus, Sparkles, Trash2, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminApiKeys() {
  const { data: tools, isLoading: toolsLoading } = trpc.aiTools.list.useQuery();
  const utils = trpc.useUtils();
  const [toolDialogOpen, setToolDialogOpen] = useState(false);
  const [toolForm, setToolForm] = useState({
    name: "",
    description: "",
    category: "rendering" as "rendering" | "document" | "image" | "video" | "layout" | "analysis" | "other",
    provider: "",
    apiEndpoint: "",
    apiKeyName: "",
  });

  const createTool = trpc.aiTools.create.useMutation({
    onSuccess: () => {
      utils.aiTools.list.invalidate();
      setToolDialogOpen(false);
      setToolForm({ name: "", description: "", category: "rendering", provider: "", apiEndpoint: "", apiKeyName: "" });
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

  const categories = [
    { value: "rendering", label: "渲染" },
    { value: "document", label: "文档" },
    { value: "image", label: "图像" },
    { value: "video", label: "视频" },
    { value: "layout", label: "布局" },
    { value: "analysis", label: "分析" },
    { value: "other", label: "其他" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API 密钥与工具管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 AI 工具配置与 API 密钥</p>
        </div>
        <Dialog open={toolDialogOpen} onOpenChange={setToolDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />添加 AI 工具</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>添加 AI 工具</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>工具名称 *</Label>
                <Input value={toolForm.name} onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })} placeholder="例：Gemini Pro" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>类别</Label>
                  <Select value={toolForm.category} onValueChange={(v) => setToolForm({ ...toolForm, category: v as typeof toolForm.category })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>提供商</Label>
                  <Input value={toolForm.provider} onChange={(e) => setToolForm({ ...toolForm, provider: e.target.value })} placeholder="例：Google" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>API 端点</Label>
                <Input value={toolForm.apiEndpoint} onChange={(e) => setToolForm({ ...toolForm, apiEndpoint: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>API Key 名称</Label>
                <Input value={toolForm.apiKeyName} onChange={(e) => setToolForm({ ...toolForm, apiKeyName: e.target.value })} placeholder="环境变量名，例：GEMINI_API_KEY" />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea value={toolForm.description} onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })} placeholder="工具功能描述" rows={2} />
              </div>
              <Button onClick={() => {
                if (!toolForm.name.trim()) { toast.error("请输入工具名称"); return; }
                createTool.mutate(toolForm);
              }} disabled={createTool.isPending} className="w-full">
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
              {tools.map((tool: any) => (
                <div key={tool.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tool.name}</p>
                      <p className="text-xs text-muted-foreground">{tool.provider} · {tool.apiKeyName || "未配置密钥"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{categories.find(c => c.value === tool.category)?.label || tool.category}</Badge>
                    <Button
                      variant={tool.isActive ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => updateTool.mutate({ id: tool.id, isActive: !tool.isActive })}
                    >
                      {tool.isActive ? "已启用" : "已停用"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂未配置 AI 工具，点击右上角添加
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
