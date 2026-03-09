import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Database, Server, Shield } from "lucide-react";

export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">平台配置与系统信息</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />系统信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="平台版本" value="1.0.0-beta" />
            <InfoRow label="运行环境" value="Production" />
            <InfoRow label="数据库状态" value="正常" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />安全设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="认证方式" value="OAuth 2.0" />
            <InfoRow label="会话有效期" value="7 天" />
            <InfoRow label="API 访问" value="已启用" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />数据统计
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="项目总数" value="—" />
            <InfoRow label="文档总数" value="—" />
            <InfoRow label="AI 调用次数" value="—" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />OpenClaw 集成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="API 端点" value="/api/v1/*" />
            <InfoRow label="Webhook" value="待配置" />
            <InfoRow label="状态" value="就绪" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
