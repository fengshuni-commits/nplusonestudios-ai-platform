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
          properties: {
            id: { type: "integer" },
            name: { type: "string", description: "项目名称" },
            code: { type: "string", description: "项目编号" },
            description: { type: "string" },
            clientName: { type: "string", description: "客户名称" },
            status: {
              type: "string",
              enum: ["active", "completed", "on_hold", "cancelled"],
              description: "项目状态",
            },
            phase: { type: "string", description: "当前阶段" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Task: {
          type: "object",
          properties: {
            id: { type: "integer" },
            projectId: { type: "integer" },
            title: { type: "string" },
            description: { type: "string" },
            status: {
              type: "string",
              enum: ["backlog", "todo", "in_progress", "review", "done"],
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
            },
            category: {
              type: "string",
              enum: ["design", "construction", "management", "other"],
            },
            assigneeId: { type: "integer", nullable: true },
            startDate: { type: "string", format: "date-time", nullable: true },
            dueDate: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
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
          properties: {
            pageIndex: { type: "integer", description: "页面索引，从 0 开始" },
            imageUrl: { type: "string", description: "页面图片 URL" },
            backgroundColor: { type: "string", description: "背景颜色" },
            imageSize: {
              type: "object",
              properties: {
                width: { type: "integer" },
                height: { type: "integer" },
              },
            },
            textBlocks: {
              type: "array",
              description: "页面中的文字块（可编辑区域）",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  text: { type: "string" },
                  x: { type: "number", description: "X 坐标（像素）" },
                  y: { type: "number", description: "Y 坐标（像素）" },
                  width: { type: "number" },
                  height: { type: "number" },
                  fontSize: { type: "number" },
                  color: { type: "string" },
                },
              },
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
              schema: { type: "string", enum: ["active", "completed", "on_hold", "cancelled"] },
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
                    name: { type: "string", description: "项目名称" },
                    code: { type: "string", description: "项目编号" },
                    description: { type: "string" },
                    clientName: { type: "string", description: "客户名称" },
                    status: {
                      type: "string",
                      enum: ["active", "completed", "on_hold", "cancelled"],
                      default: "active",
                    },
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
                  schema: {
                    type: "object",
                    properties: { data: { $ref: "#/components/schemas/Project" } },
                  },
                },
              },
            },
            "400": { description: "参数错误", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
          operationId: "updateProject",
          tags: ["项目管理"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    code: { type: "string" },
                    description: { type: "string" },
                    clientName: { type: "string" },
                    status: { type: "string", enum: ["active", "completed", "on_hold", "cancelled"] },
                    phase: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "更新成功" },
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
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"], default: "medium" },
                    category: { type: "string", enum: ["design", "construction", "management", "other"], default: "design" },
                    assigneeId: { type: "integer", description: "指派给的用户 ID" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "创建成功",
              content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Task" } } } } },
            },
          },
        },
      },
      "/tasks/{id}": {
        patch: {
          summary: "更新任务",
          operationId: "updateTask",
          tags: ["任务管理"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    status: { type: "string", enum: ["backlog", "todo", "in_progress", "review", "done"] },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                    category: { type: "string", enum: ["design", "construction", "management", "other"] },
                    assigneeId: { type: "integer", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "更新成功" },
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
                      description: "参考素材图片 URL 列表（可选）",
                    },
                    stylePrompt: {
                      type: "string",
                      description: "版式风格描述（可选），如「极简主义，黑白灰配色」",
                    },
                    imageToolId: {
                      type: "integer",
                      description: "指定使用的图像生成 AI 工具 ID（可选）",
                    },
                  },
                },
                example: {
                  docType: "brand_manual",
                  contentText: "N+1 STUDIOS 品牌介绍，专注建筑设计，团队6人",
                  pageCount: 3,
                  aspectRatio: "A4",
                  stylePrompt: "专业、简洁、现代感",
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
                          id: { type: "integer", description: "任务 ID" },
                          status: { type: "string", example: "pending" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "参数错误", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
                        properties: {
                          id: { type: "integer" },
                          status: {
                            type: "string",
                            enum: ["pending", "processing", "done", "failed"],
                            description: "pending=等待中，processing=生成中，done=已完成，failed=失败",
                          },
                          docType: { type: "string" },
                          pageCount: { type: "integer" },
                          aspectRatio: { type: "string" },
                          title: { type: "string" },
                          errorMessage: { type: "string", description: "失败原因（status=failed 时）" },
                          createdAt: { type: "string", format: "date-time" },
                          pages: {
                            type: "array",
                            description: "各页内容（status=done 时返回）",
                            items: { $ref: "#/components/schemas/GraphicLayoutPage" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "404": { description: "任务不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
              description: "导出成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          url: { type: "string", description: "PDF 下载 URL" },
                          filename: { type: "string", description: "建议文件名" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "任务未完成或无页面数据", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "任务不存在", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
      { name: "工作台", description: "工作台统计数据" },
      { name: "素材库", description: "设计素材管理" },
      { name: "设计规范", description: "设计规范文档" },
    ],
  };
}
