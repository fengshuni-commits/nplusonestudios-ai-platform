# N+1 STUDIOS AI 工作平台 TODO

## 底层基础
- [x] 数据库 schema 设计与迁移（15张业务表）
- [x] 视觉主题：暖灰建筑感（方案A）- index.css 全局样式
- [x] Google Fonts 引入（Inter + Noto Sans SC）

## 全局框架
- [x] DashboardLayout 侧边栏导航（按板块分组，支持折叠）
- [x] App.tsx 路由系统
- [x] 管理员/普通用户权限区分（管理员可管理AI工具配置、API Key、团队成员；普通用户之间不区分）
- [x] 工作台首页（项目概览、快捷入口、最近活动）

## 项目管理基础
- [x] 项目列表页（CRUD、筛选、搜索）
- [x] 项目详情页（基本信息、成员、任务、文档）
- [x] 任务看板（状态、优先级、指派）
- [x] 文档管理（上传、分类、版本）

## AI 工具系统
- [x] AI 工具中心页面（管理员：配置 API Key、添加/编辑/停用工具）
- [x] AI 工具选择器组件（可复用，用户在功能模块内自选工具）
- [x] AI 调度层（根据用户选择的工具路由请求）
- [x] 内置工具预置（内置 LLM、内置图像生成）

## 第一期 AI 模块
- [x] 对标调研模块（AI 生成调研报告 + PPT 导出为真实 PPTX 文件）
- [x] AI 渲染/草图模块（文字生成 + 图片编辑两种模式）
- [x] 会议纪要生成模块（录音转文字 + AI 整理纪要）

## OpenClaw 对接（一周内需完成）
- [x] RESTful API 端点（/api/v1/，项目/任务/文档/AI工具）
- [x] API Key 认证中间件
- [x] Webhook 事件推送（项目状态变更、任务完成等）

## 其他
- [x] "开发中"模块卡片展示（含功能规划说明）
- [x] 团队管理页面（仅管理员可见）
- [x] 后端 tRPC routers 与 db helpers
- [x] Vitest 测试覆盖（53 项测试全部通过，含 Pexels API 验证 + PPT 异步导出测试）

## 对标调研模块优化
- [x] 分阶段输出：第一步生成文本报告，第二步点击按钮生成PPT
- [x] 前端交互：报告下方显示"生成PPT"按钮，含进度指示器

## 对标调研模块优化 v2（真实数据要求）
- [x] 文字报告标注信息来源 URL，确保可溯源
- [x] 案例介绍页：从后台配置的来源网站抓取真实案例照片
- [x] 设计思路页：用 Pexels 图库真实建筑照片配图
- [x] 禁止使用 AI 生成图片作为案例配图
- [x] PPT 图文并茂，15页左右
- [x] 后台新增案例来源网站管理（管理员配置常用网站）
- [x] 网页抓取服务（针对性抓取 ArchDaily/Dezeen/谷德等）
- [x] Pexels API 集成（搜索建筑风格配图）

## Bug 修复
- [x] 对标调研模块"生成PPT"按钮不可用（pptxgenjs ESM/CJS 互操作问题，已通过 createRequire 修复）
- [x] 对标调研报告生成 API 返回 HTML 而非 JSON（临时性 sandbox 502 错误，重启服务器后恢复正常）
- [x] /design/planning 页面 "Failed to fetch" 错误（PPT 导出改为异步模式，避免长连接超时）

## PPT 生成质量全面改进
- [x] PPT 版式设计优化（参考 NotebookLM，铜色建筑事务所风格，6 种版式布局）
- [x] 修复 PPT 中的案例链接错误（移除 LLM 幻觉 URL，改为 sourceName 标签）
- [x] 修复图片获取不正确的问题（全部改用 Pexels API + LLM 生成英文搜索词）
- [x] PPT 完成后保持下载状态，支持重新下载和重新生成
- [x] 报告中空“来源”链接自动清理

## 侧边栏重构
- [x] 修复侧边栏小字与大字重叠问题
- [x] 去掉“概览”分组和“工作台”模块
- [x] 板块重新分组：设计（项目策划、设计工具）→ 营建（施工管理、采购跟踪）→ 项目管理（项目管理、会议纪要）→ 管理（出品标准、素材库、AI工具中心、API与Webhook、工作流、团队管理、API密钥）
- [x] 板块折叠功能：默认只显示板块名称，点击展开显示子模块
- [x] 管理员权限控制：出品标准、素材库、AI工具中心、API与Webhook 移入管理板块，普通用户不可见
- [x] 新增“历史”板块：存储用户使用平台的生成记录（含数据库表、后端 API、前端页面、报告/PPT 生成自动记录）

## 设计工具 - 图生图功能
- [x] 在场景描述上方增加可选的上传参考图片按钮
- [x] 后端 rendering API 支持 referenceImageUrl 参数（图生图）
- [x] 前端上传图片到 S3 后传递 URL 给渲染 API
- [x] 图生图生成记录写入历史

## 侧边栏窄图标模式
- [x] 侧边栏改为窄图标模式（只显示一级板块图标）56px 宽）
- [x] 鼠标悬停时弹出子菜单文字描述
- [x] 登录信息和管理板块以图标形式放到边栏最下方
- [x] N+1 STUDIOS Logo 移到工作区顶部（含面包屑导航）
- [x] 修复底部菜单（管理、历史）悬停弹出方向：自动检测屏幕空间，底部菜单向上伸展
- [x] 去掉侧边栏图标下方的汉字标签，只显示图标，悬停菜单中再出现文字（宽度缩小为 48px）
- [x] 侧边栏顶部添加展开/收起切换图标，展开后显示完整文字菜单（状态持久化到 localStorage）

## 媒体板块
- [x] 侧边栏新增媒体板块（项目管理下方），含小红书、公众号、Instagram 三个模块
- [x] 小红书模块：AI 生成小红书风格图文内容（标题、正文、标签、封面图）
- [x] 公众号模块：AI 生成微信公众号文章（标题、摘要、正文、封面图）
- [x] Instagram 模块：AI 生成 Instagram 帖子（英文文案、hashtags、配图）
- [x] 后端 AI 内容生成 API（media.generate，含 LLM 结构化输出 + 图像生成）
- [x] 生成记录写入历史板块

## 设计工具 - 图片迭代编辑
- [x] 生成结果图片可点击，自动作为参考图填入上传区域，修改描述后再次图生图
- [x] 历史记录中 AI 效果图可点击跳转到设计工具，自动填入参考图继续生成（含缩略图预览）

## 历史记录页面重新设计
- [x] 默认只显示缩略图网格布局，不显示文字信息
- [x] 连续编辑记录归纳为编辑链（同一图片从生成到后续编辑归为一组）
- [x] 点击缩略图展开详情面板，显示完整编辑链（每次迭代的图片+prompt）
- [x] 每条编辑记录支持“继续生成”操作（跳转设计工具）
- [x] 每条编辑记录支持“复制提示词”操作
- [x] 非 AI 效果图类型的历史记录保持合理展示

## 设计工具增强
- [x] 画笔标注功能：在参考图上用画笔圈出局部调整区域，生成时传递 mask
- [x] 参考图自适应比例：根据图片实际尺寸调整显示区域，确保完整展示
- [x] 增加素材功能：场景描述下方添加素材图片上传，与参考图结合生成
- [x] 图片比例选项：渲染风格后增加比例选择（1:1、16:9、4:3、3:2）
- [x] 分辨率选项：渲染风格后增加分辨率选择（标准、高清、超高清）
- [x] 后端支持新参数（maskImage、materialImageUrl、aspectRatio、resolution）

## Bug 修复：设计工具
- [x] 图片比例选择无效：选择 16:9 或 1:1 后生成结果尺寸不变
- [x] 画笔标注加载失败：一直显示"加载图片中"
- [x] 素材功能改为从素材库选择图片，而非上传新图片

## Bug 修复：设计工具（第二轮）
- [x] 图片比例：已在 prompt 中强化比例指令，并通过 size/image_size/width+height 多种参数格式传递
- [x] 标注功能改为右侧结果图直接编辑：点击「局部标注」在结果图上直接画笔编辑
- [x] 素材功能保留素材库选择+本地上传双入口，本地上传后自动同步到素材库

## 满意度反馈系统
- [x] 数据库表：feedback 表（关联模块、历史记录、用户、评分、文字反馈）
- [x] 后端 API：反馈提交、查询、统计汇总
- [x] 对标调研模块：生成结果后显示满意/不满意按钮
- [x] AI 渲染模块：生成结果后显示满意/不满意按钮
- [x] 会议纪要模块：生成结果后显示满意/不满意按钮
- [x] 媒体模块（小红书/公众号/Instagram）：生成结果后显示满意/不满意按钮
- [x] 可复用反馈组件：FeedbackButtons 组件
- [x] 后台反馈汇总分析页面：各模块满意度统计、趋势图表

## Bug 修复：反馈系统
- [x] getFeedbackTrend SQL 查询报错：DATE_SUB INTERVAL 参数绑定失败（改用 sql.raw 内联天数值）
- [x] 标注功能不能用：修复 ref 绑定和尺寸读取时序问题（双 rAF + setTimeout 回退）
- [x] 比例调整加黑边：有参考图时不传 size 参数避免黑边，纯文生图时才传 size

