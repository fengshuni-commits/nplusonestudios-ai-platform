/**
 * OpenAPI 3.0 specification for N+1 STUDIOS AI Platform REST API
 * Served at GET /api/openapi.json
 * Compatible with OpenClaw, Swagger UI, and other OpenAPI-compliant tools
 */

export function getOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "N+1 STUDIOS AI 工作平台 API",
      description:
        "N+1 STUDIOS AI 工作平台的 REST API，支持项目管理、任务管理、AI 辅助设计等功能。\n\n" +
        "## 认证方式\n\n" +
        "所有接口需要在请求头中携带 Bearer Token：\n\n" +
        "```\nAuthorization: Bearer sk_your_api_key\n```\n\n" +
        "API Key 可在平台「设置 → API 管理」页面生成。",
      version: "1.0.0",
      contact: {
        name: "N+1 STUDIOS",
        url: "https://nplusonestudios.com",
      },
    },
    servers: [
      {
        url: `${baseUrl}/api/v1`,
        description: "生产环境",
      },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key (sk_...)",
          description: "在平台「设置 → API 管理」页面生成 API Key，格式为 sk_xxx",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "错误描述" },
            code: { type: "string", description: "错误代码" },
          },
          required: ["error", "code"],
        },
        Project: {
          type: "object",
          description: "项目",
          properties: {
            id: { type: "integer", description: "项目 ID" },
            name: { type: "string", description: "项目名称" },
            code: { type: "string", nullable: true, description: "项目编号" },
            description: { type: "string", nullable: true, description: "项目描述" },
            clientName: { type: "string", nullable: true, description: "客户名称" },
            status: {
              type: "string",
              enum: ["planning", "design", "construction", "completed", "archived"],
              description: "项目状态：planning=策划中、design=设计中、construction=施工中、completed=已完成、archived=已归档",
              example: "design",
            },
            phase: {
              type: "string",
              enum: ["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"],
              description: "当前阶段：concept=概念设计、schematic=方案设计、development=深化设计、documentation=施工图、bidding=招标、construction=施工、closeout=结算",
              example: "schematic",
            },
            companyProfile: { type: "string", nullable: true, description: "企业简介" },
            businessGoal: { type: "string", nullable: true, description: "业务目标" },
            clientProfile: { type: "string", nullable: true, description: "客户画像" },
            projectOverview: { type: "string", nullable: true, description: "项目概述" },
            coverImage: { type: "string", nullable: true, description: "封面图片 URL" },
            startDate: { type: "string", format: "date-time", nullable: true, description: "项目开始日期" },
            endDate: { type: "string", format: "date-time", nullable: true, description: "项目结束日期" },
            createdBy: { type: "integer", nullable: true, description: "创建人用户 ID" },
            createdAt: { type: "string", format: "date-time", description: "创建时间" },
            updatedAt: { type: "string", format: "date-time", description: "最后更新时间" },
          },
        },
        Task: {
          type: "object",
          description: "项目任务",
          properties: {
            id: { type: "integer", description: "任务 ID" },
            projectId: { type: "integer", description: "所属项目 ID" },
            title: { type: "string", description: "任务标题" },
            description: { type: "string", nullable: true, description: "任务详细描述" },
            status: {
              type: "string",
              enum: ["backlog", "todo", "in_progress", "review", "done"],
              description: "任务状态：backlog=待办、todo=计划中、in_progress=进行中、review=审核中、done=已完成",
              example: "in_progress",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
              description: "优先级：low=低、medium=中、high=高、urgent=紧急",
              example: "high",
            },
            category: {
              type: "string",
              enum: ["design", "construction", "management", "other"],
              description: "任务类别：design=设计、construction=施工、management=管理、other=其他",
              example: "design",
            },
            assigneeId: { type: "integer", nullable: true, description: "指派给的用户 ID" },
            startDate: { type: "string", format: "date-time", nullable: true, description: "开始日期（ISO 8601 格式）", example: "2026-04-02T00:00:00.000Z" },
            dueDate: { type: "string", format: "date-time", nullable: true, description: "截止日期（ISO 8601 格式）", example: "2026-04-10T00:00:00.000Z" },
            progress: { type: "integer", minimum: 0, maximum: 100, description: "任务进度百分比（0-100）", example: 60 },
            progressNote: { type: "string", nullable: true, description: "进度备注" },
            parentId: { type: "integer", nullable: true, description: "父任务 ID（用于子任务）" },
            reviewerId: { type: "integer", nullable: true, description: "审核人用户 ID" },
            sortOrder: { type: "integer", description: "排序顺序（数字越小越靠前）", example: 0 },
            approval: { type: "boolean", description: "是否需要审批", example: false },
            completedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "任务完成时间（status 变为 done 时自动记录，status 改回时清除）",
              example: "2026-04-12T09:30:00.000Z",
            },
            createdBy: { type: "integer", nullable: true, description: "创建人用户 ID" },
            createdAt: { type: "string", format: "date-time", description: "创建时间" },
            updatedAt: { type: "string", format: "date-time", description: "最后更新时间" },
          },
        },
        Document: {
          type: "object",
          properties: {
            id: { type: "integer" },
            projectId: { type: "integer", nullable: true },
            title: { type: "string" },
            content: { type: "string" },
            type: {
              type: "string",
              enum: ["brief", "report", "minutes", "specification", "checklist", "schedule", "other"],
            },
            fileUrl: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        GraphicLayoutPage: {
          type: "object",
          description: "图文排版的单页内容，包含整页图片和可编辑文字块数据",
          properties: {
            pageIndex: { type: "integer", description: "页面索引，从 0 开始" },
            imageUrl: {
              type: "string",
              format: "uri",
              description: "页面整体图片 URL（S3 公开链接，包含背景、图形、文字的完整渲染图）",
              example: "https://cdn.example.com/graphic-layout/page-0.png",
            },
            backgroundColor: {
              type: "string",
              description: "页面背景颜色（CSS 颜色值）",
              example: "#F5F0EB",
            },
            imageSize: {
              type: "object",
              description: "页面图片实际像素尺寸",
              properties: {
                width: { type: "integer", example: 1080 },
                height: { type: "integer", example: 1440 },
              },
            },
            textBlocks: {
              type: "array",
              description: "页面中的可编辑文字块列表。图片本身不包含文字（为避免 AI 图像生成模型对中文的渲染不准确问题），调用方需将 textBlocks 按坐标叠加在图片上渲染。每个文字块包含坐标、尺寸、字体、颜色、对齐等属性，可通过 inpainting 接口修改文案后重绘该区域。",
              items: {
                type: "object",
                required: ["id", "text", "x", "y", "width", "height"],
                properties: {
                  id: {
                    type: "string",
                    description: "文字块唯一标识符",
                    example: "tb_0_title",
                  },
                  text: {
                    type: "string",
                    description: "文字内容",
                    example: "N+1 STUDIOS",
                  },
                  x: {
                    type: "number",
                    description: "文字块左上角 X 坐标（相对于页面图片，单位：像素）",
                    example: 80,
                  },
                  y: {
                    type: "number",
                    description: "文字块左上角 Y 坐标（相对于页面图片，单位：像素）",
                    example: 120,
                  },
                  width: {
                    type: "number",
                    description: "文字块宽度（像素）",
                    example: 920,
                  },
                  height: {
                    type: "number",
                    description: "文字块高度（像素）",
                    example: 80,
                  },
                  fontSize: {
                    type: "number",
                    description: "字体大小（像素）",
                    example: 48,
                  },
                  color: {
                    type: "string",
                    description: "文字颜色（CSS 颜色值）",
                    example: "#1A1A1A",
                  },
                  fontFamily: {
                    type: "string",
                    description: "字体族名称",
                    example: "Noto Sans SC",
                  },
                  fontWeight: {
                    type: "string",
                    description: "字重",
                    enum: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
                    example: "700",
                  },
                  align: {
                    type: "string",
                    description: "文字对齐方式",
                    enum: ["left", "center", "right"],
                    example: "left",
                  },
                  lineHeight: {
                    type: "number",
                    description: "行高倍数",
                    example: 1.4,
                  },
                  role: {
                    type: "string",
                    description: "文字块语义角色（辅助理解内容结构）",
                    enum: ["title", "subtitle", "body", "caption", "label", "other"],
                    example: "title",
                  },
                },
              },
              example: [
                {
                  id: "tb_0_title",
                  text: "N+1 STUDIOS",
                  x: 80, y: 120, width: 920, height: 80,
                  fontSize: 48, color: "#1A1A1A",
                  fontFamily: "Noto Sans SC", fontWeight: "700",
                  align: "left", lineHeight: 1.2, role: "title",
                },
                {
                  id: "tb_0_body",
                  text: "专注于科技制造业办公空间设计的建筑事务所",
                  x: 80, y: 240, width: 920, height: 120,
                  fontSize: 24, color: "#4A4A4A",
                  fontFamily: "Noto Sans SC", fontWeight: "400",
                  align: "left", lineHeight: 1.6, role: "body",
                },
              ],
            },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "健康检查",
          description: "检查 API 服务是否正常运行",
          operationId: "healthCheck",
          tags: ["系统"],
          security: [],
          responses: {
            "200": {
              description: "服务正常",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      version: { type: "string", example: "1.0.0" },
                      platform: { type: "string", example: "N+1 STUDIOS AI Platform" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/projects": {
        get: {
          summary: "获取项目列表",
          operationId: "listProjects",
          tags: ["项目管理"],
          parameters: [
            {
              name: "search",
              in: "query",
              schema: { type: "string" },
              description: "搜索关键词（项目名称或编号）",
            },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["planning", "design", "construction", "completed", "archived"] },
              description: "按状态筛选",
            },
          ],
          responses: {
            "200": {
              description: "项目列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Project" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "创建项目",
          operationId: "createProject",
          tags: ["项目管理"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string", description: "项目名称", example: "某科技公司展厅设计" },
                    code: { type: "string", description: "项目编号", example: "N25-001" },
                    description: { type: "string", description: "项目描述", example: "某科技公司展厅空间设计项目，包含展示区和接待区" },
                    clientName: { type: "string", description: "客户名称", example: "某科技有限公司" },
                    status: {
                      type: "string",
                      enum: ["planning", "design", "construction", "completed", "archived"],
                      default: "planning",
                      description: "项目状态：planning=策划中（默认）、design=设计中、construction=施工中、completed=已完成、archived=已归档",
                    },
                    phase: {
                      type: "string",
                      enum: ["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"],
                      default: "concept",
                      description: "当前阶段：concept=概念设计（默认）、schematic=方案设计、development=深化设计、documentation=施工图、bidding=招标、construction=施工、closeout=结算",
                    },
                    startDate: { type: "string", format: "date", nullable: true, description: "项目开始日期（YYYY-MM-DD）", example: "2026-04-01" },
                    endDate: { type: "string", format: "date", nullable: true, description: "项目结束日期（YYYY-MM-DD）", example: "2026-10-31" },
                  },
                },
                example: {
                  name: "某科技公司展厅设计",
                  code: "N26-003",
                  description: "某科技公司展厅空间设计项目",
                  clientName: "某科技有限公司",
                  status: "design",
                  phase: "schematic",
                  startDate: "2026-04-01",
                  endDate: "2026-10-31",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "创建成功",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Project" } } },
                  example: {
                    data: {
                      id: 12,
                      name: "某科技公司展厅设计",
                      code: "N26-003",
                      description: "某科技公司展厅空间设计项目",
                      clientName: "某科技有限公司",
                      status: "design",
                      phase: "schematic",
                      startDate: "2026-04-01T00:00:00.000Z",
                      endDate: "2026-10-31T00:00:00.000Z",
                      createdAt: "2026-04-02T08:00:00.000Z",
                      updatedAt: "2026-04-02T08:00:00.000Z",
                    },
                  },
                },
              },
            },
            "400": {
              description: "参数错误（如果传入了不在枚举范围内的 status 或 phase，会返回详细错误说明）",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                  example: { error: "Invalid status \"active\". Must be one of: planning, design, construction, completed, archived.", code: "VALIDATION_ERROR" },
                },
              },
            },
          },
        },
      },
      "/projects/{id}": {
        get: {
          summary: "获取项目详情",
          operationId: "getProject",
          tags: ["项目管理"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "项目详情",
              content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Project" } } } } },
            },
            "404": { description: "项目不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
        patch: {
          summary: "更新项目",
          description: "更新项目的任意字段。所有字段均为可选，只更新提供的字段。",
          operationId: "updateProject",
          tags: ["项目管理"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, description: "项目 ID" }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "项目名称" },
                    code: { type: "string", description: "项目编号" },
                    description: { type: "string", description: "项目描述" },
                    clientName: { type: "string", description: "客户名称" },
                    status: {
                      type: "string",
                      enum: ["planning", "design", "construction", "completed", "archived"],
                      description: "项目状态：planning=策划中、design=设计中、construction=施工中、completed=已完成、archived=已归档",
                    },
                    phase: {
                      type: "string",
                      enum: ["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"],
                      description: "当前阶段：concept=概念设计、schematic=方案设计、development=深化设计、documentation=施工图、bidding=招标、construction=施工、closeout=结算",
                    },
                    startDate: { type: "string", format: "date", nullable: true, description: "项目开始日期（YYYY-MM-DD）" },
                    endDate: { type: "string", format: "date", nullable: true, description: "项目结束日期（YYYY-MM-DD）" },
                  },
                },
                examples: {
                  updateStatus: {
                    summary: "推进项目状态",
                    value: { status: "construction", phase: "construction" },
                  },
                  updatePhase: {
                    summary: "更新设计阶段",
                    value: { phase: "development" },
                  },
                  updateDates: {
                    summary: "调整项目时间",
                    value: { startDate: "2026-05-01", endDate: "2026-12-31" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "更新成功，返回更新后的完整项目对象",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Project" } } },
                },
              },
            },
            "400": {
              description: "参数错误（枚举值不合法）",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                  example: { error: "Invalid status \"active\". Must be one of: planning, design, construction, completed, archived.", code: "VALIDATION_ERROR" },
                },
              },
            },
            "404": { description: "项目不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/projects/{projectId}/tasks": {
        get: {
          summary: "获取项目任务列表",
          operationId: "listProjectTasks",
          tags: ["任务管理"],
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "任务列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Task" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "创建任务",
          operationId: "createTask",
          tags: ["任务管理"],
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" }, description: "项目 ID" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string", description: "任务标题", example: "完成深化设计图纸" },
                    description: { type: "string", description: "任务详细描述", example: "完成展厅 A 区的深化设计图纸，包括平面图、立面图和节点详图" },
                    status: {
                      type: "string",
                      enum: ["backlog", "todo", "in_progress", "review", "done"],
                      default: "todo",
                      description: "初始状态，默认为 todo",
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "medium", "high", "urgent"],
                      default: "medium",
                      description: "优先级：low=低、medium=中（默认）、high=高、urgent=紧急",
                    },
                    category: {
                      type: "string",
                      enum: ["design", "construction", "management", "other"],
                      default: "design",
                      description: "任务类别：design=设计（默认）、construction=施工、management=管理、other=其他",
                    },
                    assigneeId: { type: "integer", nullable: true, description: "指派给的用户 ID" },
                    startDate: { type: "string", format: "date", nullable: true, description: "开始日期（YYYY-MM-DD 格式）", example: "2026-04-02" },
                    dueDate: { type: "string", format: "date", nullable: true, description: "截止日期（YYYY-MM-DD 格式）", example: "2026-04-10" },
                    progress: { type: "integer", minimum: 0, maximum: 100, default: 0, description: "初始进度百分比（0-100）" },
                    parentId: { type: "integer", nullable: true, description: "父任务 ID（创建子任务时使用）" },
                    reviewerId: { type: "integer", nullable: true, description: "审核人用户 ID" },
                    approval: { type: "boolean", default: false, description: "是否需要审批" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "创建成功",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Task" } } },
                  example: {
                    data: {
                      id: 42,
                      projectId: 5,
                      title: "完成深化设计图纸",
                      description: "完成展厅 A 区的深化设计图纸，包括平面图、立面图和节点详图",
                      status: "todo",
                      priority: "high",
                      category: "design",
                      assigneeId: 3,
                      startDate: "2026-04-02T00:00:00.000Z",
                      dueDate: "2026-04-10T00:00:00.000Z",
                      progress: 0,
                      progressNote: null,
                      parentId: null,
                      reviewerId: null,
                      sortOrder: 0,
                      approval: false,
                      createdBy: 1,
                      createdAt: "2026-04-02T06:30:00.000Z",
                      updatedAt: "2026-04-02T06:30:00.000Z",
                    },
                  },
                },
              },
            },
            "400": {
              description: "参数错误",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                  example: { error: "Task title is required", code: "VALIDATION_ERROR" },
                },
              },
            },
          },
        },
      },
      "/tasks/{id}": {
        patch: {
          summary: "更新任务",
          description: "更新任务的任意字段。所有字段均为可选，只更新提供的字段。",
          operationId: "updateTask",
          tags: ["任务管理"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, description: "任务 ID" }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "任务标题" },
                    description: { type: "string", nullable: true, description: "任务描述" },
                    status: {
                      type: "string",
                      enum: ["backlog", "todo", "in_progress", "review", "done"],
                      description: "任务状态",
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "medium", "high", "urgent"],
                      description: "优先级",
                    },
                    category: {
                      type: "string",
                      enum: ["design", "construction", "management", "other"],
                      description: "任务类别",
                    },
                    assigneeId: { type: "integer", nullable: true, description: "指派给的用户 ID" },
                    startDate: { type: "string", format: "date", nullable: true, description: "开始日期（YYYY-MM-DD 格式）" },
                    dueDate: { type: "string", format: "date", nullable: true, description: "截止日期（YYYY-MM-DD 格式）" },
                    progress: { type: "integer", minimum: 0, maximum: 100, description: "任务进度百分比（0-100）" },
                    progressNote: { type: "string", nullable: true, description: "进度备注" },
                    parentId: { type: "integer", nullable: true, description: "父任务 ID" },
                    reviewerId: { type: "integer", nullable: true, description: "审核人用户 ID" },
                    sortOrder: { type: "integer", description: "排序顺序" },
                    approval: { type: "boolean", description: "是否需要审批" },
                  },
                },
                examples: {
                  updateStatus: {
                    summary: "更新任务状态",
                    value: { status: "in_progress" },
                  },
                  updateProgress: {
                    summary: "更新任务进度",
                    value: { progress: 75, progressNote: "已完成平面图和立面图，节点详图进行中" },
                  },
                  updateAssignee: {
                    summary: "重新指派任务",
                    value: { assigneeId: 7, status: "todo" },
                  },
                  updateDates: {
                    summary: "调整任务时间",
                    value: { startDate: "2026-04-05", dueDate: "2026-04-15" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "更新成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          success: { type: "boolean" },
                        },
                      },
                    },
                  },
                  example: { data: { id: 42, success: true } },
                },
              },
            },
            "404": {
              description: "任务不存在",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                  example: { error: "Task not found", code: "NOT_FOUND" },
                },
              },
            },
          },
        },
      },
      "/projects/{projectId}/documents": {
        get: {
          summary: "获取项目文档列表",
          operationId: "listProjectDocuments",
          tags: ["文档管理"],
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "文档列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Document" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/documents": {
        post: {
          summary: "创建文档",
          operationId: "createDocument",
          tags: ["文档管理"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    projectId: { type: "integer" },
                    title: { type: "string" },
                    content: { type: "string", description: "文档内容（Markdown 格式）" },
                    type: {
                      type: "string",
                      enum: ["brief", "report", "minutes", "specification", "checklist", "schedule", "other"],
                    },
                    category: { type: "string" },
                    fileUrl: { type: "string", description: "附件文件 URL" },
                    fileKey: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "创建成功",
              content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Document" } } } } },
            },
          },
        },
      },
      "/documents/{id}": {
        get: {
          summary: "获取文档详情",
          operationId: "getDocument",
          tags: ["文档管理"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "文档详情",
              content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Document" } } } } },
            },
            "404": { description: "文档不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/ai-tools": {
        get: {
          summary: "获取 AI 工具列表",
          operationId: "listAiTools",
          tags: ["AI 功能"],
          parameters: [
            {
              name: "category",
              in: "query",
              schema: { type: "string" },
              description: "按分类筛选（如 image、video、llm）",
            },
          ],
          responses: {
            "200": {
              description: "AI 工具列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            category: { type: "string" },
                            provider: { type: "string" },
                            model: { type: "string" },
                          },
                        },
                      },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ai/benchmark": {
        post: {
          summary: "生成案例调研报告",
          description: "根据项目信息，AI 自动生成建筑设计对标案例调研报告（Markdown 格式）",
          operationId: "generateBenchmark",
          tags: ["AI 功能"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["projectName", "requirements"],
                  properties: {
                    projectName: { type: "string", description: "项目名称", example: "某科技园区展厅" },
                    projectType: { type: "string", description: "项目类型", example: "展厅设计" },
                    requirements: { type: "string", description: "项目需求描述", example: "科技感强，需要互动展示区域" },
                    referenceCount: { type: "integer", description: "对标案例数量", default: 5, minimum: 1, maximum: 10 },
                    toolId: { type: "integer", description: "指定使用的 AI 工具 ID（可选）" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "生成成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          content: { type: "string", description: "Markdown 格式的调研报告" },
                          generatedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ai/render": {
        post: {
          summary: "提交效果图生成任务",
          description: "异步生成建筑效果图，返回 jobId 后可通过 GET /ai/render/{jobId} 轮询状态",
          operationId: "createRenderJob",
          tags: ["AI 功能"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string", description: "效果图描述", example: "现代简约风格办公空间，大落地窗，白色基调" },
                    style: { type: "string", description: "风格关键词（可选）", example: "photorealistic, 8k" },
                    toolId: { type: "integer", description: "指定使用的 AI 工具 ID（可选）" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "任务已提交",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          jobId: { type: "string", description: "任务 ID，用于轮询状态" },
                          status: { type: "string", example: "pending" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ai/render/{jobId}": {
        get: {
          summary: "查询效果图生成状态",
          description: "轮询效果图生成任务状态。status 为 done 时返回图片 URL",
          operationId: "getRenderJobStatus",
          tags: ["AI 功能"],
          parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "任务状态",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["pending", "processing", "done", "failed"] },
                          url: { type: "string", description: "生成的图片 URL（status=done 时返回）" },
                          prompt: { type: "string" },
                          error: { type: "string", description: "错误信息（status=failed 时返回）" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ai/render/history": {
        get: {
          summary: "获取效果图生成历史",
          operationId: "listRenderHistory",
          tags: ["AI 功能"],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": {
              description: "历史记录",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { type: "object" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ai/meeting-minutes": {
        post: {
          summary: "生成会议纪要",
          description: "根据会议录音转写文本，AI 自动整理生成结构化会议纪要（Markdown 格式）",
          operationId: "generateMeetingMinutes",
          tags: ["AI 功能"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["transcript"],
                  properties: {
                    transcript: { type: "string", description: "会议录音转写文本" },
                    projectName: { type: "string", description: "项目名称（可选）" },
                    meetingDate: { type: "string", description: "会议日期（可选）", example: "2026-04-02" },
                    toolId: { type: "integer", description: "指定使用的 AI 工具 ID（可选）" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "生成成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          content: { type: "string", description: "Markdown 格式的会议纪要" },
                          generatedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/dashboard/stats": {
        get: {
          summary: "获取工作台统计数据",
          operationId: "getDashboardStats",
          tags: ["工作台"],
          responses: {
            "200": {
              description: "统计数据",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          totalProjects: { type: "integer" },
                          activeProjects: { type: "integer" },
                          totalTasks: { type: "integer" },
                          completedTasks: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/assets": {
        get: {
          summary: "获取素材库列表",
          operationId: "listAssets",
          tags: ["素材库"],
          parameters: [
            { name: "category", in: "query", schema: { type: "string" }, description: "素材分类" },
            { name: "search", in: "query", schema: { type: "string" }, description: "搜索关键词" },
          ],
          responses: {
            "200": {
              description: "素材列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { type: "object" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/standards": {
        get: {
          summary: "获取设计规范列表",
          operationId: "listStandards",
          tags: ["设计规范"],
          parameters: [
            { name: "category", in: "query", schema: { type: "string" }, description: "规范分类" },
          ],
          responses: {
            "200": {
              description: "规范列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { type: "object" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/graphic-layout/generate": {
        post: {
          summary: "提交图文排版生成任务",
          description:
            "异步生成图文排版内容（品牌手册、商品详情页、项目图板等）。\n\n" +
            "提交后返回 `id`，通过 `GET /graphic-layout/status/{id}` 轮询状态，完成后获取各页图片 URL 和可编辑文字块数据。",
          operationId: "createGraphicLayoutJob",
          tags: ["图文排版"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["docType", "contentText"],
                  properties: {
                    docType: {
                      type: "string",
                      enum: ["brand_manual", "product_detail", "project_board", "custom"],
                      description: "文档类型：brand_manual（品牌手册）、product_detail（商品详情页）、project_board（项目图板）、custom（自定义）",
                    },
                    contentText: {
                      type: "string",
                      description: "内容描述文本，AI 将根据此内容生成排版",
                      example: "N+1 STUDIOS 是一家专注于科技制造业办公空间设计的建筑事务所，团队6人，主要服务于中国科技制造业企业。",
                    },
                    title: { type: "string", description: "文档标题（可选）" },
                    pageCount: {
                      type: "integer",
                      description: "生成页数（1-10）",
                      default: 1,
                      minimum: 1,
                      maximum: 10,
                    },
                    aspectRatio: {
                      type: "string",
                      enum: ["3:4", "4:3", "1:1", "16:9", "9:16", "A4", "A3"],
                      default: "3:4",
                      description: "页面比例",
                    },
                    assetUrls: {
                      type: "array",
                      items: { type: "string" },
                      description: "参考素材图片 URL 列表（可选，旧格式，所有页共用同一批素材）。推荐使用 assetConfig 新格式。",
                    },
                    assetConfig: {
                      type: "object",
                      description: "素材配置（可选，新格式，与 assetUrls 二选一，assetConfig 优先）。支持两种模式：\n\n**per_page 模式**（按页分配）：\n```json\n{\"mode\":\"per_page\",\"pages\":{\"0\":[\"url1\",\"url2\"],\"1\":[\"url3\"]}}\n```\n\n**by_type 模式**（按类型分配，AI 自动为每页选择最合适的类型）：\n```json\n{\"mode\":\"by_type\",\"groups\":{\"效果图\":[\"url1\",\"url2\"],\"平面图\":[\"url3\"]}}\n```",
                    },
                    stylePrompt: {
                      type: "string",
                      description: "版式风格描述（可选），如「极简主义，黑白灰配色」。与 packId 二选一，packId 优先级更高。",
                    },
                    imageToolId: {
                      type: "integer",
                      description: "指定使用的图像生成 AI 工具 ID（可选，不传则使用平台默认工具）",
                      example: 2,
                    },
                    packId: {
                      type: "integer",
                      description: "指定版式包 ID（可选，版式包包含预设的排版风格和色彩方案，优先级高于 stylePrompt）",
                      example: 5,
                    },
                  },
                },
                examples: {
                  brand_manual: {
                    summary: "品牌手册（3页 A4）",
                    value: {
                      docType: "brand_manual",
                      contentText: "N+1 STUDIOS 是一家专注于科技制造业办公空间设计的建筑事务所，团队6人，主要服务于中国科技制造业企业。核心价值观：专业、创新、以人为本。",
                      title: "N+1 STUDIOS 品牌手册 2024",
                      pageCount: 3,
                      aspectRatio: "A4",
                      stylePrompt: "极简主义，黑白灰配色，大量留白，衬线字体",
                    },
                  },
                  project_board: {
                    summary: "项目图板（1页 3:4）",
                    value: {
                      docType: "project_board",
                      contentText: "某科技园区办公楼室内设计项目，建筑面积 2000㎡，设计主题：工业风与自然融合。",
                      title: "科技园区办公楼室内设计",
                      pageCount: 1,
                      aspectRatio: "3:4",
                      assetUrls: ["https://cdn.example.com/ref-image.jpg"],
                    },
                  },
                  product_detail: {
                    summary: "商品详情页（5页 9:16）",
                    value: {
                      docType: "product_detail",
                      contentText: "N+1 LAB 铝型材模块化书架，采用 6063 铝合金型材，表面阳极氧化处理，支持自由组合。尺寸：W1200×D300×H1800mm。",
                      title: "铝型材模块化书架",
                      pageCount: 5,
                      aspectRatio: "9:16",
                      stylePrompt: "工业感，金属质感，深色背景",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "任务已提交，异步处理中",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          id: { type: "integer", description: "任务 ID，用于轮询状态" },
                          status: {
                            type: "string",
                            enum: ["pending"],
                            description: "初始状态始终为 pending",
                          },
                        },
                      },
                    },
                  },
                  example: {
                    data: { id: 42, status: "pending" },
                  },
                },
              },
            },
            "400": { description: "参数错误（docType 或 contentText 缺失）", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "API Key 无效或未提供", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/graphic-layout/status/{id}": {
        get: {
          summary: "查询图文排版任务状态",
          description:
            "轮询图文排版任务状态。建议每 3 秒轮询一次，`status` 为 `done` 时返回各页图片 URL 和文字块数据。",
          operationId: "getGraphicLayoutStatus",
          tags: ["图文排版"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
              description: "任务 ID（由 POST /graphic-layout/generate 返回）",
            },
          ],
          responses: {
            "200": {
              description: "任务状态",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        required: ["id", "status"],
                        properties: {
                          id: { type: "integer", example: 42 },
                          status: {
                            type: "string",
                            enum: ["pending", "processing", "done", "failed"],
                            description: "pending=等待中，processing=生成中，done=已完成，failed=失败",
                          },
                          docType: {
                            type: "string",
                            enum: ["brand_manual", "product_detail", "project_board", "custom"],
                          },
                          pageCount: { type: "integer", example: 3 },
                          aspectRatio: { type: "string", example: "A4" },
                          title: { type: "string", nullable: true, example: "N+1 STUDIOS 品牌手册 2024" },
                          errorMessage: {
                            type: "string",
                            nullable: true,
                            description: "失败原因（status=failed 时返回）",
                          },
                          createdAt: { type: "string", format: "date-time" },
                          pages: {
                            type: "array",
                            description: "各页内容（status=done 时返回，其他状态返回空数组）",
                            items: { $ref: "#/components/schemas/GraphicLayoutPage" },
                          },
                        },
                      },
                    },
                  },
                  examples: {
                    pending: {
                      summary: "等待中",
                      value: {
                        data: {
                          id: 42, status: "pending",
                          docType: "brand_manual", pageCount: 3, aspectRatio: "A4",
                          title: "N+1 STUDIOS 品牌手册 2024",
                          errorMessage: null, createdAt: "2026-04-02T08:00:00.000Z",
                          pages: [],
                        },
                      },
                    },
                    processing: {
                      summary: "生成中",
                      value: {
                        data: {
                          id: 42, status: "processing",
                          docType: "brand_manual", pageCount: 3, aspectRatio: "A4",
                          title: "N+1 STUDIOS 品牌手册 2024",
                          errorMessage: null, createdAt: "2026-04-02T08:00:00.000Z",
                          pages: [],
                        },
                      },
                    },
                    done: {
                      summary: "已完成（包含页面数据）",
                      value: {
                        data: {
                          id: 42, status: "done",
                          docType: "brand_manual", pageCount: 3, aspectRatio: "A4",
                          title: "N+1 STUDIOS 品牌手册 2024",
                          errorMessage: null, createdAt: "2026-04-02T08:00:00.000Z",
                          pages: [
                            {
                              pageIndex: 0,
                              imageUrl: "https://cdn.example.com/graphic-layout/job42-page0.png",
                              backgroundColor: "#F5F0EB",
                              imageSize: { width: 1080, height: 1440 },
                              textBlocks: [
                                {
                                  id: "tb_0_title",
                                  text: "N+1 STUDIOS",
                                  x: 80, y: 120, width: 920, height: 80,
                                  fontSize: 48, color: "#1A1A1A",
                                  fontFamily: "Noto Sans SC", fontWeight: "700",
                                  align: "left", lineHeight: 1.2, role: "title",
                                },
                                {
                                  id: "tb_0_body",
                                  text: "专注于科技制造业办公空间设计的建筑事务所",
                                  x: 80, y: 240, width: 920, height: 120,
                                  fontSize: 24, color: "#4A4A4A",
                                  fontFamily: "Noto Sans SC", fontWeight: "400",
                                  align: "left", lineHeight: 1.6, role: "body",
                                },
                              ],
                            },
                            {
                              pageIndex: 1,
                              imageUrl: "https://cdn.example.com/graphic-layout/job42-page1.png",
                              backgroundColor: "#1A1A1A",
                              imageSize: { width: 1080, height: 1440 },
                              textBlocks: [
                                {
                                  id: "tb_1_title",
                                  text: "我们的服务",
                                  x: 80, y: 200, width: 920, height: 80,
                                  fontSize: 40, color: "#FFFFFF",
                                  fontFamily: "Noto Sans SC", fontWeight: "600",
                                  align: "center", lineHeight: 1.3, role: "title",
                                },
                              ],
                            },
                          ],
                        },
                      },
                    },
                    failed: {
                      summary: "失败",
                      value: {
                        data: {
                          id: 42, status: "failed",
                          docType: "brand_manual", pageCount: 3, aspectRatio: "A4",
                          title: "N+1 STUDIOS 品牌手册 2024",
                          errorMessage: "图像生成服务超时，请重试",
                          createdAt: "2026-04-02T08:00:00.000Z",
                          pages: [],
                        },
                      },
                    },
                  },
                },
              },
            },
            "404": { description: "任务不存在或无权访问", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/graphic-layout/inpaint/{jobId}/{pageIndex}/{blockId}": {
        post: {
          summary: "局部重绘图文排版文字块",
          description:
            "对已完成的图文排版任务中的某个文字块进行局部重绘（inpainting）。\n\n" +
            "修改文字内容后，AI 将只重绘该文字区域，保留页面其余部分不变。\n\n" +
            "重绘成功后返回新的页面图片 URL，同时更新该文字块的 `text` 内容。\n\n" +
            "图像生成通常需要 10–30 秒。**支持 `callbackUrl`**：传入可选的 `callbackUrl` 参数后，\n" +
            "重绘完成后服务器会主动 POST 结果到该 URL。\n\n" +
            "Webhook payload 格式：`{ event: 'graphic_layout.inpaint.done', jobId, pageIndex, blockId, newText, imageUrl }`",
          operationId: "inpaintTextBlock",
          tags: ["图文排版"],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "integer" }, description: "任务 ID" },
            { name: "pageIndex", in: "path", required: true, schema: { type: "integer" }, description: "页面索引（从 0 开始）" },
            { name: "blockId", in: "path", required: true, schema: { type: "string" }, description: "文字块 ID（如 tb_0_title）" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["newText"],
                  properties: {
                    newText: { type: "string", description: "修改后的文字内容", example: "N+1 STUDIOS 建筑设计" },
                    imageToolId: { type: "integer", nullable: true, description: "指定使用的图像生成 AI 工具 ID（可选）" },
                    callbackUrl: {
                      type: "string",
                      format: "uri",
                      nullable: true,
                      description:
                        "可选。重绘完成后，服务器主动 POST 结果到该 URL（Webhook 回调）。\n" +
                        "payload：`{ event: 'graphic_layout.inpaint.done', jobId, pageIndex, blockId, newText, imageUrl }`\n" +
                        "服务器会以最多 3 次重试（指数退避）确保送达。",
                      example: "https://your-server.com/webhooks/graphic-layout",
                    },
                  },
                },
                example: { newText: "N+1 STUDIOS 建筑设计", callbackUrl: "https://your-server.com/webhooks/graphic-layout" },
              },
            },
          },
          responses: {
            "200": {
              description: "重绘成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          imageUrl: { type: "string", format: "uri", description: "重绘后的新页面图片 URL" },
                          pageIndex: { type: "integer" },
                          blockId: { type: "string" },
                          newText: { type: "string" },
                          actualWidth: { type: "integer", description: "实际图片宽度（像素）。可能与 DB 存储的 imageSize.width 不一致，可用于调试坐标计算问题。" },
                          actualHeight: { type: "integer", description: "实际图片高度（像素）。可能与 DB 存储的 imageSize.height 不一致，可用于调试坐标计算问题。" },
                        },
                      },
                    },
                  },
                  example: {
                    data: {
                      imageUrl: "https://cdn.example.com/graphic-layout/job42-page0-repainted.png",
                      pageIndex: 0,
                      blockId: "tb_0_title",
                      newText: "N+1 STUDIOS 建筑设计",
                      actualWidth: 864,
                      actualHeight: 1184,
                    },
                  },
                },
              },
            },
            "400": { description: "参数错误或任务未完成", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "任务、页面或文字块不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/graphic-layout/export-pdf/{id}": {
        post: {
          summary: "导出图文排版为 PDF",
          description: "将已完成的图文排版任务导出为 PDF 文件，返回下载 URL",
          operationId: "exportGraphicLayoutPdf",
          tags: ["图文排版"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
              description: "任务 ID（status 必须为 done）",
            },
          ],
          responses: {
            "200": {
              description: "导出成功，返回 PDF 下载 URL",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        required: ["url", "filename"],
                        properties: {
                          url: {
                            type: "string",
                            format: "uri",
                            description: "PDF 文件下载 URL（S3 公开链接，有效期 24 小时）",
                            example: "https://cdn.example.com/graphic-layout-pdf/user123/42-1743580800000.pdf",
                          },
                          filename: {
                            type: "string",
                            description: "建议保存的文件名",
                            example: "N+1 STUDIOS 品牌手册 2024.pdf",
                          },
                        },
                      },
                    },
                  },
                  example: {
                    data: {
                      url: "https://cdn.example.com/graphic-layout-pdf/user123/42-1743580800000.pdf",
                      filename: "N+1 STUDIOS 品牌手册 2024.pdf",
                    },
                  },
                },
              },
            },
            "400": {
              description: "任务未完成（status 不为 done）或无页面数据",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "任务不存在或无权访问", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "500": { description: "页面图片获取失败", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/color-plan/generate": {
        post: {
          summary: "生成彩平图",
          description:
            "上传平面图（线稿 / 黑白），可选传入参考风格图，AI 自动生成彩色建筑平面图。\n\n" +
            "该接口为异步任务：提交后返回 `jobId`，需要轮询 `/color-plan/job-status/{jobId}` 直到 `status=done`。\n\n" +
            "支持 `callbackUrl`：任务完成或失败后，服务器主动 POST 结果到该 URL，无需轮询。Webhook payload 格式见下方。",
          operationId: "colorPlanGenerate",
          tags: ["彩平图"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["floorPlanUrl"],
                  properties: {
                    floorPlanUrl: { type: "string", format: "uri", description: "平面图 URL（线稿 / 黑白）", example: "https://cdn.example.com/floor-plan.png" },
                    referenceUrl: { type: "string", format: "uri", nullable: true, description: "参考风格图 URL（可选）" },
                    planStyle: {
                      type: "string",
                      enum: ["colored", "hand_drawn", "line_drawing"],
                      default: "colored",
                      description: "彩平风格：colored=彩色建筑风、hand_drawn=手绘风、line_drawing=线稿风",
                    },
                    style: { type: "string", nullable: true, description: "额外风格描述（如“日式简约”）" },
                    extraPrompt: { type: "string", nullable: true, description: "额外生成指令（自由文本）" },
                    projectId: { type: "integer", nullable: true, description: "关联项目 ID（可选）" },
                    toolId: { type: "integer", nullable: true, description: "指定 AI 工具 ID（不填则使用默认工具）" },
                    floorPlanWidth: { type: "integer", nullable: true, description: "平面图原始宽度（像素），用于保留画面比例" },
                    floorPlanHeight: { type: "integer", nullable: true, description: "平面图原始高度（像素）" },
                    zones: {
                      type: "array",
                      nullable: true,
                      description: "功能分区标注（可选），每个分区包含名称和位置（相对比例 0-1）",
                      items: {
                        type: "object",
                        required: ["name", "x", "y", "w", "h"],
                        properties: {
                          name: { type: "string", example: "客厅" },
                          x: { type: "number", example: 0.1 },
                          y: { type: "number", example: 0.2 },
                          w: { type: "number", example: 0.3 },
                          h: { type: "number", example: 0.25 },
                          color: { type: "string", nullable: true, example: "#E8D5B7" },
                        },
                      },
                    },
                    callbackUrl: {
                      type: "string",
                      format: "uri",
                      nullable: true,
                      description:
                        "Webhook 回调 URL（可选）。任务完成或失败后，服务器主动 POST 以下 JSON 到该 URL，最多重试 3 次（指数退避）：\n" +
                        "- 成功：`{ event: 'color_plan.done', jobId, status: 'done', url: '<图片URL>', historyId: <number> }`\n" +
                        "- 失败：`{ event: 'color_plan.failed', jobId, status: 'failed', error: '<错误信息>' }`",
                      example: "https://your-server.com/webhooks/color-plan",
                    },
                  },
                },
                example: {
                  floorPlanUrl: "https://cdn.example.com/floor-plan.png",
                  planStyle: "colored",
                  projectId: 3,
                  callbackUrl: "https://your-server.com/webhooks/color-plan",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "任务已提交",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { type: "object", properties: { jobId: { type: "string", description: "异步任务 ID，用于轮询状态" } } } },
                  },
                  example: { data: { jobId: "abc123xyz" } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/color-plan/job-status/{jobId}": {
        get: {
          summary: "轮询彩平图生成状态",
          description: "轮询异步彩平图生成任务的状态。建议每 3–5 秒轮询一次，直到 `status=done` 或 `status=failed`。",
          operationId: "colorPlanJobStatus",
          tags: ["彩平图"],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" }, description: "任务 ID（由 /color-plan/generate 返回）" },
          ],
          responses: {
            "200": {
              description: "任务状态",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["processing", "done", "failed", "not_found"], description: "任务状态" },
                          url: { type: "string", format: "uri", nullable: true, description: "生成的彩平图 URL（status=done 时返回）" },
                          historyId: { type: "integer", nullable: true, description: "生成记录 ID（可用于关联项目）" },
                          error: { type: "string", nullable: true, description: "错误信息（status=failed 时返回）" },
                        },
                      },
                    },
                  },
                  example: { data: { status: "done", url: "https://cdn.example.com/color-plan/result.png", historyId: 88 } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/color-plan/inpaint": {
        post: {
          summary: "彩平图局部修改",
          description:
            "对已生成的彩平图进行局部修改（inpainting）。\n\n" +
            "用户在彩平图上用画笔标注需要修改的区域（生成 base64 mask 图），\n" +
            "AI 只重绘标注区域，保留其余部分不变。\n\n" +
            "与 /color-plan/generate 相同，返回 `jobId` 需要轮询 `/color-plan/job-status/{jobId}`。",
          operationId: "colorPlanInpaint",
          tags: ["彩平图"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["imageUrl", "maskImageData", "prompt"],
                  properties: {
                    imageUrl: { type: "string", format: "uri", description: "原始彩平图 URL" },
                    maskImageData: { type: "string", description: "base64 编码的 PNG mask 图（白色=要修改的区域）" },
                    prompt: { type: "string", description: "修改说明（如“将客厅区域改为木地板风格”）", example: "将客厅区域改为木地板风格" },
                    floorPlanUrl: { type: "string", format: "uri", nullable: true, description: "底图 URL（线稿/黑白平面图），作为 AI 参考条件（可选）" },
                    toolId: { type: "integer", nullable: true, description: "指定 AI 工具 ID（可选）" },
                    projectId: { type: "integer", nullable: true, description: "关联项目 ID（可选）" },
                  },
                },
                example: {
                  imageUrl: "https://cdn.example.com/color-plan/result.png",
                  maskImageData: "data:image/png;base64,iVBORw0KGgo...",
                  prompt: "将客厅区域改为木地板风格",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "任务已提交",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { data: { type: "object", properties: { jobId: { type: "string" } } } } },
                  example: { data: { jobId: "def456uvw" } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/analysis-image/submit": {
        post: {
          summary: "提交 AI 分析图生成任务",
          description:
            "上传参考图，AI 生成对应的材质搜配图或软装配图。\n\n" +
            "支持同时提交 1–3 个并行任务（`count` 参数），返回 `jobId`（第一个）和 `jobIds`（全部）。\n\n" +
            "轮询状态使用 `/analysis-image/poll/{jobId}`。\n\n" +
            "支持 `callbackUrl`：每个任务完成或失败后单独回调，无需轮询。Webhook payload 格式见下方。",
          operationId: "analysisImageSubmit",
          tags: ["AI 分析图"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "referenceImageUrl"],
                  properties: {
                    type: {
                      type: "string",
                      enum: ["material", "soft_furnishing"],
                      description: "分析类型：material=材质搜配图、soft_furnishing=软装配图",
                      example: "material",
                    },
                    referenceImageUrl: { type: "string", format: "uri", description: "参考图 URL（已上传到 S3 的公开链接）", example: "https://cdn.example.com/ref.jpg" },
                    referenceImageContentType: { type: "string", nullable: true, description: "参考图 MIME 类型（如 image/jpeg）", example: "image/jpeg" },
                    extraPrompt: { type: "string", nullable: true, description: "额外生成指令（自由文本）" },
                    aspectRatio: { type: "string", nullable: true, description: "图片比例，格式 \"W x H\"，如 \"1024x1024\"" , example: "1024x1024" },
                    count: { type: "integer", minimum: 1, maximum: 3, default: 1, description: "并行生成数量（1–3）" },
                    toolId: { type: "integer", nullable: true, description: "指定 AI 工具 ID（可选）" },
                    callbackUrl: {
                      type: "string",
                      format: "uri",
                      nullable: true,
                      description:
                        "Webhook 回调 URL（可选）。每个任务完成或失败后单独回调，最多重试 3 次（指数退避）：\n" +
                        "- 成功：`{ event: 'analysis_image.done', jobId, status: 'done', url: '<图片URL>', historyId: <number> }`\n" +
                        "- 失败：`{ event: 'analysis_image.failed', jobId, status: 'failed', error: '<错误信息>' }`\n" +
                        "count>1 时每个 jobId 各自回调一次。",
                      example: "https://your-server.com/webhooks/analysis-image",
                    },
                  },
                },
                example: {
                  type: "material",
                  referenceImageUrl: "https://cdn.example.com/ref.jpg",
                  count: 2,
                  callbackUrl: "https://your-server.com/webhooks/analysis-image",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "任务已提交",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          jobId: { type: "string", description: "第一个任务 ID（单个任务时使用）" },
                          jobIds: { type: "array", items: { type: "string" }, description: "全部任务 ID列表（count>1 时使用）" },
                        },
                      },
                    },
                  },
                  example: { data: { jobId: "job001", jobIds: ["job001", "job002"] } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/analysis-image/poll/{jobId}": {
        get: {
          summary: "轮询 AI 分析图任务状态",
          description: "轮询单个分析图任务的状态。建议每 3–5 秒轮询一次。",
          operationId: "analysisImagePollJob",
          tags: ["AI 分析图"],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" }, description: "任务 ID" },
          ],
          responses: {
            "200": {
              description: "任务状态",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["pending", "processing", "done", "failed", "not_found"] },
                          url: { type: "string", format: "uri", nullable: true, description: "生成的分析图 URL（status=done 时返回）" },
                          historyId: { type: "integer", nullable: true },
                          error: { type: "string", nullable: true },
                        },
                      },
                    },
                  },
                  example: { data: { status: "done", url: "https://cdn.example.com/analysis/result.png", historyId: 99 } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "403": { description: "无权访问该任务", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "任务不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/analysis-image/poll-jobs": {
        post: {
          summary: "批量轮询 AI 分析图任务状态",
          description: "一次查询多个分析图任务的状态（count>1 时使用）。",
          operationId: "analysisImagePollJobs",
          tags: ["AI 分析图"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jobIds"],
                  properties: {
                    jobIds: { type: "array", items: { type: "string" }, description: "任务 ID 列表" },
                  },
                },
                example: { jobIds: ["job001", "job002"] },
              },
            },
          },
          responses: {
            "200": {
              description: "各任务状态列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            jobId: { type: "string" },
                            status: { type: "string", enum: ["pending", "processing", "done", "failed", "not_found"] },
                            url: { type: "string", format: "uri", nullable: true },
                            historyId: { type: "integer", nullable: true },
                            error: { type: "string", nullable: true },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    data: [
                      { jobId: "job001", status: "done", url: "https://cdn.example.com/analysis/r1.png", historyId: 99 },
                      { jobId: "job002", status: "processing" },
                    ],
                  },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/video/generate": {
        post: {
          summary: "生成视频",
          description:
            "提交视频生成任务，支持文生视频（text-to-video）和图生视频（image-to-video）两种模式。\n\n" +
            "提交后返回 `taskId`，需要轮询 `/video/status/{taskId}` 直到 `status=completed`。\n\n" +
            "视频生成通常需要 30–120 秒，请实现合理的轮询间隔（建议 5–10 秒）。\n\n" +
            "**获取 toolId**：调用 `GET /api/v1/ai-tools` 获取平台上配置的 AI 工具列表，从返回结果中找到支持视频生成能力（`capabilities` 包含 `video`）的工具，取其 `id` 字段作为 `toolId`。" +
            "如果不确定使用哪个工具，可先调用 `GET /api/v1/ai-tools` 查看 `isDefault=true` 的工具。\n\n" +
            "**支持 `callbackUrl`**：传入可选的 `callbackUrl` 参数后，任务完成或失败时服务器会主动 POST 结果到该 URL，无需持续轮询。\n\n" +
            "Webhook payload 格式：\n" +
            "- 成功：`{ event: 'video.done', taskId, status: 'completed', videoUrl }` \n" +
            "- 失败：`{ event: 'video.failed', taskId, status: 'failed', error }` \n\n" +
            "服务器会在任务完成后立即回调，若任务处于 pending/processing 状态则后台轮询（最长 5 分钟），完成后自动触发回调。",
          operationId: "videoGenerate",
          tags: ["视频生成"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["mode", "prompt", "duration", "toolId"],
                  properties: {
                    mode: {
                      type: "string",
                      enum: ["text-to-video", "image-to-video"],
                      description: "生成模式：text-to-video=文生视频、image-to-video=图生视频",
                      example: "image-to-video",
                    },
                    prompt: { type: "string", minLength: 1, description: "视频内容描述", example: "建筑内部空间漫游，光线流动，气幕宁静" },
                    duration: { type: "integer", minimum: 1, maximum: 8, description: "视频时长（秒），范围 1–8 秒", example: 5 },
                    toolId: {
                      type: "integer",
                      description:
                        "指定视频生成 AI 工具 ID（必填）。" +
                        "通过 `GET /api/v1/ai-tools` 获取工具列表，选择 capabilities 包含 video 的工具 id。" +
                        "示例：先调用 GET /api/v1/ai-tools，找到 isDefault=true 或 capabilities 含 video 的条目，取其 id 填入此字段。",
                      example: 2,
                    },
                    inputImageUrl: { type: "string", format: "uri", nullable: true, description: "输入图片 URL（image-to-video 模式必填）" },
                    callbackUrl: {
                      type: "string",
                      format: "uri",
                      nullable: true,
                      description:
                        "可选。任务完成或失败后，服务器主动 POST 结果到该 URL（Webhook 回调），无需轮询。\n" +
                        "成功 payload：`{ event: 'video.done', taskId, status: 'completed', videoUrl }`\n" +
                        "失败 payload：`{ event: 'video.failed', taskId, status: 'failed', error }`\n" +
                        "服务器会以最多 3 次重试（指数退避）确保送达。",
                      example: "https://your-server.com/webhooks/video",
                    },
                  },
                },
                example: {
                  mode: "image-to-video",
                  prompt: "建筑内部空间漫游，光线流动，气幕安静",
                  duration: 5,
                  toolId: 2,
                  inputImageUrl: "https://cdn.example.com/render.jpg",
                  callbackUrl: "https://your-server.com/webhooks/video",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "任务已提交",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          taskId: { type: "string", description: "视频任务 ID，用于轮询状态" },
                          status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
                          videoUrl: { type: "string", format: "uri", nullable: true, description: "视频 URL（如果已完成）" },
                          errorMessage: { type: "string", nullable: true },
                        },
                      },
                    },
                  },
                  example: { data: { taskId: "vid_abc123", status: "pending", videoUrl: null } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "工具不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/video/status/{taskId}": {
        get: {
          summary: "轮询视频生成状态",
          description: "轮询视频生成任务的状态。建议每 5–10 秒轮询一次，直到 `status=completed` 或 `status=failed`。",
          operationId: "videoGetStatus",
          tags: ["视频生成"],
          parameters: [
            { name: "taskId", in: "path", required: true, schema: { type: "string" }, description: "视频任务 ID（由 /video/generate 返回）" },
          ],
          responses: {
            "200": {
              description: "任务状态",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
                          videoUrl: { type: "string", format: "uri", nullable: true, description: "视频永久 URL（S3 公开链接，status=completed 时返回）" },
                          errorMessage: { type: "string", nullable: true },
                          progress: { type: "integer", minimum: 0, maximum: 100, description: "生成进度（%）" },
                          recordId: { type: "integer", description: "数据库记录 ID" },
                        },
                      },
                    },
                  },
                  example: { data: { status: "completed", videoUrl: "https://cdn.example.com/video/result.mp4", progress: 100, recordId: 12 } },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "任务不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/video/list": {
        get: {
          summary: "获取视频生成历史",
          description: "获取当前用户的视频生成历史列表。",
          operationId: "videoList",
          tags: ["视频生成"],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 }, description: "返回条数限制" },
            { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 }, description: "跳过条数偏移量" },
          ],
          responses: {
            "200": {
              description: "视频历史列表",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            mode: { type: "string", enum: ["text-to-video", "image-to-video"] },
                            prompt: { type: "string" },
                            duration: { type: "integer" },
                            status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
                            outputVideoUrl: { type: "string", format: "uri", nullable: true },
                            inputImageUrl: { type: "string", format: "uri", nullable: true },
                            taskId: { type: "string", nullable: true },
                            createdAt: { type: "string", format: "date-time" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "API Key 无效", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
    },
    tags: [
      { name: "系统", description: "系统状态检查" },
      { name: "项目管理", description: "项目的增删改查" },
      { name: "任务管理", description: "项目任务的管理" },
      { name: "文档管理", description: "项目文档的管理" },
      { name: "AI 功能", description: "AI 辅助设计功能（案例调研、效果图生成、会议纪要）" },
      { name: "图文排版", description: "AI 图文排版生成（品牌手册、详情页、项目图板）" },
      { name: "彩平图", description: "AI 彩色建筑平面图生成与局部修改" },
      { name: "AI 分析图", description: "AI 材质搜配图 / 软装配图生成" },
      { name: "视频生成", description: "AI 视频生成（文生视频 / 图生视频）" },
      { name: "工作台", description: "工作台统计数据" },
      { name: "素材库", description: "设计素材管理" },
      { name: "设计规范", description: "设计规范文档" },
    ],
  };
}
