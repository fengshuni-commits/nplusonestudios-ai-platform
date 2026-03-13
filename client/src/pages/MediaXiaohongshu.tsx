import MediaContentGenerator from "@/components/MediaContentGenerator";
import { BookMarked } from "lucide-react";

export default function MediaXiaohongshu() {
  return (
    <MediaContentGenerator
      config={{
        platform: "xiaohongshu",
        name: "小红书",
        icon: <BookMarked className="h-6 w-6 text-red-500" />,
        color: "red",
        topicPlaceholder: "例如：分享我们最新完成的科技公司办公空间设计，极简风格与自然光的完美融合",
        notesPlaceholder: "例如：突出空间的光影效果、强调可持续设计理念",
        description: "AI 生成小红书风格的建筑设计图文内容，包含吸引人的标题、专业干货正文、精准标签和封面配图",
      }}
    />
  );
}
