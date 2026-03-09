import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import crypto from "crypto";
import PptxGenJS from "pptxgenjs";
import { scrapeProjectPage, downloadImageAsBase64, searchPexelsImages } from "./scraper";

// ─── Dashboard ───────────────────────────────────────────

const dashboardRouter = router({
  stats: protectedProcedure.query(async () => {
    return db.getDashboardStats();
  }),
});

// ─── Projects ────────────────────────────────────────────

const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.listProjects(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const project = await db.getProjectById(input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      return project;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      code: z.string().optional(),
      description: z.string().optional(),
      clientName: z.string().optional(),
      status: z.enum(["planning", "design", "construction", "completed", "archived"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createProject({ ...input, createdBy: ctx.user.id });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      code: z.string().optional(),
      description: z.string().optional(),
      clientName: z.string().optional(),
      status: z.enum(["planning", "design", "construction", "completed", "archived"]).optional(),
      phase: z.enum(["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateProject(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProject(input.id);
      return { success: true };
    }),
});

// ─── Tasks ───────────────────────────────────────────────

const tasksRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listTasksByProject(input.projectId);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      category: z.enum(["design", "construction", "management", "other"]).optional(),
      assigneeId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createTask({ ...input, createdBy: ctx.user.id });
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["backlog", "todo", "in_progress", "review", "done"]) }))
    .mutation(async ({ input }) => {
      await db.updateTaskStatus(input.id, input.status);
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      category: z.enum(["design", "construction", "management", "other"]).optional(),
      status: z.enum(["backlog", "todo", "in_progress", "review", "done"]).optional(),
      assigneeId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateTask(id, data as any);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteTask(input.id);
      return { success: true };
    }),
});

// ─── Documents ───────────────────────────────────────────

const documentsRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listDocumentsByProject(input.projectId);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      title: z.string().min(1),
      content: z.string().optional(),
      type: z.enum(["brief", "report", "minutes", "specification", "checklist", "schedule", "other"]).optional(),
      category: z.enum(["design", "construction", "management"]).optional(),
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createDocument({ ...input, createdBy: ctx.user.id });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const doc = await db.getDocumentById(input.id);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "文档不存在" });
      return doc;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateDocument(id, data);
      return { success: true };
    }),
});

// ─── Assets ──────────────────────────────────────────────

const assetsRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.listAssets(input);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.string().optional(),
      fileUrl: z.string(),
      fileKey: z.string(),
      fileType: z.string().optional(),
      fileSize: z.number().optional(),
      thumbnailUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createAsset({ ...input, uploadedBy: ctx.user.id });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAsset(input.id);
      return { success: true };
    }),

  upload: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      fileData: z.string(), // base64
      contentType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const key = `assets/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url, key };
    }),
});

// ─── Standards ───────────────────────────────────────────

const standardsRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.listStandards(input);
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      content: z.string().optional(),
      category: z.enum(["design_spec", "construction_spec", "quality_checklist", "material_spec", "other"]).optional(),
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createStandard({ ...input, createdBy: ctx.user.id });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
      category: z.enum(["design_spec", "construction_spec", "quality_checklist", "material_spec", "other"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateStandard(id, data);
      return { success: true };
    }),
});

// ─── AI Tools ────────────────────────────────────────────

const aiToolsRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional(), activeOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return db.listAiTools(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const tool = await db.getAiToolById(input.id);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND", message: "工具不存在" });
      return tool;
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["rendering", "document", "image", "video", "layout", "analysis", "other"]),
      provider: z.string().optional(),
      apiEndpoint: z.string().optional(),
      apiKeyName: z.string().optional(),
      configJson: z.any().optional(),
      iconUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createAiTool({ ...input, createdBy: ctx.user.id });
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.enum(["rendering", "document", "image", "video", "layout", "analysis", "other"]).optional(),
      provider: z.string().optional(),
      apiEndpoint: z.string().optional(),
      apiKeyName: z.string().optional(),
      configJson: z.any().optional(),
      isActive: z.boolean().optional(),
      iconUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateAiTool(id, data);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAiTool(input.id);
      return { success: true };
    }),
});

// ─── AI Module: Benchmarking Research ────────────────────

const benchmarkRouter = router({
  generate: protectedProcedure
    .input(z.object({
      projectName: z.string(),
      projectType: z.string(),
      requirements: z.string(),
      referenceCount: z.number().min(1).max(10).optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();
      // Fetch configured case source sites to guide LLM
      const caseSrcList = await db.listCaseSources(true);
      const siteNames = caseSrcList.map(s => s.name).join('、');
      const siteUrls = caseSrcList.map(s => `${s.name} (${s.baseUrl})`).join('\n');
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `你是 N+1 STUDIOS 的建筑设计对标调研专家。请根据用户提供的项目信息，生成一份专业的对标调研报告。