## 设计工具改进（第三轮）
- [x] 实现真正的局部重绘（inpainting）：mask 合成到原图上（红色半透明高亮），prompt 指导 AI 只修改标记区域
- [x] 彻底修复图片比例：有参考图时用 sharp 裁切到目标比例后再传入 API，始终传递 size 参数

## Bug 修复：设计工具（第四轮）
- [x] 笔刷不连续：改用 lineTo 连续线段绘制，跟踪 lastPos 确保平滑连接
- [x] 图片比例无效：在 imageGeneration.ts 中增加 enforceAspectRatio 后处理，用 sharp 强制裁切到目标比例

## 设计工具改进（第五轮）- [x] 参考图片区域改名为“基础图片”"
- [x] 上传基础图片后显示区域比例自动适配图片实际比例
- [x] 后续迭代编辑时也保持图片比例适配
- [x] 标注确认后基础图片区域同步显示标注范围标记

## 设计工具改进（第六轮）
- [x] 上传基础图片后右侧工作区显示放大预览
- [x] 右侧放大预览支持使用标注工具做局部修改

## 项目看板改造（原项目管理模块）
- [x] 侧边栏"项目管理"子菜单改名为"项目看板"
- [x] 数据库 projects 表增加字段：companyProfile（公司概况）、businessGoal（业务目标）、clientProfile（客户情况）、projectOverview（项目概况）
- [x] 新建 project_custom_fields 表：支持用户自由添加项目信息条（key-value 形式）
- [x] 新建项目对话框：包含项目名称、项目编号、甲方名称、公司概况、业务目标、客户情况、项目概况（仅项目名称必填）
- [x] 后端 API 扩展：项目 CRUD 支持新字段、自定义信息条 CRUD
- [x] 项目详情页重构：首页显示项目信息界面，所有字段可编辑
- [x] 项目详情页：支持自由添加新的项目信息条（自定义字段）
- [x] 项目信息一键导入 AI 模块：将项目信息作为 AI 生成功能的输入
- [x] 项目文档汇总：在项目详情页通过功能模块按钮查看该项目下 AI 生成的成果
- [x] generationHistory 表增加 projectId 字段，关联项目

## 项目看板改进 + 导入功能重新设计
- [x] 清理项目看板中的空白占位项目数据（已删除测试数据）
- [x] 修改测试：不再删除测试创建的项目
- [x] 项目看板详情页移除"一键导入AI模块"按钮
- [x] 项目看板详情页保留文档汇总入口（已关联本项目的AI生成成果，点击可查看列表）
- [x] 项目策划模块：项目名称上方增加"导入项目信息"按钮，自动填入项目名称和类型等
- [x] 设计工具模块：基础图片上方增加"导入项目信息"按钮
- [x] 其他AI模块（会议纪要、小红书、公众号、Instagram）：增加"导入项目信息"按钮
- [x] 后端 API：getProjectContext 获取项目完整信息供导入（已有 list 接口）

## Bug 修复 + 生成记录关联项目
- [x] 彻底修复测试：确保所有测试文件在 afterAll 中清理测试数据，不影响用户项目
- [x] 清理数据库中的占位/空白项目数据（已删除所有非用户真实项目）
- [x] 后端改造：各 AI 生成 API（benchmark、ai_render、meeting、media）支持 projectId 参数
- [x] 前端改造：各 AI 模块导入项目信息后，生成时自动传递 projectId
- [x] 项目看板文档 Tab：展示关联该项目的所有 AI 生成记录，按模块分类筛选

## 项目看板 - 删除项目功能
- [x] 项目看板列表页增加删除项目按钮（带确认对话框）

## 项目文档界面改造
- [x] 项目文档按文件类型分类陈列（设计辅助/项目文档/媒体传播）
- [x] 设计辅助成果以缩略图形式展示
- [x] 点击缩略图打开编辑历史对话框，可查看历史并继续编辑

## 成员管理功能
- [x] users 表增加 approved 字段（boolean，owner 默认 true，其他用户默认 false）
- [x] OAuth 回调：登录后检查 approved 状态，未审批则跳转到等待审批页面
- [x] 后端 admin API：listPendingUsers（待审批）、approveUser、revokeUser
- [x] 前端：管理板块"团队管理"页面改造为成员管理，显示已审批/待审批成员列表，支持审批/撤销
- [x] 前端：未审批用户登录后看到等待审批提示页面

## 清除虚拟占位数据
- [x] 将侧边栏和页面标题“设计工具”改名为“AI效果图”
- [x] 删除数据库中所有虚拟测试 API 密钥（42 条 Test Key）

## 项目权限管理与成果共享
- [x] 数据库：新建 project_members 表（projectId, userId, addedAt, addedBy）
- [x] 数据库：generationHistory 表增加 createdBy 字段（userId）
- [x] 后端：项目成员 CRUD API（addMember, removeMember, listMembers）
- [x] 后端：项目查询带权限过滤（只有项目成员和管理员可见）
- [x] 后端：成果查询带 createdBy 用户信息
- [x] 后端：成果删除权限控制（本人或管理员可删除）
- [x] 前端：项目详情页增加"成员"Tab，管理员可添加/移除项目成员
- [x] 前端：项目看板文档 Tab 成果显示创建者信息
- [x] 前端：项目看板文档 Tab 管理员可删除任意成员成果
- [x] 前端：生成记录页成员可删除自己的历史成果

## AI 工具管理改进
- [x] 彻底清空数据库中所有虚拟测试 API 密钥（含 ai_tools 表中的测试数据）
- [x] 简化“添加AI工具”表单：去掉类别选择，只保留名称、API端点、API Key、描述
- [x] 后端：根据模型名称/API端点内置规则自动判断工具能力（支持多模态则出现在多个功能模块选择中）
- [x] 前端：AiToolSelector 组件按内置能力规则过滤，而非依赖 category 字段

## AI 工具中心删除 & 默认工具设置
- [x] 删除 AI 工具中心功能模块（页面、路由、导航入口）
- [x] 后端：ai_tools 表增加 isDefault 字段，同一时间只能有一个默认工具
- [x] 后端：aiTools.setDefault API（设为默认，自动取消其他工具的默认状态）
- [x] 前端：API 密钥管理页面每个工具增加“设为默认”按鈕
- [x] 前端：默认工具显示明显标识（Badge）

## 默认工具联动修复
- [x] AiToolSelector：无已选工具时自动采用 isDefault 工具，而非空选
- [x] 设为默认时清除所有用户的 localStorage 缓存，确保各功能模块自动采用新默认工具
- [x] 验证 AI 效果图等模块正确采用默认工具

## AI 效果图功能完善
- [ ] 添加项目关联功能：生成结果可直接关联到项目看板
- [ ] 优化反馈功能：确保"喜欢/不喜欢"按钮位置明显，易于使用
- [ ] 更新使用说明文档：修正项目关联步骤，添加反馈功能说明

## 工具选择每次打开重置为默认
- [x] 修改 AiToolSelector 组件，移除 localStorage 持久化逻辑
- [x] 每次打开功能模块都重置为默认工具，不保留用户上次的选择
- [x] 验证所有功能模块的工具选择都能正常重置

## 使用指南集成
- [x] 在顶部导航栏最右侧添加帮助按锕
- [x] 创建 HelpGuide 组件显示使用指南
- [x] 集成 HTML 使用指南内容到平台内

## 紧急：OAuth 登录流程修复
- [x] 检查 OAuth 回调处理逻辑
- [x] 修复 AdminApiKeys.tsx 的导入路径问题（@shared 别名）
- [x] 验证 session 设置是否正常

## 紧急：OAuth 登录彻底修复
- [x] 检查 OAuth 回调后端代码
- [x] 检查网络请求日志找到失败原因
- [x] 修复登录流程（从 state 解析 origin，使用绝对 URL 重定向）

## Magnific 图片增强功能集成
- [x] 配置 Freepik API Key 并验证连通性
- [x] 数据库：generationHistory 表增加 enhancedImageUrl、enhanceStatus、enhanceTaskId 字段
- [x] 后端：enhance.submit tRPC procedure（提交增强任务，调用 Freepik Magnific API）
- [x] 后端：enhance.status tRPC procedure（查询增强任务状态，自动轮询）
- [x] 后端：enhance.reset tRPC procedure（重置增强状态，允许重新增强）
- [x] 前端：AI 效果图生成结果下方新增「增强画质」按钮和参数面板
- [x] 前端：参数面板支持放大倍数（2x/4x）、优化场景、创意度/细节度/相似度三个滑块
- [x] 前端：异步轮询增强状态（3s 间隔），完成后展示增强结果图片
- [x] 前端：增强完成后显示「下载增强版」按钮
- [x] 编写 Vitest 测试（140 项全部通过）

## 更新使用说明书
- [x] 在 HelpGuide 中加入 Magnific 图片增强功能说明

## Bug 修复：Magnific 图片增强功能不可用
- [x] 诊断增强功能失败原因（API 格式错误：image_url→Base64、scale→scale_factor、detail→hdr、状态大小写）
- [x] 修复并验证（142 项测试通过）

