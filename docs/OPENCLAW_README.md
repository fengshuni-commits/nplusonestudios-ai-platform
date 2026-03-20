# OpenClaw 集成文档

本目录包含 N+1 STUDIOS 工作平台与 OpenClaw 的完整集成方案。

## 📚 文档结构

| 文件 | 说明 | 适合人群 |
|------|------|--------|
| **OPENCLAW_QUICKSTART.md** | 5 分钟快速开始指南 | 所有人 |
| **OPENCLAW_INTEGRATION.md** | 完整的集成指南（详细版） | 开发者 |
| **openclaw-skill-example.ts** | Skill 实现代码示例 | 开发者 |
| **skill.yaml.example** | Skill 配置文件示例 | 开发者 |
| **test-openclaw-skill.ts** | 集成测试脚本 | 开发者 |

## 🚀 快速开始

### 1. 获取 API Token

在网站管理后台生成一个 OpenClaw 专用的 API Token（有效期 365 天）。

### 2. 创建 Skill 目录

```bash
mkdir -p skills/n1-design-tools
cd skills/n1-design-tools
```

### 3. 配置文件

复制示例文件并修改配置：

```bash
cp docs/skill.yaml.example skills/n1-design-tools/skill.yaml
cp docs/openclaw-skill-example.ts skills/n1-design-tools/index.ts
```

修改 `skill.yaml` 中的 API 地址和 Token。

### 4. 启动 OpenClaw

```bash
openclaw dev
```

### 5. 测试集成

```bash
# 运行测试脚本
npx ts-node docs/test-openclaw-skill.ts
```

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                     用户（聊天平台）                      │
│              微信 / 钉钉 / 飞书 / Telegram             │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   OpenClaw Agent                         │
│  - 理解用户需求                                          │
│  - 选择合适的 Skill 方法                                 │
│  - 管理对话流程                                          │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│         N1DesignToolsSkill (OpenClaw Skill)             │
│  - generateImage()      → AI 效果图                      │
│  - generateVideo()      → AI 视频                        │
│  - generateColorPlan()  → AI 平面图                      │
│  - getTaskStatus()      → 查询状态                       │
│  - listAssets()         → 素材库                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│    N+1 STUDIOS API (tRPC over HTTP)                     │
│  - /api/trpc/rendering.generate                         │
│  - /api/trpc/video.generate                             │
│  - /api/trpc/colorPlan.generate                         │
│  - /api/trpc/assets.list                                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│         N+1 STUDIOS 工作平台后端                         │
│  - 调用 AI 工具 API                                      │
│  - 管理生成任务                                          │
│  - 存储结果到 S3                                         │
└──────────────────────────────────────────────────────────┘
```

## 🔄 工作流程示例

### 用户请求效果图

```
用户: "请帮我生成一个现代办公室的效果图"
  ↓
OpenClaw Agent 理解需求
  ↓
调用 Skill.generateImage({
  prompt: "现代办公室，玻璃隔断，木质地板",
  style: "minimalist"
})
  ↓
网站生成效果图（30 秒）
  ↓
返回图片 URL 给用户
  ↓
用户: "效果图已生成，点击查看 [链接]"
```

### 用户请求视频

```
用户: "基于这张效果图生成一个 5 秒的演示视频"
  ↓
OpenClaw Agent 识别出是图生视频
  ↓
调用 Skill.generateVideo({
  mode: "image-to-video",
  prompt: "镜头缓慢推进，展示办公室全景",
  duration: 5,
  inputImageUrl: "https://..."
})
  ↓
网站生成视频（90 秒）
  ↓
返回视频 URL 给用户
  ↓
