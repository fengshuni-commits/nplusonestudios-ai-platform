# OpenClaw 快速开始指南

5 分钟快速上手 OpenClaw 与 N+1 STUDIOS 工作平台的集成。

## 前置要求

- OpenClaw 已安装（[安装指南](https://docs.openclaw.ai/getting-started)）
- N+1 STUDIOS 工作平台已部署（本地或云端）
- 获取了网站的 API Token（见下文）

## 第 1 步：获取 API Token

### 方式 A：通过网站管理后台（推荐）

1. 登录网站管理后台：`https://your-domain.com/admin`
2. 进入「AI 工具」→「API 管理」
3. 点击「生成 OpenClaw Token」
4. 复制生成的 Token（有效期 365 天）

### 方式 B：手动生成（开发者）

在网站后端执行以下命令：

```bash
# 登录网站服务器
ssh user@your-server

# 进入项目目录
cd /home/ubuntu/nplus1_ai_platform

# 运行 Token 生成脚本
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 1, email: 'openclaw-bot@n1studios.local', role: 'user' },
  process.env.JWT_SECRET,
  { expiresIn: '365d' }
);
console.log('OpenClaw API Token:');
console.log(token);
"
```

## 第 2 步：创建 Skill 目录

```bash
# 在 OpenClaw 项目中创建 Skill 目录
mkdir -p skills/n1-design-tools
cd skills/n1-design-tools
```

## 第 3 步：配置 Skill 文件

### 3.1 创建 skill.yaml

复制 `docs/skill.yaml.example` 中的内容，修改以下部分：

```yaml
# 改为你的网站地址和 Token
config:
  api_base_url:
    example: "https://platform.nplusonestudios.com"  # ← 改这里
  api_token:
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # ← 改这里
```

### 3.2 创建 index.ts

复制 `docs/openclaw-skill-example.ts` 中的代码到 `index.ts`

## 第 4 步：配置 OpenClaw

### 4.1 编辑 OpenClaw 配置文件

```bash
# 打开 OpenClaw 配置
nano ~/.openclaw/config.yaml
```

添加以下内容：

```yaml
skills:
  n1-design-tools:
    enabled: true
    path: ./skills/n1-design-tools
    config:
      api_base_url: "https://platform.nplusonestudios.com"  # 改为你的网站地址
      api_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # 改为你的 Token
      default_tool_id: 1
```

### 4.2 配置 Agent Prompt

在 OpenClaw Agent 配置中，添加以下系统 Prompt：

```
你是 N+1 STUDIOS 的 AI 设计助手。你可以帮助用户生成高质量的建筑和室内设计内容。

你有以下能力：
1. **生成 AI 效果图** - 根据描述生成建筑/空间效果图
2. **生成 AI 视频** - 创建 1-8 秒的设计视频
3. **生成 AI 平面图** - 将黑白平面图转换为彩色方案

当用户请求设计内容时：
1. 理解需求
2. 调用相应的 Skill 方法（generateImage / generateVideo / generateColorPlan）
3. 等待任务完成
4. 返回结果给用户

生成时间：
- 效果图：30 秒
- 视频：60-120 秒
- 平面图：45 秒
```

## 第 5 步：测试集成

### 5.1 启动 OpenClaw

```bash
openclaw dev
```

### 5.2 测试 Skill

在 OpenClaw 控制台执行：

```bash
# 测试生成效果图
openclaw> skill test n1-design-tools

# 或直接调用
openclaw> n1-design-tools.generateImage({
  prompt: "现代办公室，玻璃隔断，木质地板",
  style: "minimalist"
})
```

### 5.3 通过聊天测试

连接到 OpenClaw 支持的聊天平台（微信、钉钉、飞书等），发送：

```
请帮我生成一个现代办公室的效果图，要求：
- 开放式办公区
- 落地窗
- 木质家具
- 北欧风格
```

## 常见问题

### Q: 如何获取网站地址？

A: 如果网站已部署，地址通常是：
- 本地开发：`http://localhost:3000`
- 云端部署：`https://platform.nplusonestudios.com`

### Q: Token 过期了怎么办？

A: 重新生成一个新 Token，然后更新 OpenClaw 配置文件中的 `api_token`。

### Q: 生成任务失败了怎么办？

A: 检查以下几点：
1. API Token 是否正确
2. 网站地址是否可访问
3. 网站是否有可用的 AI 工具
4. 提示词是否清晰、具体

### Q: 如何调试 API 调用？

A: 在 `index.ts` 中启用调试日志：

```typescript
// 在 callTRPC 方法中添加
console.log('API 请求:', endpoint, data);
console.log('API 响应:', response.data);
```

### Q: 支持哪些聊天平台？

A: OpenClaw 支持：
- WhatsApp
- Telegram
- 微信
- 钉钉
- 飞书
- Slack
- Discord

## 下一步

- 阅读完整的 [OpenClaw 集成指南](./OPENCLAW_INTEGRATION.md)
- 查看 [API 端点参考](./OPENCLAW_INTEGRATION.md#api-端点参考)
- 了解 [生产部署](./OPENCLAW_INTEGRATION.md#第五步生产部署)

## 支持

如有问题，请：
1. 检查 OpenClaw 日志：`~/.openclaw/logs/`
2. 检查网站日志：`/home/ubuntu/nplus1_ai_platform/.manus-logs/`
3. 联系 N+1 STUDIOS 技术支持