**重要要求**：
- 所有对标案例必须是真实存在的建筑项目
- 每个案例必须标注信息来源 URL（优先使用以下网站的真实项目页面链接）：
${siteUrls}
- 来源 URL 格式：在每个案例标题后用 Markdown 链接标注，例如 [来源](https://www.archdaily.com/xxx)
- 如果无法确定精确 URL，请提供该网站上可搜索到该项目的搜索链接

报告结构：
1. **项目概述与调研目标**
2. **对标案例分析**（${input.referenceCount || 5} 个案例，每个案例包含）：
   - 项目名称 + 来源链接
   - 设计单位
   - 项目概况（位置、面积、完成时间）
   - 设计亮点分析
   - 与本项目的关联性分析
3. **设计策略建议**
4. **材料与工艺参考**
5. **总结与建议**

请以 Markdown 格式输出，结构清晰，内容专业。每个案例的来源链接必须清晰可见。`
            },
            {
              role: "user",
              content: `项目名称：${input.projectName}\n项目类型：${input.projectType}\n项目需求：${input.requirements}`
            }
          ],
        });

        const content = typeof response.choices[0]?.message?.content === 'string'
          ? response.choices[0].message.content
          : '';

        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "benchmark_research",
          inputSummary: `${input.projectName} - ${input.projectType}`,
          outputSummary: content.substring(0, 200),
          status: "success",
          durationMs: Date.now() - startTime,
        });

        return { content, generatedAt: new Date().toISOString() };
      } catch (error) {
        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "benchmark_research",
          inputSummary: `${input.projectName} - ${input.projectType}`,
          status: "failed",
          durationMs: Date.now() - startTime,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "调研报告生成失败" });
      }
    }),

  // List configured case source sites (for admin management)
  listCaseSources: protectedProcedure.query(async () => {
    return db.listCaseSources(true);
  }),

  exportPpt: protectedProcedure
    .input(z.object({ content: z.string().min(1), title: z.string().min(1), projectType: z.string().optional() }))
    .mutation(async ({ input }) => {
      // Step 1: Use LLM to structure the report into ~15 slides
      // Key change: each case page must include a sourceUrl for real photo scraping
      // and a pexelsQuery for design concept pages
      const structureResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是 N+1 STUDIOS 的建筑设计 PPT 制作专家。请将以下对标调研报告转换为约 15 页的 PPT 结构。

要求：
- 第1页：封面（layout: cover）
- 第2页：目录页（layout: toc）
- 第3页：项目概述与调研目标（layout: text_only）
- 第4-12页：对标案例详细分析（每个案例 1-2 页，layout: case_study）
- 第13页：设计策略建议汇总（layout: concept，配图用 Pexels 图库）
- 第14页：材料与工艺参考（layout: concept，配图用 Pexels 图库）
- 第15页：总结与下一步建议（layout: summary）

**关键区分**：
- case_study 页：用于对标案例介绍。必须提供 sourceUrl 字段，填写报告中该案例的真实来源网页 URL（如 ArchDaily、Dezeen 等网站的项目页面）。这些页面的真实照片将被抓取作为 PPT 配图。
- concept 页：用于设计思路、材料工艺等。提供 pexelsQuery 字段（英文），用于从 Pexels 图库搜索配图。

每页字段：
- title: 标题
- subtitle: 副标题（可为空字符串）
- bullets: 要点数组，每项不超过40字
- sourceUrl: 案例来源网页 URL（仅 case_study 页面填写，其他页填空字符串）
- pexelsQuery: Pexels 图片搜索关键词（仅 concept 页面填写，英文，如 "modern office interior design materials"，其他页填空字符串）
- layout: cover / toc / text_only / case_study / concept / summary`
          },
          { role: "user", content: `项目类型：${input.projectType || "办公空间"}\n\n${input.content}` }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ppt_structure_v2",
            strict: true,
            schema: {
              type: "object",
              properties: {
                slides: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      subtitle: { type: "string" },
                      bullets: { type: "array", items: { type: "string" } },
                      sourceUrl: { type: "string" },
                      pexelsQuery: { type: "string" },
                      layout: { type: "string", enum: ["cover", "toc", "text_only", "case_study", "concept", "summary"] }
                    },
                    required: ["title", "subtitle", "bullets", "sourceUrl", "pexelsQuery", "layout"],
                    additionalProperties: false
                  }
                }
              },
              required: ["slides"],
              additionalProperties: false
            }
          }
        }
      });

      const structureContent = typeof structureResponse.choices[0]?.message?.content === 'string'
        ? structureResponse.choices[0].message.content
        : '{"slides":[]}';

      const slideData = JSON.parse(structureContent) as {
        slides: Array<{
          title: string;
          subtitle: string;
          bullets: string[];
          sourceUrl: string;
          pexelsQuery: string;
          layout: string;
        }>
      };

      // Step 2: Scrape real case photos from source URLs + search Pexels for concept pages
      const imageBase64Map: Map<number, { data: string; ext: string }> = new Map();

      // 2a: Scrape case study pages for real photos
      const caseSlides = slideData.slides
        .map((s, i) => ({ index: i, url: s.sourceUrl, layout: s.layout }))
        .filter(s => s.layout === "case_study" && s.url && s.url.startsWith("http"));

      for (const cs of caseSlides) {
        try {
          const scraped = await scrapeProjectPage(cs.url);
          if (scraped && scraped.images.length > 0) {
            // Download the best image (first one, usually hero image)
            const imgUrl = scraped.images[0].url;
            const b64 = await downloadImageAsBase64(imgUrl);
            if (b64) {
              // Extract mime type from data URI
              const mimeMatch = b64.match(/^data:(image\/\w+);/);
              const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'jpeg';
              const rawB64 = b64.replace(/^data:image\/\w+;base64,/, '');
              imageBase64Map.set(cs.index, { data: rawB64, ext });
            }
          }
        } catch (err) {
          console.error(`[PPT] Failed to scrape case ${cs.url}:`, err);
        }
      }

      // 2b: Search Pexels for concept/design pages
      const conceptSlides = slideData.slides
        .map((s, i) => ({ index: i, query: s.pexelsQuery, layout: s.layout }))
        .filter(s => s.layout === "concept" && s.query && s.query.trim().length > 0);

      for (const cs of conceptSlides) {
        try {
          const pexelsResults = await searchPexelsImages(cs.query, 1);
          if (pexelsResults.length > 0 && pexelsResults[0].url) {
            const b64 = await downloadImageAsBase64(pexelsResults[0].url);
            if (b64) {
              const mimeMatch = b64.match(/^data:(image\/\w+);/);
              const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'jpeg';
              const rawB64 = b64.replace(/^data:image\/\w+;base64,/, '');
              imageBase64Map.set(cs.index, { data: rawB64, ext });
            }
          }
        } catch (err) {
          console.error(`[PPT] Failed to fetch Pexels image for "${cs.query}":`, err);
        }
      }

      // Step 4: Build PPTX with pptxgenjs
      const pptx = new PptxGenJS();
      pptx.author = "N+1 STUDIOS";
      pptx.company = "N+1 STUDIOS";
      pptx.title = `${input.title} - 对标调研报告`;
      pptx.layout = "LAYOUT_16x9";

      const C = {
        bg: "F5F0EB", darkBg: "2C2C2C", title: "2C2C2C", subtitle: "6B6560",
        accent: "C17F59", text: "3D3D3D", white: "FFFFFF", lightGray: "F0ECE7",
      };

      for (let i = 0; i < slideData.slides.length; i++) {
        const sd = slideData.slides[i];
        const s = pptx.addSlide();
        const hasImage = imageBase64Map.has(i);

        if (sd.layout === "cover") {
          // ── Cover Slide ──
          s.background = { color: C.darkBg };
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
          s.addText(sd.title, {
            x: 0.8, y: 1.8, w: 8.4, h: 1.2,
            fontSize: 36, fontFace: "Microsoft YaHei", color: C.white, bold: true,
          });
          s.addText(sd.subtitle || "对标调研报告", {
            x: 0.8, y: 3.1, w: 8.4, h: 0.6,
            fontSize: 18, fontFace: "Microsoft YaHei", color: C.accent,
          });
          s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 3.9, w: 1.5, h: 0.04, fill: { color: C.accent } });
          s.addText(`N+1 STUDIOS | ${new Date().toLocaleDateString("zh-CN")}`, {
            x: 0.8, y: 4.6, w: 8.4, h: 0.4,
            fontSize: 11, fontFace: "Microsoft YaHei", color: C.subtitle,
          });

        } else if (sd.layout === "toc") {
          // ── Table of Contents ──
          s.background = { color: C.white };
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: C.accent } });
          s.addText(sd.title, {
            x: 0.5, y: 0.3, w: 9, h: 0.7,
            fontSize: 24, fontFace: "Microsoft YaHei", color: C.title, bold: true,
          });
          const tocItems = sd.bullets.map((b, idx) => ({
            text: `${String(idx + 1).padStart(2, "0")}   ${b}`,
            options: {
              fontSize: 14, fontFace: "Microsoft YaHei", color: C.text,
              paraSpaceAfter: 10, lineSpacingMultiple: 1.6,
            },
          }));
          s.addText(tocItems as any, { x: 0.8, y: 1.2, w: 8.4, h: 4.0, valign: "top" });

        } else if (sd.layout === "case_study") {
          // ── Case Study: real scraped photo + text ──
          s.background = { color: C.white };
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });

          if (hasImage) {
            // Split layout: text left, real photo right
            s.addText(sd.title, {
              x: 0.6, y: 0.3, w: 4.6, h: 0.7,
              fontSize: 20, fontFace: "Microsoft YaHei", color: C.title, bold: true,
            });
            if (sd.subtitle) {
              s.addText(sd.subtitle, {
                x: 0.6, y: 0.95, w: 4.6, h: 0.4,
                fontSize: 11, fontFace: "Microsoft YaHei", color: C.accent, italic: true,
              });
            }
            const imgData = imageBase64Map.get(i)!;
            s.addImage({
              data: `image/${imgData.ext};base64,${imgData.data}`,
              x: 5.4, y: 0.3, w: 4.3, h: 3.2,
              rounding: true,
            });
            const bullets = sd.bullets.map(b => ({
              text: b,
              options: {
                fontSize: 12, fontFace: "Microsoft YaHei", color: C.text,
                bullet: { code: "25CF", color: C.accent }, paraSpaceAfter: 6, lineSpacingMultiple: 1.4,
              },
            }));
            s.addText(bullets as any, { x: 0.6, y: 1.4, w: 4.6, h: 3.5, valign: "top" });
            // Source attribution
            if (sd.sourceUrl) {
              s.addText(`来源：${sd.sourceUrl}`, {
                x: 0.6, y: 5.1, w: 8, h: 0.3,
                fontSize: 7, fontFace: "Microsoft YaHei", color: C.subtitle,
                hyperlink: { url: sd.sourceUrl },
              });
            }
          } else {
            // No image scraped: full-width text layout
            s.addText(sd.title, {
              x: 0.8, y: 0.3, w: 8.4, h: 0.7,
              fontSize: 22, fontFace: "Microsoft YaHei", color: C.title, bold: true,
            });
            if (sd.subtitle) {
              s.addText(sd.subtitle, {
                x: 0.8, y: 0.95, w: 8.4, h: 0.4,
                fontSize: 12, fontFace: "Microsoft YaHei", color: C.accent, italic: true,
              });
            }
            const bullets = sd.bullets.map(b => ({
              text: b,
              options: {
                fontSize: 14, fontFace: "Microsoft YaHei", color: C.text,
                bullet: { code: "25CF", color: C.accent }, paraSpaceAfter: 8, lineSpacingMultiple: 1.4,
              },
            }));
            s.addText(bullets as any, { x: 0.8, y: 1.5, w: 8.4, h: 3.3, valign: "top" });
            if (sd.sourceUrl) {
              s.addText(`来源：${sd.sourceUrl}`, {
                x: 0.8, y: 5.1, w: 8, h: 0.3,
                fontSize: 7, fontFace: "Microsoft YaHei", color: C.subtitle,
                hyperlink: { url: sd.sourceUrl },
              });
            }
          }

        } else if (sd.layout === "concept") {
          // ── Design Concept: Pexels photo + text ──
          s.background = { color: C.lightGray };
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });

          if (hasImage) {
            // Large image top, text bottom
            const imgData = imageBase64Map.get(i)!;
            s.addImage({
              data: `image/${imgData.ext};base64,${imgData.data}`,
              x: 0.5, y: 0.3, w: 9.0, h: 3.2,
              rounding: true,
            });
            s.addText(sd.title, {
              x: 0.5, y: 3.6, w: 9, h: 0.5,
              fontSize: 18, fontFace: "Microsoft YaHei", color: C.title, bold: true,
            });
            const bullets = sd.bullets.map(b => ({
              text: b,
              options: {
                fontSize: 12, fontFace: "Microsoft YaHei", color: C.text,
                bullet: { code: "25B8", color: C.accent }, paraSpaceAfter: 5, lineSpacingMultiple: 1.3,
              },
            }));
            s.addText(bullets as any, { x: 0.5, y: 4.15, w: 9, h: 1.2, valign: "top" });
            s.addText("配图来源：Pexels", {
              x: 0.5, y: 5.1, w: 4, h: 0.3,
              fontSize: 7, fontFace: "Microsoft YaHei", color: C.subtitle,
            });
          } else {
            // No Pexels image: text-only fallback
            s.addText(sd.title, {
              x: 0.8, y: 0.3, w: 8.4, h: 0.7,
              fontSize: 22, fontFace: "Microsoft YaHei", color: C.title, bold: true,
            });
            const bullets = sd.bullets.map(b => ({
              text: b,
              options: {
                fontSize: 14, fontFace: "Microsoft YaHei", color: C.text,
                bullet: { code: "25B8", color: C.accent }, paraSpaceAfter: 8, lineSpacingMultiple: 1.4,
              },
            }));
            s.addText(bullets as any, { x: 0.8, y: 1.2, w: 8.4, h: 4.0, valign: "top" });
          }

        } else if (sd.layout === "summary") {
          // ── Summary Slide ──
          s.background = { color: C.darkBg };
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
          s.addText(sd.title, {
            x: 0.8, y: 0.4, w: 8.4, h: 0.8,
            fontSize: 24, fontFace: "Microsoft YaHei", color: C.white, bold: true,
          });
          const summaryBullets = sd.bullets.map(b => ({
            text: b,
            options: {
              fontSize: 13, fontFace: "Microsoft YaHei", color: C.lightGray,
              bullet: { code: "25B8", color: C.accent }, paraSpaceAfter: 8, lineSpacingMultiple: 1.5,
            },
          }));
          s.addText(summaryBullets as any, { x: 0.8, y: 1.4, w: 8.4, h: 3.8, valign: "top" });
          s.addText("N+1 STUDIOS | 谢谢", {
            x: 0.8, y: 5.1, w: 8.4, h: 0.3,
            fontSize: 10, fontFace: "Microsoft YaHei", color: C.accent,
          });

        } else {
          // ── Default text_only / fallback ──
          s.background = { color: C.white };
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
          s.addText(sd.title, {
            x: 0.8, y: 0.3, w: 8.4, h: 0.7,
            fontSize: 22, fontFace: "Microsoft YaHei", color: C.title, bold: true,
          });
          if (sd.subtitle) {
            s.addText(sd.subtitle, {
              x: 0.8, y: 0.95, w: 8.4, h: 0.4,
              fontSize: 12, fontFace: "Microsoft YaHei", color: C.accent, italic: true,
            });
          }
          const textBullets = sd.bullets.map(b => ({
            text: b,
            options: {
              fontSize: 14, fontFace: "Microsoft YaHei", color: C.text,
              bullet: { code: "25CF", color: C.accent }, paraSpaceAfter: 8, lineSpacingMultiple: 1.4,
            },
          }));
          s.addText(textBullets as any, { x: 0.8, y: 1.5, w: 8.4, h: 3.8, valign: "top" });
          s.addText("N+1 STUDIOS", {
            x: 0.8, y: 5.1, w: 4, h: 0.3,
            fontSize: 8, fontFace: "Microsoft YaHei", color: C.subtitle,
          });
        }
      }

      // Step 5: Export PPTX and upload to S3
      const pptxBase64 = await pptx.write({ outputType: "base64" }) as string;
      const pptxBuffer = Buffer.from(pptxBase64, "base64");
      const fileKey = `pptx/${nanoid()}-${input.title}.pptx`;
      const { url } = await storagePut(fileKey, pptxBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation");

      return {
        url,
        title: input.title,
        slideCount: slideData.slides.length,
        imageCount: imageBase64Map.size,
      };
    }),
});

