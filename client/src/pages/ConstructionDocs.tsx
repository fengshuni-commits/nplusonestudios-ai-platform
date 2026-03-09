import ComingSoon from "@/components/ComingSoon";
import { HardHat } from "lucide-react";

export default function ConstructionDocs() {
  return (
    <ComingSoon
      icon={<HardHat className="h-8 w-8 text-primary/40" />}
      title="施工文档管理"
      description="管理施工图纸、技术交底、变更单等施工文档，支持版本控制与审批流程。"
      features={["施工图纸管理", "技术交底文档", "设计变更单", "施工日志", "质量验收记录"]}
    />
  );
}
