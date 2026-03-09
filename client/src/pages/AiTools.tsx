import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Sparkles, ExternalLink, Settings2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

const categoryLabels: Record<string, string> = {
  rendering: "渲染",
  document: "文档",
  image: "图像",
  video: "视频",
  layout: "布局",
  analysis: "分析",
  other: "其他",
};

export default function AiTools() {
  const { user } = useAuth();
  const { data: tools, isLoading } = trpc.aiTools.list.useQuery();
  const isAdmin = user?.role === "admin";

  const grouped = (tools || []).reduce<Record<string, typeof tools>>((acc, tool) => {
    const cat = (tool as any).category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(tool);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI 工具中心</h1>
          <p className="text-sm text-muted-foreground mt-1">查看和管理可用的 AI 工具</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/admin/api-keys"}>
            <Settings2 className="h-4 w-4 mr-1.5" />管理 API 密钥
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-24 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : Object.keys(grouped).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, catTools]) => (
            <div key={category}>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                {categoryLabels[category] || category}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(catTools || []).map((tool: any) => (
                  <Card key={tool.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <Badge variant={tool.isActive ? "default" : "secondary"} className="text-xs">
                          {tool.isActive ? "已启用" : "未启用"}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-sm">{tool.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{tool.provider}</p>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{tool.description || "暂无描述"}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">暂未配置 AI 工具</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">请前往管理后台添加 AI 工具配置</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