// ─── AI Module: Rendering / Sketch ───────────────────────

const renderingRouter = router({
  generate: protectedProcedure
    .input(z.object({
      prompt: z.string().min(1),
      style: z.string().optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();
      const fullPrompt = input.style
        ? `${input.prompt}, style: ${input.style}`
        : input.prompt;

      try {
        const result = await generateImage({ prompt: fullPrompt });

        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "rendering_generate",
          inputSummary: fullPrompt.substring(0, 200),
          outputSummary: result.url || "",
          status: "success",
          durationMs: Date.now() - startTime,
        });

        return { url: result.url, prompt: fullPrompt };
      } catch (error) {
        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "rendering_generate",
          inputSummary: fullPrompt.substring(0, 200),
          status: "failed",
          durationMs: Date.now() - startTime,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "图像生成失败，请稍后重试" });
      }
    }),

  edit: protectedProcedure
    .input(z.object({
      prompt: z.string().min(1),
      imageUrl: z.string(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();
      try {
        const result = await generateImage({
          prompt: input.prompt,
          originalImages: [{ url: input.imageUrl, mimeType: "image/png" }],
        });

        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "rendering_edit",
          inputSummary: input.prompt.substring(0, 200),
          outputSummary: result.url || "",
          status: "success",
          durationMs: Date.now() - startTime,
        });

        return { url: result.url, prompt: input.prompt };
      } catch (error) {
        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "rendering_edit",
          status: "failed",
          durationMs: Date.now() - startTime,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "图像编辑失败" });
      }
    }),
});

