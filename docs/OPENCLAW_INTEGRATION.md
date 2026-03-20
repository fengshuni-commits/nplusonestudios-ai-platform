# OpenClaw 集成指南

本文档说明如何将 N+1 STUDIOS AI 工作平台与 OpenClaw 集成，让用户通过聊天与 OpenClaw 互动，由 OpenClaw 调用网站的设计工具。

## 概述

**架构设计：**
```
用户（微信/钉钉/飞书）
    ↓
OpenClaw Agent（运行在服务器）
    ↓
N+1 STUDIOS API（tRPC over HTTP）
    ↓
设计工具执行 & 素材库存储
```

OpenClaw 通过自定义 Skill 调用网站 API，用户在聊天中描述设计需求，OpenClaw 自动调用相应工具生成结果。

---

## 第一步：准备网站 API 认证

### 1.1 生成 API Token

网站使用 JWT 认证。需要为 OpenClaw 生成一个专用的 API Token。

**方案 A：创建专用 API 用户（推荐）**

在网站管理后台创建一个名为 `openclaw-bot` 的用户，角色为 `user`，然后手动生成一个长期有效的 JWT Token：

```bash
# 在网站后端执行（server/_core/auth.ts 中添加）
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    userId: <openclaw_bot_user_id>,
    email: 'openclaw-bot@n1studios.local',
    role: 'user'
  },
  process.env.JWT_SECRET,
  { expiresIn: '365d' } // 一年有效期
);

console.log('OpenClaw API Token:', token);
```

**方案 B：使用现有用户 Token**

如果已有管理员账号，可直接使用其 JWT Token（需要在浏览器开发者工具中复制）。

### 1.2 配置 CORS

确保网站允许 OpenClaw 服务器的请求。在 `server/_core/context.ts` 中配置 CORS：

```typescript
// 添加 OpenClaw 服务器地址到允许列表
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://your-openclaw-server.com', // OpenClaw 服务器地址
];
```

---

## 第二步：OpenClaw Skill 配置

### 2.1 创建 Skill 文件结构

在 OpenClaw 项目中创建以下目录结构：

```
skills/
└── n1-design-tools/
    ├── skill.yaml
    ├── index.ts
    ├── types.ts
    └── README.md
```

### 2.2 skill.yaml 配置

```yaml
name: n1-design-tools
version: 1.0.0
description: N+1 STUDIOS 设计工具集成 - 支持 AI 效果图、视频、平面图生成
author: N+1 STUDIOS

capabilities:
  - rendering:generate-image      # AI 效果图生成
  - video:generate-video          # AI 视频生成
  - colorplan:generate-floorplan  # AI 平面图生成
  - assets:list                   # 素材库查询

config:
  api_base_url:
    type: string
    description: N+1 STUDIOS API 基础 URL（例如 https://platform.nplusonestudios.com）
    required: true
  api_token:
    type: string
    description: JWT API Token（从网站管理后台获取）
    required: true
  default_tool_id:
    type: number
    description: 默认 AI 工具 ID（在网站管理后台查看）
    required: false
    default: 1
```

### 2.3 types.ts 类型定义

```typescript
// skills/n1-design-tools/types.ts

export interface N1APIConfig {
  api_base_url: string;
  api_token: string;
  default_tool_id?: number;
}

export interface RenderingRequest {
  prompt: string;
  style?: string;
  aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3';
  toolId?: number;
}

export interface VideoRequest {
  mode: 'text-to-video' | 'image-to-video';
  prompt: string;
  duration: number; // 1-8 秒
  inputImageUrl?: string;
  toolId?: number;
}

export interface ColorPlanRequest {
  floorPlanUrl: string;
  referenceUrl?: string;
  extraPrompt?: string;
  toolId?: number;
}

export interface GenerationResult {
  success: boolean;
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  errorMessage?: string;
  estimatedTime?: number; // 秒
}
```

### 2.4 index.ts Skill 实现

