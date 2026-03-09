import ComingSoon from "@/components/ComingSoon";
import { BookOpen } from "lucide-react";

export default function Standards() {
  return (
    <ComingSoon
      icon={<BookOpen className="h-8 w-8 text-primary/40" />}
      title="出品标准库"
      description="存储和管理设计规范、施工标准、质量检查清单等标准化文档。"
      features={["设计规范文档", "施工标准手册", "质量检查清单", "材料规格标准", "版本管理与更新"]}
    />
  );
}