## 历史记录页面 - 显示增强后图片
- [x] 在 AI 效果图详情面板中展示增强后的图片（可展开对比视图）
- [x] 增强图缩略图在历史记录网格中显示✨标识
- [x] 增强图支持下载

## Bug 修复：Magnific 增强功能卡在「增强中」
- [x] 诊断轮询卡住的原因（竞态条件：提交前就开始轮询，第一次查询返回 idle 导致停止轮询）
- [x] 修复并验证（先提交再轮询，增强图永久存储到 S3）

## 调整增强按钒位置
- [x] 上传基础图片后，在生图按钒下方显示「增强上传图片画质」按钒
- [x] 支持对上传的原图直接进行增强（本地文件自动上传 S3 后增强）
- [x] 新增 enhance.submitUrl 和 enhance.pollTaskId 接口，不依赖 historyId

## Bug 修复：enhance.submitUrl 路由未找到
- [x] 检查 enhanceRouter 中 submitUrl 和 pollTaskId 是否正确注册（代码正确，是服务器旧缓存导致）
- [x] 修复并验证（重启服务器后路由正常工作）

## 编辑历史弹窗增强
- [x] 图片可放大查看（点击图片全屏展示，支持缩放）
- [x] 每张图片有下载按钮

## 工作台首页重设计
- [x] 后端：dashboard.greeting 接口（LLM 根据用户使用历史生成个性化问候语）
- [x] 后端：dashboard.recentGenerations 接口（最近 AI 生成缩略图）
- [x] 前端：修复 / 路由，改回指向 Home 工作台页面
- [x] 前端：重写 Home.tsx（问候语+统计+最近项目+最近生成+快捷入口）

## Bug 修复：生成记录 ai_render 不显示
- [ ] 修复 listGroupedHistory "全部"视图下 ai_render 记录不返回的 bug

## 生成记录修复与优化
- [x] 清理数据库中重复的媒体模块测试数据
- [x] 历史记录页面添加「加载更多」分页功能（每次加载 20 条，点击展开更多）
- [x] 修复 listGroupedHistory "全部"视图下 ai_render 记录不返回的 bug

## 历史记录统一方块布局
- [x] 所有模块记录统一改为缩略图方块卡片（与 AI 效果图一致）
- [x] 按类别分组显示，每组按最近使用时间排序
- [x] 非图片类模块（报告/PPT/会议纪要/媒体）显示图标+标题的方块卡片

## Bug 修复：文字类记录点击无法查看
- [x] 修复小红书、对标调研报告等文字类卡片点击后无法查看内容的 bug
- [x] 添加文字类内容查看弹窗（显示 outputContent 或 outputUrl）

## Bug 修复：文字类记录点击仍无法查看（二次排查）
- [x] 深入排查 listGrouped 是否实际返回 outputContent 字段
- [x] 检查 TileCard 点击事件是否被 delete 按钮阻止冒泡
- [x] 彻底修复文字类记录点击查看

## Bug 排查：工作台 AI 调用次数显示为 0
- [x] 排查 dashboard stats 中 AI 调用次数的数据来源（来自 ai_tool_logs 表，当前显示 101 次，数据正确）
- [x] 确认生成记录是否通过 AI API 接口生成（是，已验证）
- [x] 统计逻辑正常，无需修复

## Bug 修复：对标调研报告弹窗无法查看（三次排查）
- [x] 读取当前 History.tsx 弹窗逻辑，找到对标调研报告点击无效的根本原因
- [x] 弹窗已可正常打开，旧记录 outputContent 为 NULL 是正常现象（旧数据未保存完整内容）

## API Key 接入生成流程
- [x] 排查账户设置中 API Key 的存储结构（ai_tools 表， apiKeyEncrypted 字段， AES-256-GCM 加密）
- [x] 修复对标调研报告弹窗 JSX 语法错误
- [x] 将用户配置的 API Key 接入各生成模块（通过 invokeLLMWithUserTool 实现）

## API Key 加密存储 + 接入生成流程
- [x] Schema 改造：新增 apiKeyEncrypted 字段（AES-256-GCM 加密存储）
- [x] 后端：实现加密/解密工具函数（server/_core/crypto.ts）
- [x] 后端：更新 CRUD 逻辑（创建/更新时加密，查询时脱敏）
- [x] 前端：AdminApiKeys 页面输入明文、保存加密、展示脱敏
- [x] 生成流程接入：读取用户默认工具的加密 Key，替换内置 API 调用（失败时自动回退内置）
- [x] 修复对标调研报告弹窗 bug（TileCard handleClick 没有处理文字类模块）
- [x] 迁移旧的明文 API Key 到加密字段（2 条记录已加密：百炼 Coding Plan、Gemini API）

## Bug 修复：对标调研报告生成超时（qwen3.5-plus 推理模型）
- [x] 延长服务器 HTTP 超时时间至 5 分钟（server.timeout=300000）
- [x] 用户工具 fetch 调用增加 AbortSignal.timeout(300000)
- [x] 前端生成按钒显示计时器（已用时 Xs），10s 后显示推理模型提示文案

## Magnific 增强接入用户自己的 Freepik API Key
- [x] 确认用户的 Freepik Key 已作为 FREEPIK_API_KEY 环境变量注入，已在使用用户自己的 Key

## Bug 修复：对标调研报告生成超时（代理层 100s 限制）
- [x] 数据库新增 benchmark_jobs 表（存储异步任务状态）
- [x] 后端改为异步模式：提交请求立即返回 jobId，后台线程继续生成
- [x] 前端改为轮询模式，每 3s 轮询一次，计时器持续运行显示已用时秒数

## 接入 Tavily 搜索 API 为对标案例提供真实链接
- [x] 存储 Tavily API Key 到环境变量
- [x] 创建 server/tavily.ts 搜索工具函数（搜索 ArchDaily、谷德等建筑网站）
- [x] 修改 benchmark 生成逻辑：三阶段生成（生成案例名 → Tavily 搜索真实 URL → 带真实链接生成完整报告）
- [x] Tavily API Key 验证测试通过（2 项测试，5.4s）

## Tavily 搜索域按项目类型动态调整
- [x] 修改 tavily.ts：按项目类型返回不同搜索域列表（办公/展厅/商业/住宅/文化空间）
- [x] 修改 routers.ts：传入 projectType 到搜索函数

## 模块重组：案例调研 + 设计任务书移位 + 对话式迭代调整
- [x] "项目策划"改名为"案例调研"（DashboardLayout、Home.tsx、DesignPlanning.tsx）
- [x] 移除案例调研页面中的"设计任务书"标签页
- [x] 将设计任务书功能移至项目管理板块（新建 /design/brief 路由，占位页面）
- [x] 案例调研报告生成后，底部显示对话输入框，支持对话式反馈调整报告
- [x] 后端新增 benchmark.refine 接口，接收当前报告内容 + 用户反馈，返回修订后的报告
## 历史记录 - 案例调研报告继续编辑
- [x] 历史记录弹窗中 benchmark_report 类型增加对话式继续编辑区域（底部输入框 + 发送按钒）
- [x] 调用 benchmark.refine 接口，修改后报告实时更新到弹窗显示区域
- [x] 支持 Cmd/Ctrl+Enter 快捷键发送

## 历史记录 - 案例调研报告跳转继续编辑
- [x] 历史记录中点击 benchmark_report 卡片，跳转到 /design/planning?historyId=xxx
- [x] 案例调研页面支持接收 historyId 参数，自动加载历史报告内容并显示提示

## 优化 Tavily 案例链接质量
- [x] 改为英文查询优先，提高国际建筑网站命中率
- [x] 加入相关性评分算法，过滤搜索列表页/标签页
- [x] 搜索失败时自动提供 ArchDaily 搜索页作为备用链接，不再留空
- [x] 分批并行搜索（每批 3 个），避免请求频率限制

## Bug 修复：案例调研报告轮询永远返回 processing
- [x] 诊断原因：drizzle ORM 单连接 REPEATABLE READ 隔离级别导致读取旧数据
- [x] 修复 getBenchmarkJob：改用原生 SQL 查询绕过 ORM 缓存层

## Bug 修复：pollStatus 报错 updatedAt.toISOString is not a function
- [x] 原因：原生 SQL 查询返回的 createdAt/updatedAt 是字符串而非 Date 对象
- [x] 修复：在 getBenchmarkJob 返回值中显式 new Date(row.updatedAt) 转换

## Bug 修复：对话式编辑（refine）提交后无响应
- [x] 原因：refine 接口同步调用 LLM，代理层 100s 超时导致 Failed to fetch
- [x] 修复：将 refine 改为异步 job 模式（同 generate），后端 fire-and-forget 后台处理
- [x] 新增 refineBenchmarkInBackground 函数，复用 benchmark_jobs 表存储任务状态
- [x] 前端 DesignPlanning.tsx：refine mutation 改为接收 jobId，新增 refineJobId 状态 + 轮询逻辑
- [x] 前端 History.tsx：同步更新 refine 逻辑为异步轮询，isRefining 状态控制 UI 禁用

## 对话式编辑 UI 改造
- [x] 新生成的修订报告显示在对话气泡下方（而非替换原报告区域）
- [x] 对话历史中 assistant 气泡展示完整修订报告内容，可点「采用此版本」替换主报告
- [x] 同步修改 DesignPlanning.tsx 和 History.tsx

