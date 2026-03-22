import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ApiDocs() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const apiEndpoint = `${window.location.origin}/api/trpc`;

  const apis = [
    {
      name: "AI 效果图生成",
      endpoint: "design.generateImage",
      description: "根据设计描述生成效果图",
      method: "POST",
      params: [
        { name: "prompt", type: "string", description: "设计描述（中文）", required: true },
        { name: "style", type: "string", description: "风格：minimalist, modern, industrial...", required: true },
        { name: "aspectRatio", type: "string", description: "宽高比：16:9, 1:1, 9:16, 4:3", required: false, default: "16:9" },
      ],
      response: {
        type: "object",
        fields: [
          { name: "imageUrl", type: "string", description: "生成的图片 URL" },
          { name: "generationTime", type: "number", description: "生成耗时（秒）" },
        ],
      },
      generationTime: "约 30 秒",
      example: {
        request: {
          prompt: "现代办公空间，采用玻璃和木材元素",
          style: "modern",
          aspectRatio: "16:9",
        },
        response: {
          imageUrl: "https://cdn.example.com/image.jpg",
          generationTime: 28,
        },
      },
    },
    {
      name: "AI 视频生成",
      endpoint: "design.generateVideo",
      description: "根据文本或图片生成视频",
      method: "POST",
      params: [
        { name: "mode", type: "string", description: "模式：text-to-video 或 image-to-video", required: true },
        { name: "prompt", type: "string", description: "视频描述（文生视频时必需）", required: false },
        { name: "inputImageUrl", type: "string", description: "首帧图片 URL（图生视频时必需）", required: false },
        { name: "duration", type: "number", description: "视频时长：1-8 秒", required: false, default: 4 },
      ],
      response: {
        type: "object",
        fields: [
          { name: "videoUrl", type: "string", description: "生成的视频 URL" },
          { name: "status", type: "string", description: "状态：pending, processing, completed, failed" },
          { name: "taskId", type: "string", description: "任务 ID，用于查询进度" },
        ],
      },
      generationTime: "约 60-120 秒",
      example: {
        request: {
          mode: "text-to-video",
          prompt: "现代办公空间中的员工工作场景，光线充足，节奏轻快",
          duration: 5,
        },
        response: {
          videoUrl: "https://cdn.example.com/video.mp4",
          status: "completed",
          taskId: "task_1234567890",
        },
      },
    },
    {
      name: "AI 平面图生成",
      endpoint: "design.generateColorPlan",
      description: "根据底图生成彩色平面图",
      method: "POST",
      params: [
        { name: "imageUrl", type: "string", description: "底图 URL（黑白平面图）", required: true },
        { name: "colorScheme", type: "string", description: "配色方案描述", required: true },
        { name: "style", type: "string", description: "风格：minimalist, modern, industrial...", required: false },
      ],
      response: {
        type: "object",
        fields: [
          { name: "imageUrl", type: "string", description: "生成的平面图 URL" },
          { name: "generationTime", type: "number", description: "生成耗时（秒）" },
        ],
      },
      generationTime: "约 45 秒",
      example: {
        request: {
          imageUrl: "https://cdn.example.com/floor-plan.jpg",
          colorScheme: "温暖的木色和白色，点缀绿色植物",
          style: "modern",
        },
        response: {
          imageUrl: "https://cdn.example.com/color-plan.jpg",
          generationTime: 42,
        },
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">API</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900">N+1 STUDIOS AI API 文档</h1>
          </div>
          <p className="text-lg text-slate-600 mb-6">
            完整的 API 参考文档，用于集成 OpenClaw 或其他第三方系统
          </p>

          {/* Quick Links */}
          <div className="flex flex-wrap gap-3">
            <a
              href="https://platform.nplusonestudios.com/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              获取 API Token <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/openclaw/skills"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition"
            >
              OpenClaw Skill 示例 <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* API Endpoint */}
        <Card className="mb-8 p-6 bg-white border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">API 端点</h2>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <code className="flex-1 text-sm font-mono text-slate-700">{apiEndpoint}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(apiEndpoint, -1)}
              className="gap-2"
            >
              {copiedIndex === -1 ? (
                <>
                  <Check className="w-4 h-4" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> 复制
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Authentication */}
        <Card className="mb-8 p-6 bg-white border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">认证方式</h2>
          <p className="text-slate-600 mb-4">
            所有 API 请求都需要在 HTTP 请求头中提供 API Token：
          </p>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 font-mono text-sm">
            <div className="text-slate-700">Authorization: Bearer &lt;YOUR_API_TOKEN&gt;</div>
          </div>
          <p className="text-sm text-slate-500 mt-4">
            在 <a href="https://platform.nplusonestudios.com/integrations" className="text-blue-600 hover:underline">API 管理页面</a> 获取你的 Token
          </p>
        </Card>

        {/* APIs */}
        <div className="space-y-6">
          {apis.map((api, idx) => (
            <Card key={idx} className="p-6 bg-white border-slate-200 hover:shadow-lg transition">
              <div className="mb-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{api.name}</h3>
                    <p className="text-slate-600 text-sm mt-1">{api.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                      {api.method}
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                      {api.generationTime}
                    </span>
                  </div>
                </div>

                {/* Endpoint */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
                  <code className="flex-1 text-sm font-mono text-slate-700">{api.endpoint}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(api.endpoint, idx)}
                    className="gap-2"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check className="w-4 h-4" /> 已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="params" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="params">参数</TabsTrigger>
                  <TabsTrigger value="response">返回值</TabsTrigger>
                  <TabsTrigger value="example">示例</TabsTrigger>
                </TabsList>

                {/* Parameters */}
                <TabsContent value="params" className="space-y-3">
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
                            <td className="py-2 px-3 font-mono text-slate-900">{param.name}</td>
                            <td className="py-2 px-3 text-slate-600">{param.type}</td>
                            <td className="py-2 px-3">
                              <span className={param.required ? "text-red-600 font-semibold" : "text-slate-500"}>
                                {param.required ? "是" : "否"}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {param.description}
                              {'default' in param && param.default && <span className="text-slate-500"> (默认: {param.default})</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Response */}
                <TabsContent value="response" className="space-y-3">
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
                        {api.response.fields.map((field, fidx) => (
                          <tr key={fidx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-900">{field.name}</td>
                            <td className="py-2 px-3 text-slate-600">{field.type}</td>
                            <td className="py-2 px-3 text-slate-600">{field.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Example */}
                <TabsContent value="example" className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">请求示例</h4>
                    <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-sm font-mono">
                      {JSON.stringify(api.example.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">返回示例</h4>
                    <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-sm font-mono">
                      {JSON.stringify(api.example.response, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          ))}
        </div>

        {/* Error Handling */}
        <Card className="mt-8 p-6 bg-white border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">错误处理</h2>
          <div className="space-y-3">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-900">401 Unauthorized</p>
              <p className="text-sm text-red-700">API Token 无效或已过期，请检查认证信息</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-900">400 Bad Request</p>
              <p className="text-sm text-red-700">请求参数不正确，请检查参数类型和必需字段</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-900">429 Too Many Requests</p>
              <p className="text-sm text-red-700">请求过于频繁，请稍后再试</p>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-12 text-center text-slate-600">
          <p>需要帮助？访问 <a href="https://platform.nplusonestudios.com/integrations" className="text-blue-600 hover:underline">API 管理页面</a> 或联系技术支持</p>
        </div>
      </div>
    </div>
  );
}
