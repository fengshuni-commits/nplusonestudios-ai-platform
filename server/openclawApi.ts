import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { generateGraphicLayoutAsync } from "./graphicLayoutService";
import { generateImageWithTool } from "./_core/generateImageWithTool";
import { generateVideoWithTool, queryVideoTaskStatus } from "./_core/generateVideoWithTool";
import { storagePut } from "./storage";

const router = Router();

// ─── Webhook Helper ─────────────────────────────────────────
async function fireWebhook(callbackUrl: string, payload: Record<string, unknown>, maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "N+1-STUDIOS-Webhook/1.0" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
      console.warn(`[Webhook] Attempt ${attempt}/${maxRetries} failed with status ${res.status} for ${callbackUrl}`);
    } catch (err: any) {
      console.warn(`[Webhook] Attempt ${attempt}/${maxRetries} error for ${callbackUrl}: ${err?.message}`);
    }
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
  }
  console.error(`[Webhook] All ${maxRetries} attempts failed for ${callbackUrl}`);
}

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
    // Attach user role so downstream handlers can check admin status
    (req as any).apiKey = { id: tokenInfo.userId, userId: tokenInfo.userId, type: tokenInfo.type, isAdmin: user.role === "admin" };
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
    const { name, code, description, clientName, status, phase, startDate, endDate } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Project name is required", code: "VALIDATION_ERROR" });
    }

    // Validate enum values
    const validStatuses = ["planning", "design", "construction", "completed", "archived"];
    const validPhases = ["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status "${status}". Must be one of: ${validStatuses.join(", ")}.`,
        code: "VALIDATION_ERROR",
      });
    }
    if (phase && !validPhases.includes(phase)) {
      return res.status(400).json({
        error: `Invalid phase "${phase}". Must be one of: ${validPhases.join(", ")}.`,
        code: "VALIDATION_ERROR",
      });
    }

    const insertData: any = { name, code, description, clientName };
    if (status) insertData.status = status;
    if (phase) insertData.phase = phase;
    if (startDate) insertData.startDate = new Date(startDate);
    if (endDate) insertData.endDate = new Date(endDate);

    const result = await db.createProject(insertData);

    // Fetch the created project to return full data
    const created = await db.getProjectById(result.id);

    // Trigger webhook
    await triggerWebhook("project.created", { projectId: result.id, name });

    res.status(201).json({ data: created });
  } catch (error: any) {
    console.error("[API] Failed to create project:", error?.message || error);
    res.status(500).json({ error: "Failed to create project", code: "INTERNAL_ERROR", detail: error?.message });
  }
});

router.patch("/projects/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid project ID", code: "VALIDATION_ERROR" });
    }
    const project = await db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
    }

    const { name, code, description, clientName, status, phase, startDate, endDate } = req.body;

    // Validate enum values
    const validStatuses = ["planning", "design", "construction", "completed", "archived"];
    const validPhases = ["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status "${status}". Must be one of: ${validStatuses.join(", ")}.`,
        code: "VALIDATION_ERROR",
      });
    }
    if (phase && !validPhases.includes(phase)) {
      return res.status(400).json({
        error: `Invalid phase "${phase}". Must be one of: ${validPhases.join(", ")}.`,
        code: "VALIDATION_ERROR",
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (status) updateData.status = status;
    if (phase) updateData.phase = phase;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

    await db.updateProject(id, updateData);

    // Trigger webhook on status change
    if (status && status !== project.status) {
      await triggerWebhook("project.status_changed", {
        projectId: id,
        oldStatus: project.status,
        newStatus: status,
      });
    }

    // Return updated project
    const updated = await db.getProjectById(id);
    res.json({ data: updated });
  } catch (error: any) {
    console.error("[API] Failed to update project:", error?.message || error);
    res.status(500).json({ error: "Failed to update project", code: "INTERNAL_ERROR", detail: error?.message });
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
    const result = await db.createTask({ projectId, title, description, priority, category, assigneeId, source: "api" } as any);

    await triggerWebhook("task.created", { taskId: result.id, projectId, title });

    res.status(201).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to create task", code: "INTERNAL_ERROR" });
  }
});