```typescript
// skills/n1-design-tools/index.ts

import { Skill, SkillContext } from '@openclaw/sdk';
import { N1APIConfig, RenderingRequest, VideoRequest, ColorPlanRequest, GenerationResult } from './types';

export class N1DesignToolsSkill extends Skill {
  private config: N1APIConfig;

  async initialize(config: N1APIConfig, context: SkillContext) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig() {
    if (!this.config.api_base_url) throw new Error('api_base_url 未配置');
    if (!this.config.api_token) throw new Error('api_token 未配置');
  }

  private async callAPI(endpoint: string, method: string, data?: any): Promise<any> {
    const url = `${this.config.api_base_url}/api/trpc/${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.api_token}`,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 生成 AI 效果图
   * @param request 渲染请求参数
   * @returns 生成结果
   */
  async generateImage(request: RenderingRequest): Promise<GenerationResult> {
    const toolId = request.toolId || this.config.default_tool_id || 1;
    
    const result = await this.callAPI('rendering.generate', 'POST', {
      prompt: request.prompt,
      style: request.style || 'modern',
      aspectRatio: request.aspectRatio || '16:9',
      toolId,
    });

    return {
      success: !result.error,
      taskId: result.result?.taskId || '',
      status: result.result?.status || 'failed',
      resultUrl: result.result?.imageUrl,
      errorMessage: result.error?.message,
      estimatedTime: 30, // 秒
    };
  }

  /**
   * 生成 AI 视频
   * @param request 视频生成请求参数
   * @returns 生成结果
   */
  async generateVideo(request: VideoRequest): Promise<GenerationResult> {
    const toolId = request.toolId || this.config.default_tool_id || 1;
    
    const result = await this.callAPI('video.generate', 'POST', {
      mode: request.mode,
      prompt: request.prompt,
      duration: request.duration,
      inputImageUrl: request.inputImageUrl,
      toolId,
    });

    return {
      success: !result.error,
      taskId: result.result?.taskId || '',
      status: result.result?.status || 'failed',
      resultUrl: result.result?.videoUrl,
      errorMessage: result.error?.message,
      estimatedTime: 60 + request.duration * 10, // 秒
    };
  }

  /**
   * 生成 AI 平面图
   * @param request 平面图生成请求参数
   * @returns 生成结果
   */
  async generateColorPlan(request: ColorPlanRequest): Promise<GenerationResult> {
    const toolId = request.toolId || this.config.default_tool_id || 1;
    
    const result = await this.callAPI('colorPlan.generate', 'POST', {
      floorPlanUrl: request.floorPlanUrl,
      referenceUrl: request.referenceUrl,
      extraPrompt: request.extraPrompt,
      toolId,
    });

    return {
      success: !result.error,
      taskId: result.result?.taskId || '',
      status: result.result?.status || 'failed',
      resultUrl: result.result?.imageUrl,
      errorMessage: result.error?.message,
      estimatedTime: 45, // 秒
    };
  }

  /**
   * 查询生成任务状态
   * @param taskId 任务 ID
   * @returns 任务状态
   */
  async getTaskStatus(taskId: string, type: 'image' | 'video' | 'colorplan'): Promise<GenerationResult> {
    const endpoint = type === 'image' 
      ? 'rendering.getStatus'
      : type === 'video'
      ? 'video.getStatus'
      : 'colorPlan.getStatus';

    const result = await this.callAPI(endpoint, 'POST', { taskId });

    return {
      success: !result.error,
      taskId,
      status: result.result?.status || 'failed',
      resultUrl: result.result?.imageUrl || result.result?.videoUrl,
      errorMessage: result.error?.message,
    };
  }

  /**
   * 列出素材库资源
   * @returns 素材列表
   */
  async listAssets(): Promise<any[]> {
    const result = await this.callAPI('assets.list', 'GET');
    return result.result || [];
  }
}

export default N1DesignToolsSkill;
```

---

## 第三步：在 OpenClaw 中配置 Skill

### 3.1 安装 Skill

```bash
# 在 OpenClaw 项目目录
openclaw skill install ./skills/n1-design-tools

# 或从 npm 安装（如果已发布）
openclaw skill install @n1studios/openclaw-design-tools
```

### 3.2 配置 Skill 参数

在 OpenClaw 配置文件中添加：

```yaml
# openclaw.config.yaml

skills:
  n1-design-tools:
    enabled: true
    config:
      api_base_url: "https://platform.nplusonestudios.com"
      api_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      default_tool_id: 1
```

### 3.3 配置 Agent Prompt

在 OpenClaw Agent 的系统 Prompt 中添加设计工具的使用说明：

```
你是 N+1 STUDIOS 的 AI 设计助手。你可以帮助用户生成设计内容。

可用的设计工具：

1. **AI 效果图生成** - 根据文字描述生成建筑/空间效果图
   - 使用场景：用户描述空间风格、功能需求
   - 示例：用户说"生成一个现代办公室效果图"，你调用 generateImage()

2. **AI 视频生成** - 生成 1-8 秒的设计视频
   - 使用场景：展示空间动态效果、产品演示
   - 支持两种模式：
     - 文生视频：直接从文字描述生成视频
     - 图生视频：基于首帧图片生成视频
   - 示例：用户说"生成一个办公室空间的视频"，你调用 generateVideo()

3. **AI 平面图生成** - 生成彩色平面图
   - 使用场景：将黑白平面图转换为彩色方案
   - 示例：用户上传平面图，你调用 generateColorPlan()

4. **素材库查询** - 查看可用的设计素材
   - 示例：用户问"有哪些参考素材"，你调用 listAssets()

工作流程：
1. 用户描述需求
2. 你理解需求并选择合适的工具
3. 调用相应的 Skill 方法
4. 获取任务 ID 后，定期查询状态
5. 任务完成后，返回结果 URL 给用户

重要提示：
- 生成任务是异步的，需要定期查询状态
- 估计等待时间：效果图 30 秒、视频 60-100 秒、平面图 45 秒
- 如果用户上传了图片，优先使用图片而不是文字描述
```

