import ComingSoon from "@/components/ComingSoon";
import { Image } from "lucide-react";

export default function Assets() {
  return (
    <ComingSoon
      icon={<Image className="h-8 w-8 text-primary/40" />}
      title="素材库"
      description="团队共享的素材库，支持图片、文档、模型文件的上传、分类与检索。"
      features={["图片素材管理", "文档模板库", "3D 模型文件", "标签分类系统", "全文检索"]}
    />
  );
}
