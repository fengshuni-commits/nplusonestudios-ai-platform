import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";

const router = Router();

// ─── API Key Authentication Middleware ──────────────────────

async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid API key", code: "UNAUTHORIZED" });
  }

  const rawKey = authHeader.substring(7);

  // Support sk_ prefixed API tokens (generated from the API management page)
  if (rawKey.startsWith("sk_")) {
    const tokenInfo = await db.verifyApiToken(rawKey);
    if (!tokenInfo) {
      return res.status(401).json({ error: "Invalid or expired API token", code: "UNAUTHORIZED" });
    }
    const user = await db.getUserById(tokenInfo.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found", code: "UNAUTHORIZED" });
    }
    (req as any).apiKey = { id: tokenInfo.userId, userId: tokenInfo.userId, type: tokenInfo.type };
    (req as any).apiUser = user;
    return next();
  }

  // Legacy nplus1_ prefixed API keys
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const apiKey = await db.getApiKeyByHash(keyHash);

  if (!apiKey) {
    return res.status(401).json({ error: "Invalid API key", code: "UNAUTHORIZED" });
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return res.status(401).json({ error: "API key expired", code: "KEY_EXPIRED" });
  }

  // Update last used timestamp
  await db.updateApiKeyLastUsed(apiKey.id);

  // Attach key info to request for downstream use
  (req as any).apiKey = apiKey;
  next();
}

// Apply auth to all routes
router.use(authenticateApiKey);

// ─── Health Check ───────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    platform: "N+1 STUDIOS AI Platform",
    timestamp: new Date().toISOString(),
  });
});

// ─── Projects ───────────────────────────────────────────────

router.get("/projects", async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const projects = await db.listProjects({
      search: search as string,
      status: status as string,
    });
    res.json({ data: projects, total: projects.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to list projects", code: "INTERNAL_ERROR" });
  }
});

router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const project = await db.getProjectById(parseInt(req.params.id));
    if (!project) {
      return res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    }
    res.json({ data: project });
  } catch (error) {
    res.status(500).json({ error: "Failed to get project", code: "INTERNAL_ERROR" });
  }
});

router.post("/projects", async (req: Request, res: Response) => {
  try {
    const { name, code, description, clientName, status } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Project name is required", code: "VALIDATION_ERROR" });
    }
    const result = await db.createProject({ name, code, description, clientName, status });

    // Trigger webhook
    await triggerWebhook("project.created", { projectId: result.id, name });

    res.status(201).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create project", code: "INTERNAL_ERROR" });
  }
});

router.patch("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    }

    const { name, code, description, clientName, status, phase } = req.body;
    await db.updateProject(id, { name, code, description, clientName, status, phase });

    // Trigger webhook on status change
    if (status && status !== project.status) {
      await triggerWebhook("project.status_changed", {
        projectId: id,
        oldStatus: project.status,
        newStatus: status,
      });
    }

    res.json({ data: { id, success: true } });
  } catch (error) {
    res.status(500).json({ error: "Failed to update project", code: "INTERNAL_ERROR" });
  }
});

// ─── Tasks ──────────────────────────────────────────────────

router.get("/projects/:projectId/tasks", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const tasks = await db.listTasksByProject(projectId);
    res.json({ data: tasks, total: tasks.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to list tasks", code: "INTERNAL_ERROR" });
  }
});

router.post("/projects/:projectId/tasks", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { title, description, priority, category, assigneeId } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Task title is required", code: "VALIDATION_ERROR" });
    }
    const result = await db.createTask({ projectId, title, description, priority, category, assigneeId });

    await triggerWebhook("task.created", { taskId: result.id, projectId, title });

    res.status(201).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create task", code: "INTERNAL_ERROR" });
  }
});

router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { status, title, description, priority, category, assigneeId } = req.body;

    if (status) {
      await db.updateTaskStatus(id, status);
      if (status === "done") {
        await triggerWebhook("task.completed", { taskId: id });
      }
    }

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority) updateData.priority = priority;
    if (category) updateData.category = category;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;

    if (Object.keys(updateData).length > 0) {
      await db.updateTask(id, updateData);
    }

    res.json({ data: { id, success: true } });
  } catch (error) {
    res.status(500).json({ error: "Failed to update task", code: "INTERNAL_ERROR" });
  }
});

// ─── Documents ──────────────────────────────────────────────

router.get("/projects/:projectId/documents", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const documents = await db.listDocumentsByProject(projectId);
    res.json({ data: documents, total: documents.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to list documents", code: "INTERNAL_ERROR" });
  }
});

router.post("/documents", async (req: Request, res: Response) => {
  try {
    const { projectId, title, content, type, category, fileUrl, fileKey } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Document title is required", code: "VALIDATION_ERROR" });
    }
    const result = await db.createDocument({ projectId, title, content, type, category, fileUrl, fileKey });

    await triggerWebhook("document.created", { documentId: result.id, projectId, title });

    res.status(201).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create document", code: "INTERNAL_ERROR" });
  }
});

