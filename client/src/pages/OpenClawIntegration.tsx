import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, ExternalLink, Check } from 'lucide-react';

/**
 * OpenClaw 集成方案网页版本
 * 
 * 功能：
 * 1. 快速开始指南（交互式）
 * 2. API 文档浏览器
 * 3. 配置生成器
 * 4. 代码示例
 */

export default function OpenClawIntegration() {
  const [activeTab, setActiveTab] = useState('quickstart');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('https://platform.nplusonestudios.com');
  const [apiToken, setApiToken] = useState('');

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateSkillYaml = () => {
    const yaml = `name: n1-design-tools
version: 1.0.0
description: N+1 STUDIOS 设计工具集成 - 支持 AI 效果图、视频、平面图生成
author: N+1 STUDIOS
license: MIT

capabilities:
  - rendering:generate-image
  - video:generate-video
  - colorplan:generate-floorplan
  - assets:list

config:
  api_base_url:
    type: string
    description: N+1 STUDIOS API 基础 URL
    required: true
    example: "${apiBaseUrl}"
    
  api_token:
    type: string
    description: JWT API Token
    required: true
    sensitive: true
    example: "${apiToken || 'your-jwt-token-here'}"
    
  default_tool_id:
    type: number
    description: 默认 AI 工具 ID
    required: false
    default: 1

dependencies:
  axios: "^1.6.0"
  typescript: "^5.0.0"`;

    handleCopy(yaml, 'skill-yaml');
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        {/* 页面头部 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">OpenClaw 集成方案</h1>
          <p className="text-lg text-muted-foreground">
            让用户通过聊天与 OpenClaw 互动，OpenClaw 调用 N+1 STUDIOS 设计工具
          </p>
        </div>

        {/* 架构图 */}
        <Card className="mb-8 bg-card">
          <CardHeader>
            <CardTitle>系统架构</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="font-semibold text-blue-900">用户</div>
                  <div className="text-blue-700">微信 / 钉钉 / 飞书 / Telegram</div>
                </div>
                <div className="text-2xl">↓</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="font-semibold text-purple-900">OpenClaw Agent</div>
                  <div className="text-purple-700">理解需求 → 选择 Skill → 管理对话</div>
                </div>
                <div className="text-2xl">↓</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="font-semibold text-green-900">N1DesignToolsSkill</div>
                  <div className="text-green-700">generateImage / generateVideo / generateColorPlan</div>
                </div>
                <div className="text-2xl">↓</div>
              </div>
              <div className="flex-1 bg-orange-50 p-4 rounded-lg border border-orange-200">
                <div className="font-semibold text-orange-900">N+1 STUDIOS API</div>
                <div className="text-orange-700">/api/trpc/rendering.generate / video.generate / colorPlan.generate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="quickstart">快速开始</TabsTrigger>
            <TabsTrigger value="api">API 文档</TabsTrigger>
            <TabsTrigger value="config">配置生成器</TabsTrigger>
            <TabsTrigger value="examples">代码示例</TabsTrigger>
          </TabsList>

          {/* 快速开始 */}
          <TabsContent value="quickstart" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>5 分钟快速开始</CardTitle>
                <CardDescription>按照以下步骤快速集成 OpenClaw</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 步骤 1 */}
                <div className="border-l-4 border-blue-500 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-blue-500">步骤 1</Badge>
                    <h3 className="font-semibold">获取 API Token</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    在网站管理后台生成一个 OpenClaw 专用的 API Token（有效期 365 天）
                  </p>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono">
                    登录后台 → API 管理 → 生成 OpenClaw Token
                  </div>
                </div>

                {/* 步骤 2 */}
                <div className="border-l-4 border-green-500 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-500">步骤 2</Badge>
                    <h3 className="font-semibold">创建 Skill 目录</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    在 OpenClaw 项目中创建 Skill 目录
                  </p>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono flex items-center justify-between">
                    <span>mkdir -p skills/n1-design-tools</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy('mkdir -p skills/n1-design-tools', 'step2')}
                    >
                      {copiedId === 'step2' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* 步骤 3 */}
                <div className="border-l-4 border-purple-500 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-purple-500">步骤 3</Badge>
                    <h3 className="font-semibold">配置 Skill 文件</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    复制示例文件并修改配置
                  </p>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => window.open('/docs/skill.yaml.example', '_blank')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下载 skill.yaml 示例
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => window.open('/docs/openclaw-skill-example.ts', '_blank')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      下载 index.ts 示例
                    </Button>
                  </div>
                </div>

                {/* 步骤 4 */}
                <div className="border-l-4 border-orange-500 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-orange-500">步骤 4</Badge>
                    <h3 className="font-semibold">启动 OpenClaw</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    启动 OpenClaw 开发服务器
                  </p>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono flex items-center justify-between">
                    <span>openclaw dev</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy('openclaw dev', 'step4')}
                    >
                      {copiedId === 'step4' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* 步骤 5 */}
                <div className="border-l-4 border-red-500 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-red-500">步骤 5</Badge>
                    <h3 className="font-semibold">测试集成</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    运行测试脚本验证集成是否正常
                  </p>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => window.open('/docs/test-openclaw-skill.ts', '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    下载测试脚本
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API 文档 */}
          <TabsContent value="api" className="space-y-6">
            {/* AI 效果图 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>🎨</span> generateImage - AI 效果图生成
                </CardTitle>
                <CardDescription>根据文字描述生成建筑/空间效果图</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">参数</h4>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono space-y-1">
                    <div><span className="text-blue-600">prompt</span> (string, 必需): 效果图描述</div>
                    <div><span className="text-blue-600">style</span> (string): 风格 (minimalist, modern, industrial...)</div>
                    <div><span className="text-blue-600">aspectRatio</span> (string): 宽高比 (16:9, 1:1, 9:16, 4:3)</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">返回值</h4>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono space-y-1">
                    <div><span className="text-green-600">taskId</span>: 任务 ID</div>
                    <div><span className="text-green-600">status</span>: pending | processing | completed | failed</div>
                    <div><span className="text-green-600">resultUrl</span>: 生成的图片 URL</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">生成时间</h4>
                  <Badge variant="outline">约 30 秒</Badge>
                </div>
              </CardContent>
            </Card>

            {/* AI 视频 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>🎬</span> generateVideo - AI 视频生成
                </CardTitle>
                <CardDescription>生成 1-8 秒的设计视频（支持文生视频和图生视频）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">参数</h4>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono space-y-1">
                    <div><span className="text-blue-600">mode</span> (string, 必需): text-to-video | image-to-video</div>
                    <div><span className="text-blue-600">prompt</span> (string, 必需): 视频描述</div>
                    <div><span className="text-blue-600">duration</span> (number, 必需): 时长 (1-8 秒)</div>
                    <div><span className="text-blue-600">inputImageUrl</span> (string): 首帧图 URL (图生视频时需要)</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">生成时间</h4>
                  <Badge variant="outline">约 60-120 秒</Badge>
                </div>
              </CardContent>
            </Card>

            {/* AI 平面图 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>🏠</span> generateColorPlan - AI 平面图生成
                </CardTitle>
                <CardDescription>将黑白平面图转换为彩色配色方案</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">参数</h4>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono space-y-1">
                    <div><span className="text-blue-600">floorPlanUrl</span> (string, 必需): 平面底图 URL</div>
                    <div><span className="text-blue-600">referenceUrl</span> (string): 参考风格图 URL</div>
                    <div><span className="text-blue-600">extraPrompt</span> (string): 额外提示</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">生成时间</h4>
                  <Badge variant="outline">约 45 秒</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 配置生成器 */}
          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>配置生成器</CardTitle>
                <CardDescription>自动生成 skill.yaml 配置文件</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold mb-2 block">API 基础 URL</label>
                    <Input
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      placeholder="https://platform.nplusonestudios.com"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-2 block">API Token</label>
                    <Textarea
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="粘贴你的 JWT Token..."
                      rows={4}
                    />
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">生成的 skill.yaml</h4>
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="text-xs overflow-x-auto">
{`name: n1-design-tools
version: 1.0.0
description: N+1 STUDIOS 设计工具集成

config:
  api_base_url:
    example: "${apiBaseUrl}"
  api_token:
    example: "${apiToken ? apiToken.substring(0, 20) + '...' : 'your-jwt-token-here'}"
  default_tool_id:
    default: 1`}
                    </pre>
                  </div>
                </div>

                <Button
                  onClick={generateSkillYaml}
                  className="w-full"
                  disabled={!apiToken}
                >
                  <Download className="w-4 h-4 mr-2" />
                  生成并下载 skill.yaml
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 代码示例 */}
          <TabsContent value="examples" className="space-y-6">
            {/* 生成效果图示例 */}
            <Card>
              <CardHeader>
                <CardTitle>示例 1：生成 AI 效果图</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs font-mono">{`const result = await skill.generateImage({
  prompt: "现代办公室，玻璃隔断，木质地板",
  style: "minimalist",
  aspectRatio: "16:9"
});

