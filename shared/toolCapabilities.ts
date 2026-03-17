/**
 * 平台内置规则：根据工具名称和 API 端点自动推断工具能力
 *
 * 能力标签（capabilities）说明：
 *   "rendering"   - AI 效果图生成（图生图、文生图渲染）
 *   "document"    - 文档/报告生成（文字输出）
 *   "image"       - 通用图像生成/编辑
 *   "video"       - 视频生成
 *   "layout"      - 版式/排版辅助
 *   "analysis"    - 分析/理解（多模态理解、数据分析）
 *   "media"       - 媒体内容生成（小红书/公众号/Instagram 文案）
 *
 * 多模态大模型（如 GPT-4o、Gemini、Claude 3）会同时具备多个能力，
 * 因此会出现在多个功能模块的模型选择列表中。
 */

export type ToolCapability =
  | "rendering"
  | "document"
  | "image"
  | "video"
  | "layout"
  | "analysis"
  | "media";

export const ALL_CAPABILITIES: ToolCapability[] = [
  "rendering",
  "document",
  "image",
  "video",
  "layout",
  "analysis",
  "media",
];

/** 能力标签的中文显示名 */
export const CAPABILITY_LABELS: Record<ToolCapability, string> = {
  rendering: "AI 效果图",
  document: "文档生成",
  image: "图像生成",
  video: "视频生成",
  layout: "版式辅助",
  analysis: "分析理解",
  media: "媒体内容",
};

interface CapabilityRule {
  /** 匹配工具名称或 API 端点的关键词（不区分大小写） */
  keywords: string[];
  capabilities: ToolCapability[];
}

const CAPABILITY_RULES: CapabilityRule[] = [
  // ── 多模态大模型（文本 + 图像理解 + 文档生成 + 分析 + 媒体） ──
  {
    keywords: ["gpt-4o", "gpt4o", "o1", "o3", "o4"],
    capabilities: ["rendering", "document", "analysis", "media"],
  },
  {
    keywords: ["gpt-4", "gpt4", "gpt-3.5", "gpt3.5", "openai"],
    capabilities: ["document", "analysis", "media"],
  },
  {
    keywords: ["gemini", "gemini-pro", "gemini-flash", "gemini-ultra"],
    capabilities: ["rendering", "document", "analysis", "media"],
  },
  {
    keywords: ["claude-3", "claude3", "claude-sonnet", "claude-opus", "claude-haiku", "anthropic"],
    capabilities: ["document", "analysis", "media"],
  },
  {
    keywords: ["qwen", "qwen-vl", "qwen2", "tongyi", "aliyun"],
    capabilities: ["rendering", "document", "analysis", "media"],
  },
  {
    keywords: ["doubao", "豆包", "volcengine", "volc"],
    capabilities: ["document", "analysis", "media"],
  },
  {
    keywords: ["deepseek"],
    capabilities: ["document", "analysis", "media"],
  },
  {
    keywords: ["kimi", "moonshot"],
    capabilities: ["document", "analysis", "media"],
  },
  {
    keywords: ["glm", "chatglm", "zhipu"],
    capabilities: ["document", "analysis", "media"],
  },
  // ── 专用图像生成模型 ──
  {
    keywords: ["midjourney", "mj"],
    capabilities: ["rendering", "image"],
  },
  {
    keywords: ["stable-diffusion", "stablediffusion", "sd", "sdxl", "stability"],
    capabilities: ["rendering", "image"],
  },
  {
    keywords: ["flux", "flux.1", "black-forest"],
    capabilities: ["rendering", "image"],
  },
  {
    keywords: ["dall-e", "dalle", "dall_e"],
    capabilities: ["rendering", "image"],
  },
  {
    keywords: ["ideogram"],
    capabilities: ["rendering", "image"],
  },
  {
    keywords: ["kolors", "可图"],
    capabilities: ["rendering", "image"],
  },
  {
    keywords: ["jimeng", "即梦", "janus"],
    capabilities: ["rendering", "image", "video"],
  },
  {
    keywords: ["wanx", "万象", "tongyi-wanx"],
    capabilities: ["rendering", "image"],
  },
  // ── 专用视频生成模型 ──
  {
    keywords: ["sora", "runway", "pika", "kling", "可灵", "hailuo", "海螺", "vidu", "luma"],
    capabilities: ["video"],
  },
  // ── 专用文档/分析模型 ──
  {
    keywords: ["llama", "mistral", "mixtral"],
    capabilities: ["document", "analysis"],
  },
];

/**
 * 根据工具名称和 API 端点，自动推断工具能力列表。
 * 若无法匹配任何规则，默认返回 ["document", "analysis"]（通用文本模型）。
 */
export function inferCapabilities(name: string, apiEndpoint?: string | null): ToolCapability[] {
  const haystack = `${name} ${apiEndpoint || ""}`.toLowerCase();

  for (const rule of CAPABILITY_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return rule.capabilities;
    }
  }

  // 默认：通用文本模型
  return ["document", "analysis"];
}
