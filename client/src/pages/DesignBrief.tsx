import { FileText, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DesignBrief() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">设计任务书</h1>
          <p className="text-sm text-muted-foreground mt-1">根据项目信息自动生成标准化设计任务书</p>
        </div>
        <Badge variant="secondary" className="text-xs">开发中</Badge>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-24">
          <div className="relative mb-4">
            <FileText className="h-16 w-16 text-muted-foreground/20" />
            <Sparkles className="h-5 w-5 text-violet-400 absolute -top-1 -right-1" />
          </div>
          <h3 className="text-lg font-medium text-foreground/70 mb-2">设计任务书生成</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md leading-relaxed">
            该功能正在开发中，将支持根据项目信息、对标调研报告自动生成标准化设计任务书，
            包含设计目标、空间需求、技术指标、材料要求等完整内容。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
