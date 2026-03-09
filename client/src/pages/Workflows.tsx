import ComingSoon from "@/components/ComingSoon";
import { Workflow } from "lucide-react";

export default function Workflows() {
  return (
    <ComingSoon
      icon={<Workflow className="h-8 w-8 text-primary/40" />}
      title="工作流自动化"
      description="定义和管理常用工作流模板，支持自动化执行项目流程。"
      features={["新项目启动流程", "设计评审流程", "施工交付流程", "自定义工作流", "流程状态跟踪"]}
    />
  );
}