## 报告修改历史保存与跳转修复
- [x] 自动跳转确认是手动点击侧边栏，非代码 bug
- [x] 后端：refine 完成后将修订版写入 generationHistory，关联父记录（parentId 字段）
- [x] 前端：生成历史中 benchmark_report 以可展开序列形式展示（类似 AI 效果图编辑链）
- [x] 前端：序列中最新版支持「继续修改」操作，内容可展开预览并复制

## 生成历史调研报告点击行为修复
- [x] 点击历史记录中的 benchmark_report 卡片，跳转到案例调研页面并加载该报告（而非弹窗）

## 调研报告历史弹窗改造
- [x] 点击历史记录中的 benchmark_report 卡片，弹窗展示所有版本（编辑链序列）
- [x] 每个版本可展开查看完整报告内容，点「编辑此版本」跳转案例调研页面
- [x] 弹窗支持放大缩小（全屏模式切换）
- [x] 删除 DesignPlanning.tsx 中「采用此版本」按钮，refine 完成后直接显示已自动保存提示

## 调研报告历史弹窗 Bug 修复（Round 2）
- [x] 弹窗内容显示不完整（内容被截断，无法滚动查看）
- [x] 放大缩小按钮不生效（全屏切换无效）
- [x] 点击「编辑此版本」没有跳转到案例调研页面

## 案例调研对话区折叠优化
- [x] 新修改稿出现时自动折叠之前所有版本（原稿+旧修改稿），完整展示最新版
- [x] assistant 气泡支持手动折叠/展开，折叠时显示摘要（前100字）

## 演示文稿功能模块
- [x] 从案例调研页面移除「生成对标案例 PPT」功能
- [ ] 后端：presentation 路由（图片上传 S3、视觉分析、异步生成 PPT HTML、轮询状态）
- [ ] 前端：Presentation.tsx 页面（文字输入+图片上传+进度轮询+PPT 预览+导出 PDF）
- [x] 更新导航、路由、首页快捷入口（设计板块新增演示文稿占位页面）

## 案例调研报告导出飞书文档
- [x] DesignPlanning.tsx：报告区增加「复制到飞书」按钮（复制 Markdown 到剪贴板）
- [x] History.tsx：弹窗每个版本增加「复制到飞书」按钮

## 生成记录模型标注
- [x] 数据库：generationHistory 表增加 modelName 字段（varchar 128，可为空）
- [x] 后端：各生成 API 在写入历史时记录所用模型名称
- [x] 前端：历史记录卡片和弹窗中显示模型标注标签

## Bug 修复：AI 效果图模型标注错误
- [x] 修复 ai_render 模块 modelName 固定写入"内置图像生成"，应记录用户实际选择的工具名称

## 文案修改：对标调研报告 → 案例调研报告
- [x] 数据库：更新历史记录中已有的 title（对标调研报告 → 案例调研报告）
- [x] 前端：所有界面文案替换
- [x] 后端：生成时写入的 title 文案替换

## 项目关联逻辑改造：从自动关联改为事后灵活关联
- [ ] 后端：移除生成时自动关联项目的逻辑（所有生成 API 中的 projectId 参数处理）
- [ ] 后端：新增 updateGenerationHistoryProject 接口（关联/解除项目）
- [ ] 前端：历史记录详情中增加项目选择器和关联/解除按钮
- [ ] 前端：项目看板中为每条关联成果增加"解除关联"按钮
- [ ] 测试：验证关联/解除流程正常工作

## 项目关联逻辑改造：从自动关联改为事后灵活关联
- [x] 后端：移除生成时自动关联项目的逻辑，新增项目关联/解除的 API
- [ ] 前端：历史记录页面增加项目选择/关联/解除功能
- [ ] 前端：项目看板中增加解除关联功能
- [ ] 测试：验证关联/解除流程正常工作

## 前端：项目关联 UI
- [ ] History.tsx：详情弹窗中添加项目选择器（下拉选择项目，支持关联/解除）
- [ ] ProjectDetail.tsx：文档 Tab 成果卡片添加解除关联按钮（管理员/本人可操作）

## 前端：项目关联 UI
- [x] History.tsx：详情弹窗中添加项目选择器（下拉选择项目，支持关联/解除）
- [x] ProjectDetail.tsx：文档 Tab 成果卡片添加解除关联按钮（所有人均可操作）

## 历史记录：编辑链版本独立关联项目
- [x] 移除编辑历史链弹窗头部的全局项目选择器
- [x] 在每个版本条目内添加独立的项目选择器（关联/解除）

## 案例调研模块：移除项目类型输入栏
- [x] 前端：移除调研参数表单中的项目类型字段
- [x] 后端：将 API 中的 projectType 改为可选，默认为空字符串

## 案例调研：对标案例数量改为滑块控件
- [x] 将下拉选择框改为滑块 + 数字显示组合（范围 3-10）

## 案例调研：页面使用说明
- [x] 撰写使用说明文案
- [x] 右上角添加帮助按钮和说明弹窗

## 各模块独立使用说明
- [x] 找到全局帮助按钮共享组件，理解当前实现
- [x] 修复案例调研页面帮助弹窗（显示自己的说明）
- [x] 为 AI 效果图、演示文稿、会议纪要、内容创作各添加独立说明

## Bug 修复：项目信息保存失败
- [x] 排查项目状态字段更新无效的原因（handleSave 未将 _status 映射为 status）
- [x] 修复并验证项目信息保存功能

## 演示文稿模块实际功能开发
- [x] 后端：presentationRouter（复用 pptJobStore，generate + status API）
- [x] 后端：generatePresentationInBackground（LLM 结构化 → 图片获取 → PPTX 构建 → S3 上传）
- [x] 前端：Presentation.tsx 完整实现（演示标题+内容输入、项目信息导入、图片上传、进度轮询、下载 PPT、生成历史）
- [x] 更新 HelpGuide 使用说明与实际功能对应

## 项目信息类别模板系统
- [x] 数据库：新增 project_field_templates 表（id, name, description, sortOrder, isDefault, createdAt）
- [x] 数据库：预置 10 个默认类别（甲方名称、项目面积、项目地点、设计周期、预算范围、项目概况、设计理念、业务目标、甲方背景、特殊要求）
- [x] 后端：fieldTemplates 路由（list, create, update, delete，管理员权限）
- [x] 后端：projects.extractInfo API（接收自由文字，LLM 提取关键词并分类为字段列表）
- [x] 前端：重构新建项目对话框（仅名称+编号必填，提供类别选择列表，支持自由文字 AI 提取）
- [x] 前端：重构项目详情页信息编辑（支持从类别列表选择添加字段，支持自由文字 AI 提取）
- [x] 前端：管理员设置页面添加信息类别模板管理（增删改排序）
- [x] 测试：12 项测试全部通过

## Bug 修复：新建项目对话框 AI 提取与类别选择互斥
- [x] 修复 Projects.tsx：去掉互斥 Tab 模式，AI 提取区域和类别标签同时显示，两种方式可混合使用

## Bug 修复：项目详情页信息编辑 Tab 互斥
- [x] 修复 ProjectDetail.tsx：去掉 Tab 切换模式，类别标签和 AI 提取同时显示，两种方式可混合使用

## 项目信息统一化重构
- [x] 前端：项目信息页合并基本信息和自定义信息为单一列表，只显示已填写的字段
- [x] 前端：标签选择区域加「+」按鈕，可添加新标签并永久保存到模板库（新建项目和项目详情页均支持）
- [x] 数据库：将已有项目中非空的标准字段迁移到 project_custom_fields，并清空 5 个标准字段

## 项目看板卡片显示甲方名称
- [x] 后端：listProjects 附带 clientNameDisplay 字段（从 project_custom_fields 读取甲方名称）
- [x] 前端：项目卡片在项目名称下方显示甲方名称（如有）

## Bug 修复：项目详情页重复信息标签未合并
- [x] 彻底重构 ProjectInfoTab：去掉 builtInFields 中已迁移的 5 个标准字段，只保留 name/code，页面头部甲方名称从自定义字段读取

## 项目卡片摘要改为显示自定义字段内容
- [x] 后端：listProjects 附带 summaryDisplay（优先「项目概况」，其次第一条自定义字段）
- [x] 前端：卡片摘要改为显示 summaryDisplay，不再使用 description 字段

## Bug 修复：案例报告修改后版本缺少「复制到飞书」按钮
- [x] 在案例报告编辑链对话框的每条修改版本展开时底部添加「复制到飞书」按鈕

## Bug 修复：案例报告日期显示为 2023 年
- [x] 在 benchmark 报告生成和 refine 的 system prompt 中注入北京时间当前日期，模型将使用此日期

## Bug 修复：案例报告链接不准确
- [ ] 查看当前搜索和 URL 获取逻辑，找到链接编造的根源
- [ ] 修复：将已搜索到的真实 URL 锁定到 prompt，refine 时也传入原始链接列表防止被替换

## Bug 修复：archdaily 链接不准确
- [x] 重写 tavily.ts：优先 gooood.cn，对 archdaily 链接进行关键词验证，低置信度时降级为搜索页
- [x] 修复 refine prompt：从数据库读取 caseRefs 并锁定链接，防止 LLM 替换 URL

