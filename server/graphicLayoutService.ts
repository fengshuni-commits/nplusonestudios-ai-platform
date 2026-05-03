/**
 * Graphic Layout Service
 * Shared background generation logic used by both tRPC router and REST API (OpenClaw).
 */

import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateImageWithTool } from "./_core/generateImageWithTool";
import { compositeTextOnImage } from "./compositeTextOnImage";

/**
 * Sanitize all pages in a job: fix duplicate/empty textBlock ids.
 * Returns { pages, dirty } where dirty=true means at least one id was fixed.
 * Safe to call on already-clean data (no-op if nothing needs fixing).
 */
export function sanitizeJobPages(pages: any[]): { pages: any[]; dirty: boolean } {
  let dirty = false;
  const sanitized = pages.map((page: any, pageIdx: number) => {
    const rawBlocks: any[] = page.textBlocks ?? [];
    if (rawBlocks.length === 0) return page;
    const seenIds = new Set<string>();
    let pageDirty = false;
    const fixedBlocks = rawBlocks.map((b: any, idx: number) => {
      let id: string = (typeof b.id === "string" && b.id.trim()) ? b.id.trim() : "";
      if (!id || seenIds.has(id)) {
        id = `${b.role ?? "block"}_p${pageIdx}_${idx}`;
        let counter = 0;
        while (seenIds.has(id)) { id = `${b.role ?? "block"}_p${pageIdx}_${idx}_${++counter}`; }
        pageDirty = true;
      }
      seenIds.add(id);
      return pageDirty || b.id !== id ? { ...b, id } : b;
    });
    if (pageDirty) {
      dirty = true;
      return { ...page, textBlocks: fixedBlocks };
    }
    return page;
  });
  return { pages: sanitized, dirty };
}

