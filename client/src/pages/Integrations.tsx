import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Copy, Download, ExternalLink, Check, Trash2, Plus, Key, AlertCircle, BarChart2, Clock, ArrowRight, Terminal } from 'lucide-react';
import { Tabs as InnerTabs, TabsContent as InnerTabsContent, TabsList as InnerTabsList, TabsTrigger as InnerTabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

/**
 * API 管理模块
 * 
 * 功能：
 * 1. OpenClaw 专用 API Token 管理（生成、查看、撤销）
 * 2. OpenClaw 集成方案指南
 * 3. API 文档和代码示例
 */

export default function Integrations() {
  const [activeTab, setActiveTab] = useState('tokens');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [generatedToken, setGeneratedToken] = useState<{ token: string; tokenPreview: string } | null>(null);

  // tRPC 查询和变更
  const { data: tokens = [], isLoading, refetch } = trpc.apiTokens.list.useQuery();
  const generateMutation = trpc.apiTokens.generateOpenClaw.useMutation({
    onSuccess: (data) => {
      setGeneratedToken(data);
      toast.success('API Token 生成成功');
      refetch();
    },
    onError: (error) => {
      toast.error(`生成失败: ${error.message}`);
    },
  });
  const revokeMutation = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => {
      toast.success('Token 已撤销');
      refetch();
    },
    onError: (error) => {
      toast.error(`撤销失败: ${error.message}`);
    },
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerateToken = async () => {
    if (!tokenName.trim()) {
      toast.error('请输入 Token 名称');
      return;
    }
    await generateMutation.mutateAsync({
      name: tokenName,
      expiresInDays: 365,
    });
    setTokenName('');
  };

  const handleRevokeToken = (tokenId: number) => {
    if (window.confirm('确定要撤销这个 Token 吗？')) {
      revokeMutation.mutate({ tokenId });
    }
  };

  const activeTokens = tokens.filter(t => t.isActive);
  const revokedTokens = tokens.filter(t => !t.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">API 管理</h1>
        <p className="text-muted-foreground">
          管理 OpenClaw 集成接口，生成和撤销 API Token，查看集成文档
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tokens">Token 管理</TabsTrigger>
          <TabsTrigger value="openclaw">OpenClaw 集成</TabsTrigger>
          <TabsTrigger value="docs">API 文档</TabsTrigger>
        </TabsList>

        {/* Token 管理标签页 */}
        <TabsContent value="tokens" className="space-y-6">
          {/* 生成新 Token */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                生成新 Token
              </CardTitle>
              <CardDescription>
                创建一个新的 OpenClaw 专用 API Token（有效期 365 天）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="输入 Token 名称（如：OpenClaw Integration）"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  disabled={generateMutation.isPending}
                />
                <Button
                  onClick={handleGenerateToken}
                  disabled={generateMutation.isPending || !tokenName.trim()}
                >
                  {generateMutation.isPending ? '生成中...' : '生成'}
                </Button>
              </div>

              {/* 生成成功提示 */}
              {generatedToken && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-green-900">Token 已生成</h4>
                      <p className="text-sm text-green-700 mt-1">
                        请立即复制并保存这个 Token。关闭此对话框后将无法再次查看完整 Token。
                      </p>
                    </div>
                  </div>
                  <div className="bg-white border border-green-200 rounded p-3 font-mono text-sm break-all">
                    {generatedToken.token}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleCopy(generatedToken.token, 'generated-token')}
                  >
                    {copiedId === 'generated-token' ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        复制 Token
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 活跃 Token 列表 */}
          <Card>
            <CardHeader>
              <CardTitle>活跃 Token</CardTitle>
              <CardDescription>
                {activeTokens.length} 个活跃的 API Token
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : activeTokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  还没有生成 Token，点击上方按钮生成一个
                </div>
              ) : (
                <div className="space-y-3">
                  {activeTokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{token.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {token.tokenPreview}... • 创建于 {new Date(token.createdAt).toLocaleDateString()}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <BarChart2 className="w-3 h-3" />
                            调用 {token.callCount ?? 0} 次
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {token.lastUsedAt
                              ? `最后使用：${new Date(token.lastUsedAt).toLocaleString()}`
                              : '从未使用'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            过期：{new Date(token.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeToken(token.id)}
                        disabled={revokeMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 已撤销 Token 列表 */}
          {revokedTokens.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>已撤销 Token</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {revokedTokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-red-900">{token.name}</div>
                        <div className="text-sm text-red-700">
                          {token.tokenPreview}... • 已撤销
                        </div>
                      </div>
                      <Badge variant="outline" className="text-red-600 border-red-300">
                        已撤销
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* OpenClaw 集成标签页 */}
        <TabsContent value="openclaw" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>OpenClaw 集成指南</CardTitle>
              <CardDescription>
                快速开始集成 OpenClaw，让用户通过聊天与 AI 工具互动
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 架构图 */}
              <div className="space-y-4">
                <h3 className="font-semibold">系统架构</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-blue-50 p-3 rounded border border-blue-200">
                      <div className="font-semibold text-blue-900">用户</div>
                      <div className="text-blue-700 text-xs">微信 / 钉钉 / 飞书 / Telegram</div>
                    </div>
                    <div className="text-2xl">↓</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-purple-50 p-3 rounded border border-purple-200">
                      <div className="font-semibold text-purple-900">OpenClaw Agent</div>
                      <div className="text-purple-700 text-xs">理解需求 → 选择 Skill → 管理对话</div>
                    </div>
                    <div className="text-2xl">↓</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-green-50 p-3 rounded border border-green-200">
                      <div className="font-semibold text-green-900">N1DesignToolsSkill</div>
                      <div className="text-green-700 text-xs">generateImage / generateVideo / generateColorPlan</div>
                    </div>
                    <div className="text-2xl">↓</div>
                  </div>
                  <div className="flex-1 bg-orange-50 p-3 rounded border border-orange-200">
                    <div className="font-semibold text-orange-900">N+1 STUDIOS API</div>
                    <div className="text-orange-700 text-xs">/api/trpc/rendering.generate / video.generate / colorPlan.generate</div>
                  </div>
                </div>
              </div>

              {/* 快速开始步骤 */}
              <div className="space-y-4">
                <h3 className="font-semibold">5 分钟快速开始</h3>
                <div className="space-y-3">
                  {[
                    {
                      step: 1,
                      title: '获取 API Token',
                      description: '在上方「Token 管理」标签页生成一个 OpenClaw 专用的 API Token',
                      color: 'blue',
                    },
                    {
                      step: 2,
                      title: '创建 Skill 目录',
                      description: '在 OpenClaw 项目中创建 Skill 目录',
                      code: 'mkdir -p skills/n1-design-tools',
                      color: 'green',
                    },
                    {
                      step: 3,
                      title: '配置 Skill 文件',
                      description: '复制示例文件并修改配置',
                      color: 'purple',
                    },
                    {
                      step: 4,
                      title: '启动 OpenClaw',
                      description: '启动 OpenClaw 开发服务器',
                      code: 'openclaw dev',
                      color: 'orange',
                    },
                    {
                      step: 5,
                      title: '测试集成',
                      description: '运行测试脚本验证集成是否正常',
                      color: 'red',
                    },
                  ].map(({ step, title, description, code, color }) => (
                    <div key={step} className={`border-l-4 border-${color}-500 pl-4 py-2`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`bg-${color}-500`}>步骤 {step}</Badge>
                        <h4 className="font-semibold">{title}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">{description}</p>
                      {code && (
                        <div className="bg-muted p-2 rounded text-xs font-mono mt-2 flex items-center justify-between">
                          <span>{code}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(code, `step-${step}`)}
                          >
                            {copiedId === `step-${step}` ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 下载资源 */}
              <div className="space-y-3">
                <h3 className="font-semibold">下载资源</h3>
                <div className="grid gap-2">
                  <Button variant="outline" className="justify-start">
                    <Download className="w-4 h-4 mr-2" />
                    下载 skill.yaml 示例
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Download className="w-4 h-4 mr-2" />
                    下载 index.ts 示例代码
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Download className="w-4 h-4 mr-2" />
                    下载测试脚本
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API 文档标签页 */}
        <TabsContent value="docs" className="space-y-8">
          <ApiDocsSection copiedId={copiedId} handleCopy={handleCopy} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── API 文档区块 ──────────────────────────────────────────
const BASE_URL = 'https://platform.nplusonestudios.com';
const API_BASE = `${BASE_URL}/api/trpc`;

type ApiParam = { name: string; type: string; required: boolean; desc: string; default?: string };
type ApiField = { name: string; type: string; desc: string };
type ApiEntry = {
  icon: string;
  name: string;
  title: string;
  description: string;
  method: 'POST' | 'GET';
  time: string;
  params: ApiParam[];
  responseFields: ApiField[];
  curlExample: string;
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
};

const syncApiList: ApiEntry[] = [
  {
    icon: '🎨',
    name: 'rendering.generate',
    title: 'AI 效果图生成',
    description: '根据文字描述生成建筑/空间效果图，支持多种风格',
    method: 'POST',
    time: '约 20-40 秒',
    params: [
      { name: 'prompt', type: 'string', required: true, desc: '效果图描述（中英文均可）' },
      { name: 'style', type: 'string', required: false, desc: '风格，如 minimalist、modern、industrial' },
      { name: 'projectId', type: 'number | null', required: false, default: 'null', desc: '关联项目 ID（可选）' },
    ],
    responseFields: [
      { name: 'url', type: 'string', desc: '生成的图片 CDN URL' },
      { name: 'prompt', type: 'string', desc: '实际使用的提示词' },
      { name: 'historyId', type: 'number', desc: '生成记录 ID' },
    ],
    requestExample: { prompt: '现代办公空间，玻璃和木材元素，自然采光', style: 'minimalist', projectId: null },
    responseExample: { result: { data: { json: { url: 'https://cdn.../rendering/xxx.jpg', prompt: '...', historyId: 840001 } } } },
    curlExample: `curl -X POST '${API_BASE}/rendering.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"prompt":"现代办公空间，玻璃和木材元素","style":"minimalist","projectId":null}}'`,
  },
  {
    icon: '🎬',
    name: 'video.generate',
    title: 'AI 视频生成',
    description: '生成设计视频，支持文生视频和图生视频两种模式',
    method: 'POST',
    time: '约 60-120 秒（需轮询 video.getStatus）',
    params: [
      { name: 'mode', type: 'string', required: true, desc: 'text（文生视频）或 image（图生视频）' },
      { name: 'prompt', type: 'string', required: false, desc: '视频描述（文生视频时必需）' },
      { name: 'imageUrl', type: 'string', required: false, desc: '首帧图片 URL（图生视频时必需）' },
      { name: 'duration', type: 'number', required: false, default: '5', desc: '时长（秒）：5 或 10' },
    ],
    responseFields: [
      { name: 'taskId', type: 'string', desc: '任务 ID，用于轮询进度' },
      { name: 'status', type: 'string', desc: '初始状态：pending' },
      { name: 'historyId', type: 'number', desc: '生成记录 ID' },
    ],
    requestExample: { mode: 'text', prompt: '现代办公空间工作场景，光线充足', duration: 5 },
    responseExample: { result: { data: { json: { taskId: 'task_xxx', status: 'pending', historyId: 12345 } } } },
    curlExample: `curl -X POST '${API_BASE}/video.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"mode":"text","prompt":"现代办公空间工作场景","duration":5}}'`,
  },
  {
    icon: '🏠',
    name: 'rendering.colorPlan',
    title: 'AI 平面图生成',
    description: '将黑白平面图转换为彩色渲染平面图',
    method: 'POST',
    time: '约 30-50 秒',
    params: [
      { name: 'imageUrl', type: 'string', required: true, desc: '底图 URL（黑白平面图）' },
      { name: 'prompt', type: 'string', required: true, desc: '配色和风格描述' },
      { name: 'projectId', type: 'number | null', required: false, default: 'null', desc: '关联项目 ID（可选）' },
    ],
    responseFields: [
      { name: 'url', type: 'string', desc: '生成的彩色平面图 CDN URL' },
      { name: 'prompt', type: 'string', desc: '实际使用的提示词' },
      { name: 'historyId', type: 'number', desc: '生成记录 ID' },
    ],
    requestExample: { imageUrl: 'https://cdn.example.com/floor-plan.jpg', prompt: '温暖木色，现代简约', projectId: null },
    responseExample: { result: { data: { json: { url: 'https://cdn.../color-plan/xxx.jpg', prompt: '...', historyId: 840002 } } } },
    curlExample: `curl -X POST '${API_BASE}/rendering.colorPlan' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"imageUrl":"https://cdn.example.com/floor-plan.jpg","prompt":"温暖木色，现代简约","projectId":null}}'`,
  },
];

type BenchmarkStep = {
  step: number;
  name: string;
  endpoint: string;
  method: 'POST' | 'GET';
  description: string;
  params: ApiParam[];
  responseFields: ApiField[];
  curlExample: string;
  requestExample: Record<string, unknown>;
  responseExample: Record<string, unknown>;
};

const benchmarkSteps: BenchmarkStep[] = [
  {
    step: 1,
    name: 'benchmark.generate',
    endpoint: 'benchmark.generate',
    method: 'POST',
    description: '提交案例调研报告生成任务，立即返回 jobId，后台异步生成（约 60-120 秒）',
    params: [
      { name: 'projectName', type: 'string', required: true, desc: '项目名称，如「百悦科技园办公空间」' },
      { name: 'requirements', type: 'string', required: true, desc: '调研需求描述，如「工业风科技感办公空间，面积约3000㎡」' },
      { name: 'projectType', type: 'string', required: false, default: '""', desc: '项目类型，如 office、exhibition 等' },
      { name: 'referenceCount', type: 'number', required: false, default: '5', desc: '对标案例数量（1-10）' },
      { name: 'toolId', type: 'number', required: false, desc: '指定 AI 工具 ID（可选）' },
    ],
    responseFields: [
      { name: 'jobId', type: 'string', desc: '任务 ID，用于轮询状态' },
    ],
    requestExample: { projectName: '百悦科技园办公空间', requirements: '工业风科技感办公空间，面积约3000㎡', projectType: 'office', referenceCount: 5 },
    responseExample: { result: { data: { json: { jobId: 'V1StGXR8_Z5jdHi6B-myT' } } } },
    curlExample: `curl -X POST '${API_BASE}/benchmark.generate' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"projectName":"百悦科技园办公空间","requirements":"工业风科技感办公空间，面积约3000㎡","projectType":"office","referenceCount":5}}'`,
  },
  {
    step: 2,
    name: 'benchmark.pollStatus',
    endpoint: 'benchmark.pollStatus',
    method: 'GET',
    description: '查询生成任务状态，建议每 3 秒轮询一次，直到 status 变为 done 或 failed',
    params: [
      { name: 'jobId', type: 'string', required: true, desc: '第一步返回的任务 ID' },
    ],
    responseFields: [
      { name: 'status', type: 'string', desc: 'pending / processing / done / failed / not_found' },
      { name: 'content', type: 'string', desc: '报告 Markdown 内容（status=done 时返回）' },
      { name: 'historyId', type: 'number', desc: '生成记录 ID（status=done 时返回）' },
      { name: 'generatedAt', type: 'string', desc: '完成时间 ISO 字符串（status=done 时返回）' },
      { name: 'error', type: 'string', desc: '错误信息（status=failed 时返回）' },
    ],
    requestExample: { jobId: 'V1StGXR8_Z5jdHi6B-myT' },
    responseExample: { result: { data: { json: { status: 'done', content: '# 案例调研报告\n...', historyId: 840010, generatedAt: '2026-03-22T10:30:00.000Z' } } } },
    curlExample: `curl -G '${API_BASE}/benchmark.pollStatus' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  --data-urlencode 'input={"json":{"jobId":"V1StGXR8_Z5jdHi6B-myT"}}'`,
  },
  {
    step: 3,
    name: 'benchmark.refine',
    endpoint: 'benchmark.refine',
    method: 'POST',
    description: '基于已生成的报告进行对话式修改，提交修改意见后异步生成修订版（同样需要轮询 pollStatus）',
    params: [
      { name: 'currentReport', type: 'string', required: true, desc: '当前报告的完整 Markdown 内容' },
      { name: 'feedback', type: 'string', required: true, desc: '修改意见，如「增加更多可持续设计案例」' },
      { name: 'projectName', type: 'string', required: true, desc: '项目名称（与生成时保持一致）' },
      { name: 'projectType', type: 'string', required: false, default: '""', desc: '项目类型（可选）' },
      { name: 'parentHistoryId', type: 'number', required: false, desc: '父报告的历史记录 ID（建议传入）' },
    ],
    responseFields: [
      { name: 'jobId', type: 'string', desc: '修改任务 ID，使用 benchmark.pollStatus 轮询结果' },
    ],
    requestExample: { currentReport: '# 案例调研报告\n...', feedback: '增加更多可持续设计案例', projectName: '百悦科技园办公空间', parentHistoryId: 840010 },
    responseExample: { result: { data: { json: { jobId: 'K9mNpQR2_X7keLm3C-abZ' } } } },
    curlExample: `curl -X POST '${API_BASE}/benchmark.refine' \\
  -H 'Authorization: Bearer sk_1774xxxxxxxxx_xxxxxxxxxx' \\
  -H 'Content-Type: application/json' \\
  -d '{"json":{"currentReport":"# 案例调研报告\\n...","feedback":"增加更多可持续设计案例","projectName":"百悦科技园办公空间","parentHistoryId":840010}}'`,
  },
];

function ApiDocsSection({ copiedId, handleCopy }: { copiedId: string | null; handleCopy: (text: string, id: string) => void }) {
  return (
    <>
      {/* 同步 API */}
      <div>
        <h3 className="text-base font-semibold mb-1">同步 API</h3>
        <p className="text-sm text-muted-foreground mb-4">以下 API 在单次请求内完成，直接返回生成结果。</p>
        <div className="space-y-4">
          {syncApiList.map((api) => (
            <SyncApiCard key={api.name} api={api} copiedId={copiedId} handleCopy={handleCopy} />
          ))}
        </div>
      </div>

      {/* 案例调研 API */}
      <div>
        <h3 className="text-base font-semibold mb-1">案例调研 API</h3>
        <p className="text-sm text-muted-foreground mb-3">
          案例调研报告生成耗时较长（约 60-120 秒），采用<strong>异步任务模式</strong>：先提交任务获取 jobId，再轮询状态，完成后获取报告内容。
        </p>

        {/* 流程示意 */}
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 flex-wrap text-xs">
          <span className="px-2 py-1 bg-blue-600 text-white rounded font-semibold">1 benchmark.generate</span>
          <ArrowRight className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-semibold flex items-center gap-1"><Clock className="w-3 h-3" />每 3s 轮询</span>
          <ArrowRight className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-semibold">2 benchmark.pollStatus</span>
          <ArrowRight className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold">status=done → 获取报告</span>
          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold">3 benchmark.refine（可选）</span>
        </div>

        <div className="space-y-4">
          {benchmarkSteps.map((step) => (
            <BenchmarkStepCard key={step.step} step={step} copiedId={copiedId} handleCopy={handleCopy} />
          ))}
        </div>
      </div>

      {/* 公开文档链接 */}
      <div className="space-y-3">
        <div className="p-4 bg-muted rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">查看完整公开 API 文档</p>
            <p className="text-xs text-muted-foreground mt-0.5">包含详细的 curl 示例、JSON 示例和错误处理说明</p>
          </div>
          <a
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition"
          >
            打开文档 <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-900">OpenClaw / Swagger 机器可读文档</p>
              <p className="text-xs text-purple-700 mt-0.5 mb-2">OpenAPI 3.0 JSON 格式，可直接导入 OpenClaw、Swagger UI、Postman 等工具</p>
              <div className="flex items-center gap-2 p-2 bg-white border border-purple-200 rounded text-xs font-mono text-purple-800 overflow-x-auto">
                <span className="shrink-0 text-purple-400">GET</span>
                <span className="truncate">{BASE_URL}/api/openapi.json</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-5 px-1 shrink-0"
                  onClick={() => handleCopy(`${BASE_URL}/api/openapi.json`, 'openapi-url')}
                >
                  {copiedId === 'openapi-url' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
            <a
              href={`${BASE_URL}/api/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition shrink-0"
            >
              查看 JSON <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="mt-3 pt-3 border-t border-purple-200">
            <p className="text-xs text-purple-700 font-medium mb-1.5">OpenClaw 导入步骤：</p>
            <ol className="text-xs text-purple-600 space-y-0.5 list-decimal list-inside">
              <li>在 OpenClaw 项目中选择「添加 API 来源」</li>
              <li>选择「OpenAPI / Swagger URL」</li>
              <li>粘贴上方 URL，OpenClaw 将自动解析所有端点</li>
              <li>在请求头中配置 <code className="bg-purple-100 px-1 rounded">Authorization: Bearer sk_...</code></li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}

function SyncApiCard({ api, copiedId, handleCopy }: { api: ApiEntry; copiedId: string | null; handleCopy: (text: string, id: string) => void }) {
  const key = api.name;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{api.icon}</span>
            <div>
              <CardTitle className="text-base">{api.title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{api.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <Badge variant="outline" className="text-xs">{api.method}</Badge>
            <Badge variant="outline" className="text-xs text-purple-700 border-purple-300">{api.time}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded text-xs font-mono">
          <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{API_BASE}/</span>
          <span className="text-blue-600 font-semibold">{api.name}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-5 px-1" onClick={() => handleCopy(`${API_BASE}/${api.name}`, `ep-${key}`)}>  
            {copiedId === `ep-${key}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <InnerTabs defaultValue="params">
          <InnerTabsList className="grid w-full grid-cols-3 h-8 mb-3">
            <InnerTabsTrigger value="params" className="text-xs">请求参数</InnerTabsTrigger>
            <InnerTabsTrigger value="response" className="text-xs">返回字段</InnerTabsTrigger>
            <InnerTabsTrigger value="curl" className="text-xs">curl 示例</InnerTabsTrigger>
          </InnerTabsList>
          <InnerTabsContent value="params">
            <CompactParamTable params={api.params} />
          </InnerTabsContent>
          <InnerTabsContent value="response">
            <CompactResponseTable fields={api.responseFields} />
          </InnerTabsContent>
          <InnerTabsContent value="curl">
            <CurlBlock code={api.curlExample} id={`curl-${key}`} copiedId={copiedId} handleCopy={handleCopy} />
          </InnerTabsContent>
        </InnerTabs>
      </CardContent>
    </Card>
  );
}

function BenchmarkStepCard({ step, copiedId, handleCopy }: { step: BenchmarkStep; copiedId: string | null; handleCopy: (text: string, id: string) => void }) {
  const key = `bm-${step.step}`;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {step.step}
            </div>
            <div>
              <CardTitle className="text-base">{step.name === 'benchmark.generate' ? '提交生成任务' : step.name === 'benchmark.pollStatus' ? '轮询任务状态' : '对话式优化报告'}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{step.description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 ml-2">{step.method}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded text-xs font-mono">
          <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{API_BASE}/</span>
          <span className="text-blue-600 font-semibold">{step.endpoint}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-5 px-1" onClick={() => handleCopy(`${API_BASE}/${step.endpoint}`, `ep-${key}`)}>  
            {copiedId === `ep-${key}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <InnerTabs defaultValue="params">
          <InnerTabsList className="grid w-full grid-cols-3 h-8 mb-3">
            <InnerTabsTrigger value="params" className="text-xs">请求参数</InnerTabsTrigger>
            <InnerTabsTrigger value="response" className="text-xs">返回字段</InnerTabsTrigger>
            <InnerTabsTrigger value="curl" className="text-xs">curl 示例</InnerTabsTrigger>
          </InnerTabsList>
          <InnerTabsContent value="params">
            <CompactParamTable params={step.params} />
          </InnerTabsContent>
          <InnerTabsContent value="response">
            <CompactResponseTable fields={step.responseFields} />
          </InnerTabsContent>
          <InnerTabsContent value="curl">
            <CurlBlock code={step.curlExample} id={`curl-${key}`} copiedId={copiedId} handleCopy={handleCopy} />
          </InnerTabsContent>
        </InnerTabs>
      </CardContent>
    </Card>
  );
}

function CompactParamTable({ params }: { params: ApiParam[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">参数名</th>
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">类型</th>
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">必需</th>
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">说明</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-1.5 px-2 font-mono text-blue-600">{p.name}</td>
              <td className="py-1.5 px-2 font-mono text-muted-foreground">{p.type}</td>
              <td className="py-1.5 px-2">
                <span className={p.required ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                  {p.required ? '必需' : '可选'}
                </span>
              </td>
              <td className="py-1.5 px-2 text-muted-foreground">
                {p.desc}{p.default && <span className="text-muted-foreground/60 ml-1">（默认: {p.default}）</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactResponseTable({ fields }: { fields: ApiField[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">字段名</th>
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">类型</th>
            <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">说明</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-1.5 px-2 font-mono text-blue-600">{f.name}</td>
              <td className="py-1.5 px-2 font-mono text-muted-foreground">{f.type}</td>
              <td className="py-1.5 px-2 text-muted-foreground">{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">响应体结构：<code className="font-mono bg-muted px-1 rounded">{'{ result: { data: { json: { ...fields } } } }'}</code></p>
    </div>
  );
}

function CurlBlock({ code, id, copiedId, handleCopy }: { code: string; id: string; copiedId: string | null; handleCopy: (text: string, id: string) => void }) {
  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="absolute top-2 right-2 gap-1 text-xs z-10 h-6" onClick={() => handleCopy(code, id)}>
        {copiedId === id ? <><Check className="w-3 h-3" />已复制</> : <><Copy className="w-3 h-3" />复制</>}
      </Button>
      <pre className="p-3 bg-slate-900 text-green-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre pr-20">{code}</pre>
    </div>
  );
}
