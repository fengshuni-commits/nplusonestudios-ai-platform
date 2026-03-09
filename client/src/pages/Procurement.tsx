import ComingSoon from "@/components/ComingSoon";
import { ShoppingCart } from "lucide-react";

export default function Procurement() {
  return (
    <ComingSoon
      icon={<ShoppingCart className="h-8 w-8 text-primary/40" />}
      title="采购跟踪"
      description="管理项目采购清单，跟踪采购进度，对接供应商信息。"
      features={["采购清单管理", "供应商信息库", "采购进度跟踪", "成本对比分析", "采购审批流程"]}
    />
  );
}