## Logo 图片替换
- [x] 将 N+1 STUDIOS logo 图片上传到 CDN
- [x] 顶部信息条（DashboardLayout header）替换文字 logo 为图片
- [x] 主页（Home.tsx）问候语区域替换文字 logo 为图片
- [x] 登录页（DashboardLayout 未登录状态）替换文字 logo 为图片

## Bug 修复：案例调研报告链接不准确（Round 2）
- [x] 读取 tavily.ts 和 benchmark 生成逻辑，定位链接编造根源
- [x] 重构：搜索结果 URL 强锁定到 prompt，禁止 LLM 自行生成 URL
- [x] 修复 refine 流程：从数据库读取 caseRefs 并传入，防止修改时替换链接
- [x] 测试验证链接质量

## 搜索页链接角标
- [x] 定位报告渲染组件（Streamdown/Markdown 链接渲染方式）
- [x] 实现自定义链接渲染：检测 ?q= 并附加“搜索页”角标
- [x] 测试并保存检查点

## 出品标准：渲染风格管理
- [x] 数据库新建 render_styles 表（id, label, promptHint, referenceImageUrl, sortOrder, isActive）
- [x] 后端 CRUD 路由：列表/创建/更新/删除/排序/图片上传
- [x] 前端出品标准页面：风格列表、新增、编辑弹窗、参考图上传、拖拽排序
- [x] AI 效果图模块：风格列表改为动态读取，生成时注入 promptHint 和参考图
- [x] 删除 AI 效果图模块的「导入项目信息」功能
- [x] 编写 vitest 测试

## 文案修改：项目状态「规划中」→「待启动」
- [x] Home.tsx、Projects.tsx、ProjectDetail.tsx 中所有「规划中」替换为「待启动」

## 项目状态标签颜色区分
- [x] Projects.tsx、ProjectDetail.tsx、Home.tsx：为各状态设置专属颜色（待启动=灰蓝、设计中=蓝、施工中=橙、已完成=绿、已归档=灰）

## 调研报告生成记录：复制提示词功能
- [x] 查找生成记录 UI 位置及 inputParams 中提示词字段
- [x] 在记录卡片中添加「复制提示词」按钮
- [x] 保存检查点

## Tavily 搜索范围优化：去掉 include_domains 强制约束
- [x] 定位 tavily.ts 中 include_domains 的使用位置
- [x] 改为 exclude_domains 过滤低质量站，扩大覆盖面
- [x] 保存检查点

## 案例调研界面：项目名称→报告名称
- [x] 将「项目名称」字段改为「报告名称」
- [x] 导入项目信息时自动填入「{project_name}案例调研报告」
## 生成记录图片：导入素材库功能
- [x] 读取素材库数据结构和相关路由
- [x] 后端：添加从生成记录导入素材库的路由（assets.importFromHistory）
- [x] 前端：图片卡片 hover 时显示「导入素材库」按钮，带状态反馈
- [x] 编写测试并保存检查点

## 素材库模块完善
- [x] 数据库：assets 表增加 historyId、projectId 字段
- [x] 后端：listAssets 带关联项目名称（JOIN projects）
- [x] 后端：importFromHistory 写入 historyId 和 projectId
- [x] 后端：assets.create 支持 historyId、projectId 参数
- [x] 前端：重构 Assets.tsx（图片网格、关联项目标签、本地上传、删除、搜索）
- [x] 编写测试并保存检查点

## 素材库文件夹结构支持
- [x] 数据库：assets 表增加 parentId、isFolder、path 字段
- [x] 后端：assets.createFolder 创建文件夹
- [x] 后端：assets.moveAsset 移动素材到文件夹
- [x] 后端：assets.deleteFolder 删除文件夹（级联删除）
- [x] 后端：assets.listByParent 树形结构返回（支持按 parentId 查询）
- [x] 前端：Assets.tsx 重构为树形导航（面包屑路导航、文件夹打开、内容区）
- [x] 前端：支持拖拽上传文件夹（webkitdirectory）与自动创建文件夹层级
- [x] 编写测试并保存检查点

## 素材库新建文件夹功能
- [x] 前端：Assets.tsx 添加「新建文件夹」按钮和对话框
- [x] 前端：支持在任意文件夹层级创建新文件夹
- [x] 编写测试并保存检查点

## AI 彩平功能
- [x] 后端：renderingRouter 新增 colorPlan 子路由（generate 接口）
- [x] 后端：上传底图接口（base64 → S3）
- [x] 前端：新建 ColorPlan.tsx 页面（上传底图、选择参考图、生成结果展示）
- [x] 前端：支持从素材库选择参考图
- [x] 前端：生成结果支持下载和导入素材库
- [x] 导航：DashboardLayout 设计板块添加「AI 彩平」入口（Palette 图标）
- [x] 路由：App.tsx 注册 /design/color-plan 路由
- [x] 编写测试并保存检查点（27 项测试全部通过）

## 媒体板块新增占位模块
- [x] 创建「图文排版」占位页面（/media/layout）
- [x] 创建「作品集」占位页面（/media/portfolio）
- [x] App.tsx 注册两个新路由
- [x] DashboardLayout 媒体板块添加两个导航入口（LayoutTemplate + BookImage 图标）
- [x] 保存检查点

## AI 彩平：添加 API 选择功能
- [x] 读取 DesignTools.tsx 中 API 选择器的实现方式（AiToolSelector 组件）
- [x] 后端：colorPlan.generate 接口添加 toolId 参数和工具日志
- [x] 前端：ColorPlan.tsx 头部添加 AiToolSelector（category="rendering"）
- [x] 保存检查点

## 修复 AI 效果图/彩平外部 API 调用（高优先级）
- [x] 调查根本原因：rendering.generate 始终调用内置 AI，toolId 只用于日志
- [x] 测试验证 Gemini API Key 可用（gemini-3.1-flash-image-preview，9秒返回图像）
- [x] 修复数据库：Gemini 3 工具的 apiEndpoint 更新为正确的 Gemini API 端点
- [x] 创建 generateImageWithTool.ts：根据 toolId 路由到外部 API（Gemini）或内置 AI
- [x] 更新 rendering.generate：使用 generateImageWithTool 替代 generateImage
- [x] 更新 colorPlan.generate：使用 generateImageWithTool 替代 generateImage
- [x] 编写测试（31 项全部通过）并保存检查点

## AI 工具选择器过滤修复
- [x] 数据库：qwen3.5-plus capabilities 去掉 rendering，只保留 document/analysis
- [x] 数据库：qwen-image-2.0 和 gemini-3-pro-image-preview capabilities 改为 image_generation
- [x] 数据库：Gemini 3（旧条目）capabilities 去掉 rendering
- [x] 前端：DesignTools.tsx 和 ColorPlan.tsx 的 AiToolSelector 改用 capability="image_generation"
- [x] 后端：generateImageWithTool.ts 添加 qwen-image (dashscope) 调用分支，自动检测 provider
- [x] 编写测试并保存检查点，31 项测试全部通过

## 修复 qwen-image-2.0 调用（OpenAI 兼容模式）
- [ ] 查清 DashScope compatible-mode 图像生成 API 格式
- [ ] 数据库：更新 qwen-image-2.0 的 apiEndpoint 为 compatible-mode 端点
- [ ] 后端：generateImageWithTool.ts 添加 openai-compatible 调用分支
- [ ] 保存检查点

## 修复 qwen-image-2.0 调用（原生异步端点）
- [x] 确认新 API Key 有效（主账号 sk-763ae...）
- [x] 改用原生 DashScope 异步端点（提交任务 + 轮询结果）
- [x] 端到端测试通过（15秒内 SUCCEEDED，返回图片 URL）
- [x] 保存检查点

## AI 工具默认设置按功能类别分组
- [x] 数据库：新增 ai_tool_defaults 表（capability, toolId），替代 ai_tools.isDefault 全局字段
- [x] 后端：aiTools.setDefaultForCapability API（按 capability 设置默认工具）
- [x] 后端：aiTools.getDefaultForCapability API（按 capability 获取默认工具）
- [x] 前端：API 密钥管理页面按 capability 分组，每组独立设置默认工具
- [x] 前端：AiToolSelector 按 capability 读取对应默认工具（而非全局 isDefault）
- [x] 测试并保存检查点

## 修复 capability 类别重复问题
- [x] 分析「图像生成」和「AI效果图」两个类别的来源（toolCapabilities.ts vs AdminApiKeys.tsx）
- [x] 合并为统一的单一类别，消除重复
- [x] 保存检查点

## 修复 AI 工具 capabilities 字段错误
- [ ] 修正数据库中 Gemini 3 的 capabilities（加入 rendering）
- [ ] 修正 gemini-3-pro-image-preview 的 capabilities（image_generation → rendering,image）
- [ ] 修复 inferCapabilities 推断逻辑，确保 gemini 类工具包含 rendering
- [ ] 保存检查点

