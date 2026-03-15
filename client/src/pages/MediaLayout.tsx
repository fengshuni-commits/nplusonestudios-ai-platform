import { LayoutTemplate, Sparkles, Type, Image, AlignLeft, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const plannedFeatures = [
  {
    icon: Type,
    title: "智能排版引擎",
    desc: "根据文字内容和图片自动生成多种排版方案，支持一键切换",
  },
  {
    icon: Image,
    title: "素材库直连",
    desc: "直接从素材库拖入图片，与文字内容自动适配对齐",
  },
  {
    icon: AlignLeft,
    title: "品牌风格模板",
    desc: "内置 N+1 STUDIOS 品牌规范，确保对外输出的视觉一致性",
  },
  {
    icon: Layers,
    title: "多格式导出",
    desc: "支持导出为 PDF、PNG 长图、小红书竖版、公众号横版等格式",
  },
];

export default function MediaLayout() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <LayoutTemplate className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">图文排版</h1>
              <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                开发中
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI 辅助图文排版，快速生成品牌一致的视觉内容
            </p>
          </div>
        </div>
      </div>

      {/* Coming soon body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-10">
        {/* Hero illustration */}
        <div className="relative">
          <div className="h-28 w-28 rounded-3xl bg-violet-500/10 flex items-center justify-center">
            <LayoutTemplate className="h-14 w-14 text-violet-500/40" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary/60" />
          </div>
        </div>

        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-foreground/80 mb-2">功能正在开发中</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            图文排版模块将帮助你快速将设计内容转化为高质量的图文素材，
            适用于小红书、公众号、项目提案等多种场景。
          </p>
        </div>

        {/* Planned features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {plannedFeatures.map((f) => (
            <div
              key={f.title}
              className="flex gap-3 p-4 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="shrink-0 h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center mt-0.5">
                <f.icon className="h-4 w-4 text-violet-500/70" />
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