/** Retry a function up to `maxAttempts` times on timeout/abort errors */
async function withRetryOnTimeout<T>(fn: () => Promise<T>, maxAttempts = 2, label = "operation"): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("timeout") || msg.includes("aborted") || msg.includes("abort");
      if (isTimeout && attempt < maxAttempts) {
        console.warn(`[GraphicLayout] ${label} timed out (attempt ${attempt}/${maxAttempts}), retrying...`);
        // Wait 2s before retry
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function generateGraphicLayoutAsync(
  jobId: number,
  userId: number,
  imageToolId?: number,
  stylePrompt?: string
) {
  const drizzleDb = await db.getDb();
  if (!drizzleDb) return;
  const { graphicLayoutJobs, graphicStylePacks } = await import("../drizzle/schema");
  const { eq: _eq } = await import("drizzle-orm");
  await drizzleDb.update(graphicLayoutJobs).set({ status: "processing" }).where(_eq(graphicLayoutJobs.id, jobId));
  try {
    const [job] = await drizzleDb.select().from(graphicLayoutJobs).where(_eq(graphicLayoutJobs.id, jobId)).limit(1);
    if (!job) throw new Error("任务不存在");

    let styleGuideHint = "";
    let packStyleGuide: any = null;
    if (stylePrompt) {
      styleGuideHint = `【参考风格提示词】\n${stylePrompt}`;
    } else if (job.packId) {
      const [pack] = await drizzleDb.select().from(graphicStylePacks).where(_eq(graphicStylePacks.id, job.packId)).limit(1);
      if (pack?.styleGuide) {
        packStyleGuide = pack.styleGuide as any;
        const sg = packStyleGuide;
        styleGuideHint = [
          `【版式包：${pack.name}】`,
          `配色方案（必须严格执行）：主色 ${sg.colorPalette?.primary}  背景 ${sg.colorPalette?.background}  文字 ${sg.colorPalette?.text}  强调色 ${sg.colorPalette?.accent}`,
          `字体：标题使用 ${sg.typography?.titleFont}，正文使用 ${sg.typography?.bodyFont}`,
          `调性：${sg.tone === "dark" ? "深色系，背景深色" : sg.tone === "light" ? "浅色系，背景浅色" : "混合调性"}`,
          sg.styleKeywords?.length ? `风格关键词：${sg.styleKeywords.join("、")}` : "",
          sg.layoutPatterns?.length ? `排版模式：${sg.layoutPatterns.join("、")}` : "",
          sg.spacingDensity ? `空间密度：${sg.spacingDensity}` : "",
        ].filter(Boolean).join("\n");
      }
    }

    const [layoutPlanPromptRow, imageGenPromptRow] = await Promise.all([
      db.getGraphicLayoutPrompt("layout_plan_system"),
      db.getGraphicLayoutPrompt("image_generation"),
    ]);
    const layoutPlanSystemPrompt = layoutPlanPromptRow?.prompt ?? `你是一个专业的品牌视觉设计师。请为图文排版页面规划排版结构，输出每个文字块的内容和位置。

规则：
- 文字块不得超出页面边界，不得相互重叠
- 每个文字块的 x/y 是左上角坐标，width/height 是文字区域尺寸（单位 px）
- 留出足够边距（至少 40px）
- fontSize 单位 px，标题 48-80px，副标题 24-36px，正文 16-22px
- 最多 6 个文字块
- 严格使用版式包中提取的配色方案，不得使用默认黑白配色
- 排版结构应忠实还原参考版式的视觉层次和空间分布`;
    const imageGenStyleSuffix = imageGenPromptRow?.prompt ?? "Professional brand design, high-end architectural studio aesthetic. Strictly follow the color scheme from the style guide. Clean layout with precise typography placement. No watermarks, no gray bars, no placeholder rectangles, no decorative strips, no solid color overlays in text areas. Background must flow seamlessly across the entire image. Photorealistic quality.";

    const docTypeNames: Record<string, string> = {
      brand_manual: "品牌手册", product_detail: "商品详情页",
      project_board: "项目图板", custom: "自定义图文排版"
    };
    const docTypeName = docTypeNames[job.docType] ?? "图文排版";

    const rawAssets = job.assetUrls as any;
    type AssetConfig =
      | { mode: "per_page"; pages: Record<string, string[]> }
      | { mode: "by_type"; groups: Record<string, string[]> }
      | { mode: "legacy"; urls: string[] };
    let assetConfig: AssetConfig;
    if (Array.isArray(rawAssets)) {
      assetConfig = { mode: "legacy", urls: rawAssets };
    } else if (rawAssets && typeof rawAssets === "object" && rawAssets.mode) {
      assetConfig = rawAssets as AssetConfig;
    } else {
      assetConfig = { mode: "legacy", urls: [] };
    }

    const getAssetsForPage = (pageIdx: number, selectedGroup?: string): string[] => {
      if (assetConfig.mode === "per_page") {
        return (assetConfig.pages[String(pageIdx)] ?? []).slice(0, 5);
      } else if (assetConfig.mode === "by_type") {
        const groups = assetConfig.groups;
        if (selectedGroup && groups[selectedGroup]) return groups[selectedGroup].slice(0, 5);
        const firstGroup = Object.values(groups)[0] ?? [];
        return firstGroup.slice(0, 5);
      } else {
        return (assetConfig.urls ?? []).slice(0, 5);
      }
    };

    const getByTypeGroupNames = (): string[] => {
      if (assetConfig.mode !== "by_type") return [];
      return Object.keys(assetConfig.groups);
    };

    const getByTypeDescription = (selectedGroup?: string): string => {
      if (assetConfig.mode !== "by_type") return "";
      if (selectedGroup) {
        const count = assetConfig.groups[selectedGroup]?.length ?? 0;
        return `已选择「${selectedGroup}」类素材（共${count}张，取前5张作为参考）`;
      }
      return Object.entries(assetConfig.groups)
        .map(([typeName, urls]) => `${typeName}(共${urls.length}张)`)
        .join("、");
    };

    const aspectRatio = (job as any).aspectRatio ?? "3:4";
    const aspectRatioToSize: Record<string, string> = {
      "3:4": "1024x1365", "4:3": "1365x1024", "1:1": "1024x1024",
      "16:9": "1536x864", "9:16": "864x1536",
      "A4": "1024x1448", "A3": "1448x1024",
    };
    const imageSize = aspectRatioToSize[aspectRatio] ?? "1024x1365";
    const [imgW, imgH] = imageSize.split("x").map(Number);

    const sg = packStyleGuide;
    const colorScheme = sg
      ? `主色 ${sg.colorPalette?.primary}，背景 ${sg.colorPalette?.background}，文字 ${sg.colorPalette?.text}，强调色 ${sg.colorPalette?.accent}`
      : "深色系：背景 #0f0f0f，文字 #ffffff，强调色 #c8a96e（金色）";
    void colorScheme; // suppress unused warning

    const generatedPages: any[] = [];
    const byTypeGroupNames = getByTypeGroupNames();
    let anyPageFailed = false;

    for (let pageIdx = 0; pageIdx < job.pageCount; pageIdx++) {
      try {
        const byTypeInstruction = byTypeGroupNames.length > 0
          ? `\n- 可用素材文件夹：${byTypeGroupNames.join("、")}，请根据这一页的主题选择最合适的一个文件夹，输出到 selectedAssetGroup 字段`
          : "";

        // Step 1: Layout planning with retry on timeout
        const planResponse = await withRetryOnTimeout(
          () => invokeLLM({
            messages: [
              {
                role: "system",
                content: `${layoutPlanSystemPrompt}
页面尺寸：${imgW}x${imgH}px
${styleGuideHint ? styleGuideHint : "风格：现代简约，专业感强"}

⚠️ 优先级规则：如果用户的内容描述中包含配色、版式、风格等具体要求，必须以用户描述为准，覆盖上方参考风格中的对应设置。用户描述的优先级高于一切参考风格。${byTypeInstruction ? "\n" + byTypeInstruction : ""}`
              },
              {
                role: "user",
                content: `文档类型：${docTypeName}，第 ${pageIdx + 1} 页 / 共 ${job.pageCount} 页
内容描述（最高优先级，其中的配色/版式/风格要求必须覆盖参考风格）：${job.contentText}
请规划这一页的排版结构，输出文字块列表。`
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "layout_plan",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    pageTheme: { type: "string", description: "这一页的视觉主题描述（用于图像生成 prompt）" },
                    backgroundColor: { type: "string", description: "背景主色 hex" },
                    selectedAssetGroup: { type: "string", description: "选择的素材文件夹名称，必须是可用文件夹列表中的一个，无文件夹时输出空字符串" },
                    textBlocks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "唯一标识符，格式必须为 block_1、block_2、block_3...（每个块编号不同，严禁重复）" },
                          role: { type: "string", enum: ["title", "subtitle", "body", "caption", "label"] },
                          text: { type: "string" },
                          x: { type: "number" },
                          y: { type: "number" },
                          width: { type: "number" },
                          height: { type: "number" },
                          fontSize: { type: "number" },
                          color: { type: "string" },
                          align: { type: "string", enum: ["left", "center", "right"] },
                        },
                        required: ["id", "role", "text", "x", "y", "width", "height", "fontSize", "color", "align"],
                        additionalProperties: false,
                      }
                    }
                  },
                  required: ["pageTheme", "backgroundColor", "selectedAssetGroup", "textBlocks"],
                  additionalProperties: false,
                }
              }
            }
          }),
          2,
          `page ${pageIdx + 1} layout planning`
        );

        const planContent = planResponse.choices[0]?.message?.content ?? "{}";
        const plan = JSON.parse(typeof planContent === "string" ? planContent : JSON.stringify(planContent));
        // Sanitize textBlocks: ensure every block has a unique non-empty id
        const { pages: [sanitizedPage] } = sanitizeJobPages([{ textBlocks: plan.textBlocks ?? [] }]);
        const textBlocks: any[] = sanitizedPage.textBlocks ?? [];
        const pageTheme: string = plan.pageTheme ?? "";
        const bgColor: string = plan.backgroundColor ?? (sg?.colorPalette?.background ?? "#0f0f0f");
        const selectedGroup: string | undefined = plan.selectedAssetGroup || undefined;
        const pageAssets = getAssetsForPage(pageIdx, selectedGroup);
        const assetImagesForPage = pageAssets.length > 0
          ? pageAssets.map((url: string) => ({ url, mimeType: "image/jpeg" as const }))
          : undefined;

        // Build text layout description WITH text content for composition guidance.
        // Including the actual text helps AI understand the semantic weight and leave appropriate visual space.
        // CRITICAL: DO NOT render any text in the image — text is rendered as HTML overlay in the frontend.
        const textDescriptions = textBlocks.map((b: any) => {
          const left = Math.round(b.x / imgW * 100);
          const top = Math.round(b.y / imgH * 100);
          const w = Math.round(b.width / imgW * 100);
          const h = Math.round(b.height / imgH * 100);
          // Include text content for composition reference, but strictly forbid rendering it
          const textHint = b.text ? ` [content: "${b.text}"]` : "";
          return `${b.role} zone${textHint} (${b.fontSize}px, at ${left}% left ${top}% top, ${w}% wide ${h}% tall) — this area MUST remain as clean seamless background, NO text rendering, NO solid color bars, NO rectangles, NO placeholder shapes, NO gray strips, background must flow through naturally`;
        }).join("; ");

        const byTypeDesc = getByTypeDescription(selectedGroup);
        const assetDesc = pageAssets.length > 0
          ? (byTypeDesc
              ? `incorporate the provided reference images as visual elements; ${byTypeDesc}`
              : `incorporate the provided reference images as visual elements`)
          : `use ${bgColor} as background with geometric shapes and abstract visual elements`;

        const styleHintEn = sg
          ? [
              sg.description ? `STYLE REFERENCE: ${sg.description}` : "",
              `Color palette: background ${sg.colorPalette?.background}, primary ${sg.colorPalette?.primary}, text ${sg.colorPalette?.text}, accent ${sg.colorPalette?.accent}.`,
              sg.styleKeywords?.length ? `Visual keywords: ${sg.styleKeywords.join(", ")}.` : "",
              sg.typography?.style ? `Typography: ${sg.typography.style}.` : "",
            ].filter(Boolean).join(" ")
          : "";

        const userDescPrefix = job.contentText.match(/(背景|配色|风格|色调|#[0-9a-fA-F]{6})/)
          ? `USER REQUIREMENT (HIGHEST PRIORITY, OVERRIDES STYLE REFERENCE): ${job.contentText}. `
          : "";
        const imagePrompt = `${userDescPrefix}${docTypeName} design, page ${pageIdx + 1} of ${job.pageCount}. ${pageTheme}. ${assetDesc}. Text layout: ${textDescriptions}. ${styleHintEn} Background color: ${bgColor}. ${imageGenStyleSuffix}`;

        // Step 2: Image generation with retry on timeout
        const genResult = await withRetryOnTimeout(
          () => generateImageWithTool({
            prompt: imagePrompt,
            originalImages: assetImagesForPage,
            size: imageSize,
            toolId: imageToolId ?? null,
          }),
          2,
          `page ${pageIdx + 1} image generation`
        );

        const pageImageUrl = genResult.url ?? "";

        // Step 3: Composite text onto the background image (for API callers who don't have the HTML overlay)
        let compositeImageUrl: string | null = null;
        if (pageImageUrl && textBlocks.length > 0) {
          try {
            compositeImageUrl = await compositeTextOnImage({
              backgroundImageUrl: pageImageUrl,
              textBlocks,
              imageWidth: imgW,
              imageHeight: imgH,
              outputKeyPrefix: `graphic-layout/composite-job${jobId}-p${pageIdx}`,
            });
          } catch (compErr) {
            console.warn(`[GraphicLayout] Job ${jobId} page ${pageIdx + 1} composite failed (non-fatal):`, compErr);
          }
        }

        generatedPages.push({
          pageIndex: pageIdx,
          imageUrl: pageImageUrl,
          compositeImageUrl: compositeImageUrl ?? undefined,
          backgroundColor: bgColor,
          textBlocks: textBlocks,
          imageSize: { width: imgW, height: imgH },
        });

        console.log(`[GraphicLayout] Job ${jobId} page ${pageIdx + 1}/${job.pageCount} done`);
      } catch (pageError: unknown) {
        // Page-level error isolation: one page failure doesn't abort the whole job
        const pageMsg = pageError instanceof Error ? pageError.message : "未知错误";
        console.error(`[GraphicLayout] Job ${jobId} page ${pageIdx + 1} failed:`, pageMsg);
        anyPageFailed = true;
        generatedPages.push({
          pageIndex: pageIdx,
          imageUrl: "",
          backgroundColor: sg?.colorPalette?.background ?? "#0f0f0f",
          textBlocks: [],
          imageSize: { width: imgW, height: imgH },
          error: pageMsg,
        });
      }
    }

    const successPages = generatedPages.filter(p => p.imageUrl);
    if (successPages.length === 0) {
      // All pages failed — mark job as failed
      throw new Error(`所有页面生成失败，请重试`);
    }

    const finalStatus = anyPageFailed ? "done" : "done";
    const errorSummary = anyPageFailed
      ? `部分页面生成失败（${generatedPages.filter(p => !p.imageUrl).length}/${job.pageCount} 页）`
      : null;

    await drizzleDb.update(graphicLayoutJobs)
      .set({ status: finalStatus, pages: generatedPages, htmlPages: [], errorMessage: errorSummary } as any)
      .where(_eq(graphicLayoutJobs.id, jobId));

    const docTypeLabels: Record<string, string> = {
      brand_manual: "品牌手册", product_detail: "商品详情页",
      project_board: "项目图板", custom: "自定义排版",
    };
    const firstPageUrl = successPages[0]?.imageUrl ?? null;
    const [jobForHistory] = await drizzleDb.select().from(graphicLayoutJobs).where(_eq(graphicLayoutJobs.id, jobId)).limit(1);
    if (jobForHistory) {
      const docLabel = docTypeLabels[jobForHistory.docType] ?? jobForHistory.docType;
      const histTitle = jobForHistory.title ? `${jobForHistory.title}` : `${docLabel}（${jobForHistory.pageCount}页）`;
      // 写入成果历史
      await db.createGenerationHistory({
        userId,
        module: "layout_design",
        title: histTitle,
        summary: jobForHistory.contentText?.slice(0, 200) ?? null,
        inputParams: { docType: jobForHistory.docType, pageCount: jobForHistory.pageCount, aspectRatio: jobForHistory.aspectRatio, jobId },
        outputUrl: firstPageUrl,
        outputContent: null,
        status: "success",
        durationMs: null,
      });
      // 写入调用统计日志（每页一条，记录实际调用次数）
      const effectiveToolId = imageToolId ?? 0;
      for (let pi = 0; pi < generatedPages.length; pi++) {
        const pg = generatedPages[pi];
        await db.createAiToolLog({
          toolId: effectiveToolId,
          userId,
          action: "layout_design",
          inputSummary: `${docLabel} 第${pi + 1}页 - ${(jobForHistory.contentText ?? "").slice(0, 100)}`,
          outputSummary: pg.imageUrl ? pg.imageUrl.slice(-60) : "",
          status: pg.imageUrl ? "success" : "failed",
        });
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error(`[GraphicLayout] Generation failed for job ${jobId}:`, msg);
    await drizzleDb.update(graphicLayoutJobs)
      .set({ status: "failed", errorMessage: msg })
      .where(_eq(graphicLayoutJobs.id, jobId));
  }
}
