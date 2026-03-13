import MediaContentGenerator from "@/components/MediaContentGenerator";
import { MessageCircle } from "lucide-react";

export default function MediaWechat() {
  return (
    <MediaContentGenerator
      config={{
        platform: "wechat",
        name: "公众号",
        icon: <MessageCircle className="h-6 w-6 text-green-600" />,
        color: "green",
        topicPlaceholder: "例如：探讨当代科技企业办公空间的设计趋势，从功能性到人文关怀的转变",
        notesPlaceholder: "例如：加入行业数据引用、结合国际案例对比分析",
        description: "AI 生成微信公众号风格的深度文章，包含专业标题、精炼摘要、结构化正文和封面配图",
      }}
    />
  );
}