console.log(\`效果图生成中，任务 ID: \${result.taskId}\`);

// 等待完成
const completed = await skill.waitForCompletion(
  result.taskId,
  'image',
  { maxWaitTime: 60000 }
);

console.log('效果图 URL:', completed.resultUrl);`}</pre>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(`const result = await skill.generateImage({
  prompt: "现代办公室，玻璃隔断，木质地板",
  style: "minimalist",
  aspectRatio: "16:9"
});`, 'example1')}
                >
                  {copiedId === 'example1' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  复制代码
                </Button>
              </CardContent>
            </Card>

            {/* 生成视频示例 */}
            <Card>
              <CardHeader>
                <CardTitle>示例 2：生成 AI 视频</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs font-mono">{`// 文生视频
const videoTask = await skill.generateVideo({
  mode: "text-to-video",
  prompt: "镜头缓慢推进，展示现代办公室",
  duration: 5
});

// 图生视频
const videoTask = await skill.generateVideo({
  mode: "image-to-video",
  prompt: "添加人物走动和光线变化",
  duration: 3,
  inputImageUrl: "https://..."
});

const completed = await skill.waitForCompletion(
  videoTask.taskId,
  'video'
);`}</pre>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(`const videoTask = await skill.generateVideo({
  mode: "text-to-video",
  prompt: "镜头缓慢推进，展示现代办公室",
  duration: 5
});`, 'example2')}
                >
                  {copiedId === 'example2' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  复制代码
                </Button>
              </CardContent>
            </Card>

            {/* 下载完整代码 */}
            <Card>
              <CardHeader>
                <CardTitle>下载完整代码</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('/docs/openclaw-skill-example.ts', '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Skill 完整实现代码 (TypeScript)
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('/docs/test-openclaw-skill.ts', '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  集成测试脚本
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('/docs/OPENCLAW_INTEGRATION.md', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  完整集成指南 (Markdown)
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 底部信息 */}
        <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">需要帮助？</h3>
          <p className="text-sm text-blue-700 mb-4">
            查看完整的集成文档了解更多细节、常见问题和最佳实践。
          </p>
          <Button
            variant="outline"
            onClick={() => window.open('/docs/OPENCLAW_README.md', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            查看完整文档
          </Button>
        </div>
      </div>
    </div>
  );
}