用户: "视频已生成，点击查看 [链接]"
```

## 📋 支持的功能

### 1. AI 效果图生成

**功能：** 根据文字描述生成建筑/空间效果图

**参数：**
- `prompt` (必需)：效果图描述
- `style` (可选)：风格（minimalist, modern, industrial, scandinavian 等）
- `aspectRatio` (可选)：宽高比（16:9, 1:1, 9:16, 4:3）

**示例：**
```
用户: "生成一个北欧风格的办公室，要求有大量木质元素"
OpenClaw: 调用 generateImage({
  prompt: "北欧风格办公室，大量木质元素，白色墙面，自然采光",
  style: "scandinavian",
  aspectRatio: "16:9"
})
```

**生成时间：** 约 30 秒

### 2. AI 视频生成

**功能：** 生成 1-8 秒的设计视频

**两种模式：**

#### 文生视频
直接从文字描述生成视频

```
用户: "生成一个办公室空间的演示视频，5 秒"
OpenClaw: 调用 generateVideo({
  mode: "text-to-video",
  prompt: "镜头缓慢推进，展示现代办公室，光线变化",
  duration: 5
})
```

#### 图生视频
基于静态图片生成动画效果

```
用户: "基于这张效果图生成一个视频"
OpenClaw: 调用 generateVideo({
  mode: "image-to-video",
  prompt: "添加人物走动，光线变化",
  duration: 3,
  inputImageUrl: "https://..."
})
```

**生成时间：** 约 60-120 秒

### 3. AI 平面图生成

**功能：** 将黑白平面图转换为彩色配色方案

**参数：**
- `floorPlanUrl` (必需)：平面底图 URL
- `referenceUrl` (可选)：参考风格图 URL
- `extraPrompt` (可选)：额外提示（风格、配色等）

**示例：**
```
用户: "将这张平面图转换为北欧风格的彩平"
OpenClaw: 调用 generateColorPlan({
  floorPlanUrl: "https://...",
  extraPrompt: "北欧风格，浅色系，木质家具"
})
```

**生成时间：** 约 45 秒

### 4. 素材库查询

**功能：** 列出可用的设计素材

```
用户: "有哪些参考素材？"
OpenClaw: 调用 listAssets()
返回: 素材列表（图片、视频等）
```

## 🔐 安全配置

### API Token 管理

1. **生成 Token**
   - 在网站管理后台生成专用的 OpenClaw Token
   - 有效期设置为 365 天

2. **存储 Token**
   - 使用环境变量存储，不要硬编码
   - 定期轮换 Token（建议每季度一次）

3. **权限控制**
   - OpenClaw Token 只能调用设计工具 API
   - 无法访问用户数据、项目信息等敏感内容

### CORS 配置

网站已配置 CORS，允许来自 OpenClaw 服务器的请求。

### 速率限制

为防止滥用，建议配置以下速率限制：

| 功能 | 限制 | 时间窗口 |
|------|------|--------|
| 效果图 | 10 个 | 1 小时 |
| 视频 | 5 个 | 1 小时 |
| 平面图 | 20 个 | 1 小时 |

## 🧪 测试和调试

### 运行测试脚本

```bash
# 设置环境变量
export API_BASE_URL="https://platform.nplusonestudios.com"
export API_TOKEN="your-jwt-token-here"

# 运行测试
npx ts-node docs/test-openclaw-skill.ts
```

### 查看日志

**网站日志：**
```bash
tail -f /home/ubuntu/nplus1_ai_platform/.manus-logs/devserver.log
```

**OpenClaw 日志：**
```bash
tail -f ~/.openclaw/logs/openclaw.log
```

## 📞 常见问题

### Q: 如何获取网站地址？

A: 
- 本地开发：`http://localhost:3000`
- 云端部署：`https://platform.nplusonestudios.com`
- 自定义域名：`https://your-domain.com`

### Q: Token 过期了怎么办？

A: 在网站管理后台重新生成一个新 Token，然后更新 OpenClaw 配置。

### Q: 生成任务失败了怎么办？

A: 检查以下几点：
1. API Token 是否正确且未过期
2. 网站地址是否可访问
3. 网站是否有可用的 AI 工具
4. 提示词是否清晰、具体

### Q: 如何支持更多聊天平台？

A: OpenClaw 本身支持多个聊天平台，只需在 OpenClaw 配置中启用相应的连接器即可。

### Q: 可以自定义 Skill 功能吗？

A: 可以。修改 `openclaw-skill-example.ts` 中的代码，添加更多功能（如图片编辑、批量生成等）。

## 🔗 相关资源

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [N+1 STUDIOS 工作平台](https://platform.nplusonestudios.com)
- [tRPC 文档](https://trpc.io/)
- [Axios 文档](https://axios-http.com/)

## 📝 更新日志

### v1.0.0 (2026-03-20)

- ✅ 初始版本发布
- ✅ 支持 AI 效果图生成
- ✅ 支持 AI 视频生成（文生视频和图生视频）
- ✅ 支持 AI 平面图生成
- ✅ 支持素材库查询
- ✅ 完整的集成文档和示例代码
- ✅ 测试脚本和快速开始指南

## 📧 技术支持

如有问题，请联系：
- 邮件：tech@n1studios.com
- 微信：N+1 STUDIOS 技术支持
- 文档：https://docs.n1studios.com/openclaw
