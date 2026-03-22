import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Copy, Download, ExternalLink, Check, Trash2, Plus, Key, AlertCircle, BarChart2, Clock } from 'lucide-react';
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
                            调用 {(token as any).callCount ?? 0} 次
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
        <TabsContent value="docs" className="space-y-6">
          {[
            {
              icon: '🎨',
              name: 'generateImage',
              title: 'AI 效果图生成',
              description: '根据文字描述生成建筑/空间效果图',
              params: [
                { name: 'prompt', type: 'string', desc: '效果图描述' },
                { name: 'style', type: 'string', desc: '风格 (minimalist, modern, industrial...)' },
                { name: 'aspectRatio', type: 'string', desc: '宽高比 (16:9, 1:1, 9:16, 4:3)' },
              ],
              time: '约 30 秒',
            },
            {
              icon: '🎬',
              name: 'generateVideo',
              title: 'AI 视频生成',
              description: '生成 1-8 秒的设计视频（支持文生视频和图生视频）',
              params: [
                { name: 'mode', type: 'string', desc: 'text-to-video | image-to-video' },
                { name: 'prompt', type: 'string', desc: '视频描述' },
                { name: 'duration', type: 'number', desc: '时长 (1-8 秒)' },
                { name: 'inputImageUrl', type: 'string', desc: '首帧图 URL (图生视频时需要)' },
              ],
              time: '约 60-120 秒',
            },
            {
              icon: '🏠',
              name: 'generateColorPlan',
              title: 'AI 平面图生成',
              description: '将黑白平面图转换为彩色配色方案',
              params: [
                { name: 'floorPlanUrl', type: 'string', desc: '平面底图 URL' },
                { name: 'referenceUrl', type: 'string', desc: '参考风格图 URL' },
                { name: 'extraPrompt', type: 'string', desc: '额外提示' },
              ],
              time: '约 45 秒',
            },
          ].map((api) => (
            <Card key={api.name}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{api.icon}</span>
                  {api.title}
                </CardTitle>
                <CardDescription>{api.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">参数</h4>
                  <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                    {api.params.map((param) => (
                      <div key={param.name}>
                        <span className="text-blue-600 font-mono">{param.name}</span>
                        <span className="text-muted-foreground"> ({param.type}): </span>
                        <span>{param.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">生成时间</h4>
                  <Badge variant="outline">{api.time}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
