import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

type HelpGuideProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageKey?: string; // 当前页面路由路径
};

type GuideContent = {
  title: string;
  externalUrl?: string;
  sections: Array<{
    heading?: string;
    level?: 1 | 2 | 3;
    body?: string;
    steps?: string[];
    items?: string[];
    note?: string;
  }>;
};

const guides: Record<string, GuideContent> = {
  "/design/planning": {
    title: "案例调研 — 使用说明",
    sections: [
      {
        body: "案例调研模块通过 AI 自动检索并整理国内外同类项目案例，生成结构化的对标分析报告，帮助团队在方案设计阶段快速建立参照体系。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "在《调研参数》面板填写《项目名称》和《项目需求与描述》",
          "选择需要生成的对标案例数量（3–10 个）",
          "右上角选择 AI 工具（不同工具在搜索覆盖面和报告质量上有所差异）",
          "点击《生成调研报告》，等待 1–3 分钟即可完成",
        ],
      },
      {
        heading: "二、关键功能",
        level: 2,
      },
      {
        heading: "导入项目信息",
        level: 3,
        body: "点击调研参数面板顶部的《导入项目信息》按钮，可将项目库中已建立的项目信息（公司概况、业务目标、项目概况等）自动填入调研参数，无需重复输入。",
      },
      {
        heading: "对话式修订",
        level: 3,
        body: "报告生成后，可在下方对话框输入修改意见（如「请增加对可持续性的分析」「补充中国本土案例」），AI 会在原报告基础上进行定向修订，每次修订结果均会自动保存到生成历史。",
      },
      {
        heading: "复制到飞书",
        level: 3,
        body: "报告区域右上角点击《复制到飞书》，将报告内容复制到剪贴板，直接在飞书文档中粘贴即可自动识别格式。",
      },
      {
        heading: "关联项目",
        level: 3,
        body: "在《生成历史》页面中找到该报告，可将其关联到对应项目，方便后续在项目看板中统一查阅所有相关成果。",
      },
      {
        heading: "三、填写建议",
        level: 2,
        items: [
          "项目名称建议包含地点、业主类型和空间类型，如《某科技园区总部办公楼》",
          "项目需求描述越具体，搜索结果越精准；建议包含面积、功能分区、风格定位等信息",
          "对标案例数量建议选 5–7 个，覆盖面和分析深度平衡较好",
        ],
        note: "生成时间通常为 1–3 分钟，使用推理模型时可能超过 3 分钟，请耐心等待。生成结果已自动保存，不必手动备份。",
      },
    ],
  },

  "/design/tools": {
    title: "AI 效果图 — 使用说明",
    externalUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663304605552/HuBQuntBuVNNlrnj.html",
    sections: [
      {
        body: "AI 效果图模块利用 AI 模型，根据文字描述快速生成专业级建筑设计效果图，支持文生图、图生图、局部重绘和画质增强，加速设计迭代与客户沟通。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "在左侧输入框中输入设计描述（如「现代办公空间，落地窗，木地板，自然采光」）",
          "（可选）上传参考图片或从素材库选择",
          "右上角选择 AI 工具",
          "点击《生成图像》，等待 10–30 秒",
          "查看结果，可继续使用图生图或局部重绘进行迭代",
        ],
      },
      {
        heading: "二、核心功能",
        level: 2,
      },
      {
        heading: "文生图",
        level: 3,
        body: "输入描述直接生成效果图。建议按'空间类型 + 风格 + 材料 + 光线 + 功能'的顺序组织描述，越具体结果越准确。",
      },
      {
        heading: "图生图",
        level: 3,
        body: "上传参考图片，AI 根据新描述进行创意迭代，保留原图整体构图和风格，同时融入新的设计元素。",
      },
      {
        heading: "局部重绘",
        level: 3,
        body: "用画笔标注需要修改的区域，输入修改描述，AI 只修改标注区域，保持其余部分原样，适合精细调整。",
      },
      {
        heading: "画质增强",
        level: 3,
        body: "使用 Magnific AI 将效果图放大并增强画质（2x 或 4x），让细节更丰富，适合客户汇报或打印输出。推荐参数：2x 放大 + 3D渲染 + 细节度 +2。",
      },
      {
        heading: "三、工作流建议",
        level: 2,
        steps: [
          "生成 3–5 个基础方案，选择最接近理想的一个",
          "使用图生图功能，基于最佳方案进行风格或细节调整",
          "使用局部重绘精细调整特定区域",
          "对最终满意的图片使用画质增强，提升分辨率后用于汇报",
        ],
        note: "每次打开页面时，AI 工具会自动重置为管理员设置的默认工具。如需临时更换，点击右上角工具选择器即可，仅在本次会话中有效。",
      },
    ],
  },

  "/design/presentation": {
    title: "演示文稿 — 使用说明",
    sections: [
      {
        body: "演示文稿模块通过 AI 将文字描述和项目图片自动整合为结构完整、图文并茂的 PPT 文件，适用于方案汇报、项目提案等场景。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "填写《演示标题》，如《JPT 总部办公空间设计方案汇报》",
          "在《演示内容描述》中详细说明要展示的内容",
          "（可选）点击《导入项目信息》，自动填入项目背景信息",
          "（可选）上传项目图片（最多 8 张），AI 会将图片分配到合适的幻灯片中",
          "点击《生成演示文稿》，等待 1–3 分钟",
          "生成完成后，点击《下载 PPT》下载 .pptx 文件",
        ],
      },
      {
        heading: "二、关键功能",
        level: 2,
      },
      {
        heading: "导入项目信息",
        level: 3,
        body: "点击《导入项目信息（可选）》按钮，选择项目库中的项目后，项目名称、项目概况、委托方等信息将自动填入演示内容描述区域，无需重复输入。",
      },
      {
        heading: "项目图片上传",
        level: 3,
        body: "在《项目图片》区域点击或拖拽上传图片（最多 8 张）。AI 会将图片分配到合适的幻灯片中，其他幻灯片则会自动搜索 Pexels 配图。",
      },
      {
        heading: "下载 PPT 文件",
        level: 3,
        body: "生成完成后，点击结果区域的《下载 PPT》按钮，将自动下载 .pptx 格式文件。文件同时保存到生成历史，可随时重新下载。",
      },
      {
        heading: "生成历史",
        level: 3,
        body: "页面底部的《生成历史》区域保存了所有历史生成记录，包括标题、页数、生成时间等信息，可随时点击下载按钮重新获取文件。",
      },
      {
        heading: "三、填写建议",
        level: 2,
        items: [
          "演示标题越明确，生成内容越有针对性，如《JPT 总部办公空间设计方案汇报》",
          "内容描述越详细，生成的幻灯片结构和要点越精确，建议 100 字以上",
          "可在内容描述中指定受众（如《面向非专业甲方》），AI 会调整表达方式",
          "如需包含具体数据或案例，可在内容描述中直接提供",
        ],
        note: "生成时间通常为 1–3 分钟。生成结果已自动保存到生成历史，不必手动备份。",
      },
    ],
  },

  "/meeting": {
    title: "会议纪要 — 使用说明",
    sections: [
      {
        body: "会议纪要模块支持上传会议录音或录像，AI 自动转录并整理为结构化纪要，包含议题、决议事项、待办任务和责任人，大幅减少手动整理时间。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "点击《上传录音/录像》，选择会议音频或视频文件（支持 mp3、wav、mp4、webm，最大 16MB）",
          "（可选）填写会议主题和参与人，帮助 AI 更准确地识别发言人",
          "点击《生成纪要》，等待转录和整理完成（通常 1–5 分钟，取决于文件时长）",
          "检查生成的纪要内容，可通过对话框补充或修改",
          "点击《复制到飞书》将纪要粘贴到飞书文档",
        ],
      },
      {
        heading: "二、关键功能",
        level: 2,
      },
      {
        heading: "语音转录",
        level: 3,
        body: "支持中文、英文及中英混合的会议录音。AI 会自动识别语言并进行高精度转录，同时过滤背景噪音和口头禅。",
      },
      {
        heading: "结构化整理",
        level: 3,
        body: "转录完成后，AI 自动将内容整理为标准纪要格式，包含：会议概况、主要议题、讨论要点、决议事项和待办任务（含责任人和截止日期）。",
      },
      {
        heading: "对话式修订",
        level: 3,
        body: "生成后可在对话框中补充信息（如「请添加下次会议时间」「将第三条待办的责任人改为张三」），AI 会精准修改对应内容。",
      },
      {
        heading: "三、使用建议",
        level: 2,
        items: [
          "录音质量越好，转录准确率越高；建议使用专用录音设备或手机靠近发言人录制",
          "会议前告知参与者录音，并在开始时报出参与人姓名，有助于 AI 识别发言人",
          "文件大小限制为 16MB，超过限制请先压缩音频或截取关键片段",
        ],
        note: "生成时间取决于录音时长，通常每 10 分钟录音需要约 1 分钟处理时间。",
      },
    ],
  },

  "/media/xiaohongshu": {
    title: "小红书内容创作 — 使用说明",
    sections: [
      {
        body: "小红书内容创作模块帮助团队快速生成符合平台调性的图文内容，包括标题、正文、标签和配图建议，适用于项目展示、设计分享和品牌推广。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "选择内容类型（项目展示 / 设计分享 / 品牌故事等）",
          "填写核心信息（项目名称、设计亮点、目标受众）",
          "（可选）上传项目图片作为参考",
          "点击《生成内容》，等待 30–60 秒",
          "检查并微调生成的标题、正文和标签",
          "复制内容到小红书 App 发布",
        ],
      },
      {
        heading: "二、内容结构",
        level: 2,
      },
      {
        heading: "标题",
        level: 3,
        body: "AI 会生成 3 个候选标题，覆盖不同风格（情感共鸣型、干货分享型、悬念吸引型），选择最符合发布目的的一个。",
      },
      {
        heading: "正文",
        level: 3,
        body: "正文按照小红书平台习惯生成，包含开场钩子、核心内容分段和结尾互动引导，并自动插入适量 emoji 增加可读性。",
      },
      {
        heading: "标签",
        level: 3,
        body: "自动生成 10–15 个相关标签，涵盖行业大词（如 #室内设计）和长尾词（如 #科技园区办公室设计），提升内容曝光。",
      },
      {
        heading: "三、发布建议",
        level: 2,
        items: [
          "发布时间建议选择工作日 12:00–13:00 或 20:00–22:00，互动率较高",
          "配图建议使用高质量效果图或实景照片，封面图比例建议 3:4",
          "发布后 1 小时内积极回复评论，有助于提升算法推荐权重",
        ],
        note: "生成内容仅供参考，发布前请根据实际项目情况和品牌调性进行调整。",
      },
    ],
  },

  "/media/wechat": {
    title: "公众号内容创作 — 使用说明",
    sections: [
      {
        body: "公众号内容创作模块帮助团队生成适合微信公众号发布的长文内容，包括标题、导语、正文结构和配图说明，适用于项目案例分享、设计理念阐述和行业观点输出。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "选择文章类型（项目案例 / 设计理念 / 行业观点等）",
          "填写文章主题和核心观点",
          "（可选）提供参考资料或项目背景信息",
          "点击《生成文章》，等待 1–2 分钟",
          "在结果区域检查并修改内容",
          "复制到公众号编辑器进行排版后发布",
        ],
      },
      {
        heading: "二、内容结构",
        level: 2,
      },
      {
        heading: "标题与导语",
        level: 3,
        body: "AI 生成多个候选标题（含主标题和副标题），以及 2–3 句导语，帮助读者快速了解文章价值。",
      },
      {
        heading: "正文",
        level: 3,
        body: "正文按照公众号长文格式生成，包含清晰的段落结构、小标题分隔和适当的过渡语句，适合直接粘贴到公众号编辑器。",
      },
      {
        heading: "三、发布建议",
        level: 2,
        items: [
          "发布时间建议选择周二至周四的 9:00–10:00 或 20:00–21:00",
          "文章长度建议 1500–3000 字，过长会降低完读率",
          "配图建议每 500 字插入一张，封面图尺寸建议 900×383 像素",
        ],
        note: "生成内容仅供参考，发布前请核实数据准确性并根据品牌调性调整语气。",
      },
    ],
  },

  "/media/layout": {
    title: "图文排版 — 使用说明",
    sections: [
      {
        body: "图文排版模块通过 AI 生成整页图文排版内容，文字、色块、图形、照片全部融合在同一张图片中，支持局部重绘修改文案，并可导出 PDF 或图片包。",
      },
      {
        heading: "一、快速开始",
        level: 2,
        steps: [
          "在左侧「版式包」区域选择已有版式包，或点击「上传学习」上传参考图片创建新版式包",
          "在右侧设置区填写文档类型（品牌手册 / 项目图板 / 商品详情页 / 自定义）、页数和图幅比例",
          "在「内容描述」中详细描述主题、核心信息和风格要求",
          "（可选）上传素材图片：支持「按页上传」（每页最多 5 张）或「按类型文件夹」（AI 按需选择）",
          "点击「生成排版」，AI 会逐页生成整页图片，右侧预览区实时更新",
        ],
      },
      {
        heading: "二、关键功能",
        level: 2,
      },
      {
        heading: "版式包",
        level: 3,
        body: "版式包是 AI 学习排版风格的参考库。上传 5–10 张同一风格的参考图片后，AI 会自动提取配色、字体和排版特征，并在生成时复现该风格。版式包可在不同生成任务中复用。",
      },
      {
        heading: "素材图片上传",
        level: 3,
        body: "支持两种上传模式：「按页上传」为每页单独指定参考素材（最多 5 张），适合每页主题差异较大的情况；「按类型文件夹」按文件夹名称分组（如「室内实景」「外立面」「细节」），AI 会根据每页主题自动选择最合适的文件夹中的图片。",
      },
      {
        heading: "局部重绘",
        level: 3,
        body: "生成完成后，预览图上会叠加透明文字热区。悬停文字区域可看到编辑图标，点击后输入新文案，AI 以 Inpainting 方式仅替换该区域内容，保留其余画面不变。重绘需要 10–30 秒。",
      },
      {
        heading: "导出",
        level: 3,
        body: "「导出图片」将所有页面打包为 ZIP 文件（按 page-01、page-02 命名），适合展示和分享；「导出 PDF」将所有页面合并为 PDF，页面尺寸自动匹配所选图幅比例，适合打印和正式提交。",
      },
      {
        heading: "三、使用建议",
        level: 2,
        items: [
          "版式包参考图越多、风格越统一，AI 学习效果越好，建议上传 5–10 张同一风格的参考图",
          "内容描述建议包含：主题、核心信息点（标题 / 副标题 / 正文）、希望的调性或氛围",
          "按类型文件夹模式适合有多种类型素材的项目，AI 会为每页选择最合适的类型",
          "局部重绘适合微调文案，如需大幅修改排版风格，建议修改内容描述后重新生成",
        ],
        note: "每次生成结果都会保存在历史记录中，可随时查看和重新导出。",
      },
    ],
  },
};