---

## 第四步：测试集成

### 4.1 本地测试

```bash
# 启动 OpenClaw 开发服务器
openclaw dev

# 在 OpenClaw 控制台测试
openclaw> skill test n1-design-tools

# 测试生成效果图
openclaw> n1-design-tools.generateImage({
  prompt: "现代办公室，玻璃隔断，木质地板",
  style: "minimalist",
  aspectRatio: "16:9"
})
```

### 4.2 聊天测试

通过 OpenClaw 支持的聊天平台（微信、钉钉、飞书等）测试：

**用户输入：**
```
请帮我生成一个现代办公室的效果图，要求：
- 开放式办公区
- 落地窗
- 木质家具
- 北欧风格
```

**OpenClaw 应该：**
1. 理解需求
2. 调用 `generateImage()` 方法
3. 获取任务 ID
4. 返回消息："正在生成效果图，预计需要 30 秒..."
5. 定期查询任务状态
6. 完成后返回图片 URL 和下载链接

---

## 第五步：生产部署

### 5.1 安全配置

**API Token 管理：**
- 使用环境变量存储 Token，不要硬编码
- 定期轮换 Token
- 为不同的 OpenClaw 实例创建不同的 Token

**网站端配置：**
```typescript
// server/_core/context.ts
const OPENCLAW_ALLOWED_ORIGINS = [
  process.env.OPENCLAW_SERVER_URL || 'http://localhost:7777',
];

// 在 CORS 中间件中验证
if (!OPENCLAW_ALLOWED_ORIGINS.includes(request.origin)) {
  throw new Error('Unauthorized origin');
}
```

### 5.2 速率限制

为 OpenClaw 用户设置 API 速率限制，防止滥用：

```typescript
// server/_core/rateLimit.ts
const OPENCLAW_RATE_LIMITS = {
  rendering: { limit: 10, window: '1h' },  // 每小时 10 个效果图
  video: { limit: 5, window: '1h' },       // 每小时 5 个视频
  colorplan: { limit: 20, window: '1h' },  // 每小时 20 个平面图
};
```

### 5.3 监控和日志

在网站后端添加 OpenClaw 请求的专门日志：

```typescript
// server/_core/logging.ts
logger.info('OpenClaw API call', {
  skill: 'n1-design-tools',
  method: 'generateImage',
  timestamp: new Date(),
  userId: ctx.user.id,
  status: 'success',
});
```

---

## API 端点参考

### rendering.generate（AI 效果图）

**请求：**
```json
{
  "prompt": "现代办公室，玻璃隔断，木质地板",
  "style": "minimalist",
  "aspectRatio": "16:9",
  "toolId": 1
}
```

**响应：**
```json
{
  "result": {
    "taskId": "task_abc123",
    "status": "pending",
    "imageUrl": null
  }
}
```

### video.generate（AI 视频）

**请求：**
```json
{
  "mode": "text-to-video",
  "prompt": "镜头缓慢推进，展示现代办公室",
  "duration": 5,
  "toolId": 1
}
```

**响应：**
```json
{
  "result": {
    "taskId": "task_def456",
    "status": "pending",
    "videoUrl": null
  }
}
```

### colorPlan.generate（AI 平面图）

**请求：**
```json
{
  "floorPlanUrl": "https://...",
  "referenceUrl": "https://...",
  "extraPrompt": "北欧风格，浅色系",
  "toolId": 1
}
```

**响应：**
```json
{
  "result": {
    "taskId": "task_ghi789",
    "status": "pending",
    "imageUrl": null
  }
}
```

### getStatus（查询任务状态）

**请求：**
```json
{
  "taskId": "task_abc123"
}
```

**响应：**
```json
{
  "result": {
    "status": "completed",
    "imageUrl": "https://s3.../image.png",
    "progress": 100
  }
}
```

---

## 常见问题

**Q: 如何获取 API Token？**
A: 在网站管理后台（/admin/ai-tools）创建一个专用的 API 用户，然后生成 JWT Token。

**Q: 生成任务需要多长时间？**
A: 效果图通常 20-40 秒，视频 60-120 秒，平面图 30-60 秒。

**Q: 如何处理生成失败？**
A: OpenClaw 会自动重试，如果多次失败，检查网站日志和 AI 工具配置。

**Q: 可以同时生成多个任务吗？**
A: 可以，但建议为 OpenClaw 设置速率限制以避免过载。

---

## 更新日志

- **v1.0.0** (2026-03-20)：初始版本，支持效果图、视频、平面图生成
