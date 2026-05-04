import { BookImage, Sparkles, FolderOpen, Globe, FileDown, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const plannedFeatures = [
  {
    icon: FolderOpen,
    title: "项目素材聚合",
    desc: "自动从项目信息库和素材库中提取效果图、平面图等关键内容",
  },
  {
    icon: Wand2,
    title: "AI 自动编排",
    desc: "根据项目类型和风格，AI 自动生成作品集页面布局和文字描述",
  },
  {
    icon: Globe,
    title: "在线展示链接",
    desc: "生成可分享的在线作品集链接，支持密码保护和有效期设置",
  },
  {
    icon: FileDown,
    title: "多格式导出",
    desc: "支持导出为 PDF 印刷版、网页版、以及适合邮件发送的轻量版",
  },
];

export default function MediaPortfolio() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <BookImage className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                开发中
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              一键生成专业作品集，展示 N+1 STUDIOS 的设计成果
            </p>
          </div>
        </div>
      </div>

      {/* Coming soon body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-10">
        {/* Hero illustration */}
        <div className="relative">
          <div className="h-28 w-28 rounded-3xl bg-emerald-500/10 flex items-center justify-center">
            <BookImage className="h-14 w-14 text-emerald-500/40" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary/60" />
          </div>
        </div>

        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-foreground/80 mb-2">功能正在开发中</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            作品集模块将整合项目信息库与素材库中的内容，
            通过 AI 自动编排生成专业的设计作品集，
            用于客户提案、招募合作或品牌展示。
          </p>
        </div>

        {/* Planned features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {plannedFeatures.map((f) => (
            <div
              key={f.title}
              className="flex gap-3 p-4 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="shrink-0 h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mt-0.5">
                <f.icon className="h-4 w-4 text-emerald-500/70" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/80">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