## 集成即梦 AI（火山引擎）
- [x] 后端：实现火山引擎 HMAC-SHA256 签名生成
- [x] 后端：实现即梦 API 调用逻辑（支持 AccessKeyID + SecretAccessKey）
- [x] 后端：在 generateImageWithTool 中添加即梦 AI 路由
- [x] 前端：修改 AdminApiKeys 支持 AccessKeyID/SecretAccessKey 两个字段
- [x] 前端：AI 工具管理页面识别「即梦」工具，显示 AccessKeyID/SecretAccessKey 输入框
- [x] 数据库：ai_tools 表增加字段存储 AccessKeyID（或复用现有字段）
- [x] 测试验证即梦 API 调用
- [x] 保存检查点

## AI 视频功能（即梦视频生成）
- [x] 后端：研究即梦视频生成 API（文生视频、图生视频）
- [x] 后端：实现视频生成 tRPC 接口（video.generate）
- [x] 后端：实现视频任务查询接口（video.getStatus）
- [x] 后端：实现视频下载和存储逻辑
- [x] 数据库：添加 video_history 表存储视频生成记录
- [x] 前端：创建 VideoGeneration.tsx 页面组件
- [x] 前端：实现文生视频 Tab（描述词输入、时长选择）
- [x] 前端：实现图生视频 Tab（首帧图上传/素材库选择、描述词、时长选择）
- [x] 前端：实现视频预览播放器
- [x] 前端：实现视频下载功能
- [x] 前端：集成视频历史记录
- [x] 前端：在设计板块导航中添加「AI 视频」菜单项
- [x] 测试验证和保存检查点

### 视频功能中的工具选择器支持
- [x] 在 toolCapabilities.ts 中添加 video capability
- [x] 修改 inferCapabilities 识别视频生成工具
- [x] 在 AdminApiKeys 中为「视频生成」类别添加默认工具配置

## 视频历史记录管理功能
- [ ] 分析 AI 效果图历史记录的交互方式（缩略图、预览、删除、重新生成）
- [ ] 后端：实现视频历史记录查询 API（支持分页、排序）
- [ ] 后端：实现视频历史记录删除 API
- [ ] 后端：实现视频重新生成 API（基于历史记录重新生成）
- [ ] 前端：创建视频历史记录卡片组件（与效果图卡片风格一致）
- [ ] 前端：实现视频历史网格布局和加载更多
- [ ] 前端：在历史板块添加「视频历史」Tab
- [ ] 测试验证和保存检查点

## AI 视频功能独立模块化
- [x] 从 DesignTools.tsx 中移除 AI 视频 Tab
- [x] 在 App.tsx 中为 AI 视频添加独立路由 /design/video
- [x] 在设计板块下拉菜单中添加「AI 视频」选项
- [x] 测试验证导航和路由
- [x] 保存检查点

## 视频历史记录集成到历史板块
- [ ] 分析历史板块结构和 AI 效果图历史记录的交互方式
- [ ] 后端：确保视频历史记录 API（list、delete、regenerate）正常工作
- [ ] 前端：创建视频历史卡片组件（与效果图卡片风格一致）
- [ ] 前端：在历史板块添加「视频历史」模块配置
- [ ] 前端：在历史记录过滤中添加视频选项
- [ ] 前端：集成视频历史卡片到历史记录网格
- [ ] 测试验证和保存检查点

## API 密钥管理改名为 AI 工具管理
- [ ] 找出所有提及「API 密钥管理」的位置
- [ ] 更新导航菜单中的模块名称
- [ ] 更新路由和页面标题
- [ ] 测试验证
- [ ] 保存检查点

## 视频生成 UX 修复
- [x] 图生视频：支持从素材库选择图片作为参考素材
- [x] 文生视频：提交新任务前工作区不显示上次生成内容

## 图生视频 - 本地上传入口
- [x] 图生视频首帧图区域增加本地上传按钮（与素材库选择并排）
- [x] 上传图片到 S3 并自动同步到素材库（调用 assets.upload + assets.create）
- [x] 上传完成后自动填入首帧图 URL 并显示预览
- [x] 上传中显示进度状态
- [x] 测试验证并保存检查点

## AI 彩平改名为 AI 平面图
- [x] 定位所有涉及「AI彩平」的代码位置
- [x] 全局替换为「AI平面图」
- [x] 测试验证并保存检查点

## OpenClaw 集成方案网页版本
- [x] 创建 OpenClaw 集成网页（/openclaw 路由）
- [x] 实现快速开始指南交互式页面
- [x] 实现 API 文档浏览器（可复制代码）
- [x] 实现配置生成器（自动生成 skill.yaml）
- [x] 实现在线 Token 生成工具
- [x] 测试验证并保存检查点

## API 管理模块 - 改造 API 与 Webhook 页面
- [x] 读取现有 API 与 Webhook 页面代码
- [x] 设计 api_tokens 表结构（Token、创建时间、过期时间、状态等）
- [x] 实现后端 tRPC 接口：generateOpenClawToken、listTokens、revokeToken
- [x] 改造前端页面为 API 管理模块（Token 管理 + OpenClaw 集成指南）
- [x] 实现 Token 复制、撤销、过期时间显示等交互
- [x] 集成 OpenClaw 集成方案网页到模块中
- [x] 测试验证并保存检查点

## 公开 API 文档页面
- [x] 创建公开 API 文档页面（/api-docs 路由，不需要登录）
- [x] 展示 OpenClaw 三个核心 API 的完整文档
- [x] 提供 API 调用示例和错误处理说明
- [x] 添加 Token 获取指引
- [x] 测试验证并提供公开链接

## API Token 认证修复
- [x] 修改 sdk.ts 中的 authenticateRequest 方法，支持 API Token 认证
- [x] 在 db.ts 中添加 API Token 验证函数
- [x] 修复 hashToken 一致性问题（统一使用 Node.js crypto.createHash）
- [x] 修复 context.ts 区分“无认证信息”和“认证信息无效”两种情况
- [x] 测试 API Token 认证成功（curl 返回正确结果）
- [x] 保存检查点

## API 文档页面更新
- [x] 更新认证说明为正确的 Bearer Token 格式
- [x] 补充完整的 curl 调用示例（三个核心 API）
- [x] 验证并保存检查点

## API Token 调用统计显示
- [x] 在 api_tokens 表中添加 callCount 字段
- [x] 更新 updateApiTokenLastUsed 函数，同时递增 callCount
- [x] 更新 getApiTokensByUserId 函数，返回 callCount 和 lastUsedAt
- [x] 更新前端 Token 列表，显示调用次数和最后使用时间
- [x] 验证并保存检查点

## 修复 API Token 调用次数始终显示 0
- [x] 修复 sdk.ts 中双重哈希问题：updateApiTokenLastUsed 应传入原始 token 而非 tokenHash
- [x] 验证修复效果并保存检查点

## 补充案例调研模块 API 文档
- [x] 梳理案例调研后端接口（benchmark.generate、benchmark.pollStatus、benchmark.refine）
- [x] 在 /api-docs 页面新增案例调研 API 文档区块
- [x] 验证页面显示并保存检查点

## 更新 API 管理模块中的 API 文档
- [x] 定位 Integrations 页面内嵌 API 文档区块
- [x] 补充案例调研三个接口文档
- [x] 验证并保存检查点

## 任务看板增强功能
- [x] 扩展 tasks 表：新增 startDate、progress、parentId 字段
- [x] 更新后端路由：create/update 支持 startDate、progress、parentId，新增 listMyTasks 接口
- [x] 更新任务看板新建/编辑弹窗：完成人选择、开始时间、截止时间、进度
- [x] 任务卡片展示：显示完成人头像、进度条、子任务数量
- [x] 工作台待办面板：分配给我的任务列表 + 甘特图（按天）
- [x] 子任务功能：任务详情中可添加/管理子任务
- [x] 进度标记：可在任务详情中拖动进度滑块
- [x] 3天倒计时提醒：工作台顶部 banner 提醒

## 任务审核人功能
- [x] tasks 表新增 reviewerId 字段并迁移
- [x] listMyTasks 包含审核人待办（进度100%且状态非done）
- [x] tasks.create/update 支持 reviewerId
- [x] 新建/编辑弹窗增加审核人选择
- [x] 工作台待办区分「执行中」和「待我审核」两类任务
- [x] 审核模式下显示「通过审核」按钮，点击标记任务为 done

## 素材库分类体系
- [x] 清空素材库所有数据
- [x] 前端分类 Tab 更新为：参考图片、效果图、施工图纸、材料样板、品牌物料、项目照片、其他
- [x] 上传弹窗增加分类选择下拉框
- [x] 按分类筛选浏览（Tab 切换）
- [x] 验证并保存检查点

## 侧边栏板块改名
- [x] 将「媒体」板块改名为「品牌」

## 任务看板甘特图视图
- [x] 在 TaskKanbanTab 顶部增加看板/甘特图视图切换按预
- [x] 实现甘特图视图渲染（按天显示时间轴、任务条、进度填充）
- [x] 验证并保存检查点

## 任务看板权限控制
- [x] 后端：tasks.create 仅创建者可用
- [x] 后端：tasks.update 仅创建者和任务负责人可用
- [x] 后端：tasks.delete 仅创建者可用
- [x] 前端：非创建者隐藏「新建任务」按预
- [x] 前端：非创建者和任务负责人隐藏编辑/删除按预
- [x] 前端：任务负责人可修改进度和添加子任务