// ─── AI Module: Meeting Minutes ──────────────────────────

const meetingRouter = router({
  transcribe: protectedProcedure
    .input(z.object({
      audioUrl: z.string(),
      language: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language || "zh",
        prompt: "会议录音转写",
      });
      if ('error' in result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return result;
    }),

  generateMinutes: protectedProcedure
    .input(z.object({
      transcript: z.string(),
      projectName: z.string().optional(),
      meetingDate: z.string().optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `你是 N+1 STUDIOS 的会议纪要整理专家。请根据会议录音转写文本，生成一份结构化的会议纪要。

格式要求：
1. 会议基本信息（日期、项目名称）
2. 参会人员（从对话中推断）
3. 会议议题与讨论要点
4. 决议事项（明确的决定）
5. 待办事项（谁、做什么、截止时间）
6. 下次会议安排

请以 Markdown 格式输出，语言简洁专业。`
            },
            {
              role: "user",
              content: `项目：${input.projectName || "未指定"}\n日期：${input.meetingDate || new Date().toLocaleDateString("zh-CN")}\n\n录音转写文本：\n${input.transcript}`
            }
          ],
        });

        const content = typeof response.choices[0]?.message?.content === 'string'
          ? response.choices[0].message.content
          : '';

        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "meeting_minutes",
          inputSummary: `${input.projectName || "会议"} - ${input.meetingDate || "今日"}`,
          outputSummary: content.substring(0, 200),
          status: "success",
          durationMs: Date.now() - startTime,
        });

        return { content, generatedAt: new Date().toISOString() };
      } catch (error) {
        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "meeting_minutes",
          status: "failed",
          durationMs: Date.now() - startTime,
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "会议纪要生成失败" });
      }
    }),

  uploadAudio: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      fileData: z.string(), // base64
      contentType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const sizeMB = buffer.length / (1024 * 1024);
      if (sizeMB > 16) throw new TRPCError({ code: "BAD_REQUEST", message: "音频文件不能超过 16MB" });
      const key = `audio/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url, key };
    }),
});

// ─── Admin ───────────────────────────────────────────────

const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    return db.listUsers();
  }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input }) => {
      await db.updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  // API Keys management
  listApiKeys: adminProcedure.query(async () => {
    return db.listApiKeys();
  }),

  createApiKey: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      permissions: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rawKey = `nplus1_${nanoid(32)}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.substring(0, 12);
      await db.createApiKey({
        name: input.name,
        keyHash,
        keyPrefix,
        permissions: input.permissions || "read",
        createdBy: ctx.user.id,
      });
      return { key: rawKey, prefix: keyPrefix };
    }),

  deleteApiKey: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteApiKey(input.id);
      return { success: true };
    }),

  // Webhooks management
  listWebhooks: adminProcedure.query(async () => {
    return db.listWebhooks();
  }),

  createWebhook: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      url: z.string().url(),
      events: z.string(),
      secret: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createWebhook({ ...input, createdBy: ctx.user.id });
    }),

  updateWebhook: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      url: z.string().url().optional(),
      events: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateWebhook(id, data);
      return { success: true };
    }),

  deleteWebhook: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteWebhook(input.id);
      return { success: true };
    }),

  // Case Sources management (for benchmark scraping)
  listCaseSources: adminProcedure.query(async () => {
    return db.listCaseSources(false);
  }),

  createCaseSource: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      baseUrl: z.string().url(),
      description: z.string().optional(),
      imageSelector: z.string().optional(),
      titleSelector: z.string().optional(),
      descSelector: z.string().optional(),
      imageDomain: z.string().optional(),
      preferredSize: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createCaseSource({ ...input, createdBy: ctx.user.id });
    }),

  updateCaseSource: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      baseUrl: z.string().url().optional(),
      description: z.string().optional(),
      imageSelector: z.string().optional(),
      titleSelector: z.string().optional(),
      descSelector: z.string().optional(),
      imageDomain: z.string().optional(),
      preferredSize: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateCaseSource(id, data);
      return { success: true };
    }),

  deleteCaseSource: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCaseSource(input.id);
      return { success: true };
    }),
});

// ─── File Upload ─────────────────────────────────────────

const uploadRouter = router({
  file: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      fileData: z.string(), // base64
      contentType: z.string(),
      folder: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const folder = input.folder || "uploads";
      const key = `${folder}/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url, key };
    }),
});

// ─── Main Router ─────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: dashboardRouter,
  projects: projectsRouter,
  tasks: tasksRouter,
  documents: documentsRouter,
  assets: assetsRouter,
  standards: standardsRouter,
  aiTools: aiToolsRouter,
  benchmark: benchmarkRouter,
  rendering: renderingRouter,
  meeting: meetingRouter,
  admin: adminRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