router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid task ID", code: "VALIDATION_ERROR" });
    }

    const task = await db.getTaskById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found", code: "NOT_FOUND" });
    }

    // Permission check:
    // - API-created tasks (source = "api"): any authenticated API key can modify
    // - User-created tasks (source = "user" or createdBy is set): only admin API key can modify
    const apiKeyInfo = (req as any).apiKey;
    // isAdmin is set during authentication based on the token owner's user role
    const isAdminApiKey = apiKeyInfo?.isAdmin === true;
    const taskSource = (task as any).source || "user";

    if (taskSource === "user" && !isAdminApiKey) {
      return res.status(403).json({
        error: "This task was created by a user. Only admin API keys can modify user-created tasks.",
        code: "FORBIDDEN",
      });
    }

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
    const user = (req as any).apiUser;
    const fullPrompt = style ? `${prompt}, style: ${style}` : prompt;

    // Async mode: create job and return jobId
    const jobId = nanoid();
    await db.createRenderingJob({ id: jobId, userId: user.id, inputParams: { prompt: fullPrompt } });

    // Fire-and-forget background generation
    (async () => {
      try {
        await db.updateRenderingJob(jobId, { status: "processing" });
        const result = await generateImage({ prompt: fullPrompt });
        const history = await db.createGenerationHistory({
          userId: user.id,
          module: "rendering",
          title: fullPrompt.substring(0, 100),
          outputUrl: result.url,
          status: "success",
          createdByName: user.name || "API",
        });
        await db.updateRenderingJob(jobId, { status: "done", resultUrl: result.url, resultPrompt: fullPrompt, historyId: history.id });
      } catch (err) {
        await db.updateRenderingJob(jobId, { status: "failed", error: String(err) });
      }
    })();

    res.json({ data: { jobId, status: "pending" } });
  } catch (error) {
    res.status(500).json({ error: "Image generation failed", code: "AI_ERROR" });
  }
});

// List rendering history (must be before /:jobId to avoid route conflict)
router.get("/ai/render/history", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await db.listGenerationHistory(user.id, { module: "rendering", limit, offset });
    res.json({ data: result.items, total: result.total });
  } catch (error) {
    res.status(500).json({ error: "Failed to get history", code: "INTERNAL_ERROR" });
  }
});

// Poll rendering job status
router.get("/ai/render/:jobId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    const job = await db.getRenderingJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    if (job.userId !== user.id) return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    if (job.status === "done") {
      return res.json({ data: { status: "done", url: job.resultUrl, prompt: job.resultPrompt, historyId: job.historyId } });
    }
    if (job.status === "failed") {
      return res.json({ data: { status: "failed", error: job.error } });
    }
    res.json({ data: { status: job.status } });
  } catch (error) {
    res.status(500).json({ error: "Failed to get job status", code: "INTERNAL_ERROR" });
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

// ─── Graphic Layout REST API ────────────────────────────────

// POST /api/v1/graphic-layout/generate
router.post("/graphic-layout/generate", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { docType, contentText, pageCount, aspectRatio, title, assetUrls, stylePrompt, imageToolId } = req.body;
    if (!docType || !contentText) {
      return res.status(400).json({ error: "docType and contentText are required", code: "VALIDATION_ERROR" });
    }
    const validDocTypes = ["brand_manual", "product_detail", "project_board", "custom"];
    if (!validDocTypes.includes(docType)) {
      return res.status(400).json({ error: `docType must be one of: ${validDocTypes.join(", ")}`, code: "VALIDATION_ERROR" });
    }
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return res.status(500).json({ error: "Database unavailable", code: "INTERNAL_ERROR" });
    const { graphicLayoutJobs } = await import("../drizzle/schema");
    const { eq: _eq, desc: _desc } = await import("drizzle-orm");
    const storedAssets = assetUrls ? { mode: "legacy", urls: assetUrls } : { mode: "legacy", urls: [] };
    await drizzleDb.insert(graphicLayoutJobs).values({
      userId: user.id,
      packId: null,
      docType,
      pageCount: Math.min(Math.max(parseInt(pageCount) || 1, 1), 10),
      aspectRatio: aspectRatio ?? "3:4",
      contentText,
      assetUrls: storedAssets,
      title: title ?? null,
      status: "pending",
    });
    const [newJob] = await drizzleDb.select().from(graphicLayoutJobs)
      .where(_eq(graphicLayoutJobs.userId, user.id))
      .orderBy(_desc(graphicLayoutJobs.createdAt))
      .limit(1);
    if (!newJob) return res.status(500).json({ error: "Failed to create job", code: "INTERNAL_ERROR" });
    generateGraphicLayoutAsync(newJob.id, user.id, imageToolId ?? undefined, stylePrompt ?? undefined).catch(console.error);
    res.json({ data: { id: newJob.id, status: "pending" } });
  } catch (error) {
    console.error("[API] graphic-layout/generate error:", error);
    res.status(500).json({ error: "Failed to create graphic layout job", code: "INTERNAL_ERROR" });
  }
});