## 任务名字编辑功能
- [x] 任务详情弹窗中任务名字支持点击编辑（创建者和负责人可编辑）
- [x] 子任务名字也支持编辑
- [x] 验证并保存检查点

## 修复子任务名字编辑功能
- [x] 查找子任务渲染位置并添加编辑功能
- [x] 验证修复

## 工作台待办区域调整
- [x] 将待办任务区域移动到最近AI生成上方
- [x] 增加「查看所有成员任务」按钮
- [x] 增加「查看某个成员任务」按钮（下拉选择成员）
- [x] 验证并保存检查点

## Bug 修复 + 甘特图改进（第二轮）
- [x] 修复任务名称编辑功能（点击任务名仍无法进入编辑模式）
- [x] 修复子任务名称编辑功能（同上）
- [x] 甘特图左侧任务名称栏固定（sticky），滚动时不随时间轴移动
- [x] 甘特图任务名称悬浮 tooltip 显示全称
- [x] 成员视图甘特图按项目分配不同颜色（同一项目同色）
- [x] 验证并保存检查点

## 项目文档本地文件上传
- [x] 分析现有项目文档模块（Documents/ProjectDocuments）代码结构
- [x] 后端：新增 documents.uploadFile 接口（接收文件，上传到 S3，存入 documents 表）
- [x] 后端：新增 documents.deleteFile 接口（删除文档）
- [x] 前端：文档列表页添加「上传文件」按钮，支持多文件选择和拖拽
- [x] 前端：上传时显示「同步到素材库」复选框
- [x] 前端：上传进度状态显示（实时状态图标）
- [x] 验证并保存检查点

## 修复上传功能 + 飞书文档链接
- [x] 诊断项目文档页上传功能不显示的原因（空状态早期返回导致上传区块被跳过）
- [x] 修复上传功能（移除早期返回，始终渲染项目文件区块）
- [x] 后端：复用 documents.create 接口存储飞书链接（fileUrl 存储链接地址）
- [x] 前端：在项目文档页添加「飞书链接」按钮和 Dialog
- [x] 前端：飞书链接在文件列表中用蓝色图标区分，点击可跳转到飞书
- [x] 验证并保存检查点

## 通用 URL 收藏 + AI 自动分析
- [x] 后端：新增 documents.analyzeUrl 接口（抓取页面内容 + AI 提取标题/摘要/关键词/类型）
- [x] 数据库：文档表新增 aiSummary / aiKeywords / urlMeta 字段存储分析结果
- [x] 前端：将「飞书链接」 Dialog 扩展为「添加链接」，支持任意 URL
- [x] 前端：粘贴 URL 后自动触发 AI 分析，显示加载状态
- [x] 前端：分析完成后预填标题、类型，并展示摘要和关键词供用户确认
- [x] 前端：文件列表中链接条目展示 AI 摘要和关键词标签
- [x] 验证并保存检查点

## 甘特图修复（第三轮）
- [x] 诊断「所有成员」视图甘特图闪退原因（日期计算在每帧重建、查询无 staleTime）
- [x] 修复闪退问题（日期范围全部移入 useMemo，查询加 staleTime + refetchOnWindowFocus:false）
- [x] 甘特图时间条上显示任务负责人名称（成员视图下显示）
- [x] 左侧固定名称栏也显示成员名称（蓝色小字）
- [x] 验证并保存检查点

## 项目看板甘特图修复
- [x] 修复项目看板甘特图闪退（日期计算移入 useMemo，动态时间窗口）
- [x] 项目看板甘特图显示任务负责人名称（左侧名称栏和时间条内均显示）
- [x] 验证并保存检查点

## 个人任务功能
- [x] 数据库：新增 personal_tasks 表（id, userId, title, notes, priority, status, startDate, dueDate, createdAt, updatedAt）
- [x] 后端： personalTasks.list / create / update / delete 路由（protectedProcedure，仅返回自己的任务）
- [x] 前端：工作台待办面板新增「个人」按钮（与「我的」「所有成员」「指定成员」并列）
- [x] 前端：个人任务列表视图（含状态筛选、优先级标签、完成勾选）
- [x] 前端：个人任务甘特图视图（复用 GanttView 组件）
- [x] 前端：新建个人任务 Dialog（标题、备注、优先级、开始/截止日期）
- [x] 验证个人任务不在「所有成员」和「指定成员」视图中显示（后端 protectedProcedure 仅返回当前用户自己的任务）
- [x] 验证并保存检查点

## 任务名称点击跳转功能
- [x] 分析工作台列表和甘特图中任务点击行为及权限逻辑
- [x] 列表视图：点击项目任务名称，弹出任务详情/编辑 Dialog（含状态修改、负责人、日期等）
- [x] 列表视图：点击个人任务名称，弹出个人任务编辑 Dialog
- [x] 甘特图：点击左侧名称栏或时间条弹出任务详情 Dialog
- [x] 权限控制：创建者/负责人/管理员可编辑，其他人只读
- [x] 验证并保存检查点

## 任务自动状态更新
- [x] 后端：新增 tasks.applyAutoStatus 接口（根据 startDate 和 approval 自动更新状态）
- [x] 前端：查询任务列表后自动调用 applyAutoStatus 更新状态
- [x] 后端：定时任务（可选）每小时批量更新过旧任务状态
- [x] 验证并保存检查点

## 任务自动状态更新修复
- [x] 后端：修复 applyAutoStatus 逻辑（开始日期当天即触发，比较日期部分而非精确时间）
- [x] 后端：applyAutoStatus 默认查询所有未完成任务（不限 taskIds），确保全量更新
- [x] 前端：Home.tsx 挂载时全量触发（不传 taskIds），更新后刷新任务列表
- [x] 前端：ProjectDetail.tsx 项目任务看板加载后也触发 applyAutoStatus
- [x] 验证并保存检查点

## 任务权限限制
- [x] 数据库：tasks 表新增 progressNote（text）字段
- [x] 后端：新增 tasks.submitProgress 接口（负责人提交进度）
- [x] 后端：tasks.update 接口增加权限检查，负责人只能更新 progress/progressNote
- [x] 前端：ProjectDetail.tsx 任务详情弹窗中，负责人隐藏状态下拉编辑，显示提交进度表单
- [x] 前端：Home.tsx 任务弹窗中，负责人隐藏状态编辑，显示提交进度表单
- [x] 项目创建者保留完整状态编辑权限
- [x] 验证并保存检查点

## Bug 修复：AI 效果图生成超时（Failed to fetch）
- [x] 数据库：新增 rendering_jobs 表
- [x] 后端：rendering.generate 改为异步模式（立即返回 jobId，后台生成）
- [x] 后端：新增 rendering.pollJob 接口（轮询生成状态）
- [x] 前端：DesignTools.tsx 改为提交后轮询结果，显示进度状态
- [x] 验证并保存检查点

## Bug 修复：登录后跳转回登录页
- [x] 根本原因：Express 未设置 trust proxy，生产环境 req.protocol 返回 http，导致 cookie 以 secure=false 设置，浏览器拒绝存储
- [x] 修复：在 server/_core/index.ts 中添加 app.set("trust proxy", 1)
- [x] 验证并保存检查点

## Bug 修复：OpenClaw API 认证失败
- [x] 修复 openclawApi.ts 中间件：支持 sk_ 前缀 token（api_tokens 表）和旧版 nplus1_ 前缀 key 双认证
- [x] 验证并保存检查点

## Bug 修复：rendering API 接口缺失与文档不一致
- [x] 后端：/api/v1/ai/render 改为异步模式（立即返回 jobId）
- [x] 后端：新增 GET /api/v1/ai/render/history 历史查询接口
- [x] 后端：新增 GET /api/v1/ai/render/:jobId 轮询接口
- [x] 前端：ApiDocs.tsx 更新效果图 API 文档（异步两步流程、轮询示例代码）
- [x] 验证并保存检查点

## API 文档：Node.js 和 Python 完整调用示例
- [x] ApiDocs.tsx 新增「完整调用示例」区域（语言切换 Tab：Node.js / Python）
- [x] Node.js 示例：认证、项目列表、任务查询、AI 效果图生成（异步轮询）、案例调研报告生成
- [x] Python 示例：认证、项目列表、任务查询、AI 效果图生成（异步轮询）、案例调研报告生成
- [x] 验证并保存检查点

## 功能：任务审核通过按钮
- [x] 后端：新增 tasks.approveTask 接口（设置 approval=true，status=done）
- [x] 前端：ProjectDetail.tsx 任务详情弹窗中，审核人看到「通过审核」按钮
- [x] 前端：Home.tsx 任务详情弹窗中，审核人看到「通过审核」按钮
- [x] 验证并保存检查点

## 功能：会议纪要实时录音转录
- [x] 前端：录音 UI 组件（开始/暂停/停止按钮、录音时长、跨动画效果）
- [x] 前端：使用 MediaRecorder API 分段录音（15 秒一段）并上传到 S3
- [x] 后端：复用现有 meeting.transcribe 接口（Whisper）处理每段音频
- [x] 前端：实时将转录文字追加到会议内容文本框
- [x] 前端：录音进行中禁用「生成纪要」按钮，停止后可立即生成
- [x] 验证并保存检查点

