import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Presentation, ImageIcon, FileText, Sparkles, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function PresentationPage() {
  const [, navigate] = useLocation();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">演示文稿</h1>
          <p className="text-sm text-muted-foreground mt-1">
            上传文字与图片资料，AI 自动构思版式，生成图文并茂的演示文稿
          </p>
        </div>
      </div>

      {/* Coming soon card */}
      <Card className="border border-dashed border-border bg-secondary/30">
        <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Presentation className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-xl font-semibold text-foreground">功能开发中</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              演示文稿功能正在规划中。你可以提供项目文字资料和图片，
              AI 将自主构思版式、分配图片，生成图文并茂的演示文稿，
              文字和图片内容完全忠实于你提供的原始资料。
            </p>
          </div>

          {/* Feature preview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg mt-2">
            <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background border border-border">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center">上传文字资料</span>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background border border-border">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center">上传项目图片</span>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background border border-border">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center">AI 生成演示文稿</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="mt-2"
            onClick={() => navigate("/design/planning")}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            前往案例调研
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