// GET /api/v1/graphic-layout/status/:id
router.get("/graphic-layout/status/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id", code: "VALIDATION_ERROR" });
    // Auto-timeout stale jobs (pending/processing for >15min) and use raw SQL to bypass REPEATABLE READ
    await db.timeoutStaleGraphicLayoutJobs(15 * 60 * 1000);
    const job = await db.getGraphicLayoutJobRaw(jobId, user.id);
    if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    const pages = (job.pages as any[] | null) ?? [];
    res.json({
      data: {
        id: job.id,
        status: job.status,
        docType: job.docType,
        pageCount: job.pageCount,
        aspectRatio: job.aspectRatio,
        title: job.title,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        pages: job.status === "done" ? pages.map((p: any) => ({
          pageIndex: p.pageIndex,
          imageUrl: p.imageUrl,
          backgroundColor: p.backgroundColor,
          textBlocks: p.textBlocks ?? [],
          imageSize: p.imageSize,
        })) : [],
      }
    });
  } catch (error) {
    console.error("[API] graphic-layout/status error:", error);
    res.status(500).json({ error: "Failed to get job status", code: "INTERNAL_ERROR" });
  }
});

// POST /api/v1/graphic-layout/export-pdf/:id
router.post("/graphic-layout/export-pdf/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job id", code: "VALIDATION_ERROR" });
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return res.status(500).json({ error: "Database unavailable", code: "INTERNAL_ERROR" });
    const { graphicLayoutJobs } = await import("../drizzle/schema");
    const { eq: _eq, and: _and } = await import("drizzle-orm");
    const [job] = await drizzleDb.select().from(graphicLayoutJobs)
      .where(_and(_eq(graphicLayoutJobs.id, jobId), _eq(graphicLayoutJobs.userId, user.id)))
      .limit(1);
    if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    if (job.status !== "done") return res.status(400).json({ error: "Job not completed yet", code: "BAD_REQUEST" });
    const pages = (job.pages as any[]) ?? [];
    if (pages.length === 0) return res.status(400).json({ error: "No pages available", code: "BAD_REQUEST" });
    const aspectRatio = job.aspectRatio ?? "3:4";
    const PAGE_SIZES: Record<string, [number, number]> = {
      "3:4": [595, 793], "4:3": [793, 595], "1:1": [595, 595],
      "16:9": [842, 474], "9:16": [474, 842], "A4": [595, 842], "A3": [1191, 842],
    };
    const [pageW, pageH] = PAGE_SIZES[aspectRatio] ?? [595, 793];
    const imageBuffers: Array<{ buf: Buffer; idx: number }> = [];
    const sortedPages = [...pages].sort((a: any, b: any) => a.pageIndex - b.pageIndex);
    for (const page of sortedPages) {
      if (!page.imageUrl) continue;
      try {
        const fetchRes = await fetch(page.imageUrl);
        if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
        imageBuffers.push({ buf: Buffer.from(await fetchRes.arrayBuffer()), idx: page.pageIndex });
      } catch (err) {
        console.error(`[API] export-pdf page ${page.pageIndex} fetch failed:`, err);
      }
    }
    if (imageBuffers.length === 0) return res.status(500).json({ error: "Failed to fetch page images", code: "INTERNAL_ERROR" });
    const PDFDocument = (await import("pdfkit")).default;
    const { storagePut } = await import("./storage");
    const pdfChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
      doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));
      doc.on("end", resolve);
      doc.on("error", reject);
      for (const { buf } of imageBuffers) {
        doc.addPage({ size: [pageW, pageH], margin: 0 });
        try { doc.image(buf, 0, 0, { width: pageW, height: pageH }); } catch (e) { console.error(e); }
      }
      doc.end();
    });
    const pdfBuffer = Buffer.concat(pdfChunks);
    const fileKey = `graphic-layout-pdf/${user.id}/${jobId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    res.json({ data: { url, filename: `${job.title || "排版"}.pdf` } });
  } catch (error) {
    console.error("[API] graphic-layout/export-pdf error:", error);
    res.status(500).json({ error: "Failed to export PDF", code: "INTERNAL_ERROR" });
  }
});

// POST /api/v1/graphic-layout/inpaint/:jobId/:pageIndex/:blockId
router.post("/graphic-layout/inpaint/:jobId/:pageIndex/:blockId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const jobId = parseInt(req.params.jobId);
    const pageIndex = parseInt(req.params.pageIndex);
    const blockId = req.params.blockId;
    if (isNaN(jobId) || isNaN(pageIndex)) return res.status(400).json({ error: "Invalid jobId or pageIndex", code: "VALIDATION_ERROR" });
    const { newText, imageToolId, callbackUrl } = req.body;
    if (!newText) return res.status(400).json({ error: "newText is required", code: "VALIDATION_ERROR" });

    const drizzleDb = await db.getDb();
    if (!drizzleDb) return res.status(500).json({ error: "Database unavailable", code: "INTERNAL_ERROR" });
    const { graphicLayoutJobs } = await import("../drizzle/schema");
    const { eq: _eq, and: _and } = await import("drizzle-orm");

    const [job] = await drizzleDb.select().from(graphicLayoutJobs)
      .where(_and(_eq(graphicLayoutJobs.id, jobId), _eq(graphicLayoutJobs.userId, user.id)))
      .limit(1);
    if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });

    const pages = (job.pages as any[]) ?? [];
    const page = pages.find((p: any) => p.pageIndex === pageIndex);
    if (!page) return res.status(404).json({ error: "Page not found", code: "NOT_FOUND" });
    const block = (page.textBlocks ?? []).find((b: any) => b.id === blockId);
    if (!block) return res.status(404).json({ error: "Text block not found", code: "NOT_FOUND" });

    const originalImageUrl: string = page.imageUrl ?? "";
    if (!originalImageUrl) return res.status(400).json({ error: "Original image not available", code: "BAD_REQUEST" });

    const imgW: number = page.imageSize?.width ?? 1024;
    const imgH: number = page.imageSize?.height ?? 1365;

    // Build red-overlay composite (same approach as tRPC inpaintTextBlock)
    let compositeB64: string;
    const compositeMimeType = "image/png";
    // Hoisted so actualWidth/actualHeight are available in the response after the try block
    let actualWidth: number = imgW;
    let actualHeight: number = imgH;
    try {
      const sharp = (await import("sharp")).default;
      const padding = 20;
      // Fetch image first so we can read actual dimensions (DB imageSize may differ from real image)
      const imgResp = await fetch(originalImageUrl, { signal: AbortSignal.timeout(30000) });
      if (!imgResp.ok) throw new Error(`Failed to fetch original image: ${imgResp.status}`);
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      // Use actual image dimensions to avoid "Image to composite must have same dimensions or smaller" error
      const meta = await sharp(imgBuffer).metadata();
      const actualW = meta.width ?? imgW;
      const actualH = meta.height ?? imgH;
      actualWidth = actualW;
      actualHeight = actualH;
      if (actualW !== imgW || actualH !== imgH) {
        console.warn(`[API] graphic-layout/inpaint: DB imageSize (${imgW}x${imgH}) differs from actual (${actualW}x${actualH}), using actual`);
      }
      // Sanitize block coordinates — DB JSON may have undefined/null fields
      const bx = isFinite(Number(block.x)) ? Number(block.x) : 0;
      const by = isFinite(Number(block.y)) ? Number(block.y) : 0;
      const bw = isFinite(Number(block.width)) ? Number(block.width) : 0;
      const bh = isFinite(Number(block.height)) ? Number(block.height) : 0;
      const mx = Math.max(0, Math.round(bx) - padding);
      const my = Math.max(0, Math.round(by) - padding);
      const mw = Math.min(actualW - mx, Math.round(bw) + padding * 2);
      const mh = Math.min(actualH - my, Math.round(bh) + padding * 2);
      // If overlay dimensions are invalid (block outside image bounds), fall back to original image
      if (mw > 0 && mh > 0) {
        const overlayPixels = Buffer.alloc(mw * mh * 4);
        for (let i = 0; i < mw * mh; i++) {
          overlayPixels[i * 4] = 255; overlayPixels[i * 4 + 1] = 60;
          overlayPixels[i * 4 + 2] = 60; overlayPixels[i * 4 + 3] = 120;
        }
        const overlay = await sharp(overlayPixels, { raw: { width: mw, height: mh, channels: 4 } }).png().toBuffer();
        const compositeBuffer = await sharp(imgBuffer).composite([{ input: overlay, left: mx, top: my, blend: "over" }]).png().toBuffer();
        compositeB64 = compositeBuffer.toString("base64");
      } else {
        // Block is outside image bounds — use original image without overlay
        console.warn(`[API] graphic-layout/inpaint: block out of bounds (mx=${mx} my=${my} mw=${mw} mh=${mh} actualW=${actualW} actualH=${actualH}), using original image`);
        compositeB64 = imgBuffer.toString("base64");
      }
    } catch (err) {
      console.error("[API] graphic-layout/inpaint composite error:", err);
      return res.status(500).json({ error: "Failed to generate composite image", code: "INTERNAL_ERROR" });
    }

    const inpaintPrompt = `[INPAINTING INSTRUCTION: The image has a red-highlighted area marking the region to modify. ONLY modify the content within the red-marked area. Keep all other areas exactly unchanged.] Replace the text in the red-highlighted region with: "${newText}". Keep the same font style, size (approximately ${block.fontSize}px), color (${block.color}), alignment (${block.align}), and background. Only change the text content, preserve everything else exactly.`;

    const result = await generateImageWithTool({
      prompt: inpaintPrompt,
      originalImages: [{ b64Json: compositeB64, mimeType: compositeMimeType }],
      size: `${imgW}x${imgH}`,
      toolId: imageToolId ?? null,
    });

    const newImageUrl = result.url ?? "";
    if (!newImageUrl) return res.status(500).json({ error: "Inpainting returned empty image", code: "INTERNAL_ERROR" });

    // Update pages in DB
    const updatedPages = pages.map((p: any) => {
      if (p.pageIndex !== pageIndex) return p;
      return {
        ...p,
        imageUrl: newImageUrl,
        textBlocks: (p.textBlocks ?? []).map((b: any) =>
          b.id === blockId ? { ...b, text: newText } : b
        ),
      };
    });
    await drizzleDb.update(graphicLayoutJobs).set({ pages: updatedPages }).where(_eq(graphicLayoutJobs.id, jobId));

    res.json({ data: { imageUrl: newImageUrl, pageIndex, blockId, newText, actualWidth, actualHeight } });

    // Fire webhook if callbackUrl provided
    if (callbackUrl) {
      fireWebhook(callbackUrl, {
        event: "graphic_layout.inpaint.done",
        jobId,
        pageIndex,
        blockId,
        newText,
        imageUrl: newImageUrl,
      }).catch(console.error);
    }
  } catch (error) {
    console.error("[API] graphic-layout/inpaint error:", error);
    res.status(500).json({ error: "Failed to inpaint text block", code: "INTERNAL_ERROR" });
  }
});

// ─── Color Plan REST API ────────────────────────────────────

// In-memory job store shared with tRPC colorPlan router
// (jobs are stored in the same process memory)
const colorPlanJobStoreApi = new Map<string, { status: string; url?: string; historyId?: number; error?: string }>();

// POST /api/v1/color-plan/generate
router.post("/color-plan/generate", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { floorPlanUrl, referenceUrl, planStyle = "colored", style, extraPrompt, toolId, zones, floorPlanWidth, floorPlanHeight, callbackUrl } = req.body;
    if (!floorPlanUrl) return res.status(400).json({ error: "floorPlanUrl is required", code: "VALIDATION_ERROR" });
    const validStyles = ["colored", "hand_drawn", "line_drawing"];
    if (!validStyles.includes(planStyle)) return res.status(400).json({ error: `planStyle must be one of: ${validStyles.join(", ")}`, code: "VALIDATION_ERROR" });

    const jobId = nanoid();
    colorPlanJobStoreApi.set(jobId, { status: "processing" });

    (async () => {
      try {
        const defaultPrompts: Record<string, { base: string; refPrefix: string }> = {
          colored: {
            base: `Architectural colored floor plan. Transform the provided black-and-white or line-drawing floor plan into a richly colored architectural floor plan. Apply realistic material textures and colors: warm wood flooring for living and dining areas, light tile or stone for bathrooms and kitchens, soft carpet or parquet for bedrooms, green indoor plants, furniture with drop shadows for depth. Maintain the exact spatial layout, room boundaries, walls, doors, and windows from the original floor plan. Clean top-down orthographic view. High quality architectural presentation style.`,
            refPrefix: `[STYLE REFERENCE: The second image shows the target color style and material palette. Apply the same color scheme and material textures to the floor plan.]`,
          },
          hand_drawn: {
            base: `Architectural hand-drawn floor plan. Transform the provided floor plan into a hand-drawn style architectural plan. Apply watercolor washes for room fills with soft, organic color bleeding at edges. Use pencil-sketch line work for walls, doors, and windows with slight imperfections for a human touch. Maintain exact spatial layout. Top-down orthographic view with artistic, sketch-like quality.`,
            refPrefix: `[STYLE REFERENCE: The second image shows the target hand-drawn style, color palette and sketch technique. Apply the same watercolor wash style, line weight, and color tones to the floor plan.]`,
          },
          line_drawing: {
            base: `Architectural floor plan line drawing. Transform the provided floor plan into a clean, precise architectural line drawing. Use crisp black lines on white background for all walls, doors, windows, and furniture outlines. No color fills, no textures. Clean, technical drafting style. Top-down orthographic view.`,
            refPrefix: `[STYLE REFERENCE: The second image shows the target line drawing style and line weight convention. Apply the same drafting technique to the floor plan.]`,
          },
        };
        const basePromptRow = await db.getColorPlanPrompt("base", planStyle);
        const refPrefixRow = await db.getColorPlanPrompt("reference_prefix", planStyle);
        const defaults = defaultPrompts[planStyle] || defaultPrompts.colored;
        let prompt = basePromptRow?.prompt || defaults.base;
        if (style) prompt += ` Style: ${style}.`;
        if (zones && Array.isArray(zones) && zones.length > 0) {
          const zoneDescriptions = zones.map((z: any, i: number) => {
            const xPct = Math.round(z.x * 100); const yPct = Math.round(z.y * 100);
            const wPct = Math.round(z.w * 100); const hPct = Math.round(z.h * 100);
            return `Zone ${i + 1}: "${z.name}" — located at approximately ${xPct}% from left, ${yPct}% from top, spanning ${wPct}% wide and ${hPct}% tall.`;
          }).join(" ");
          prompt += ` FUNCTIONAL ZONES: ${zoneDescriptions}`;
        }
        if (extraPrompt) prompt += ` ${extraPrompt}`;
        const originalImages: Array<{ url?: string; mimeType?: string }> = [{ url: floorPlanUrl, mimeType: "image/png" }];
        if (referenceUrl) {
          originalImages.push({ url: referenceUrl, mimeType: "image/png" });
          prompt = `${refPrefixRow?.prompt || defaults.refPrefix} ` + prompt;
        }
        let colorPlanSize: string | undefined;
        if (floorPlanWidth && floorPlanHeight) {
          const BASE = 1024;
          const ratio = floorPlanWidth / floorPlanHeight;
          let outW = ratio >= 1 ? BASE : Math.round(BASE * ratio);
          let outH = ratio >= 1 ? Math.round(BASE / ratio) : BASE;
          outW = Math.max(64, Math.round(outW / 64) * 64);
          outH = Math.max(64, Math.round(outH / 64) * 64);
          colorPlanSize = `${outW}x${outH}`;
        }
        const result = await generateImageWithTool({ prompt, originalImages, toolId: toolId ?? undefined, size: colorPlanSize });
        const historyResult = await db.createGenerationHistory({
          userId: user.id, module: "color_plan",
          title: `AI 彩平 - ${new Date().toLocaleDateString("zh-CN")}`,
          summary: prompt, inputParams: { floorPlanUrl, referenceUrl: referenceUrl || null, planStyle },
          outputUrl: result.url, status: "success", createdByName: user.name || null,
        }).catch(() => ({ id: 0 }));
        colorPlanJobStoreApi.set(jobId, { status: "done", url: result.url, historyId: historyResult.id });
        setTimeout(() => colorPlanJobStoreApi.delete(jobId), 10 * 60 * 1000);
        if (callbackUrl) {
          await fireWebhook(callbackUrl, { event: "color_plan.done", jobId, status: "done", url: result.url, historyId: historyResult.id }).catch(console.error);
        }
      } catch (err: any) {
        colorPlanJobStoreApi.set(jobId, { status: "failed", error: err?.message || "彩平生成失败" });
        setTimeout(() => colorPlanJobStoreApi.delete(jobId), 5 * 60 * 1000);
        if (callbackUrl) {
          await fireWebhook(callbackUrl, { event: "color_plan.failed", jobId, status: "failed", error: err?.message || "彩平生成失败" }).catch(console.error);
        }
      }
    })().catch(console.error);

    res.json({ data: { jobId, status: "processing" } });
  } catch (error) {
    console.error("[API] color-plan/generate error:", error);
    res.status(500).json({ error: "Failed to create color plan job", code: "INTERNAL_ERROR" });
  }
});

// GET /api/v1/color-plan/status/:jobId
router.get("/color-plan/status/:jobId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { jobId } = req.params;
    const job = colorPlanJobStoreApi.get(jobId);
    if (!job) return res.status(404).json({ error: "Job not found or expired (jobs expire after 10 minutes)", code: "NOT_FOUND" });
    if (job.status === "done") return res.json({ data: { jobId, status: "done", url: job.url, historyId: job.historyId } });
    if (job.status === "failed") return res.json({ data: { jobId, status: "failed", error: job.error } });
    res.json({ data: { jobId, status: "processing" } });
  } catch (error) {
    res.status(500).json({ error: "Failed to get job status", code: "INTERNAL_ERROR" });
  }
});

// ─── Analysis Image REST API ─────────────────────────────────

// POST /api/v1/analysis-image/submit
router.post("/analysis-image/submit", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { type, referenceImageUrl, referenceImageContentType, extraPrompt, aspectRatio, count = 1, toolId, callbackUrl } = req.body;
    if (!type || !referenceImageUrl) return res.status(400).json({ error: "type and referenceImageUrl are required", code: "VALIDATION_ERROR" });
    if (!["material", "soft_furnishing"].includes(type)) return res.status(400).json({ error: "type must be material or soft_furnishing", code: "VALIDATION_ERROR" });
    const safeCount = Math.min(Math.max(parseInt(count) || 1, 1), 3);
    let width: number | undefined; let height: number | undefined;
    if (aspectRatio) {
      const parts = String(aspectRatio).split("x");
      if (parts.length === 2) { width = parseInt(parts[0], 10); height = parseInt(parts[1], 10); }
    }
    const jobIds: string[] = [];
    for (let i = 0; i < safeCount; i++) {
      const jobId = nanoid();
      await db.createAnalysisImageJob({ id: jobId, userId: user.id, type, toolId: toolId ?? null, referenceImageUrl, width: width ?? null, height: height ?? null });
      // Fire-and-forget background generation
      (async () => {
        try {
          await db.updateAnalysisImageJob(jobId, { status: "processing" });
          const builtinPrompt = await db.getAnalysisImagePrompt(type);
          const basePrompt = builtinPrompt?.prompt ?? (type === "material" ? "Generate a professional material palette board based on the reference image." : "Generate a professional soft furnishing mood board based on the reference image.");
          const fullPrompt = extraPrompt ? `${basePrompt}\n\n${extraPrompt}` : basePrompt;
          await db.updateAnalysisImageJob(jobId, { fullPrompt });
          const sizeStr = (width && height) ? `${width}x${height}` : undefined;
          const refMimeType = referenceImageContentType || (/\.png$/i.test(referenceImageUrl) ? "image/png" : /\.webp$/i.test(referenceImageUrl) ? "image/webp" : "image/jpeg");
          let resultUrl: string;
          if (toolId) {
            const r = await generateImageWithTool({ toolId, prompt: fullPrompt, originalImages: [{ url: referenceImageUrl, mimeType: refMimeType }], size: sizeStr });
            resultUrl = r.url;
          } else {
            const r = await generateImage({ prompt: fullPrompt, originalImages: [{ url: referenceImageUrl, mimeType: refMimeType }], size: sizeStr });
            resultUrl = r.url || "";
          }
          const historyEntry = await db.createGenerationHistory({ userId: user.id, module: "analysis_image", title: type === "material" ? "材质搜配图" : "软装搜配图", outputUrl: resultUrl, inputParams: { type, toolId, referenceImageUrl, fullPrompt } });
          await db.updateAnalysisImageJob(jobId, { status: "done", resultUrl, historyId: historyEntry.id });
          if (callbackUrl) {
            await fireWebhook(callbackUrl, { event: "analysis_image.done", jobId, status: "done", url: resultUrl, historyId: historyEntry.id }).catch(console.error);
          }
        } catch (err: any) {
          await db.updateAnalysisImageJob(jobId, { status: "failed", error: err?.message || "生成失败" });
          if (callbackUrl) {
            await fireWebhook(callbackUrl, { event: "analysis_image.failed", jobId, status: "failed", error: err?.message || "生成失败" }).catch(console.error);
          }
        }
      })().catch(console.error);
      jobIds.push(jobId);
    }
    res.json({ data: { jobId: jobIds[0], jobIds } });
  } catch (error) {
    console.error("[API] analysis-image/submit error:", error);
    res.status(500).json({ error: "Failed to submit analysis image job", code: "INTERNAL_ERROR" });
  }
});

// GET /api/v1/analysis-image/status/:jobId
router.get("/analysis-image/status/:jobId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { jobId } = req.params;
    const job = await db.getAnalysisImageJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    if (job.userId !== user.id) return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    if (job.status === "done") return res.json({ data: { jobId, status: "done", url: job.resultUrl, historyId: job.historyId } });
    if (job.status === "failed") return res.json({ data: { jobId, status: "failed", error: job.error } });
    res.json({ data: { jobId, status: job.status } });
  } catch (error) {
    res.status(500).json({ error: "Failed to get job status", code: "INTERNAL_ERROR" });
  }
});

// ─── Video Generation REST API ───────────────────────────────

// POST /api/v1/video/generate
router.post("/video/generate", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { mode, prompt, duration, toolId, inputImageUrl, callbackUrl } = req.body;
    if (!mode || !prompt || !duration || !toolId) return res.status(400).json({ error: "mode, prompt, duration, and toolId are required", code: "VALIDATION_ERROR" });
    if (!["-to-video", "image-to-video"].includes(mode)) return res.status(400).json({ error: "mode must be text-to-video or image-to-video", code: "VALIDATION_ERROR" });
    if (mode === "image-to-video" && !inputImageUrl) return res.status(400).json({ error: "inputImageUrl is required for image-to-video mode", code: "VALIDATION_ERROR" });
    const tool = await db.getAiToolById(parseInt(toolId));
    if (!tool) return res.status(404).json({ error: "Tool not found", code: "NOT_FOUND" });
    const result = await generateVideoWithTool({
      mode, prompt, duration: parseInt(duration), inputImageUrl,
      tool: { id: tool.id, name: tool.name, apiEndpoint: tool.apiEndpoint || undefined, apiKeyEncrypted: tool.apiKeyEncrypted || undefined, configJson: (tool.configJson as Record<string, unknown> | undefined) || undefined },
    });
    await db.db.insert(db.videoHistory).values({ userId: user.id, toolId: tool.id, mode, prompt, duration: parseInt(duration), inputImageUrl, taskId: result.taskId, status: result.status, outputVideoUrl: result.videoUrl, errorMessage: result.errorMessage });
    res.json({ data: { taskId: result.taskId, status: result.status, videoUrl: result.videoUrl, errorMessage: result.errorMessage } });
    // Fire webhook asynchronously if callbackUrl provided
    if (callbackUrl) {
      if (result.status === "completed") {
        fireWebhook(callbackUrl, { event: "video.done", taskId: result.taskId, status: "completed", videoUrl: result.videoUrl }).catch(console.error);
      } else if (result.status === "failed") {
        fireWebhook(callbackUrl, { event: "video.failed", taskId: result.taskId, status: "failed", error: result.errorMessage }).catch(console.error);
      } else {
        // Task is still pending/processing — poll until done, then fire webhook
        (async () => {
          const maxPolls = 60; // up to 5 minutes (5s interval)
          for (let i = 0; i < maxPolls; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            try {
              const apiStatus = await queryVideoTaskStatus(
                result.taskId,
                { name: tool.name, apiKeyEncrypted: tool.apiKeyEncrypted || undefined, configJson: (tool.configJson as Record<string, unknown> | undefined) || undefined },
                (mode as "text-to-video" | "image-to-video")
              );
              if (apiStatus.status === "completed") {
                let permanentVideoUrl = apiStatus.videoUrl;
                if (apiStatus.videoUrl) {
                  try {
                    const videoResp = await fetch(apiStatus.videoUrl);
                    if (videoResp.ok) {
                      const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
                      const s3Key = `video-history/${user.id}/${Date.now()}.mp4`;
                      const { url: s3Url } = await storagePut(s3Key, videoBuffer, "video/mp4");
                      permanentVideoUrl = s3Url;
                    }
                  } catch { /* use original URL */ }
                }
                // Update video history record by taskId
                const records = await db.listVideoHistory(user.id);
                const rec = records.find((r: any) => r.taskId === result.taskId);
                if (rec) await db.updateVideoHistory(rec.id, { status: "completed", outputVideoUrl: permanentVideoUrl });
                await fireWebhook(callbackUrl, { event: "video.done", taskId: result.taskId, status: "completed", videoUrl: permanentVideoUrl }).catch(console.error);
                break;
              } else if (apiStatus.status === "failed") {
                const records = await db.listVideoHistory(user.id);
                const rec = records.find((r: any) => r.taskId === result.taskId);
                if (rec) await db.updateVideoHistory(rec.id, { status: "failed", errorMessage: apiStatus.errorMessage });
                await fireWebhook(callbackUrl, { event: "video.failed", taskId: result.taskId, status: "failed", error: apiStatus.errorMessage }).catch(console.error);
                break;
              }
            } catch (err) { console.error("[Webhook] video poll error:", err); }
          }
        })();
      }
    }
  } catch (error) {
    console.error("[API] video/generate error:", error);
    res.status(500).json({ error: "Failed to generate video", code: "INTERNAL_ERROR" });
  }
});

// GET /api/v1/video/status/:taskId
router.get("/video/status/:taskId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).apiUser;
    if (!user) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    const { taskId } = req.params;
    const records = await db.listVideoHistory(user.id);
    const record = records.find((r: any) => r.taskId === taskId);
    if (!record) return res.status(404).json({ error: "Task not found", code: "NOT_FOUND" });
    if (record.status === "pending" || record.status === "processing") {
      try {
        const tool = record.toolId ? await db.getAiToolById(record.toolId) : null;
        if (tool && record.taskId) {
          const apiStatus = await queryVideoTaskStatus(record.taskId, { name: tool.name, apiKeyEncrypted: tool.apiKeyEncrypted || undefined, configJson: (tool.configJson as Record<string, unknown> | undefined) || undefined }, (record.mode as "text-to-video" | "image-to-video") || "text-to-video");
          let permanentVideoUrl = apiStatus.videoUrl;
          if (apiStatus.status === "completed" && apiStatus.videoUrl) {
            try {
              const videoResp = await fetch(apiStatus.videoUrl);
              if (videoResp.ok) {
                const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
                const s3Key = `video-history/${user.id}/${record.id}-${Date.now()}.mp4`;
                const { url: s3Url } = await storagePut(s3Key, videoBuffer, "video/mp4");
                permanentVideoUrl = s3Url;
              }
            } catch { /* use original URL if S3 upload fails */ }
          }
          await db.updateVideoHistory(record.id, { status: apiStatus.status, outputVideoUrl: permanentVideoUrl, errorMessage: apiStatus.errorMessage });
          return res.json({ data: { taskId, status: apiStatus.status, videoUrl: permanentVideoUrl, errorMessage: apiStatus.errorMessage, progress: apiStatus.progress || 0 } });
        }
      } catch (err) { console.error("[API] video/status query failed:", err); }
    }
    let progress = record.status === "pending" ? 10 : record.status === "processing" ? 50 : record.status === "completed" ? 100 : 0;
    res.json({ data: { taskId, status: record.status, videoUrl: record.outputVideoUrl, errorMessage: record.errorMessage, progress } });
  } catch (error) {
    res.status(500).json({ error: "Failed to get video status", code: "INTERNAL_ERROR" });
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
