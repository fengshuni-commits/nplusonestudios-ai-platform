import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { nanoid } from "nanoid";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { generateGraphicLayoutAsync } from "./graphicLayoutService";

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
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return res.status(500).json({ error: "Database unavailable", code: "INTERNAL_ERROR" });
    const { graphicLayoutJobs } = await import("../drizzle/schema");
    const { eq: _eq, and: _and } = await import("drizzle-orm");
    const [job] = await drizzleDb.select().from(graphicLayoutJobs)
      .where(_and(_eq(graphicLayoutJobs.id, jobId), _eq(graphicLayoutJobs.userId, user.id)))
      .limit(1);
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