## 功能：会议纪要基本信息字段
- [x] 前端：添加会议名称输入框（含图标）
- [x] 前端：添加会议地点输入框（含图标）
- [x] 前端：添加参会人员输入框（含图标）
- [x] 后端：generateMinutes 接口支持 meetingTitle、meetingLocation、meetingAttendees 字段
- [x] 后端：将新字段传入 AI 提示词，生成纪要时包含完整会议信息
- [x] 验证并保存检查点

## 功能：会议纪要参会人员多选
- [x] 前端：构建 AttendeeSelector 组件（内部成员多选 + 外部客户手动添加）
- [x] 前端：调用 tasks.listTeamMembers 获取团队成员列表供选择
- [x] 前端：已选人员以 Tag 形式展示，可逐个删除（外部客户显示琥珀色标签）
- [x] 前端：替换 MeetingMinutes.tsx 中的参会人员文本输入框
- [x] 后端：序列化参会人员数组为可读字符串传入 AI 提示词
- [x] 验证并保存检查点

## Bug 修复：会议纪要录音功能
- [x] 排查录音分段上传 S3 失败原因
- [x] 修复：btoa 对二进制音频数据抛 RangeError，改用 FileReader.readAsDataURL 安全转换
- [x] 修复：mimeType 带参数（audio/webm;codecs=opus）导致文件名后缀错误，改为裁剪主类型
- [x] 修复：voiceTranscription.ts 不再依赖 S3 返回的 content-type，改为从 URL 路径推断扩展名
- [x] 修复：录音错误被静默吐掉，改为显示 toast 错误提示
- [x] 修复：停止录音后按鈕立即可点导致 transcript 为空，添加 pendingSegments 计数器，转录完成前禁用按鈕
- [x] 验证并保存检查点

## 功能：会议纪要录音文件下载
- [x] 累积所有录音分片到 fullRecordingChunksRef，保留完整录音数据
- [x] 停止录音后生成可下载的 Blob URL
- [x] 在录音控制区显示「下载录音」按鈕，文件名包含会议名称和日期
- [x] 页面离开或重新开始录音时释放 Blob URL 内存
- [x] 验证并保存检查点

## 功能：会议纪要与录音联合存档
- [x] 查看 schema，复用现有 documents 表（type=minutes）存档纪要
- [x] 数据库：documents 表添加 audioUrl、audioKey 字段并迁移
- [x] 后端：generateMinutes 接口支持 audioUrl/audioKey 输入，有 projectId 时自动写入 documents 表
- [x] 前端：生成纪要前先上传录音到 S3，再一并传入 generateMinutes 存档
- [x] 前端：生成按鈕在已关联项目时显示「生成并存入文档库」
- [x] 前端：纪要生成后展示绿色存档成功提示，含「查看文档库 →」跳转链接
- [x] 前端：ProjectDetail.tsx 文档库列表为 minutes 类型条目显示录音下载按鈕（话筒图标）
- [x] 验证并保存检查点

## Bug 修复：AI 平面图彩平图未显示
- [ ] 排查生成接口调用是否成功
- [ ] 排查图片 URL 是否正确返回
- [ ] 排查前端图片展示逻辑
- [ ] 修复并验证彩平图正常显示
- [ ] 保存检查点

## 功能：演示文稿 AI 工具选择 + PPT 预览
- [x] 前端：左侧参数区添加 AiToolSelector（capability=document）
- [x] 前端：生成按钮传入 toolId 参数
- [x] 后端：presentation.generate 接口支持 toolId 参数
- [x] 后端：invokeLLMWithUserTool 支持按 toolId 选择指定工具
- [x] 前端：生成结果区嵌入 Office Online Viewer iframe 预览 PPT
- [x] 验证并保存检查点

## Bug 修复：演示文稿 PPT 预览失败
- [x] 诊断原因：Office Online Viewer 嵌套 iframe 导致浏览器同源策略限制，无法正常渲染
- [x] 改用自定义 React 幻灯片预览组件，直接渲染幻灯片数据（标题、要点、配图）
- [x] 后端在 done 状态中返回 slides 数组（含 imageUrl）
- [x] 前端支持翻页导航（上一页、下一页、圆点导航）
- [x] 验证并保存检查点

## 功能：PPT 版式全面改进 + 出品标准版式管理
- [x] PPT：新增 quote（大字引言）版式
- [x] PPT：新增 comparison（左右对比）版式
- [x] PPT：新增 timeline（时间轴）版式
- [x] PPT：新增 data_highlight（数据大字展示）版式
- [x] PPT：优化封面 cover — 全出血配图 + 半透明蒙层 + 白字
- [x] PPT：section_intro 支持右侧配图
- [x] PPT：配色节奏 — 深色版式与浅色版式交替使用
- [x] PPT：增加引号装饰符、大号数字编号、几何色块等装饰元素
- [x] PPT：更新 AI 提示词，将新版式加入可选列表
- [x] 出品标准：新建「演示文稿版式标准」标签页，可视化展示全部 10 种版式
- [x] 出品标准：每种版式展示小预览、使用场景、内容要素和配色说明
- [x] 出品标准：页面底部添加版式使用规则说明卡片
- [x] 验证并保存检查点

## 功能：AI 学习版式 + 演示文稿版式包选择
- [x] 数据库：新建 layout_packs 表（id, userId, name, description, sourceType, thumbnails, styleGuide, slides, status, createdAt）
- [x] 后端：layoutPacks.upload 接口（接收 PPT/图片/PDF，上传 S3）
- [x] 后端：layoutPacks.extract 接口（AI 分析文件，提取版式特征，生成版式包）
- [x] 后端：layoutPacks.list / delete 接口
- [x] 前端：Standards.tsx 版式标准页新增「AI 学习版式」区域（上传入口、提取进度、版式包卡片）
- [x] 前端：版式包卡片展示缩略图、版式名称、幻灯片数量、AI 提取的风格描述
- [x] 前端：Presentation.tsx 新增版式包选择器（默认内置版式 / 自定义版式包）
- [x] 后端：presentation.generate 支持 layoutPackId，按版式包风格生成 PPT
- [x] 验证并保存检查点

## Bug 修复：AI 版式学习上传失败（413 PayloadTooLarge）
- [x] 后端：新增 multipart/form-data 上传端点 /api/upload/layout-pack，绕过 tRPC JSON body 限制
- [x] 前端：Standards.tsx 改用 FormData + fetch 直接上传文件，不经过 base64 编码
- [x] 后端：提高 body-parser 限制到 200mb 作为保底（兼容其他模块）
- [ ] 验证大文件（>50MB）上传成功

## Bug 修复：AI 版式提取处理失败
- [x] 排查原因：LLM API 不支持 file_url 类型，导致 choices[0] 为 undefined
- [x] 修复：改用 pdftoppm 将 PDF/PPTX 转为截图，再以 image_url 方式传给 LLM 分析
- [x] 新增 layoutPacks.retry 接口，失败的版式包可一键重试
- [x] 前端卡片新增「重试」按鈕
- [x] 验证并保存检查点

## Bug 修复：演示文稿选择版式包后未应用到 PPT
- [x] 排查前端 Presentation.tsx 正确传递 layoutPackId
- [x] 排查后端 presentation.generate 正确读取并查询版式包数据
- [x] 根本原因：PPT 生成时配色/字体常量硬编码，未读取版式包的 colorPalette/typography
- [x] 修复：用版式包配色覆盖 C 常量，用版式包字体覆盖 F 常量
- [x] 增强 LLM 提示词，包含具体配色和版式偏好指导
- [x] 验证并保存检查点

## Bug 修复：演示文稿预览显示旧版本
- [ ] 排查 Presentation.tsx 预览区域是否缓存了旧的 slides 数据
- [ ] 修复预览在新生成后正确刷新显示最新版本

## Bug 修复：版式包未出现在出品标准版式标准中
- [ ] 排查 Standards.tsx 版式标准 Tab 是否有展示版式包的逻辑
- [ ] 在演示文稿版式标准 Tab 中集成版式包列表展示和预览功能

## 重设计：演示文稿版式标准页面（版式包并列展示）
- [x] 内置版式作为「内置版式包」与 AI 学习版式包并列展示，统一用版式包卡片形式
- [x] AI 版式包可点开查看每个版式详情（与内置版式 LayoutCard 一致的卡片形式）
- [x] 版式标准 Tab 改为版式包列表视图（选中一个包后展示其版式详情）

## 改进：AI 版式学习提取逻辑（Lovart 方向）
- [x] 均匀采样：整份文件均匀取最多 10 张截图（替代原来只取前 3 页）
- [x] 视觉参考描述：AI 描述「每张截图看起来像什么」，而非只提取参数
- [x] 版式意图映射：每个版式明确映射到内置版式 ID（cover/toc/case_study 等）
- [x] 改进 LLM prompt：加入内置版式 ID 列表和内容建议，输出 mappedLayoutId + visualDescription + contentSuggestion
- [x] 更新 JSON schema：新字段结构，兼容旧数据
- [x] 前端 AiLayoutSlideCard 展示新字段（版式标签 + 视觉描述 + 适用场景）
- [x] 保存检查点
