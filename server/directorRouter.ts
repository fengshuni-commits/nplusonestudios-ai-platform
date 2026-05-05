import { router, protectedProcedure } from "./_core/trpc";
import { generateImageWithTool } from "./_core/generateImageWithTool";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { invokeLLMWithUserTool } from "./_core/llm";
import type { Message, Tool, ToolCall } from "./_core/llm";
import { getDb } from "./db";
import { directorConversations, directorWorkspaceItems } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const DIRECTOR_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_my_projects",
      description: "获取当前用户参与的所有项目列表，包括项目名称、状态、阶段、甲方等信息",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "按状态筛选：planning（规划中）| design（设计中）| construction（施工中）| paused（暂停）| completed（已完成）| archived（已归档）。不传则返回所有",
            enum: ["planning", "design", "construction", "paused", "completed", "archived"],
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_tasks",
      description: "获取分配给当前用户的任务列表，包括任务标题、状态、截止日期、所属项目等",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_detail",
      description: "获取指定项目的详细信息，包括项目概况、成员列表、任务列表",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "项目 ID",
          },
        },
        required: ["project_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_members",
      description: "获取工作室所有成员列表，包括姓名、角色、部门等信息",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "直接生成 AI 效果图/渲染图。当用户描述一个空间、场景或要求生成效果图时，直接调用此工具生成，无需跳转页面。支持纯文字描述生成，也支持基于参考图生成（图生图）。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "详细的图像描述，包括空间类型、风格、材质、光线、氛围等。请用英文或中文描述，越详细越好。",
          },
          reference_image_url: {
            type: "string",
            description: "可选。参考底图的 URL（用户上传的图片）。提供后将基于此图进行风格迁移或空间改造。",
          },
          title: {
            type: "string",
            description: "可选。生成图片的标题，用于在工作区显示。",
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_document",
      description: "直接生成文字文档，包括设计任务书、案例调研报告、小红书/公众号/Instagram 内容文案等。生成的文档将在对话消息中显示，用户可以直接下载。",
      parameters: {
        type: "object",
        properties: {
          doc_type: {
            type: "string",
            description: "文档类型",
            enum: ["design_brief", "case_study", "xiaohongshu", "wechat_article", "instagram", "meeting_summary", "project_report"],
          },
          title: {
            type: "string",
            description: "文档标题",
          },
          requirements: {
            type: "string",
            description: "用户的具体要求和背景信息，越详细越好。包括项目名称、客户、设计风格、目标受众等。",
          },
          project_id: {
            type: "number",
            description: "可选。关联的项目 ID，提供后将自动带入项目信息。",
          },
        },
        required: ["doc_type", "title", "requirements"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_module",
      description: "引导用户跳转到指定功能模块页面。仅当用户需要进行以下操作时才跳转：上传底图做 AI 平面图、录制会议纪要、制作演示文稿。注意：效果图、设计任务书、案例调研、内容创作文案请直接使用 generate_image 或 generate_document 工具完成，不要跳转。",
      parameters: {
        type: "object",
        properties: {
          module: {
            type: "string",
            description: "功能模块名称（注意：效果图生成请使用 generate_image 工具，不要选择 ai_effect）",
            enum: [
              "meeting_minutes",
              "ai_floor_plan",
              "presentation",
              "project_management",
              "construction_management",
            ],
          },
          project_id: {
            type: "number",
            description: "可选，跳转时预选的项目 ID",
          },
        },
        required: ["module"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────────────────

const MODULE_PATHS: Record<string, string> = {
  design_brief: "/design-brief",
  meeting_minutes: "/meeting-minutes",
  ai_effect: "/design-tools",
  ai_floor_plan: "/design-tools",
  case_study: "/case-study",
  presentation: "/presentation",
  content_creation: "/content-creation",
  project_management: "/projects",
  construction_management: "/construction",
};

const MODULE_NAMES: Record<string, string> = {
  design_brief: "设计任务书",
  meeting_minutes: "会议纪要",
  ai_effect: "AI 效果图",
  ai_floor_plan: "AI 平面图",
  case_study: "案例调研",
  presentation: "演示文稿",
  content_creation: "内容创作",
  project_management: "项目管理",
  construction_management: "施工管理",
};

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: number
): Promise<string> {
  try {
    if (toolName === "get_my_projects") {
      const allProjects = await db.listProjects(
        args.status ? { status: args.status as string } : undefined
      );
      // Filter to projects where the user is a member (or is admin/owner)
      const userInfo = await db.getUserById(userId);
      let userProjects = allProjects;
      if (userInfo?.role !== "admin") {
        const dbConn = await getDb();
        if (dbConn) {
          const memberRows = await dbConn
            .select({ projectId: directorConversations.userId })
            .from(directorConversations)
            .where(eq(directorConversations.userId, userId))
            .limit(1);
          // Use a simpler approach: get project IDs where user is a member
          const { projectMembers } = await import("../drizzle/schema");
          const memberProjects = await dbConn
            .select({ projectId: projectMembers.projectId })
            .from(projectMembers)
            .where(eq(projectMembers.userId, userId));
          const memberProjectIds = new Set(memberProjects.map((r) => r.projectId));
          userProjects = allProjects.filter(
            (p) => memberProjectIds.has(p.id) || p.createdBy === userId
          );
        }
      }
      if (userProjects.length === 0) return "当前没有参与中的项目。";
      const lines = userProjects.map(
        (p) =>
          `- [ID:${p.id}] ${p.name}（${p.status}/${p.phase}）${p.clientNameDisplay ? `，甲方：${p.clientNameDisplay}` : ""}`
      );
      return `共 ${userProjects.length} 个项目：\n${lines.join("\n")}`;
    }

    if (toolName === "get_my_tasks") {
      const tasks = await db.listMyTasks(userId);
      if (tasks.length === 0) return "当前没有待处理的任务。";
      const lines = tasks.map(
        (t) =>
          `- [${t.status}] ${t.title}（项目：${(t as any).projectName || "未知"}，截止：${t.dueDate ? new Date(t.dueDate).toLocaleDateString("zh-CN") : "无"}）`
      );
      return `共 ${tasks.length} 项任务：\n${lines.join("\n")}`;
    }

    if (toolName === "get_project_detail") {
      const projectId = Number(args.project_id);
      const project = await db.getProjectById(projectId);
      if (!project) return `未找到 ID 为 ${projectId} 的项目。`;
      const members = await db.listProjectMembers(projectId);
      const tasks = await db.listTasksByProject(projectId);
      const memberLines = members.map(
        (m) => `  - ${(m as any).userName || "未知"}（${m.role}）`
      );
      const taskSummary = `待处理 ${tasks.filter((t) => t.status !== "done").length} 项，已完成 ${tasks.filter((t) => t.status === "done").length} 项`;
      return [
        `**项目：${project.name}**`,
        `状态：${project.status} / 阶段：${project.phase}`,
        project.clientName ? `甲方：${project.clientName}` : "",
        project.projectOverview ? `概况：${project.projectOverview}` : "",
        project.businessGoal ? `目标：${project.businessGoal}` : "",
        `成员（${members.length}人）：\n${memberLines.join("\n") || "  暂无成员"}`,
        `任务：${taskSummary}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (toolName === "get_team_members") {
      const members = await db.listUsers();
      if (members.length === 0) return "暂无成员信息。";
      const lines = members.map(
        (m) =>
          `- ${m.name || "未知"}${m.department ? `（${m.department}）` : ""}，角色：${m.role}`
      );
      return `工作室共 ${members.length} 位成员：\n${lines.join("\n")}`;
    }

    if (toolName === "generate_image") {
      const prompt = String(args.prompt || "");
      const referenceImageUrl = args.reference_image_url ? String(args.reference_image_url) : undefined;
      const title = args.title ? String(args.title) : `AI 效果图 - ${prompt.substring(0, 30)}`;

      // Resolve image generation tool (use ai_render capability default)
      const imageToolId = await db.getDefaultToolForCapability("ai_render") ?? undefined;

      const genOpts: Parameters<typeof generateImageWithTool>[0] = { prompt, toolId: imageToolId };
      if (referenceImageUrl) {
        genOpts.originalImages = [{ url: referenceImageUrl, mimeType: "image/jpeg" }];
      }

      const result = await generateImageWithTool(genOpts);
      if (!result.url) return "图片生成失败，请重试。";

      // Save to workspace
      const dbConn = await getDb();
      if (dbConn) {
        await dbConn.insert(directorWorkspaceItems).values({
          userId,
          type: "effect",
          title,
          imageUrl: result.url,
          projectId: null,
          conversationId: null,
          metadata: { prompt, referenceImageUrl: referenceImageUrl ?? null },
        });
      }

      // Also save to generationHistory for history tracking
      try {
        await db.createGenerationHistory({
          userId,
          module: "ai_render",
          title,
          summary: prompt.substring(0, 200),
          inputParams: { prompt, referenceImageUrl: referenceImageUrl ?? null },
          outputUrl: result.url,
          status: "success",
          durationMs: 0,
        });
      } catch { /* non-critical */ }

      return JSON.stringify({ action: "image_generated", url: result.url, title });
    }

    if (toolName === "generate_document") {
      const docType = String(args.doc_type || "design_brief");
      const title = String(args.title || "无标题文档");
      const requirements = String(args.requirements || "");
      const projectId = args.project_id ? Number(args.project_id) : null;

      // Optionally enrich with project info
      let projectContext = "";
      if (projectId) {
        try {
          const project = await db.getProjectById(projectId);
          if (project) {
            projectContext = `\n\n**项目信息**\n- 项目名称：${project.name}\n- 状态：${project.status}\n- 阶段：${project.phase}${project.clientName ? `\n- 甲方：${project.clientName}` : ""}${project.projectOverview ? `\n- 项目概况：${project.projectOverview}` : ""}`;
          }
        } catch { /* ignore */ }
      }

      // Build document-type-specific system prompt
      const docPrompts: Record<string, string> = {
        design_brief: `你是 N+1 STUDIOS 建筑设计事务所的设计师。请根据以下要求生成一份详细的设计任务书（用 Markdown 格式）。\n内容应包括：项目背景、设计目标、空间要求、功能分区、设计风格定位、材料要求、时间节点、预算范围。专业、简洁、实用。`,
        case_study: `你是 N+1 STUDIOS 建筑设计事务所的研究员。请生成一份案例调研报告（用 Markdown 格式）。\n内容应包括：项目概况、设计亮点分析、空间策略、材料工艺、对本项目的借鉴意义。专业、深入、有洞察力。`,
        xiaohongshu: `你是 N+1 STUDIOS 的内容运营小红书账号的撰稿人。请生成一篇小红书内容（用 Markdown 格式）。\n要求：标题吸睛、内容真实专业、合理使用 emoji、尾部加相关标签。风格：建筑设计专业账号，调性而不过于商业化。`,
        wechat_article: `你是 N+1 STUDIOS 公众号的撰稿人。请生成一篇公众号文章（用 Markdown 格式）。\n要求：标题吸引眼球、结构清晰（引言+正文+结语）、语言流畅易读、展示事务所专业度和审美调性。`,
        instagram: `你是 N+1 STUDIOS Instagram 账号的撰稿人。请生成 Instagram 内容（用 Markdown 格式）。\n包括：英文主文字（简洁优雅）、相关 hashtag。风格：高端建筑设计账号。`,
        meeting_summary: `你是 N+1 STUDIOS 的会议纪要整理小助手。请根据以下信息生成一份会议纪要（用 Markdown 格式）。\n内容应包括：会议主题、参与人员、主要讨论要点、决议事项、后续行动项。`,
        project_report: `你是 N+1 STUDIOS 的项目管理小助手。请生成一份项目进度报告（用 Markdown 格式）。\n内容应包括：项目概况、当前阶段、已完成事项、进行中事项、待处理事项、风险提示。`,
      };

      const sysPrompt = docPrompts[docType] || docPrompts.design_brief;
      const { invokeLLM } = await import("./_core/llm");
      const llmResult = await invokeLLM({
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: `请生成标题为「${title}」的文档。\n\n要求：${requirements}${projectContext}` },
        ],
      });

      const content = typeof llmResult.choices[0]?.message?.content === "string"
        ? llmResult.choices[0].message.content
        : "文档生成失败。";

      return JSON.stringify({ action: "document_generated", doc_type: docType, title, content });
    }

    if (toolName === "navigate_to_module") {
      const module = args.module as string;
      const path = MODULE_PATHS[module] || "/";
      const name = MODULE_NAMES[module] || module;
      return JSON.stringify({ action: "navigate", path, name, project_id: args.project_id ?? null });
    }

    return `工具 ${toolName} 暂不支持。`;
  } catch (err: any) {
    return `工具调用失败：${err.message}`;
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(user: { name?: string | null; role: string; department?: string | null }) {
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return `你是 N+1 STUDIOS 建筑设计事务所的 AI 所长助手。

今天是 ${today}。

**工作室背景**
N+1 STUDIOS 是一家专注于中国科技制造业企业办公空间、展厅及创新空间类型的建筑设计事务所，团队共 6 人。事务所旗下有产品线 N+1 LAB，主要设计铝型材家具。

**你的职责**
- 帮助团队成员了解项目状态、任务安排和工作进度
- **直接生成 AI 效果图**：当用户描述空间、场景或要求生成效果图时，立即调用 generate_image 工具生成，不要跳转页面
- 如果用户上传了参考图片，将其 URL 传入 generate_image 的 reference_image_url 参数
- 协助调用各功能模块（设计任务书、会议纪要、案例调研等需要复杂操作的功能）
- 提供专业的建筑设计工作建议
- 从公司发展的视角理解每个项目，而不仅仅是执行层面的任务

**当前用户**
姓名：${user.name || "成员"}，角色：${user.role === "admin" ? "管理员/所长" : "团队成员"}${user.department ? `，部门：${user.department}` : ""}

**工作原则**
- 严肃专业，直接切入工作要点，不做无谓的寒暄。
- 回答简洁准确，必要时使用列表或表格呈现信息
- 遇到需要具体操作的任务，主动调用相关工具或引导跳转到对应功能模块
- 对项目的理解要从公司战略和业务发展角度出发，不只是执行层面
- 如果用户消息中包含“[参考图片: URL]”，说明用户上传了参考图，调用 generate_image 时将该 URL 传入 reference_image_url 参数
- 使用中文回复`;
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

async function saveMessage(data: {
  userId: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
}) {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.insert(directorConversations).values({
    userId: data.userId,
    role: data.role,
    content: data.content,
    toolCalls: data.toolCalls ?? null,
    toolCallId: data.toolCallId ?? null,
  });
}

async function getRecentHistory(userId: number, limit = 20): Promise<Message[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const rows = await dbConn
    .select()
    .from(directorConversations)
    .where(eq(directorConversations.userId, userId))
    .orderBy(desc(directorConversations.createdAt))
    .limit(limit);
  // Reverse to chronological order
  rows.reverse();
  return rows.map((r) => {
    if (r.role === "assistant" && r.toolCalls) {
      return {
        role: "assistant" as const,
        content: r.content,
        tool_calls: r.toolCalls as ToolCall[],
      } as Message;
    }
    if (r.role === "tool") {
      // Recover tool function name from the preceding assistant's toolCalls by matching toolCallId
      const toolCallId = r.toolCallId ?? undefined;
      let toolFnName: string | undefined;
      if (toolCallId) {
        // Find the assistant message that contains this tool call
        const assistantRow = rows.find(
          (row) => row.role === "assistant" && row.toolCalls &&
          (row.toolCalls as ToolCall[]).some((tc) => tc.id === toolCallId)
        );
        if (assistantRow) {
          const tc = (assistantRow.toolCalls as ToolCall[]).find((tc) => tc.id === toolCallId);
          toolFnName = tc?.function?.name;
        }
      }
      return {
        role: "tool" as const,
        content: r.content,
        tool_call_id: toolCallId,
        ...(toolFnName ? { name: toolFnName } : {}),
      } as Message;
    }
    return { role: r.role as "user" | "assistant", content: r.content } as Message;
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const directorRouter = router({
  /** Upload an image for use as reference in director chat */
  uploadImage: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      fileData: z.string(), // base64
      contentType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const key = `director-uploads/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url, key };
    }),

  /** Send a message to the director and get a response */
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(4000),
      imageUrl: z.string().url().optional(), // optional reference image
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;

      // Save user message (include image URL in content if provided)
      const userContent = input.imageUrl
        ? `${input.message}\n[参考图片: ${input.imageUrl}]`
        : input.message;
      await saveMessage({ userId, role: "user", content: userContent });

      // Build messages array
      const history = await getRecentHistory(userId, 20);
      const systemPrompt = buildSystemPrompt(ctx.user);

      // Build user message content (multimodal if image provided)
      const userMessageContent: Message["content"] = input.imageUrl
        ? [
            { type: "text", text: input.message },
            { type: "image_url", image_url: { url: input.imageUrl, detail: "auto" } },
          ]
        : input.message;

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userMessageContent },
      ];

      // First LLM call
      // Resolve director capability tool ID (falls back to user default)
      const directorToolId = await db.getDefaultToolForCapability("director");
      let response = await invokeLLMWithUserTool({ messages, tools: DIRECTOR_TOOLS, toolChoice: "auto" }, ctx.user.id, directorToolId);
      let assistantMsg = response.choices[0]?.message;

      // Agentic loop: handle tool calls
      const MAX_TOOL_ROUNDS = 5;
      let round = 0;
      while (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0 && round < MAX_TOOL_ROUNDS) {
        round++;
        const toolCalls = assistantMsg.tool_calls;
        const assistantContent = typeof assistantMsg.content === "string" ? assistantMsg.content : "";

        // Save assistant message with tool_calls
        await saveMessage({
          userId,
          role: "assistant",
          content: assistantContent,
          toolCalls: toolCalls,
        });

        // Add assistant message to context
        messages.push({
          role: "assistant",
          content: assistantContent,
          tool_calls: toolCalls,
        } as Message);

        // Execute each tool call
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}
          const result = await executeTool(tc.function.name, args, userId);

          // Save tool result
          await saveMessage({ userId, role: "tool", content: result, toolCallId: tc.id });

          messages.push({
            role: "tool",
            content: result,
            tool_call_id: tc.id,
            name: tc.function.name, // required by Gemini: function_response.name must not be empty
          } as Message);
        }

        // Next LLM call
        response = await invokeLLMWithUserTool({ messages, tools: DIRECTOR_TOOLS, toolChoice: "auto" }, ctx.user.id, directorToolId);
        assistantMsg = response.choices[0]?.message;
      }

      // Save final assistant reply
      const finalContent = typeof assistantMsg?.content === "string"
        ? assistantMsg.content
        : JSON.stringify(assistantMsg?.content ?? "");

      await saveMessage({ userId, role: "assistant", content: finalContent });

      // Check if any tool call returned a navigate, image_generated, or document_generated action
      let navigateTo: { path: string; name: string; project_id?: number | null } | null = null;
      let generatedImageUrl: string | null = null;
      let generatedDocument: { doc_type: string; title: string; content: string } | null = null;
      // Scan tool results in messages
      for (const msg of messages) {
        if (msg.role === "tool" && typeof msg.content === "string") {
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.action === "navigate") {
              navigateTo = { path: parsed.path, name: parsed.name, project_id: parsed.project_id };
            }
            if (parsed.action === "image_generated" && parsed.url) {
              generatedImageUrl = parsed.url;
            }
            if (parsed.action === "document_generated" && parsed.content) {
              generatedDocument = { doc_type: parsed.doc_type, title: parsed.title, content: parsed.content };
            }
          } catch {}
        }
      }

      return { content: finalContent, navigateTo, generatedImageUrl, generatedDocument };
    }),

  /** Get conversation history for the current user */
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      const dbConn = await getDb();
      if (!dbConn) return [];
      const rows = await dbConn
        .select()
        .from(directorConversations)
        .where(
          and(
            eq(directorConversations.userId, ctx.user.id),
            // Only return user and assistant messages (not tool calls)
            eq(directorConversations.role, "user")
          )
        )
        .orderBy(desc(directorConversations.createdAt))
        .limit(input.limit);

      // Actually return all visible messages (user + assistant, not tool)
      const allRows = await dbConn
        .select()
        .from(directorConversations)
        .where(eq(directorConversations.userId, ctx.user.id))
        .orderBy(desc(directorConversations.createdAt))
        .limit(input.limit);

      return allRows
        .filter((r) => r.role === "user" || r.role === "assistant")
        .reverse();
    }),

  /** Clear conversation history for the current user */
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    const dbConn = await getDb();
    if (!dbConn) return { success: false };
      await dbConn
        .delete(directorConversations)
        .where(eq(directorConversations.userId, ctx.user.id))
        .execute();
    return { success: true };
  }),

  /** Get greeting message for the current user */
  getGreeting: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const tasks = await db.listMyTasks(userId);
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done"
    );
    const dueSoonTasks = tasks.filter((t) => {
      if (!t.dueDate || t.status === "done") return false;
      const daysUntilDue = (new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysUntilDue >= 0 && daysUntilDue <= 3;
    });

    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
    const name = ctx.user.name?.split(" ")[0] || "成员";

    let greeting = `${timeGreeting}，${name}。`;
    if (overdueTasks.length > 0) {
      greeting += ` 有 ${overdueTasks.length} 项任务已逾期，请尽快处理。`;
    } else if (dueSoonTasks.length > 0) {
      greeting += ` 有 ${dueSoonTasks.length} 项任务将在 3 天内到期。`;
    } else if (tasks.length > 0) {
      greeting += ` 当前有 ${tasks.length} 项待处理任务。`;
    } else {
      greeting += " 当前没有待处理任务。";
    }

    return { greeting };
  }),

  /** Get workspace items for the current user */
  getWorkspaceItems: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      const dbConn = await getDb();
      if (!dbConn) return [];
      return dbConn
        .select()
        .from(directorWorkspaceItems)
        .where(eq(directorWorkspaceItems.userId, ctx.user.id))
        .orderBy(desc(directorWorkspaceItems.createdAt))
        .limit(input.limit);
    }),

  /** Add an image to the workspace */
  addWorkspaceItem: protectedProcedure
    .input(
      z.object({
        type: z.enum(["effect", "plan", "color_plan", "analysis", "other"]).default("other"),
        title: z.string().optional(),
        imageUrl: z.string().url(),
        projectId: z.number().optional(),
        conversationId: z.number().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await dbConn.insert(directorWorkspaceItems).values({
        userId: ctx.user.id,
        type: input.type,
        title: input.title ?? null,
        imageUrl: input.imageUrl,
        projectId: input.projectId ?? null,
        conversationId: input.conversationId ?? null,
        metadata: input.metadata ?? null,
      });
      return { id: Number((result as any).insertId) };
    }),

  /** Remove a workspace item */
  removeWorkspaceItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const dbConn = await getDb();
      if (!dbConn) return { success: false };
      await dbConn
        .delete(directorWorkspaceItems)
        .where(
          and(
            eq(directorWorkspaceItems.id, input.id),
            eq(directorWorkspaceItems.userId, ctx.user.id)
          )
        )
        .execute();
      return { success: true };
    }),
});
