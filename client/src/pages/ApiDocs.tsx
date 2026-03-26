import { useState } from "react";
import { Copy, Check, ExternalLink, Shield, Terminal, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const BASE_URL = "https://platform.nplusonestudios.com";

type ApiParam = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
};

type ApiResponseField = {
  name: string;
  type: string;
  description: string;
};

type ApiDef = {
  name: string;
  endpoint: string;
  description: string;
  method: "POST" | "GET";
  generationTime: string;
  isAsync?: boolean;
  asyncNote?: string;
  params: ApiParam[];
  responseFields: ApiResponseField[];
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  curlExample: string;
};

// ── 同步 API ──────────────────────────────────────────────
const syncApis: ApiDef[] = [
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

// ── 案例调研异步 API（三步流程）──────────────────────────
type BenchmarkApiStep = {
  step: number;
  name: string;
  endpoint: string;
  method: "POST" | "GET";
  description: string;
  params: ApiParam[];
  responseFields: ApiResponseField[];
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  curlExample: string;
};

const benchmarkSteps: BenchmarkApiStep[] = [
  {
    step: 1,
    name: "提交生成任务",
    endpoint: "benchmark.generate",
    method: "POST",
    description: "提交案例调研报告生成任务，立即返回 jobId，后台异步生成（约 60-120 秒）",
    params: [
      { name: "projectName", type: "string", required: true, description: "项目名称，如「百悦科技园办公空间」" },
      { name: "requirements", type: "string", required: true, description: "调研需求描述，如「工业风科技感办公空间，面积约3000㎡」" },
      { name: "projectType", type: "string", required: false, default: "\"\"", description: "项目类型，如 office、exhibition、commercial 等（可选）" },
      { name: "referenceCount", type: "number", required: false, default: "5", description: "对标案例数量（1-10，默认 5）" },
      { name: "toolId", type: "number", required: false, description: "指定 AI 工具 ID（可选，不传则使用默认工具）" },
    ],
    responseFields: [
      { name: "jobId", type: "string", description: "任务 ID，用于后续轮询状态" },
    ],
    requestExample: {
      projectName: "百悦科技园办公空间",
      requirements: "工业风科技感办公空间，面积约3000㎡，需要展示科技公司的创新文化",
      projectType: "office",
      referenceCount: 5,
    },
    responseExample: {
      result: {
        data: {
          json: {
            jobId: "V1StGXR8_Z5jdHi6B-myT",
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/benchmark.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"projectName":"百悦科技园办公空间","requirements":"工业风科技感办公空间，面积约3000㎡","projectType":"office","referenceCount":5}}'`,
  },
  {
    step: 2,
    name: "轮询任务状态",
    endpoint: "benchmark.pollStatus",
    method: "GET",
    description: "查询生成任务的当前状态。建议每 3 秒轮询一次，直到 status 变为 done 或 failed",
    params: [
      { name: "jobId", type: "string", required: true, description: "第一步返回的任务 ID" },
    ],
    responseFields: [
      { name: "status", type: "string", description: "任务状态：pending（排队中）/ processing（生成中）/ done（完成）/ failed（失败）/ not_found（任务不存在）" },
      { name: "content", type: "string", description: "生成的报告 Markdown 内容（仅 status=done 时返回）" },
      { name: "historyId", type: "number", description: "生成记录 ID（仅 status=done 时返回）" },
      { name: "generatedAt", type: "string", description: "完成时间 ISO 字符串（仅 status=done 时返回）" },
      { name: "error", type: "string", description: "错误信息（仅 status=failed 时返回）" },
    ],
    requestExample: {
      jobId: "V1StGXR8_Z5jdHi6B-myT",
    },
    responseExample: {
      result: {
        data: {
          json: {
            status: "done",
            content: "# 案例调研报告\n\n## 项目概述\n...",
            historyId: 840010,
            generatedAt: "2026-03-22T10:30:00.000Z",
          }
        }
      }
    },
    curlExample: `curl -G '${BASE_URL}/api/trpc/benchmark.pollStatus' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  --data-urlencode 'input={"json":{"jobId":"V1StGXR8_Z5jdHi6B-myT"}}'`,
  },
  {
    step: 3,
    name: "对话式优化报告",
    endpoint: "benchmark.refine",
    method: "POST",
    description: "基于已生成的报告进行对话式修改优化，提交修改意见后异步生成修订版，同样需要轮询 benchmark.pollStatus",
    params: [
      { name: "currentReport", type: "string", required: true, description: "当前报告的完整 Markdown 内容（从 pollStatus 的 content 字段获取）" },
      { name: "feedback", type: "string", required: true, description: "修改意见，如「增加更多可持续设计案例，减少传统办公案例」" },
      { name: "projectName", type: "string", required: true, description: "项目名称（与生成时保持一致）" },
      { name: "projectType", type: "string", required: false, default: "\"\"", description: "项目类型（可选）" },
      { name: "parentHistoryId", type: "number", required: false, description: "父报告的历史记录 ID（用于关联版本链，建议传入）" },
      { name: "toolId", type: "number", required: false, description: "指定 AI 工具 ID（可选）" },
    ],
    responseFields: [
      { name: "jobId", type: "string", description: "修改任务 ID，使用 benchmark.pollStatus 轮询结果" },
    ],
    requestExample: {
      currentReport: "# 案例调研报告\n\n## 项目概述\n...",
      feedback: "增加更多可持续设计和绿色建筑案例，减少传统办公案例的比重",
      projectName: "百悦科技园办公空间",
      projectType: "office",
      parentHistoryId: 840010,
    },
    responseExample: {
      result: {
        data: {
          json: {
            jobId: "K9mNpQR2_X7keLm3C-abZ",
          }
        }
      }
    },
    curlExample: `curl -X POST '${BASE_URL}/api/trpc/benchmark.refine' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"currentReport":"# 案例调研报告\\n...","feedback":"增加更多可持续设计案例","projectName":"百悦科技园办公空间","parentHistoryId":840010}}'`,
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

        {/* ── 同步 APIs ── */}
        <h2 className="text-xl font-bold text-slate-900 mb-4">同步 API</h2>
        <p className="text-sm text-slate-500 mb-5">以下 API 在单次请求内完成，直接返回生成结果。</p>

        <div className="space-y-6 mb-12">
          {syncApis.map((api, idx) => (
            <ApiCard
              key={idx}
              api={api}
              idx={idx}
              apiEndpoint={apiEndpoint}
              copiedKey={copiedKey}
              copyToClipboard={copyToClipboard}
            />
          ))}
        </div>

        {/* ── 效果图生成 API（异步两步流程）── */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">AI 效果图生成 API</h2>
          <p className="text-sm text-slate-500 mb-4">
            效果图生成耗时较长（约 30-90 秒），采用<strong>异步任务模式</strong>：先提交任务获取 jobId，再轮询状态，完成后获取图片 URL。
          </p>

          {/* 流程示意 */}
          <div className="flex items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-xl mb-6 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-semibold">
              <span>1</span> POST /api/v1/ai/render
            </div>
            <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" /> 每 3s 轮询
            </div>
            <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg text-sm font-semibold">
              <span>2</span> GET /api/v1/ai/render/:jobId
            </div>
            <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-semibold">
              status = done → 获取图片 URL
            </div>
          </div>

          {/* 接口说明 */}
          <div className="space-y-4 mb-6">
            {/* Step 1 */}
            <Card className="p-5 bg-white border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold">POST</span>
                <code className="text-sm font-mono text-slate-700">{BASE_URL}/api/v1/ai/render</code>
              </div>
              <p className="text-sm text-slate-600 mb-3">提交效果图生成任务，立即返回 jobId，后台异步生成（约 30-90 秒）</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">请求体（JSON）</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "prompt": "现代办公空间，玻璃和木材元素",
  "style": "minimalist"  // 可选
}`}</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">返回（立即）</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": {
    "jobId": "V1StGXR8_Z5jdHi6B-myT",
    "status": "pending"
  }
}`}</pre>
                </div>
              </div>
            </Card>

            {/* Step 2 */}
            <Card className="p-5 bg-white border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs font-bold">GET</span>
                <code className="text-sm font-mono text-slate-700">{BASE_URL}/api/v1/ai/render/:jobId</code>
              </div>
              <p className="text-sm text-slate-600 mb-3">轮询任务状态，建议每 3 秒查询一次，直到 status = done 或 failed</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">生成中返回</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": { "status": "processing" }
}`}</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">完成后返回</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": {
    "status": "done",
    "url": "https://cdn.../rendering/xxx.jpg",
    "prompt": "现代办公空间...",
    "historyId": 840001
  }
}`}</pre>
                </div>
              </div>
            </Card>

            {/* History */}
            <Card className="p-5 bg-white border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs font-bold">GET</span>
                <code className="text-sm font-mono text-slate-700">{BASE_URL}/api/v1/ai/render/history</code>
              </div>
              <p className="text-sm text-slate-600 mb-3">获取当前用户的效果图生成历史记录，支持分页</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">查询参数（可选）</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`?limit=20&offset=0`}</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">返回</p>
                  <pre className="p-3 bg-slate-900 text-green-300 rounded text-xs font-mono overflow-x-auto">{`{
  "data": [ { "id": 840001, "outputUrl": "...", ... } ],
  "total": 42
}`}</pre>
                </div>
              </div>
            </Card>
          </div>

          {/* 轮询代码示例 */}
          <Card className="mb-6 p-5 bg-white border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" /> 轮询示例代码（JavaScript）
            </h3>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{`async function generateRendering(prompt, style, token) {
  const base = '${BASE_URL}/api/v1';
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Step 1: Submit job
  const submitRes = await fetch(base + '/ai/render', {
    method: 'POST', headers, body: JSON.stringify({ prompt, style })
  });
  const { data: { jobId } } = await submitRes.json();

  // Step 2: Poll until done
  while (true) {
    const pollRes = await fetch(base + '/ai/render/' + jobId, { headers });
    const { data } = await pollRes.json();
    if (data.status === 'done') return data.url;  // CDN URL
    if (data.status === 'failed') throw new Error(data.error);
    await new Promise(r => setTimeout(r, 3000));
  }
}`}</pre>
          </Card>
        </div>

        {/* ── 案例调研 API（异步三步流程）── */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">案例调研 API</h2>
          <p className="text-sm text-slate-500 mb-4">
            案例调研报告生成耗时较长（约 60-120 秒），采用<strong>异步任务模式</strong>：先提交任务获取 jobId，再轮询状态，完成后获取报告内容。
          </p>

          {/* 流程示意 */}
          <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">
              <span>1</span> benchmark.generate
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" /> 每 3s 轮询
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-semibold">
              <span>2</span> benchmark.pollStatus
            </div>
            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-semibold">
              status = done → 获取报告
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-sm font-semibold">
              <span>3</span> benchmark.refine（可选）
            </div>
          </div>

          {/* 轮询代码示例 */}
          <Card className="mb-6 p-5 bg-white border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" /> 轮询示例代码（JavaScript）
            </h3>
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(`async function waitForReport(jobId, token) {
  const base = '${BASE_URL}/api/trpc';
  while (true) {
    const res = await fetch(
      base + '/benchmark.pollStatus?input=' + encodeURIComponent(JSON.stringify({ json: { jobId } })),
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const { status, content, historyId, error } = data.result.data.json;

    if (status === 'done') {
      console.log('报告生成完成，historyId:', historyId);
      return content; // Markdown 格式报告内容
    }
    if (status === 'failed') {
      throw new Error('生成失败: ' + error);
    }
    // pending 或 processing，继续等待
    await new Promise(r => setTimeout(r, 3000));
  }
}`, "poll-code")}
                className="absolute top-2 right-2 gap-1 text-xs z-10"
              >
                {copiedKey === "poll-code" ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
              <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">{`async function waitForReport(jobId, token) {
  const base = '${BASE_URL}/api/trpc';
  while (true) {
    const res = await fetch(
      base + '/benchmark.pollStatus?input=' + encodeURIComponent(JSON.stringify({ json: { jobId } })),
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const { status, content, historyId, error } = data.result.data.json;

    if (status === 'done') {
      console.log('报告生成完成，historyId:', historyId);
      return content; // Markdown 格式报告内容
    }
    if (status === 'failed') {
      throw new Error('生成失败: ' + error);
    }
    // pending 或 processing，继续等待
    await new Promise(r => setTimeout(r, 3000));
  }
}`}</pre>
            </div>
          </Card>
        </div>

        {/* 三步接口卡片 */}
        <div className="space-y-6 mb-12">
          {benchmarkSteps.map((step, idx) => (
            <BenchmarkStepCard
              key={idx}
              step={step}
              apiEndpoint={apiEndpoint}
              copiedKey={copiedKey}
              copyToClipboard={copyToClipboard}
            />
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

// ── 同步 API 卡片组件 ──────────────────────────────────────
function ApiCard({
  api,
  idx,
  apiEndpoint,
  copiedKey,
  copyToClipboard,
}: {
  api: ApiDef;
  idx: number;
  apiEndpoint: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  return (
    <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition">
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

        <TabsContent value="params">
          <ParamTable params={api.params} />
        </TabsContent>

        <TabsContent value="response">
          <ResponseTable fields={api.responseFields} />
        </TabsContent>

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
  );
}

// ── 案例调研步骤卡片组件 ───────────────────────────────────
function BenchmarkStepCard({
  step,
  apiEndpoint,
  copiedKey,
  copyToClipboard,
}: {
  step: BenchmarkApiStep;
  apiEndpoint: string;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  const stepKey = `bm-${step.step}`;
  return (
    <Card className="p-6 bg-white border-slate-200 hover:shadow-md transition">
      <div className="mb-5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {step.step}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{step.name}</h3>
              <p className="text-slate-500 text-sm mt-0.5">{step.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Badge variant="outline" className="text-xs font-semibold border-blue-300 text-blue-700">
              {step.method}
            </Badge>
          </div>
        </div>

        {/* Endpoint */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <code className="flex-1 text-sm font-mono text-slate-700">
            <span className="text-slate-400">{apiEndpoint}/</span>
            <span className="text-blue-600 font-semibold">{step.endpoint}</span>
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copyToClipboard(`${apiEndpoint}/${step.endpoint}`, `ep-${stepKey}`)}
            className="gap-1 text-xs"
          >
            {copiedKey === `ep-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <Copy className="w-3 h-3" />}
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

        <TabsContent value="curl">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">将 <code className="font-mono bg-slate-100 px-1 rounded">sk_1774xxxxxxxxx_xxxxxxxxxx</code> 替换为你的真实 Token</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(step.curlExample, `curl-${stepKey}`)}
                className="gap-1 text-xs"
              >
                {copiedKey === `curl-${stepKey}` ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </Button>
            </div>
            <pre className="p-4 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">
              {step.curlExample}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="params">
          <ParamTable params={step.params} />
        </TabsContent>

        <TabsContent value="response">
          <ResponseTable fields={step.responseFields} />
        </TabsContent>

        <TabsContent value="json" className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">请求体（-d 参数中的 json 字段）</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
              {JSON.stringify(step.requestExample, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">完整返回示例</h4>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono">
              {JSON.stringify(step.responseExample, null, 2)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── 共享子组件 ────────────────────────────────────────────
function ParamTable({ params }: { params: ApiParam[] }) {
  return (
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
          {params.map((param, pidx) => (
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
  );
}

function ResponseTable({ fields }: { fields: ApiResponseField[] }) {
  return (
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
          {fields.map((field, fidx) => (
            <tr key={fidx} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2 px-3 font-mono text-slate-900 text-xs">{field.name}</td>
              <td className="py-2 px-3 text-slate-500 text-xs font-mono">{field.type}</td>
              <td className="py-2 px-3 text-slate-600 text-xs">{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 mt-3">
        注：tRPC 响应体结构为 <code className="font-mono bg-slate-100 px-1 rounded">{"{ result: { data: { json: { ...fields } } } }"}</code>
      </p>
    </div>
  );
}