// 默认内容（无匹配路由时显示）
const defaultGuide: GuideContent = {
  title: "N+1 STUDIOS AI 工作平台 — 使用说明",
  sections: [
    {
      body: "N+1 STUDIOS AI 工作平台集成了多个 AI 辅助工具，帮助团队在设计、营建和媒体传播各环节提升效率。请导航到具体功能模块后点击右上角问号图标，查看该模块的详细使用说明。",
    },
    {
      heading: "功能模块概览",
      level: 2,
      items: [
        "案例调研：AI 自动检索并整理同类项目案例，生成对标分析报告",
        "AI 效果图：文字描述生成建筑设计效果图，支持图生图和局部重绘",
        "演示文稿：自动生成项目汇报 PPT 内容并导出文件",
        "会议纪要：上传录音自动转录并整理为结构化纪要",
        "小红书 / 公众号：生成符合平台调性的图文内容",
        "图文排版：AI 生成整页图文排版，支持局部重绘和导出",
        "项目管理：项目看板、成果归档和团队协作",
      ],
    },
  ],
};

function renderSection(section: GuideContent["sections"][0], idx: number) {
  return (
    <div key={idx} className="space-y-2">
      {section.heading && section.level === 2 && (
        <p className="font-semibold text-sm mt-4 mb-1">{section.heading}</p>
      )}
      {section.heading && section.level === 3 && (
        <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mt-3 mb-1">
          {section.heading}
        </p>
      )}
      {section.body && (
        <p className="text-sm text-foreground/90 leading-relaxed">{section.body}</p>
      )}
      {section.steps && (
        <ol className="space-y-1.5 list-decimal list-inside text-sm text-muted-foreground">
          {section.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      {section.items && (
        <ul className="space-y-1 list-disc list-inside text-sm text-muted-foreground">
          {section.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      {section.note && (
        <div className="rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground mt-2">
          {section.note}
        </div>
      )}
    </div>
  );
}

export function HelpGuide({ open, onOpenChange, pageKey }: HelpGuideProps) {
  // 根据路由路径匹配对应的说明，支持前缀匹配
  const guide = pageKey
    ? Object.entries(guides).find(([key]) => pageKey === key || pageKey.startsWith(key))?.[1] ?? defaultGuide
    : defaultGuide;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {guide.sections.map((section, idx) => renderSection(section, idx))}
        </div>

        <div className="flex gap-2 justify-end mt-4 pt-4 border-t">
          {guide.externalUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(guide.externalUrl, "_blank")}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              查看完整版
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
