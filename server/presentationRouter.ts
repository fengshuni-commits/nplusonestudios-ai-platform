/**
 * Presentation Router
 * New AI-driven workflow:
 *   1. Create project with description + assets
 *   2. AI generates per-slide prompts
 *   3. AI generates full-page images with text coordinates stored as percentages
 *   4. Export editable PPTX
 */

import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateImageWithTool } from "./_core/generateImageWithTool";
import { storagePut } from "./storage";
import { createRequire } from "module";

// ─── PptxGenJS lazy loader ──────────────────────────────────────────────────
let _PptxGenJS: any = null;
async function getPptxGenJS() {
  if (_PptxGenJS) return _PptxGenJS;
  try {
    const req = createRequire(import.meta.url);
    const mod = req("pptxgenjs");
    _PptxGenJS = mod.default || mod;
  } catch {
    const mod = await import("pptxgenjs") as any;
    _PptxGenJS = mod.default?.default || mod.default || mod;
  }
  return _PptxGenJS;
}

// ─── Slide dimensions (16:9 landscape) ─────────────────────────────────────
const SLIDE_W_IN = 10;   // inches
const SLIDE_H_IN = 5.625; // inches
const SLIDE_W_PX = 1920;
const SLIDE_H_PX = 1080;

// ─── Retry helper ───────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2, label = "op"): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("timeout") || msg.includes("aborted") || msg.includes("abort");
      if (isTimeout && attempt < maxAttempts) {
        console.warn(`[Presentation] ${label} timed out (attempt ${attempt}/${maxAttempts}), retrying...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ─── Core: generate one slide image (layout plan → image) ──────────────────
export async function generateOneSlideFull(opts: {
  slideId: number;
  presentationId: number;
  slideOrder: number;
  totalSlides: number;
  prompt: string;
  assetUrls: string[];
  imageToolId?: number | null;
  planToolId?: number | null;
}) {
  const { slideId, slideOrder, totalSlides, prompt, assetUrls, imageToolId, planToolId } = opts;
  const drizzleDb = await db.getDb();
  if (!drizzleDb) throw new Error("DB not available");
  const { presentationSlides } = await import("../drizzle/schema");
  const { eq: _eq } = await import("drizzle-orm");

  // Mark as generating
  await drizzleDb.update(presentationSlides)
    .set({ status: "generating", errorMessage: null })
    .where(_eq(presentationSlides.id, slideId));

  try {
    // Step 1: Layout planning — AI decides text blocks with pixel coordinates
    const layoutPlanParams = {
      messages: [
        {
          role: "system" as const,
          content: `你是专业的演示文稿视觉设计师。请为幻灯片规划文字排版结构，输出每个文字块的内容和位置。
页面尺寸：${SLIDE_W_PX}x${SLIDE_H_PX}px（16:9横版）
规则：
- 文字块不得超出页面边界，不得相互重叠
- 每个文字块的 x/y 是左上角坐标，width/height 是文字区域尺寸（单位 px）
- 留出足够边距（至少 60px）
- fontSize 单位 px，标题 60-90px，副标题 32-48px，正文 22-30px
- 最多 5 个文字块
- 配色：深色背景（#0f0f0f 或深灰），文字使用白色或金色（#c8a96e）
- 排版简洁大气，符合建筑设计事务所专业形象`
        },
        {
          role: "user" as const,
          content: `幻灯片 ${slideOrder + 1} / 共 ${totalSlides} 页
内容描述：${prompt}
请规划这一页的文字排版结构，输出文字块列表。`
        }
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "slide_layout_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              pageTheme: { type: "string", description: "这一页的视觉主题描述（用于图像生成 prompt）" },
              backgroundColor: { type: "string", description: "背景主色 hex" },
              textBlocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    role: { type: "string", enum: ["title", "subtitle", "body", "caption", "label"] },
                    text: { type: "string" },
                    x: { type: "number" },
                    y: { type: "number" },
                    width: { type: "number" },
                    height: { type: "number" },
                    fontSize: { type: "number" },
                    color: { type: "string" },
                    align: { type: "string", enum: ["left", "center", "right"] },
                    bold: { type: "boolean" },
                  },
                  required: ["id", "role", "text", "x", "y", "width", "height", "fontSize", "color", "align", "bold"],
                  additionalProperties: false,
                }
              }
            },
            required: ["pageTheme", "backgroundColor", "textBlocks"],
            additionalProperties: false,
          }
        }
      }
    };

    const planResponse = await withRetry(
      () => planToolId
        ? (async () => {
            const { invokeLLMWithUserTool } = await import("./_core/llm");
            return invokeLLMWithUserTool(layoutPlanParams, undefined, planToolId);
          })()
        : invokeLLM(layoutPlanParams),
      2,
      `slide ${slideOrder + 1} layout planning`
    );

    const planContent = planResponse.choices[0]?.message?.content ?? "{}";
    const plan = JSON.parse(typeof planContent === "string" ? planContent : JSON.stringify(planContent));
    const textBlocks: any[] = plan.textBlocks ?? [];
    const pageTheme: string = plan.pageTheme ?? prompt;
    const bgColor: string = plan.backgroundColor ?? "#0f0f0f";

    // Build text description for image generation prompt
    const textDescriptions = textBlocks.map((b: any) => {
      const left = Math.round(b.x / SLIDE_W_PX * 100);
      const top = Math.round(b.y / SLIDE_H_PX * 100);
      const w = Math.round(b.width / SLIDE_W_PX * 100);
      const h = Math.round(b.height / SLIDE_H_PX * 100);
      const fontSizePct = Math.round(b.fontSize / SLIDE_H_PX * 100 * 10) / 10;
      return `[${b.role}] RENDER TEXT: "${b.text}" — position: ${left}% from left, ${top}% from top, ${w}% wide, ${h}% tall, font-size ~${fontSizePct}% of page height, color: ${b.color}, align: ${b.align}`;
    }).join("\n");

    const assetDesc = assetUrls.length > 0
      ? `Incorporate the provided reference images as visual content elements.`
      : `Use ${bgColor} as background with architectural geometric shapes and abstract visual elements.`;

    const textSection = textDescriptions
      ? `\n\n=== MANDATORY TEXT RENDERING (HIGHEST PRIORITY) ===\nYou MUST render ALL of the following Chinese text blocks exactly as specified. Each block has a precise position, size, and color. Do NOT substitute with English placeholders. Do NOT skip any text block. Render the EXACT Chinese characters provided:\n${textDescriptions}\n=== END TEXT RENDERING ===`
      : "";

    const imagePrompt = `Professional architectural design studio presentation slide ${slideOrder + 1} of ${totalSlides}. ${pageTheme}. ${assetDesc} Background color: ${bgColor}.${textSection}

Professional brand design layout for a Chinese architectural studio. CRITICAL: You MUST render ALL Chinese text blocks exactly as specified — use clean, legible Chinese (Simplified) typography with correct font sizes and colors at the exact positions given. NEVER replace Chinese text with English placeholders. NEVER omit any text block. Photorealistic quality, visually cohesive full-page composition. 16:9 landscape format.`;

    // Step 2: Generate full-page image
    const assetImageObjects = assetUrls.slice(0, 3).map((url: string) => ({
      url,
      mimeType: "image/jpeg" as const,
      role: "content" as const
    }));

    const genResult = await withRetry(
      () => generateImageWithTool({
        prompt: imagePrompt,
        originalImages: assetImageObjects.length > 0 ? assetImageObjects : undefined,
        size: `${SLIDE_W_PX}x${SLIDE_H_PX}`,
        toolId: imageToolId ?? null,
      }),
      2,
      `slide ${slideOrder + 1} image generation`
    );

    const imageUrl = genResult.url ?? "";

    // Convert pixel coordinates to percentages (0-100) for storage
    const textElements = textBlocks.map((b: any) => ({
      text: b.text,
      role: b.role,
      x: Math.round(b.x / SLIDE_W_PX * 100 * 100) / 100,
      y: Math.round(b.y / SLIDE_H_PX * 100 * 100) / 100,
      w: Math.round(b.width / SLIDE_W_PX * 100 * 100) / 100,
      h: Math.round(b.height / SLIDE_H_PX * 100 * 100) / 100,
      fontSize: b.fontSize,
      color: b.color,
      fontFamily: "Noto Sans SC",
      bold: b.bold ?? (b.role === "title"),
      align: b.align,
    }));

    // Update slide with result
    await drizzleDb.update(presentationSlides)
      .set({
        imageUrl,
        textElements,
        status: "done",
        errorMessage: null,
        regenerateCount: (await drizzleDb.select({ cnt: presentationSlides.regenerateCount })
          .from(presentationSlides).where(_eq(presentationSlides.id, slideId)).limit(1))[0]?.cnt ?? 0,
      })
      .where(_eq(presentationSlides.id, slideId));

    return { imageUrl, textElements };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "未知错误";
    await drizzleDb.update(presentationSlides)
      .set({ status: "error", errorMessage: msg })
      .where(_eq(presentationSlides.id, slideId));
    throw err;
  }
}

// ─── Background generation for all slides ──────────────────────────────────
export async function generateAllSlidesAsync(
  presentationId: number,
  userId: number,
  imageToolId?: number | null,
  planToolId?: number | null
) {
  const drizzleDb = await db.getDb();
  if (!drizzleDb) return;
  const { presentationProjects, presentationSlides, presentationAssets } = await import("../drizzle/schema");
  const { eq: _eq, asc: _asc } = await import("drizzle-orm");

  await drizzleDb.update(presentationProjects)
    .set({ status: "generating" })
    .where(_eq(presentationProjects.id, presentationId));

  try {
    // Fetch all slides and assets
    const slides = await drizzleDb.select().from(presentationSlides)
      .where(_eq(presentationSlides.presentationId, presentationId))
      .orderBy(_asc(presentationSlides.slideOrder));
    const assets = await drizzleDb.select().from(presentationAssets)
      .where(_eq(presentationAssets.presentationId, presentationId))
      .orderBy(_asc(presentationAssets.sortOrder));
    const assetUrls = assets.map(a => a.fileUrl);

    const totalSlides = slides.length;
    let anyFailed = false;

    for (const slide of slides) {
      if (slide.status === "done") continue; // skip already done
      try {
        await generateOneSlideFull({
          slideId: slide.id,
          presentationId,
          slideOrder: slide.slideOrder,
          totalSlides,
          prompt: slide.prompt ?? "",
          assetUrls,
          imageToolId,
          planToolId,
        });
        console.log(`[Presentation] Slide ${slide.slideOrder + 1}/${totalSlides} done`);
      } catch (e: unknown) {
        console.error(`[Presentation] Slide ${slide.slideOrder + 1} failed:`, e);
        anyFailed = true;
      }
    }

    const finalStatus = anyFailed ? "review" : "review";
    await drizzleDb.update(presentationProjects)
      .set({ status: finalStatus })
      .where(_eq(presentationProjects.id, presentationId));

    // Write generation history
    const [pres] = await drizzleDb.select().from(presentationProjects)
      .where(_eq(presentationProjects.id, presentationId)).limit(1);
    if (pres) {
      const doneSlides = await drizzleDb.select().from(presentationSlides)
        .where(_eq(presentationSlides.presentationId, presentationId));
      const firstImageUrl = doneSlides.find(s => s.imageUrl)?.imageUrl ?? null;
      await db.createGenerationHistory({
        userId,
        module: "presentation",
        title: pres.title,
        summary: (pres.description ?? "").slice(0, 200),
        inputParams: { presentationId, slideCount: totalSlides },
        outputUrl: firstImageUrl,
        outputContent: null,
        status: "success",
        durationMs: null,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "未知错误";
    console.error(`[Presentation] generateAllSlidesAsync failed:`, msg);
    await drizzleDb.update(presentationProjects)
      .set({ status: "review" })
      .where(_eq(presentationProjects.id, presentationId));
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────
export const presentationProjectsRouter = router({
  // Create a new presentation project with assets
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(256),
      description: z.string().optional(),
      designThoughts: z.string().optional(),
      targetPages: z.number().min(1).max(50).default(10),
      projectId: z.number().optional(),
      assetUrls: z.array(z.object({
        url: z.string(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
      })).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const { presentationProjects, presentationAssets } = await import("../drizzle/schema");
      const { eq: _eq, desc: _desc } = await import("drizzle-orm");

      const result = await drizzleDb.insert(presentationProjects).values({
        userId: ctx.user.id,
        projectId: input.projectId ?? null,
        title: input.title,
        description: input.description ?? null,
        designThoughts: input.designThoughts ?? null,
        targetPages: input.targetPages,
        status: "draft",
      });
      const insertId = Number((result as any).insertId);
      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_eq(presentationProjects.id, insertId)).limit(1);
      if (!pres) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建失败" });

      // Insert assets
      if (input.assetUrls.length > 0) {
        await drizzleDb.insert(presentationAssets).values(
          input.assetUrls.map((a, i) => ({
            presentationId: pres.id,
            fileUrl: a.url,
            fileName: a.fileName ?? null,
            mimeType: a.mimeType ?? null,
            sortOrder: i,
          }))
        );
      }

      return { id: pres.id, status: pres.status };
    }),

  // List user's presentation projects
  list: protectedProcedure.query(async ({ ctx }) => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return [];
    const { presentationProjects, presentationSlides } = await import("../drizzle/schema");
    const { eq: _eq, desc: _desc } = await import("drizzle-orm");

    const rows = await drizzleDb.select().from(presentationProjects)
      .where(_eq(presentationProjects.userId, ctx.user.id))
      .orderBy(_desc(presentationProjects.createdAt))
      .limit(50);

    // Get slide counts and first image for each presentation
    const result = await Promise.all(rows.map(async (pres) => {
      const slides = await drizzleDb.select({
        id: presentationSlides.id,
        status: presentationSlides.status,
        imageUrl: presentationSlides.imageUrl,
      }).from(presentationSlides)
        .where(_eq(presentationSlides.presentationId, pres.id));
      const slideCount = slides.length;
      const coverImage = slides.find(s => s.imageUrl)?.imageUrl ?? null;
      const doneCount = slides.filter(s => s.status === "done").length;
      return { ...pres, slideCount, coverImage, doneCount };
    }));

    return result;
  }),

  // Get a presentation with its slides and assets
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides, presentationAssets } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, asc: _asc } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.id), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      const slides = await drizzleDb.select().from(presentationSlides)
        .where(_eq(presentationSlides.presentationId, input.id))
        .orderBy(_asc(presentationSlides.slideOrder));

      const assets = await drizzleDb.select().from(presentationAssets)
        .where(_eq(presentationAssets.presentationId, input.id))
        .orderBy(_asc(presentationAssets.sortOrder));

      return { ...pres, slides, assets };
    }),

  // Delete a presentation
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides, presentationAssets } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.id), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      await drizzleDb.delete(presentationSlides).where(_eq(presentationSlides.presentationId, input.id));
      await drizzleDb.delete(presentationAssets).where(_eq(presentationAssets.presentationId, input.id));
      await drizzleDb.delete(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.id), _eq(presentationProjects.userId, ctx.user.id)));

      return { success: true };
    }),

  // AI generates per-slide prompts based on description + assets
  generatePrompts: protectedProcedure
    .input(z.object({
      id: z.number(),
      planToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides, presentationAssets } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, asc: _asc } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.id), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      const assets = await drizzleDb.select().from(presentationAssets)
        .where(_eq(presentationAssets.presentationId, input.id))
        .orderBy(_asc(presentationAssets.sortOrder));

      // Build asset image content for LLM
      const assetImageContent: any[] = assets.slice(0, 6).map(a => ({
        type: "image_url",
        image_url: { url: a.fileUrl, detail: "low" },
      }));

      const userContent: any[] = [
        {
          type: "text",
          text: `项目描述：${pres.description ?? ""}
设计思路：${pres.designThoughts ?? ""}
目标页数：约 ${pres.targetPages} 页（可适当增减）

请根据以上信息和参考素材，为演示文稿规划每一页的内容提示词。每页提示词应包含：
- 这一页的主题/标题
- 要展示的核心内容（文字、数据、图片）
- 视觉风格建议
- 如何使用参考素材（如有）

输出 JSON 格式，slides 数组中每个元素包含 slideOrder（从0开始）、title（页面标题）、prompt（详细内容提示词，中文）。`
        },
        ...assetImageContent,
      ];

      const response = await withRetry(
        () => invokeLLM({
          messages: [
            {
              role: "system",
              content: `你是专业的建筑设计演示文稿策划师。请为 N+1 STUDIOS 建筑设计事务所规划演示文稿结构，风格专业、简洁、有设计感。`
            },
            { role: "user", content: userContent }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "presentation_prompts",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  slides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        slideOrder: { type: "number" },
                        title: { type: "string" },
                        prompt: { type: "string" },
                      },
                      required: ["slideOrder", "title", "prompt"],
                      additionalProperties: false,
                    }
                  }
                },
                required: ["slides"],
                additionalProperties: false,
              }
            }
          }
        }),
        2,
        "generatePrompts"
      );

      const content = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      const slides: Array<{ slideOrder: number; title: string; prompt: string }> = parsed.slides ?? [];

      // Delete existing slides and insert new ones
      await drizzleDb.delete(presentationSlides).where(_eq(presentationSlides.presentationId, input.id));
      if (slides.length > 0) {
        await drizzleDb.insert(presentationSlides).values(
          slides.map(s => ({
            presentationId: input.id,
            slideOrder: s.slideOrder,
            prompt: `${s.title}\n\n${s.prompt}`,
            status: "pending" as const,
            textElements: null,
            imageUrl: null,
          }))
        );
      }

      // Update presentation status
      await drizzleDb.update(presentationProjects)
        .set({ status: "prompts_ready" })
        .where(_eq(presentationProjects.id, input.id));

      return { slideCount: slides.length, slides };
    }),

  // User edits a slide's prompt
  updateSlidePrompt: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideId: z.number(),
      prompt: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");

      // Verify ownership
      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.presentationId), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      await drizzleDb.update(presentationSlides)
        .set({ prompt: input.prompt, status: "pending" })
        .where(_and(_eq(presentationSlides.id, input.slideId), _eq(presentationSlides.presentationId, input.presentationId)));

      return { success: true };
    }),

  // Add a new slide
  addSlide: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      prompt: z.string(),
      insertAfterOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, asc: _asc } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.presentationId), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      // Get current slides and reorder
      const existingSlides = await drizzleDb.select().from(presentationSlides)
        .where(_eq(presentationSlides.presentationId, input.presentationId))
        .orderBy(_asc(presentationSlides.slideOrder));

      const insertAfter = input.insertAfterOrder ?? (existingSlides.length - 1);
      const newOrder = insertAfter + 1;

      // Shift slides after insertion point
      for (const slide of existingSlides) {
        if (slide.slideOrder >= newOrder) {
          await drizzleDb.update(presentationSlides)
            .set({ slideOrder: slide.slideOrder + 1 })
            .where(_eq(presentationSlides.id, slide.id));
        }
      }

      const result = await drizzleDb.insert(presentationSlides).values({
        presentationId: input.presentationId,
        slideOrder: newOrder,
        prompt: input.prompt,
        status: "pending",
        textElements: null,
        imageUrl: null,
      });

      return { id: Number((result as any).insertId), slideOrder: newOrder };
    }),

  // Delete a slide
  deleteSlide: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.presentationId), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      await drizzleDb.delete(presentationSlides)
        .where(_and(_eq(presentationSlides.id, input.slideId), _eq(presentationSlides.presentationId, input.presentationId)));

      return { success: true };
    }),

  // Generate image for a single slide
  generateSlideImage: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideId: z.number(),
      imageToolId: z.number().optional(),
      planToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides, presentationAssets } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, asc: _asc } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.presentationId), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      const [slide] = await drizzleDb.select().from(presentationSlides)
        .where(_and(_eq(presentationSlides.id, input.slideId), _eq(presentationSlides.presentationId, input.presentationId)))
        .limit(1);
      if (!slide) throw new TRPCError({ code: "NOT_FOUND" });

      const allSlides = await drizzleDb.select({ id: presentationSlides.id })
        .from(presentationSlides).where(_eq(presentationSlides.presentationId, input.presentationId));
      const totalSlides = allSlides.length;

      const assets = await drizzleDb.select().from(presentationAssets)
        .where(_eq(presentationAssets.presentationId, input.presentationId))
        .orderBy(_asc(presentationAssets.sortOrder));
      const assetUrls = assets.map(a => a.fileUrl);

      // Resolve tool IDs
      const resolvedImageToolId = input.imageToolId ?? (await db.getDefaultToolForCapability("image_generation")) ?? null;
      const resolvedPlanToolId = input.planToolId ?? (await db.getDefaultToolForCapability("layout_plan")) ?? null;

      // Fire async generation (don't await)
      generateOneSlideFull({
        slideId: slide.id,
        presentationId: input.presentationId,
        slideOrder: slide.slideOrder,
        totalSlides,
        prompt: slide.prompt ?? "",
        assetUrls,
        imageToolId: resolvedImageToolId,
        planToolId: resolvedPlanToolId,
      }).catch(console.error);

      return { success: true, slideId: slide.id };
    }),

  // Generate all pending slides
  generateAllSlides: protectedProcedure
    .input(z.object({
      id: z.number(),
      imageToolId: z.number().optional(),
      planToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.id), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      const resolvedImageToolId = input.imageToolId ?? (await db.getDefaultToolForCapability("image_generation")) ?? null;
      const resolvedPlanToolId = input.planToolId ?? (await db.getDefaultToolForCapability("layout_plan")) ?? null;

      // Fire async generation
      generateAllSlidesAsync(input.id, ctx.user.id, resolvedImageToolId, resolvedPlanToolId).catch(console.error);

      return { success: true };
    }),

  // Regenerate a single slide
  regenerateSlide: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideId: z.number(),
      imageToolId: z.number().optional(),
      planToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides, presentationAssets } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, asc: _asc } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.presentationId), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      const [slide] = await drizzleDb.select().from(presentationSlides)
        .where(_and(_eq(presentationSlides.id, input.slideId), _eq(presentationSlides.presentationId, input.presentationId)))
        .limit(1);
      if (!slide) throw new TRPCError({ code: "NOT_FOUND" });

      // Increment regenerate count
      await drizzleDb.update(presentationSlides)
        .set({ regenerateCount: (slide.regenerateCount ?? 0) + 1, status: "pending" })
        .where(_eq(presentationSlides.id, input.slideId));

      const allSlides = await drizzleDb.select({ id: presentationSlides.id })
        .from(presentationSlides).where(_eq(presentationSlides.presentationId, input.presentationId));
      const totalSlides = allSlides.length;

      const assets = await drizzleDb.select().from(presentationAssets)
        .where(_eq(presentationAssets.presentationId, input.presentationId))
        .orderBy(_asc(presentationAssets.sortOrder));
      const assetUrls = assets.map(a => a.fileUrl);

      const resolvedImageToolId = input.imageToolId ?? (await db.getDefaultToolForCapability("image_generation")) ?? null;
      const resolvedPlanToolId = input.planToolId ?? (await db.getDefaultToolForCapability("layout_plan")) ?? null;

      generateOneSlideFull({
        slideId: slide.id,
        presentationId: input.presentationId,
        slideOrder: slide.slideOrder,
        totalSlides,
        prompt: slide.prompt ?? "",
        assetUrls,
        imageToolId: resolvedImageToolId,
        planToolId: resolvedPlanToolId,
      }).catch(console.error);

      return { success: true };
    }),

  // Update slide text (user edits text, then inpainting updates image)
  updateSlideText: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideId: z.number(),
      textElements: z.array(z.object({
        text: z.string(),
        role: z.string().optional(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        fontSize: z.number(),
        color: z.string(),
        fontFamily: z.string().optional(),
        bold: z.boolean().optional(),
        align: z.string().optional(),
      })),
      inpaintToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.presentationId), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      // Just update the textElements in DB (inpainting is complex, save for future)
      await drizzleDb.update(presentationSlides)
        .set({ textElements: input.textElements })
        .where(_and(_eq(presentationSlides.id, input.slideId), _eq(presentationSlides.presentationId, input.presentationId)));

      return { success: true };
    }),

  // Export PPTX
  exportPptx: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { presentationProjects, presentationSlides } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, asc: _asc } = await import("drizzle-orm");

      const [pres] = await drizzleDb.select().from(presentationProjects)
        .where(_and(_eq(presentationProjects.id, input.id), _eq(presentationProjects.userId, ctx.user.id)))
        .limit(1);
      if (!pres) throw new TRPCError({ code: "NOT_FOUND" });

      const slides = await drizzleDb.select().from(presentationSlides)
        .where(_eq(presentationSlides.presentationId, input.id))
        .orderBy(_asc(presentationSlides.slideOrder));

      const PptxGenJS = await getPptxGenJS();
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"

      // Use 13.33" x 7.5" for LAYOUT_WIDE
      const slideW = 13.33;
      const slideH = 7.5;

      for (const slide of slides) {
        const pptSlide = pptx.addSlide();

        // Add full-page background image
        if (slide.imageUrl) {
          pptSlide.addImage({
            path: slide.imageUrl,
            x: 0, y: 0,
            w: slideW, h: slideH,
          });
        } else {
          // Fallback: dark background
          pptSlide.addShape(pptx.ShapeType.rect, {
            x: 0, y: 0, w: slideW, h: slideH,
            fill: { color: "0f0f0f" },
          });
        }

        // Add text boxes using percentage coordinates
        const textElements = (slide.textElements as any[]) ?? [];
        for (const el of textElements) {
          // Convert percentages to inches
          const x = (el.x / 100) * slideW;
          const y = (el.y / 100) * slideH;
          const w = (el.w / 100) * slideW;
          const h = (el.h / 100) * slideH;
          const fontSizePt = Math.round(el.fontSize * 0.75); // px to pt approx

          const colorHex = (el.color ?? "#ffffff").replace("#", "");

          pptSlide.addText(el.text ?? "", {
            x, y, w, h,
            fontSize: fontSizePt,
            color: colorHex,
            bold: el.bold ?? false,
            align: (el.align as "left" | "center" | "right") ?? "left",
            fontFace: "Arial",
            valign: "top",
            wrap: true,
          });
        }
      }

      // Export to buffer
      const pptxBuffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;

      // Upload to S3
      const fileName = `presentation-${pres.id}-${Date.now()}.pptx`;
      const { url } = await storagePut(
        `presentations/${ctx.user.id}/${fileName}`,
        pptxBuffer,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      );

      // Mark as done
      await drizzleDb.update(presentationProjects)
        .set({ status: "done" })
        .where(_eq(presentationProjects.id, input.id));

      return { url, fileName };
    }),
});
