import { useState } from "react";
import { Copy, Check, ExternalLink, Shield, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BASE_URL = "https://platform.nplusonestudios.com";

const apis = [
  {
    name: "AI 效果图生成",
    endpoint: "rendering.generate",
    description: "根据设计描述生成效果图，支持多种风格",
    method: "POST",
    generationTime: "约 20-40 秒",
    params: [
      { name: "prompt", type: "string", required: true, description: "设计描述（中英文均可）" },
      { name: "style", type: "string", required: false, description: "风格名称，如 minimalist、modern、industrial 等" },
      { name: "projectId", type: "number | null", required: false, default: "null", description: "关联项目 ID（可选）" },
    ],
    responseFields: [
      { name: "url", type: "string", description: "生成的图片 CDN URL" },
      { name: "prompt", type: "string", description: "实际使用的提示词" },
      { name: "historyId", type: "number", description: "生成记录 ID，可用于后续查询" },
    ],
    requestExample: {
      prompt: "现代办公空间，采用玻璃和木材元素，自然采光",
      style: "minimalist",
      projectId: null,
    },
    responseExample: {
      result: {
        data: {
          json: {
            url: "https://d2xsxph8kpxj0f.cloudfront.net/rendering/xxx.jpg",
            prompt: "现代办公空间，采用玻璃和木材元素，自然采光",
            historyId: 840001,
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/rendering.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"prompt":"现代办公空间，采用玻璃和木材元素","style":"minimalist","projectId":null}}'`,
  },
  {
    name: "AI 视频生成",
    endpoint: "video.generate",
    description: "根据文本描述或参考图片生成设计视频，支持文生视频和图生视频两种模式",
    method: "POST",
    generationTime: "约 60-120 秒（需轮询 video.getStatus）",
    params: [
      { name: "mode", type: "string", required: true, description: "生成模式：text（文生视频）或 image（图生视频）" },
      { name: "prompt", type: "string", required: false, description: "视频描述（文生视频时必需）" },
      { name: "imageUrl", type: "string", required: false, description: "首帧图片 URL（图生视频时必需）" },
      { name: "duration", type: "number", required: false, default: "5", description: "视频时长（秒）：5 或 10" },
    ],
    responseFields: [
      { name: "taskId", type: "string", description: "任务 ID，用于轮询查询进度" },
      { name: "status", type: "string", description: "初始状态：pending" },
      { name: "historyId", type: "number", description: "生成记录 ID" },
    ],
    requestExample: {
      mode: "text",
      prompt: "现代办公空间中的员工工作场景，光线充足，节奏轻快",
      duration: 5,
    },
    responseExample: {
      result: {
        data: {
          json: {
            taskId: "task_1234567890",
            status: "pending",
            historyId: 12345,
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/video.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"mode":"text","prompt":"现代办公空间工作场景，光线充足","duration":5}}'`,
  },
  {
    name: "AI 平面图生成",
    endpoint: "rendering.colorPlan",
    description: "根据上传的底图（黑白平面图）生成彩色渲染平面图",
    method: "POST",
    generationTime: "约 30-50 秒",
    params: [
      { name: "imageUrl", type: "string", required: true, description: "底图 URL（黑白平面图，建议先上传到素材库）" },
      { name: "prompt", type: "string", required: true, description: "配色和风格描述" },
      { name: "projectId", type: "number | null", required: false, default: "null", description: "关联项目 ID（可选）" },
    ],
    responseFields: [
      { name: "url", type: "string", description: "生成的彩色平面图 CDN URL" },
      { name: "prompt", type: "string", description: "实际使用的提示词" },
      { name: "historyId", type: "number", description: "生成记录 ID" },
    ],
    requestExample: {
      imageUrl: "https://cdn.example.com/floor-plan.jpg",
      prompt: "温暖的木色和白色，点缀绿色植物，现代简约风格",
      projectId: null,
    },
    responseExample: {
      result: {
        data: {
          json: {
            url: "https://d2xsxph8kpxj0f.cloudfront.net/color-plan/xxx.jpg",
            prompt: "温暖的木色和白色，点缀绿色植物，现代简约风格",
            historyId: 840002,
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/rendering.colorPlan' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"imageUrl":"https://cdn.example.com/floor-plan.jpg","prompt":"温暖木色，现代简约","projectId":null}}'`,
  },
];

export default function ApiDocs() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const apiEndpoint = `${BASE_URL}/api/trpc`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">API</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">N+1 STUDIOS AI API 文档</h1>
          </div>
          <p className="text-slate-600 mb-5">
            完整的 API 参考文档，用于集成 OpenClaw 或其他第三方系统
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${BASE_URL}/integrations`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              获取 API Token <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={`${BASE_URL}/openclaw`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition text-sm"
            >
              OpenClaw 集成指南 <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* API Base Endpoint */}
        <Card className="mb-6 p-5 bg-white border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4" /> API 基础端点
          </h2>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <code className="flex-1 text-sm font-mono text-slate-700">{apiEndpoint}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(apiEndpoint, "endpoint")}
              className="gap-2 shrink-0"
            >
              {copiedKey === "endpoint" ? <><Check className="w-4 h-4" /> 已复制</> : <><Copy className="w-4 h-4" /> 复制</>}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">所有 API 路径均以此为前缀，如 <code className="font-mono">{apiEndpoint}/rendering.generate</code></p>
        </Card>

        {/* Authentication */}
        <Card className="mb-8 p-5 bg-white border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> 认证方式
          </h2>

          <p className="text-sm text-slate-600 mb-3">
            所有 API 请求必须在 HTTP 请求头中携带 <strong>Bearer Token</strong>：
          </p>

          {/* Header format */}
          <div className="relative mb-4">
            <div className="p-4 bg-slate-900 rounded-lg font-mono text-sm">
              <span className="text-slate-400">Authorization: </span>
              <span className="text-green-400">Bearer sk_1774xxxxxxxxx_xxxxxxxxxx</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard("Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx", "auth-header")}
              className="absolute top-2 right-2 gap-1 text-xs bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              {copiedKey === "auth-header" ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
            </Button>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="font-semibold text-blue-800 mb-1">Token 格式</p>
              <p className="text-blue-700 font-mono text-xs">sk_&#123;时间戳&#125;_&#123;随机串&#125;</p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-semibold text-amber-800 mb-1">有效期</p>
              <p className="text-amber-700 text-xs">365 天，过期后需重新生成</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-800 mb-1">注意</p>
              <p className="text-red-700 text-xs">Token 仅生成时显示一次，请立即保存</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-4">
            前往 <a href={`${BASE_URL}/integrations`} className="text-blue-600 hover:underline">API 管理页面</a> 生成专属 Token
          </p>
        </Card>

        {/* APIs */}
        <div className="space-y-6">
          {apis.map((api, idx) => (
            <Card key={idx} className="p-6 bg-white border-slate-200 hover:shadow-md transition">
              <div className="mb-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{api.name}</h3>
                    <p className="text-slate-500 text-sm mt-0.5">{api.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                      {api.method}
                    </span>
                    <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                      {api.generationTime}
                    </span>
                  </div>
                </div>

                {/* Endpoint */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <code className="flex-1 text-sm font-mono text-slate-700">
                    <span className="text-slate-400">{apiEndpoint}/</span>
                    <span className="text-blue-600 font-semibold">{api.endpoint}</span>
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(`${apiEndpoint}/${api.endpoint}`, `ep-${idx}`)}
                    className="gap-1 text-xs"
                  >
                    {copiedKey === `ep-${idx}` ? <><Check className="w-3 h-3" /> 已复制</> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="curl" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="curl">curl 示例</TabsTrigger>
                  <TabsTrigger value="params">请求参数</TabsTrigger>
                  <TabsTrigger value="response">返回字段</TabsTrigger>
                  <TabsTrigger value="json">JSON 示例</TabsTrigger>
                </TabsList>

                {/* curl Example */}
                <TabsContent value="curl">
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-500">将 <code className="font-mono bg-slate-100 px-1 rounded">sk_1774xxxxxxxxx_xxxxxxxxxx</code> 替换为你的真实 Token</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(api.curlExample, `curl-${idx}`)}
                        className="gap-1 text-xs"
                      >
                        {copiedKey === `curl-${idx}` ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
                      </Button>
                    </div>
                    <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">
                      {api.curlExample}
                    </pre>
                  </div>
                </TabsContent>

                {/* Parameters */}
                <TabsContent value="params">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">参数名</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">类型</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">必需</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {api.params.map((param, pidx) => (
                          <tr key={pidx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-900 text-xs">{param.name}</td>
                            <td className="py-2 px-3 text-slate-500 text-xs font-mono">{param.type}</td>
                            <td className="py-2 px-3">
                              <span className={param.required ? "text-red-600 font-semibold text-xs" : "text-slate-400 text-xs"}>
                                {param.required ? "必需" : "可选"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600 text-xs">
                              {param.description}
                              {"default" in param && param.default && (
                                <span className="text-slate-400 ml-1">（默认: {param.default}）</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Response */}
                <TabsContent value="response">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">字段名</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">类型</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-700">说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {api.responseFields.map((field, fidx) => (
                          <tr key={fidx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-900 text-xs">{field.name}</td>
                            <td className="py-2 px-3 text-slate-500 text-xs font-mono">{field.type}</td>
                            <td className="py-2 px-3 text-slate-600 text-xs">{field.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    注：tRPC 响应体结构为 <code className="font-mono bg-slate-100 px-1 rounded">{"{ result: { data: { json: { ...fields } } } }"}</code>
                  </p>
                </TabsContent>

                {/* JSON Example */}
                <TabsContent value="json" className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2 text-sm">请求体（-d 参数中的 json 字段）</h4>
                    <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
                      {JSON.stringify(api.requestExample, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2 text-sm">完整返回示例</h4>
                    <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
                      {JSON.stringify(api.responseExample, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          ))}
        </div>

        {/* Error Handling */}
        <Card className="mt-8 p-5 bg-white border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-4">错误处理</h2>
          <div className="space-y-3">
            {[
              { code: "UNAUTHORIZED (10001)", color: "red", desc: "API Token 无效、已过期或未提供 Authorization 请求头" },
              { code: "BAD_REQUEST", color: "orange", desc: "请求参数不正确，请检查必需字段和参数类型" },
              { code: "INTERNAL_SERVER_ERROR", color: "red", desc: "服务器内部错误，AI 生成失败，请稍后重试" },
              { code: "TOO_MANY_REQUESTS", color: "yellow", desc: "请求过于频繁，请降低调用频率" },
            ].map((err, i) => (
              <div key={i} className={`p-3 bg-${err.color}-50 border border-${err.color}-200 rounded-lg flex items-start gap-3`}>
                <code className={`text-${err.color}-800 font-mono text-xs font-semibold shrink-0 mt-0.5`}>{err.code}</code>
                <p className={`text-${err.color}-700 text-sm`}>{err.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-10 text-center text-slate-500 text-sm">
          <p>
            需要帮助？访问{" "}
            <a href={`${BASE_URL}/integrations`} className="text-blue-600 hover:underline">API 管理页面</a>
            {" "}或{" "}
            <a href={`${BASE_URL}/openclaw`} className="text-blue-600 hover:underline">OpenClaw 集成指南</a>
          </p>
        </div>
      </div>
    </div>
  );
}
