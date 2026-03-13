import ComingSoon from "@/components/ComingSoon";
import { Webhook } from "lucide-react";

export default function Integrations() {
  return (
    <ComingSoon
      icon={<Webhook className="h-8 w-8 text-primary/40" />}
      title="API 与 Webhook"
      description="管理 OpenClaw 集成接口，配置 Webhook 事件推送，查看 API 调用日志。"
      features={["RESTful API 端点管理", "Webhook 事件配置", "API 密钥管理", "调用日志与监控", "OpenClaw Skill 对接"]}
    />
  );
}