router.get("/documents/:id", async (req: Request, res: Response) => {
  try {
    const doc = await db.getDocumentById(parseInt(req.params.id));
    if (!doc) {
      return res.status(404).json({ error: "Document not found", code: "NOT_FOUND" });
    }
    res.json({ data: doc });
  } catch (error) {
    res.status(500).json({ error: "Failed to get document", code: "INTERNAL_ERROR" });
  }
});

// ─── AI Tools ───────────────────────────────────────────────

router.get("/ai-tools", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const tools = await db.listAiTools({ category: category as string, activeOnly: true });
    res.json({ data: tools, total: tools.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to list AI tools", code: "INTERNAL_ERROR" });
  }
});

// ─── AI Actions (invoke AI capabilities via API) ────────────

router.post("/ai/benchmark", async (req: Request, res: Response) => {
  try {
    const { projectName, projectType, requirements, referenceCount, toolId } = req.body;
    if (!projectName || !requirements) {
      return res.status(400).json({ error: "projectName and requirements are required", code: "VALIDATION_ERROR" });
    }

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是 N+1 STUDIOS 的建筑设计对标调研专家。请根据用户提供的项目信息，生成一份专业的对标调研报告。

报告需要包含以下内容：
1. 项目概述与调研目标
2. ${referenceCount || 5} 个对标案例分析
3. 设计策略建议
4. 材料与工艺参考
5. 总结与建议

请以 Markdown 格式输出。`
        },
        {
          role: "user",
          content: `项目名称：${projectName}\n项目类型：${projectType || "未指定"}\n项目需求：${requirements}`
        }
      ],
    });

    const content = typeof response.choices[0]?.message?.content === 'string'
      ? response.choices[0].message.content
      : '';

    res.json({ data: { content, generatedAt: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ error: "Benchmark generation failed", code: "AI_ERROR" });
  }
});

router.post("/ai/render", async (req: Request, res: Response) => {
  try {
    const { prompt, style, toolId } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required", code: "VALIDATION_ERROR" });
    }

    const fullPrompt = style ? `${prompt}, style: ${style}` : prompt;
    const result = await generateImage({ prompt: fullPrompt });

    res.json({ data: { url: result.url, prompt: fullPrompt } });
  } catch (error) {
    res.status(500).json({ error: "Image generation failed", code: "AI_ERROR" });
  }
});

router.post("/ai/meeting-minutes", async (req: Request, res: Response) => {
  try {
    const { transcript, projectName, meetingDate, toolId } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: "transcript is required", code: "VALIDATION_ERROR" });
    }

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是 N+1 STUDIOS 的会议纪要整理专家。请根据会议录音转写文本，生成一份结构化的会议纪要。

格式要求：
1. 会议基本信息
2. 参会人员
3. 会议议题与讨论要点
4. 决议事项
5. 待办事项
6. 下次会议安排

请以 Markdown 格式输出。`
        },
        {
          role: "user",
          content: `项目：${projectName || "未指定"}\n日期：${meetingDate || new Date().toLocaleDateString("zh-CN")}\n\n录音转写文本：\n${transcript}`
        }
      ],
    });

    const content = typeof response.choices[0]?.message?.content === 'string'
      ? response.choices[0].message.content
      : '';

    res.json({ data: { content, generatedAt: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ error: "Meeting minutes generation failed", code: "AI_ERROR" });
  }
});

// ─── Dashboard Stats ────────────────────────────────────────

router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({ data: stats });
  } catch (error) {
    res.status(500).json({ error: "Failed to get dashboard stats", code: "INTERNAL_ERROR" });
  }
});

// ─── Assets ─────────────────────────────────────────────────

router.get("/assets", async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    const assets = await db.listAssets({ category: category as string, search: search as string });
    res.json({ data: assets, total: assets.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to list assets", code: "INTERNAL_ERROR" });
  }
});

// ─── Standards ──────────────────────────────────────────────

router.get("/standards", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const standards = await db.listStandards({ category: category as string });
    res.json({ data: standards, total: standards.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to list standards", code: "INTERNAL_ERROR" });
  }
});

// ─── Webhook Trigger Helper ─────────────────────────────────

async function triggerWebhook(event: string, payload: any) {
  try {
    const webhooks = await db.getActiveWebhooksByEvent(event);
    for (const webhook of webhooks) {
      try {
        const body = JSON.stringify({
          event,
          payload,
          timestamp: new Date().toISOString(),
          platform: "nplus1-studios",
        });

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
        };

        // Sign payload if secret is configured
        if (webhook.secret) {
          const signature = crypto
            .createHmac("sha256", webhook.secret)
            .update(body)
            .digest("hex");
          headers["X-Webhook-Signature"] = `sha256=${signature}`;
        }

        // Fire and forget - don't block the main request
        fetch(webhook.url as string, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(10000),
        }).catch((err) => {
          console.warn(`[Webhook] Failed to deliver to ${webhook.url}:`, err.message);
        });
      } catch (err) {
        console.warn(`[Webhook] Error processing webhook ${webhook.id}:`, err);
      }
    }
  } catch (err) {
    console.warn("[Webhook] Error fetching webhooks:", err);
  }
}

export { router as openclawRouter };
