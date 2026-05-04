import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { invokeLLM, invokeLLMWithUserTool } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { generateImageWithTool } from "./_core/generateImageWithTool";
import { generateGraphicLayoutAsync } from "./graphicLayoutService";
import { generateVideoWithTool, queryVideoTaskStatus } from "./_core/generateVideoWithTool";
import { transcribeAudio } from "./_core/voiceTranscription";
import { transcribeFileWithVolcengine } from "./_core/volcengineTranscription";
import { decryptApiKey } from "./_core/crypto";
import { storagePut } from "./storage";
import { compositeMaskOnImage, cropToAspectRatio } from "./imageProcessor";
import { submitEnhanceTask, getEnhanceTaskStatus, downloadAndStoreEnhancedImage } from "./magnific";
import { nanoid } from "nanoid";
import { searchCaseStudies, searchCaseStudyImages } from "./tavily";
import { notifyOwner } from "./_core/notification";
import crypto from "crypto";
// pptxgenjs ESM/CJS interop: lazy-load to handle all runtime environments
import { createRequire } from "module";
let _PptxGenJS: any = null;
async function getPptxGenJS() {
  if (_PptxGenJS) return _PptxGenJS;
  try {
    // Try CJS require first (most reliable in tsx watch)
    const req = createRequire(import.meta.url);
    const mod = req("pptxgenjs");
    _PptxGenJS = mod.default || mod;
  } catch {
    // Fallback to dynamic import
    const mod = await import("pptxgenjs") as any;
    _PptxGenJS = mod.default?.default || mod.default || mod;
  }
  return _PptxGenJS;
}
import { downloadImageAsBase64, searchPexelsImages } from "./scraper";
import { pdfToImages } from "./pdfToImages";

// ─── PPT Job Store (in-memory async queue) ──────────────
type PptSlidePreview = { title: string; subtitle: string; bullets: string[]; layout: string; imageUrl?: string; styleGuide?: any };
type PptJob =
  | { status: "processing"; progress: number; stage: string; currentPage?: number; totalPages?: number }
  | { status: "done"; url: string; title: string; slideCount: number; imageCount: number; historyId?: number; slides?: PptSlidePreview[]; pageImages?: string[]; pageSummaries?: Array<{ texts: string[]; imageCount: number }>; previewImages?: string[] }
  | { status: "failed"; error: string };

const pptJobStore = new Map<string, PptJob>();

// ─── Color Plan Job Store (in-memory async queue) ────────
type ColorPlanJob =
  | { status: "processing" }
  | { status: "done"; url: string; historyId: number }
  | { status: "failed"; error: string };

const colorPlanJobStore = new Map<string, ColorPlanJob>();

/**
 * Convert a PPTX buffer to per-slide PNG preview images.
 * Uses LibreOffice (PPTX → PDF) + pdfjs-dist (PDF → PNG, no system dependency).
 * Returns an array of S3 URLs (one per slide), or [] on failure.
 */
async function convertPptxToPreviewImages(pptxBuffer: Buffer, jobId: string): Promise<string[]> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-preview-"));
  try {
    const pptxPath = path.join(tmpDir, "presentation.pptx");
    const pdfDir = path.join(tmpDir, "pdf");
    const imgDir = path.join(tmpDir, "imgs");
    fs.writeFileSync(pptxPath, pptxBuffer);
    fs.mkdirSync(pdfDir);
    fs.mkdirSync(imgDir);
    // Step 1: PPTX → PDF
    execSync(`libreoffice --headless --convert-to pdf --outdir "${pdfDir}" "${pptxPath}"`, { timeout: 120000 });
    const pdfFiles = fs.readdirSync(pdfDir).filter((f: string) => f.endsWith(".pdf"));
    if (pdfFiles.length === 0) { console.warn("[PptxPreview] LibreOffice produced no PDF"); return []; }
    const pdfPath = path.join(pdfDir, pdfFiles[0]);
    // Step 2: PDF → PNG (150 dpi) using pdfjs-dist (no system dependency)
    const pngFiles = await pdfToImages(pdfPath, imgDir, "slide", { dpi: 150, format: "png" });
    if (pngFiles.length === 0) { console.warn("[PptxPreview] pdfToImages produced no PNGs"); return []; }
    // Step 3: Upload each PNG to S3
    const urls: string[] = [];
    for (let i = 0; i < pngFiles.length; i++) {
      try {
        const buf = fs.readFileSync(pngFiles[i]);
        const key = `presentations/previews/${jobId}-slide${i + 1}.png`;
        const { url } = await storagePut(key, buf, "image/png");
        urls.push(url);
      } catch (e) { console.error(`[PptxPreview] Failed to upload slide ${i + 1}:`, e); }
    }
    return urls;
  } catch (e) {
    console.error("[PptxPreview] Conversion failed:", e);
    return [];
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function generatePptInBackground(
  jobId: string,
  input: { content: string; title: string; projectType?: string },
  userId?: number
) {
  const pptStartTime = Date.now();
  try {
    // Stage 1: LLM structuring
    pptJobStore.set(jobId, { status: "processing", progress: 10, stage: "structuring" });

    const structureResponse = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: `你是 N+1 STUDIOS 的建筑设计 PPT 制作专家。请将以下对标调研报告转换为约 12-15 页的 PPT 结构。

页面结构要求：
- 第1页：封面（layout: cover）
- 第2页：目录页（layout: toc）
- 第3页：项目概述与调研目标（layout: section_intro）
- 第4-10页：对标案例详细分析（每个案例 1 页，layout: case_study）
- 第11页：设计策略建议汇总（layout: insight）
- 第12页：材料与工艺参考（layout: insight）
- 第13页：总结与下一步建议（layout: summary）

每页字段：
- title: 标题（简洁有力，不超过20字）
- subtitle: 副标题（可为空字符串）
- bullets: 要点数组，每项不超过30字，每页最多5个要点
- sourceName: 案例来源网站名称（仅 case_study 页填写，如 "ArchDaily" 或 "Dezeen"，其他页填空字符串）
- pexelsQuery: Pexels 图片搜索关键词（英文，必须为每个 case_study 和 insight 页提供精准的搜索词，例如 "modern glass office building exterior"、"minimalist lobby interior design"、"concrete texture wall architecture"）
- layout: cover / toc / section_intro / case_study / insight / summary

**重要**：
- 不要生成任何 URL 链接，只用 sourceName 标注来源网站名称
- pexelsQuery 必须是英文，且要具体描述建筑/空间的视觉特征，以便搜索到高质量配图
- 每个 case_study 页和 insight 页都必须提供 pexelsQuery
- 要点要精炼，每页不超过5个 bullet，避免文字过多`
        },
        { role: "user", content: `项目类型：${input.projectType || "办公空间"}\n\n${input.content}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ppt_structure_v3",
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
                    sourceName: { type: "string" },
                    pexelsQuery: { type: "string" },
                    layout: { type: "string", enum: ["cover", "toc", "section_intro", "case_study", "insight", "summary"] }
                  },
                  required: ["title", "subtitle", "bullets", "sourceName", "pexelsQuery", "layout"],
                  additionalProperties: false
                }
              }
            },
            required: ["slides"],
            additionalProperties: false
          }
        }
      }
    }, userId);
    const structureContent = typeof structureResponse.choices[0]?.message?.content === 'string'
      ? structureResponse.choices[0].message.content
      : '{"slides":[]}';
    const slideData = JSON.parse(structureContent) as {
      slides: Array<{
        title: string; subtitle: string; bullets: string[];
        sourceName: string; pexelsQuery: string; layout: string;
      }>
    };

    // Stage 2: Fetch Pexels images for all slides that need them
    pptJobStore.set(jobId, { status: "processing", progress: 25, stage: "generating_images" });

    const imageBase64Map: Map<number, { data: string; ext: string }> = new Map();

    const slidesNeedingImages = slideData.slides
      .map((s, i) => ({ index: i, query: s.pexelsQuery, layout: s.layout }))
      .filter(s => s.query && s.query.trim().length > 0);

    for (let ci = 0; ci < slidesNeedingImages.length; ci++) {
      const cs = slidesNeedingImages[ci];
      try {
        // Search Pexels for high-quality architecture photos
        const pexelsResults = await searchPexelsImages(cs.query, 3);
        // Pick the best result (first available)
        for (const pr of pexelsResults) {
          if (pr.url) {
            const b64 = await downloadImageAsBase64(pr.url);
            if (b64) {
              const mimeMatch = b64.match(/^data:(image\/\w+);/);
              const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'jpeg';
              const rawB64 = b64.replace(/^data:image\/\w+;base64,/, '');
              imageBase64Map.set(cs.index, { data: rawB64, ext });
              break;
            }
          }
        }
      } catch (err) {
        console.error(`[PPT] Failed to fetch Pexels image for "${cs.query}":`, err);
      }
      // Update progress (25-65)
      const imgProgress = 25 + Math.round((ci + 1) / Math.max(slidesNeedingImages.length, 1) * 40);
      pptJobStore.set(jobId, { status: "processing", progress: imgProgress, stage: "generating_images" });
    }

    // Stage 3: Build PPTX with professional layout design
    pptJobStore.set(jobId, { status: "processing", progress: 70, stage: "building_pptx" });

    const PptxCtor = await getPptxGenJS();
    const pptx = new PptxCtor();
    pptx.author = "N+1 STUDIOS";
    pptx.company = "N+1 STUDIOS";
    pptx.title = `${input.title} - 案例调研报告`;
    pptx.layout = "LAYOUT_16x9";

    // Professional color palette inspired by architecture firms
    const C = {
      charcoal: "1A1A2E",   // Deep dark background
      slate: "2D2D3F",      // Slightly lighter dark
      warmGray: "F5F0EB",   // Warm light background
      cream: "FAF8F5",      // Lightest background
      copper: "B87333",     // Primary accent (copper/bronze)
      copperLight: "D4956B", // Light copper
      copperDark: "8B5E3C", // Dark copper
      text: "2C2C2C",       // Main text
      textLight: "6B6560",  // Secondary text
      textOnDark: "E8E4DF", // Text on dark backgrounds
      white: "FFFFFF",
      divider: "D4CFC8",    // Subtle divider lines
      tagBg: "EDE8E2",      // Tag/badge background
    };

    // Font settings
    const F = {
      title: "Microsoft YaHei",
      body: "Microsoft YaHei",
    };

    let caseIndex = 0; // Track case study numbering

    for (let i = 0; i < slideData.slides.length; i++) {
      const sd = slideData.slides[i];
      const s = pptx.addSlide();
      const hasImage = imageBase64Map.has(i);

      if (sd.layout === "cover") {
        // ══════ COVER SLIDE ══════
        // Full dark background with elegant typography
        s.background = { color: C.charcoal };
        // Top accent line
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        // Decorative vertical line
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.2, w: 0.03, h: 2.5, fill: { color: C.copper } });
        // Main title
        s.addText(sd.title, {
          x: 1.1, y: 1.3, w: 7.5, h: 1.0,
          fontSize: 32, fontFace: F.title, color: C.white, bold: true,
          lineSpacingMultiple: 1.2,
        });
        // Subtitle
        s.addText(sd.subtitle || "案例调研报告", {
          x: 1.1, y: 2.4, w: 7.5, h: 0.5,
          fontSize: 16, fontFace: F.body, color: C.copperLight,
        });
        // Horizontal divider
        s.addShape(pptx.ShapeType.rect, { x: 1.1, y: 3.2, w: 2.0, h: 0.025, fill: { color: C.copper } });
        // Company + date
        s.addText(`N+1 STUDIOS`, {
          x: 1.1, y: 3.6, w: 4, h: 0.35,
          fontSize: 14, fontFace: F.title, color: C.copper, bold: true,
        });
        s.addText(new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long" }), {
          x: 1.1, y: 4.0, w: 4, h: 0.3,
          fontSize: 11, fontFace: F.body, color: C.textLight,
        });
        // Cover image (right side, if available)
        if (hasImage) {
          const imgData = imageBase64Map.get(i)!;
          s.addImage({ data: `image/${imgData.ext};base64,${imgData.data}`, x: 5.5, y: 0.04, w: 4.5, h: 5.59 });
          // Semi-transparent overlay on image edge for text readability
          s.addShape(pptx.ShapeType.rect, { x: 5.0, y: 0.04, w: 1.0, h: 5.59, fill: { color: C.charcoal, transparency: 50 } });
        }

      } else if (sd.layout === "toc") {
        // ══════ TABLE OF CONTENTS ══════
        s.background = { color: C.cream };
        // Left accent bar
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 5.63, fill: { color: C.copper } });
        // Section label
        s.addText("目录", {
          x: 0.8, y: 0.4, w: 2, h: 0.35,
          fontSize: 10, fontFace: F.body, color: C.copper, bold: true, charSpacing: 3,
        });
        // Title
        s.addText(sd.title, {
          x: 0.8, y: 0.8, w: 8, h: 0.6,
          fontSize: 22, fontFace: F.title, color: C.text, bold: true,
        });
        // Divider
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.5, w: 8.4, h: 0.01, fill: { color: C.divider } });
        // TOC items with numbers
        const tocItems = sd.bullets.map((b, idx) => ({
          text: `${String(idx + 1).padStart(2, "0")}`,
          options: { fontSize: 20, fontFace: F.title, color: C.copper, bold: true, breakType: idx > 0 ? "n" as const : undefined, paraSpaceAfter: 4 }
        }));
        const tocDescs = sd.bullets.map((b) => ({
          text: `    ${b}`,
          options: { fontSize: 13, fontFace: F.body, color: C.text, paraSpaceAfter: 16, lineSpacingMultiple: 1.3 }
        }));
        // Interleave numbers and descriptions
        const tocContent: any[] = [];
        for (let t = 0; t < sd.bullets.length; t++) {
          tocContent.push(tocItems[t], tocDescs[t]);
        }
        s.addText(tocContent, { x: 0.8, y: 1.7, w: 8.4, h: 3.5, valign: "top" });

      } else if (sd.layout === "section_intro") {
        // ══════ SECTION INTRO ══════
        s.background = { color: C.warmGray };
        // Top accent
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        // Large section number
        s.addText("01", {
          x: 0.8, y: 0.6, w: 2, h: 1.2,
          fontSize: 48, fontFace: F.title, color: C.copper, bold: true, transparency: 30,
        });
        // Title
        s.addText(sd.title, {
          x: 0.8, y: 1.6, w: 8.4, h: 0.7,
          fontSize: 24, fontFace: F.title, color: C.text, bold: true,
        });
        // Subtitle
        if (sd.subtitle) {
          s.addText(sd.subtitle, {
            x: 0.8, y: 2.3, w: 8.4, h: 0.4,
            fontSize: 13, fontFace: F.body, color: C.textLight, italic: true,
          });
        }
        // Divider
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.9, w: 1.5, h: 0.02, fill: { color: C.copper } });
        // Bullets
        const introBullets = sd.bullets.map(b => ({
          text: b,
          options: {
            fontSize: 13, fontFace: F.body, color: C.text,
            bullet: { code: "2014" }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5,
            indentLevel: 0,
          },
        }));
        s.addText(introBullets as any, { x: 0.8, y: 3.2, w: 8.4, h: 2.0, valign: "top" });

      } else if (sd.layout === "case_study") {
        // ══════ CASE STUDY SLIDE ══════
        caseIndex++;
        s.background = { color: C.cream };
        // Top accent line
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.03, fill: { color: C.copper } });

        if (hasImage) {
          // ── Layout: Image right (60/40 split) ──
          // Left content area
          // Case number badge
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.35, w: 0.55, h: 0.55, fill: { color: C.copper }, rectRadius: 0.06 });
          s.addText(String(caseIndex).padStart(2, "0"), {
            x: 0.6, y: 0.35, w: 0.55, h: 0.55,
            fontSize: 14, fontFace: F.title, color: C.white, bold: true, align: "center", valign: "middle",
          });
          // Title
          s.addText(sd.title, {
            x: 1.3, y: 0.3, w: 3.8, h: 0.65,
            fontSize: 18, fontFace: F.title, color: C.text, bold: true,
            lineSpacingMultiple: 1.1,
          });
          // Subtitle (architect/location)
          if (sd.subtitle) {
            s.addText(sd.subtitle, {
              x: 1.3, y: 0.95, w: 3.8, h: 0.35,
              fontSize: 10, fontFace: F.body, color: C.copper, italic: true,
            });
          }
          // Divider
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.4, w: 4.5, h: 0.01, fill: { color: C.divider } });
          // Bullets
          const caseBullets = sd.bullets.map(b => ({
            text: b,
            options: {
              fontSize: 11, fontFace: F.body, color: C.text,
              bullet: { code: "25AA", color: C.copper }, paraSpaceAfter: 7, lineSpacingMultiple: 1.4,
            },
          }));
          s.addText(caseBullets as any, { x: 0.6, y: 1.55, w: 4.5, h: 3.2, valign: "top" });
          // Source tag
          if (sd.sourceName) {
            s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 4.9, w: 1.8, h: 0.3, fill: { color: C.tagBg }, rectRadius: 0.04 });
            s.addText(`来源：${sd.sourceName}`, {
              x: 0.6, y: 4.9, w: 1.8, h: 0.3,
              fontSize: 8, fontFace: F.body, color: C.textLight, align: "center", valign: "middle",
            });
          }
          // Image (right side)
          const imgData = imageBase64Map.get(i)!;
          s.addImage({
            data: `image/${imgData.ext};base64,${imgData.data}`,
            x: 5.3, y: 0.3, w: 4.4, h: 4.95,
            rounding: true,
          });
          // Photo credit
          s.addText("图片来源: Pexels", {
            x: 5.3, y: 5.25, w: 4.4, h: 0.2,
            fontSize: 7, fontFace: F.body, color: C.textLight, align: "right",
          });
        } else {
          // ── Layout: Text only (no image) ──
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.35, w: 0.55, h: 0.55, fill: { color: C.copper }, rectRadius: 0.06 });
          s.addText(String(caseIndex).padStart(2, "0"), {
            x: 0.6, y: 0.35, w: 0.55, h: 0.55,
            fontSize: 14, fontFace: F.title, color: C.white, bold: true, align: "center", valign: "middle",
          });
          s.addText(sd.title, {
            x: 1.3, y: 0.3, w: 8, h: 0.65,
            fontSize: 20, fontFace: F.title, color: C.text, bold: true,
          });
          if (sd.subtitle) {
            s.addText(sd.subtitle, {
              x: 1.3, y: 0.95, w: 8, h: 0.35,
              fontSize: 11, fontFace: F.body, color: C.copper, italic: true,
            });
          }
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.5, w: 8.8, h: 0.01, fill: { color: C.divider } });
          const caseBullets = sd.bullets.map(b => ({
            text: b,
            options: {
              fontSize: 13, fontFace: F.body, color: C.text,
              bullet: { code: "25AA", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5,
            },
          }));
          s.addText(caseBullets as any, { x: 0.8, y: 1.7, w: 8.4, h: 3.0, valign: "top" });
          if (sd.sourceName) {
            s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 4.9, w: 1.8, h: 0.3, fill: { color: C.tagBg }, rectRadius: 0.04 });
            s.addText(`来源：${sd.sourceName}`, {
              x: 0.8, y: 4.9, w: 1.8, h: 0.3,
              fontSize: 8, fontFace: F.body, color: C.textLight, align: "center", valign: "middle",
            });
          }
        }
        // Footer
        s.addText(`N+1 STUDIOS  |  对标调研`, {
          x: 7.5, y: 5.25, w: 2.2, h: 0.2,
          fontSize: 7, fontFace: F.body, color: C.textLight, align: "right",
        });

      } else if (sd.layout === "insight") {
        // ══════ INSIGHT / STRATEGY SLIDE ══════
        s.background = { color: C.warmGray };
        // Top accent
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.03, fill: { color: C.copper } });

        if (hasImage) {
          // ── Layout: Full-width image top + text bottom ──
          const imgData = imageBase64Map.get(i)!;
          s.addImage({
            data: `image/${imgData.ext};base64,${imgData.data}`,
            x: 0.5, y: 0.3, w: 9.0, h: 2.8,
            rounding: true,
          });
          // Title below image
          s.addText(sd.title, {
            x: 0.5, y: 3.25, w: 9, h: 0.5,
            fontSize: 18, fontFace: F.title, color: C.text, bold: true,
          });
          // Divider
          s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.8, w: 1.2, h: 0.02, fill: { color: C.copper } });
          // Bullets
          const insightBullets = sd.bullets.map(b => ({
            text: b,
            options: {
              fontSize: 11, fontFace: F.body, color: C.text,
              bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 6, lineSpacingMultiple: 1.3,
            },
          }));
          s.addText(insightBullets as any, { x: 0.5, y: 3.95, w: 9, h: 1.3, valign: "top" });
          s.addText("图片来源: Pexels", {
            x: 7.5, y: 5.25, w: 2, h: 0.2,
            fontSize: 7, fontFace: F.body, color: C.textLight, align: "right",
          });
        } else {
          // ── Text-only insight ──
          s.addText(sd.title, {
            x: 0.8, y: 0.5, w: 8.4, h: 0.6,
            fontSize: 22, fontFace: F.title, color: C.text, bold: true,
          });
          if (sd.subtitle) {
            s.addText(sd.subtitle, {
              x: 0.8, y: 1.1, w: 8.4, h: 0.35,
              fontSize: 12, fontFace: F.body, color: C.copper, italic: true,
            });
          }
          s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.6, w: 1.5, h: 0.02, fill: { color: C.copper } });
          const insightBullets = sd.bullets.map(b => ({
            text: b,
            options: {
              fontSize: 13, fontFace: F.body, color: C.text,
              bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5,
            },
          }));
          s.addText(insightBullets as any, { x: 0.8, y: 1.8, w: 8.4, h: 3.5, valign: "top" });
        }

      } else if (sd.layout === "summary") {
        // ══════ SUMMARY / CLOSING SLIDE ══════
        s.background = { color: C.charcoal };
        // Top accent
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        // Decorative vertical line
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 0.6, w: 0.03, h: 1.5, fill: { color: C.copper } });
        // Title
        s.addText(sd.title, {
          x: 1.1, y: 0.7, w: 8, h: 0.7,
          fontSize: 24, fontFace: F.title, color: C.white, bold: true,
        });
        // Subtitle
        if (sd.subtitle) {
          s.addText(sd.subtitle, {
            x: 1.1, y: 1.4, w: 8, h: 0.35,
            fontSize: 12, fontFace: F.body, color: C.copperLight,
          });
        }
        // Divider
        s.addShape(pptx.ShapeType.rect, { x: 1.1, y: 2.1, w: 8, h: 0.01, fill: { color: C.copper, transparency: 50 } });
        // Summary bullets
        const summaryBullets = sd.bullets.map(b => ({
          text: b,
          options: {
            fontSize: 12, fontFace: F.body, color: C.textOnDark,
            bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5,
          },
        }));
        s.addText(summaryBullets as any, { x: 1.1, y: 2.3, w: 8, h: 2.5, valign: "top" });
        // Footer
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.0, w: 10, h: 0.63, fill: { color: C.slate } });
        s.addText("N+1 STUDIOS", {
          x: 0.8, y: 5.05, w: 3, h: 0.5,
          fontSize: 14, fontFace: F.title, color: C.copper, bold: true,
        });
        s.addText("感谢您的关注", {
          x: 6, y: 5.05, w: 3.5, h: 0.5,
          fontSize: 11, fontFace: F.body, color: C.textLight, align: "right",
        });

      } else {
        // ══════ FALLBACK / TEXT_ONLY ══════
        s.background = { color: C.cream };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.03, fill: { color: C.copper } });
        s.addText(sd.title, {
          x: 0.8, y: 0.4, w: 8.4, h: 0.6,
          fontSize: 22, fontFace: F.title, color: C.text, bold: true,
        });
        if (sd.subtitle) {
          s.addText(sd.subtitle, {
            x: 0.8, y: 1.0, w: 8.4, h: 0.35,
            fontSize: 12, fontFace: F.body, color: C.copper, italic: true,
          });
        }
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.5, w: 1.5, h: 0.02, fill: { color: C.copper } });
        const textBullets = sd.bullets.map(b => ({
          text: b,
          options: {
            fontSize: 13, fontFace: F.body, color: C.text,
            bullet: { code: "2014" }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5,
          },
        }));
        s.addText(textBullets as any, { x: 0.8, y: 1.7, w: 8.4, h: 3.5, valign: "top" });
        s.addText("N+1 STUDIOS", {
          x: 7.5, y: 5.25, w: 2.2, h: 0.2,
          fontSize: 7, fontFace: F.body, color: C.textLight, align: "right",
        });
      }
    }

    // Stage 4: Export and upload
    pptJobStore.set(jobId, { status: "processing", progress: 85, stage: "building_pptx" });

    const pptxBase64 = await pptx.write({ outputType: "base64" }) as string;
    const pptxBuffer = Buffer.from(pptxBase64, "base64");
    const fileKey = `pptx/${nanoid()}-${input.title}.pptx`;
    const { url } = await storagePut(fileKey, pptxBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation");

    pptJobStore.set(jobId, {
      status: "done",
      url,
      title: input.title,
      slideCount: slideData.slides.length,
      imageCount: imageBase64Map.size,
    });
    console.log(`[PPT] Job ${jobId} completed: ${slideData.slides.length} slides, ${imageBase64Map.size} images`);

    // Record in generation history
    if (userId) {
      await db.createGenerationHistory({
        userId,
        module: "benchmark_ppt",
        title: `${input.title} - 调研 PPT`,
        summary: `${slideData.slides.length} 页幻灯片，${imageBase64Map.size} 张配图`,
        outputUrl: url,
        status: "success",
        durationMs: Date.now() - pptStartTime,
        modelName: structureResponse.model || null,
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error(`[PPT] Job ${jobId} failed:`, err);
    pptJobStore.set(jobId, { status: "failed", error: err?.message || "PPT 生成失败" });
    // Record failure in history
    if (userId) {
      await db.createGenerationHistory({
        userId,
        module: "benchmark_ppt",
        title: `${input.title} - 调研 PPT`,
        summary: err?.message || "PPT 生成失败",
        status: "failed",
        durationMs: Date.now() - pptStartTime,
      }).catch(() => {});
    }
  }
}

// ─── Dashboard ───────────────────────────────────────────

const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    return db.getDashboardStats(ctx.user.id);
  }),

  /** AI-generated personalized greeting - returns immediately with default, generates AI greeting async */
  greeting: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const userName = ctx.user.name || "设计师";
    // Use Beijing time (UTC+8) for greeting
    const bjHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
    const timeOfDay = bjHour < 6 ? "深夜" : bjHour < 9 ? "早上" : bjHour < 12 ? "上午" : bjHour < 14 ? "中午" : bjHour < 18 ? "下午" : bjHour < 22 ? "晚上" : "深夜";

    // Check if we have a cached greeting generated within the last 2 hours
    const cached = await db.getCachedGreeting(userId);
    if (cached) {
      return { greeting: cached, timeOfDay, cached: true };
    }

    // Return default immediately, fire-and-forget AI generation
    const defaultGreeting = timeOfDay + "好，欢迎回到工作平台。";

    // Generate AI greeting in background (non-blocking)
    setImmediate(async () => {
      try {
        const recentHistory = await db.listRecentHistoryForGreeting(userId, 10);
        const moduleLabel: Record<string, string> = {
          ai_render: "AI效果图",
          benchmark_report: "案例调研报告",
          benchmark_ppt: "调研PPT",
          meeting_minutes: "会议纪要",
          media_xiaohongshu: "小红书内容",
          media_wechat: "公众号文章",
          media_instagram: "Instagram帖子",
        };
        const historyContext = recentHistory.length > 0
          ? recentHistory.map((h: any) => (moduleLabel[h.module] || h.module) + "：" + h.title).join("\n")
          : "暂无使用记录";
        const systemPrompt = [
          "你是 N+1 STUDIOS 建筑设计事务所 AI 工作平台的助手。请根据用户的最近使用记录，生成一句简短、自然、有温度的中文问候语。",
          "要求：一句话20-40字，结合工作内容，语气专业亲切，用“你”不用“您”，不重复用户名字，只输出问候语本身。",
        ].join("\n");
        const userPrompt = "用户名：" + userName + "\n当前时间：" + timeOfDay + "\n最近使用记录：\n" + historyContext;
        const response = await invokeLLMWithUserTool({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }, userId);
        const aiGreeting = (typeof response?.choices?.[0]?.message?.content === "string"
          ? response.choices[0].message.content.trim() : "") || defaultGreeting;
        await db.setCachedGreeting(userId, aiGreeting);
      } catch {
        // Silently ignore - user already got default greeting
      }
    });

    return { greeting: defaultGreeting, timeOfDay, cached: false };
  }),


  /** Recent AI generations for homepage thumbnail display */
  recentGenerations: protectedProcedure.query(async ({ ctx }) => {
    return db.listRecentHistoryForGreeting(ctx.user.id, 8);
  }),
});

// ─── Projects ────────────────────────────────────────────

const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.union([z.string(), z.array(z.string())]).optional() }).optional())
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
      companyProfile: z.string().optional(),
      businessGoal: z.string().optional(),
      clientProfile: z.string().optional(),
      projectOverview: z.string().optional(),
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
      companyProfile: z.string().optional(),
      businessGoal: z.string().optional(),
      clientProfile: z.string().optional(),
      projectOverview: z.string().optional(),
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

  // ─── Custom Fields ──────────────────────────────────
  listCustomFields: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listProjectCustomFields(input.projectId);
    }),

  createCustomField: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      fieldName: z.string().min(1),
      fieldValue: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createProjectCustomField(input);
    }),

  updateCustomField: protectedProcedure
    .input(z.object({
      id: z.number(),
      fieldName: z.string().optional(),
      fieldValue: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateProjectCustomField(id, data);
      return { success: true };
    }),

  deleteCustomField: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProjectCustomField(input.id);
      return { success: true };
    }),

  // ─── Project Generation History ────────────────────
  listGenerationHistory: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listProjectGenerationHistory(input.projectId);
    }),

  // ─── Project Members ──────────────────────────────────
  listMembers: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listProjectMembers(input.projectId);
    }),

  addMember: adminProcedure
    .input(z.object({
      projectId: z.number(),
      userId: z.number(),
      role: z.enum(["lead", "designer", "engineer", "viewer"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.addProjectMember({ ...input, addedBy: ctx.user.id });
    }),

  removeMember: adminProcedure
    .input(z.object({ projectId: z.number(), userId: z.number() }))
    .mutation(async ({ input }) => {
      await db.removeProjectMember(input.projectId, input.userId);
      return { success: true };
    }),

  updateMemberRole: adminProcedure
    .input(z.object({
      projectId: z.number(),
      userId: z.number(),
      role: z.enum(["lead", "designer", "engineer", "viewer"]),
    }))
    .mutation(async ({ input }) => {
      await db.updateProjectMemberRole(input.projectId, input.userId, input.role);
      return { success: true };
    }),

  // ─── Gantt Chart Data ────────────────────────────
  ganttData: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.union([z.string(), z.array(z.string())]).optional() }).optional())
    .query(async ({ input }) => {
      const projects = await db.listProjects(input);
      const result = [];
      for (const project of projects) {
        const tasks = await db.listTasksByProject(project.id);
        let startDate: number | null = null;
        let endDate: number | null = null;
        if (tasks.length > 0) {
          const validTasks = tasks.filter((t: any) => t.startDate || t.dueDate);
          if (validTasks.length > 0) {
            const startDates = validTasks.map((t: any) => t.startDate).filter(Boolean);
            const dueDates = validTasks.map((t: any) => t.dueDate).filter(Boolean);
            if (startDates.length > 0) startDate = Math.min(...startDates);
            if (dueDates.length > 0) endDate = Math.max(...dueDates);
          }
        }
        result.push({
          id: project.id,
          name: project.name,
          code: project.code,
          status: project.status,
          startDate,
          endDate,
          taskCount: tasks.length,
        });
      }
      return result;
    }),

  // ─── AI Extract Project Info from free text ────
  extractInfo: protectedProcedure
    .input(z.object({
      text: z.string().min(1),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // Get field templates as hints
      const templates = await db.listProjectFieldTemplates();
      const templateNames = templates.map(t => t.name).join("、");
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一个建筑设计项目信息提取助手。用户会输入一段描述项目的自由文字，请你提取其中的关键信息并对应到合适的信息类别。

常用的信息类别包括：${templateNames}。你也可以创建新的类别名称。

要求：
1. 返回 JSON 数组，每个元素包含 fieldName 和 fieldValue
2. fieldName 应与常用类别名称匹配（如果内容匹配），或创建简短清晰的新类别名
3. fieldValue 应是简洁准确的信息，去掉冠冕词语
4. 只返回能明确识别的信息，不要猜测
5. 如果文字中没有有效信息，返回空数组`,
          },
          { role: "user", content: input.text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "project_info_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fields: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      fieldName: { type: "string" },
                      fieldValue: { type: "string" },
                    },
                    required: ["fieldName", "fieldValue"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["fields"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : "{}";
      const parsed = JSON.parse(content);
      return { fields: parsed.fields || [] };
    }),

  // ─── Export project info as context for AI modules ────
  getProjectContext: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const project = await db.getProjectById(input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      const customFields = await db.listProjectCustomFields(input.id);
      // Build a structured context string for AI modules
      const lines: string[] = [];
      if (project.name) lines.push(`项目名称：${project.name}`);
      if (project.code) lines.push(`项目编号：${project.code}`);
      if (project.clientName) lines.push(`甲方名称：${project.clientName}`);
      if (project.companyProfile) lines.push(`公司概况：${project.companyProfile}`);
      if (project.businessGoal) lines.push(`业务目标：${project.businessGoal}`);
      if (project.clientProfile) lines.push(`客户情况：${project.clientProfile}`);
      if (project.projectOverview) lines.push(`项目概况：${project.projectOverview}`);
      if (project.description) lines.push(`项目描述：${project.description}`);
      for (const cf of customFields) {
        if (cf.fieldValue) lines.push(`${cf.fieldName}：${cf.fieldValue}`);
      }
      return { context: lines.join("\n"), project, customFields };
    }),
});

// ─── Tasks ───────────────────────────────────────────────

const tasksRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listTasksByProject(input.projectId);
    }),
  listMine: protectedProcedure
    .query(async ({ ctx }) => {
      return db.listMyTasks(ctx.user.id);
    }),
  listSubTasks: protectedProcedure
    .input(z.object({ parentId: z.number() }))
    .query(async ({ input }) => {
      return db.listSubTasks(input.parentId);
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      category: z.enum(["design", "construction", "management", "other"]).optional(),
      assigneeId: z.number().nullable().optional(),
      reviewerId: z.number().nullable().optional(),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
      parentId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 权限检查：仅项目创建者可以创建任务
      const project = await db.getProjectById(input.projectId);
      if (!project || project.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你没有权限创建任务" });
      }
      const { startDate, dueDate, ...rest } = input;
      return db.createTask({
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        createdBy: ctx.user.id,
      });
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["backlog", "todo", "in_progress", "review", "done"]) }))
    .mutation(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ctx.user.role === "admin";
      // API-created tasks can only be modified by admins
      if ((task as any).source === "api" && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "该任务由 API 创建，只有管理员可以修改" });
      }
      // Task creator, assignee, or admin can update status
      const isTaskCreator = task.createdBy === ctx.user.id;
      const isAssignee = task.assigneeId === ctx.user.id;
      if (!isAdmin && !isTaskCreator && !isAssignee) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你没有权限修改任务" });
      }
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
      reviewerId: z.number().nullable().optional(),
      startDate: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      progress: z.number().min(0).max(100).optional(),
      progressNote: z.string().nullable().optional(),
      parentId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ctx.user.role === "admin";
      // API-created tasks can only be modified by admins
      if ((task as any).source === "api" && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "该任务由 API 创建，只有管理员可以修改" });
      }
      // User-created tasks: task creator or admin can fully modify; assignee/reviewer can only update progress
      const isTaskCreator = task.createdBy === ctx.user.id;
      const isAssignee = task.assigneeId === ctx.user.id;
      const isReviewer = task.reviewerId === ctx.user.id;
      if (!isAdmin && !isTaskCreator && !isAssignee && !isReviewer) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你没有权限修改任务" });
      }
      // Assignees/reviewers (not creator, not admin) can only update progress/progressNote
      if (!isAdmin && !isTaskCreator && (isAssignee || isReviewer)) {
        const allowedFields = ["progress", "progressNote"];
        const attemptedFields = Object.keys(input).filter(k => k !== "id" && input[k as keyof typeof input] !== undefined);
        const forbidden = attemptedFields.filter(f => !allowedFields.includes(f));
        if (forbidden.length > 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "任务负责人只能更新完成进度" });
        }
      }
      const { id, startDate, dueDate, ...rest } = input;
      await db.updateTask(id, {
        ...rest,
        startDate: startDate === null ? null : startDate ? new Date(startDate) : undefined,
        dueDate: dueDate === null ? null : dueDate ? new Date(dueDate) : undefined,
      } as any);
      return { success: true };
    }),
  // Dedicated endpoint for assignees to submit progress
  submitProgress: protectedProcedure
    .input(z.object({
      id: z.number(),
      progress: z.number().min(0).max(100),
      progressNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.assigneeId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有任务负责人可以提交进度" });
      }
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq } = await import('drizzle-orm');
      const { tasks } = await import('../drizzle/schema');
      await drizzleDb.update(tasks).set({
        progress: input.progress,
        progressNote: input.progressNote ?? null,
        updatedAt: new Date(),
      }).where(eq(tasks.id, input.id));
      return { success: true };
    }),

  approveTask: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      // 权限检查：只有任务的审核人可以通过审核
      if (task.reviewerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有任务审核人可以通过审核" });
      }
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq } = await import('drizzle-orm');
      const { tasks } = await import('../drizzle/schema');
      // Check if completedAt is already set to preserve original completion time
      const existing = await drizzleDb.select({ completedAt: tasks.completedAt }).from(tasks).where(eq(tasks.id, input.id)).limit(1);
      const completedAt = existing[0]?.completedAt ?? new Date();
      await drizzleDb.update(tasks).set({
        approval: true,
        status: 'done',
        completedAt,
        updatedAt: new Date(),
      }).where(eq(tasks.id, input.id));
      return { success: true };
    }),
  // Submit deliverable when progress reaches 100%
  submitDeliverable: protectedProcedure
    .input(z.object({
      id: z.number(),
      deliverableType: z.enum(["file_location", "doc_link", "upload"]),
      deliverableContent: z.string().optional(),
      deliverableFileUrl: z.string().optional(),
      deliverableFileName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.assigneeId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有任务负责人可以提交成果" });
      }
      if (!input.deliverableContent && !input.deliverableFileUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请填写文件存储位置、文档链接或上传完成文件" });
      }
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq, sql: drizzleSql } = await import('drizzle-orm');
      const { tasks, taskDeliverableHistory } = await import('../drizzle/schema');
      const now = new Date();
      // Calculate next version number
      const [countRow] = await drizzleDb
        .select({ count: drizzleSql<number>`COUNT(*)` })
        .from(taskDeliverableHistory)
        .where(eq(taskDeliverableHistory.taskId, input.id));
      const nextVersion = Number((countRow as any)?.count ?? 0) + 1;
      // Insert history record
      await drizzleDb.insert(taskDeliverableHistory).values({
        taskId: input.id,
        version: nextVersion,
        deliverableType: input.deliverableType,
        deliverableContent: input.deliverableContent ?? null,
        deliverableFileUrl: input.deliverableFileUrl ?? null,
        deliverableFileName: input.deliverableFileName ?? null,
        submittedAt: now,
        submittedBy: ctx.user.id,
        reviewStatus: 'pending',
      });
      // Update task with latest deliverable info
      await drizzleDb.update(tasks).set({
        progress: 100,
        deliverableType: input.deliverableType,
        deliverableContent: input.deliverableContent ?? null,
        deliverableFileUrl: input.deliverableFileUrl ?? null,
        deliverableFileName: input.deliverableFileName ?? null,
        deliverableSubmittedAt: now,
        reviewStatus: 'pending',
        reviewComment: null,
        status: 'review',
        updatedAt: now,
      }).where(eq(tasks.id, input.id));
      return { success: true, version: nextVersion };
    }),
  // Reviewer approves or rejects deliverable
  reviewDeliverable: protectedProcedure
    .input(z.object({
      id: z.number(),
      approved: z.boolean(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.reviewerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有任务审核人可以审核成果" });
      }
      if (!(task as any).deliverableSubmittedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "任务尚未提交成果" });
      }
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq, desc } = await import('drizzle-orm');
      const { tasks, taskDeliverableHistory } = await import('../drizzle/schema');
      const now = new Date();
      // Update the latest history record with review result
      const [latestHistory] = await drizzleDb
        .select({ id: taskDeliverableHistory.id })
        .from(taskDeliverableHistory)
        .where(eq(taskDeliverableHistory.taskId, input.id))
        .orderBy(desc(taskDeliverableHistory.version))
        .limit(1);
      if (latestHistory) {
        await drizzleDb.update(taskDeliverableHistory).set({
          reviewStatus: input.approved ? 'approved' : 'rejected',
          reviewComment: input.comment ?? null,
          reviewedAt: now,
          reviewedBy: ctx.user.id,
        }).where(eq(taskDeliverableHistory.id, latestHistory.id));
      }
      if (input.approved) {
        await drizzleDb.update(tasks).set({
          reviewStatus: 'approved',
          reviewComment: input.comment ?? null,
          approval: true,
          status: 'done',
          updatedAt: now,
        }).where(eq(tasks.id, input.id));
      } else {
        await drizzleDb.update(tasks).set({
          reviewStatus: 'rejected',
          reviewComment: input.comment ?? null,
          status: 'in_progress',
          progress: 90,
          updatedAt: now,
        }).where(eq(tasks.id, input.id));
      }
      return { success: true };
    }),
  // Get deliverable submission history for a task
  getDeliverableHistory: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      // Only assignee, reviewer, project creator, or admin can view history
      const project = await db.getProjectById(task.projectId);
      const isAllowed =
        task.assigneeId === ctx.user.id ||
        task.reviewerId === ctx.user.id ||
        project?.createdBy === ctx.user.id ||
        ctx.user.role === 'admin';
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN" });
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { eq, desc } = await import('drizzle-orm');
      const { taskDeliverableHistory } = await import('../drizzle/schema');
      const history = await drizzleDb
        .select()
        .from(taskDeliverableHistory)
        .where(eq(taskDeliverableHistory.taskId, input.id))
        .orderBy(desc(taskDeliverableHistory.version));
      return history;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // 权限检查：仅项目创建者可以删除任务
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const project = await db.getProjectById(task.projectId);
      if (!project || project.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你没有权限删除任务" });
      }
      await db.deleteTask(input.id);
      return { success: true };
    }),
  listAll: protectedProcedure
    .query(async () => {
      return db.listAllTasks();
    }),
  listByUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return db.listTasksByUser(input.userId);
    }),
  listTeamMembers: protectedProcedure
    .query(async () => {
      return db.listUsers();
    }),
  applyAutoStatus: protectedProcedure
    .input(z.object({ taskIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return { updated: 0 };
      
      const { eq, inArray, ne } = await import('drizzle-orm');
      const { tasks } = await import('../drizzle/schema');
      
      // Today's date string in Beijing time (UTC+8), e.g. "2026-03-26"
      const now = new Date();
      const todayStr = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      
      // If specific taskIds provided, filter to those; otherwise scan all non-done tasks
      let query = drizzleDb.select().from(tasks) as any;
      if (input.taskIds?.length) {
        query = query.where(inArray(tasks.id, input.taskIds));
      } else {
        query = query.where(ne(tasks.status, 'done'));
      }
      const allTasks = await query;
      
      let updated = 0;
      for (const task of allTasks) {
        let newStatus: string = task.status;
        
        // Rule 1: startDate is today or earlier and status is 'todo' → mark as 'in_progress'
        if (task.startDate && task.status === 'todo') {
          // Convert stored UTC timestamp to date string in Beijing time
          const startStr = new Date(new Date(task.startDate).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
          if (startStr <= todayStr) {
            newStatus = 'in_progress';
          }
        }
        
        // Rule 2: approval is true → mark as 'done' (regardless of current status)
        if (task.approval === true && task.status !== 'done') {
          newStatus = 'done';
        }
        
        if (newStatus !== task.status) {
          await drizzleDb.update(tasks).set({ status: newStatus as any, updatedAt: new Date() }).where(eq(tasks.id, task.id));
          updated++;
        }
      }
      
      return { updated };
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

  // Upload a local file to S3 and create a document record
  uploadFile: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1),
      fileName: z.string(),
      fileData: z.string(), // base64
      contentType: z.string(),
      fileSize: z.number().optional(),
      type: z.enum(["brief", "report", "minutes", "specification", "checklist", "schedule", "other"]).optional(),
      category: z.enum(["design", "construction", "management"]).optional(),
      syncToAssets: z.boolean().optional().default(false),
      assetCategory: z.string().optional(),
      assetTags: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      // Sanitize filename: encodeURIComponent ensures Chinese chars & special symbols
      // are URL-safe in the S3 key, preventing CloudFront 403 errors
      const safeFileName = encodeURIComponent(input.fileName);
      const key = `project-docs/${input.projectId}/${nanoid()}-${safeFileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);

      // Create document record
      const doc = await db.createDocument({
        projectId: input.projectId,
        title: input.title,
        type: input.type ?? "other",
        category: input.category ?? "design",
        fileUrl: url,
        fileKey: key,
        createdBy: ctx.user.id,
      });

      // Optionally sync to assets library
      let asset = null;
      if (input.syncToAssets) {
        asset = await db.createAsset({
          name: input.title,
          fileUrl: url,
          fileKey: key,
          fileType: input.contentType,
          fileSize: input.fileSize,
          category: input.assetCategory || "project_doc",
          tags: input.assetTags,
          uploadedBy: ctx.user.id,
          projectId: input.projectId,
        });
      }

      return { doc, asset, url, key };
    }),

  // Analyze a URL with AI: fetch page content and extract key info
  analyzeUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      // 1. Fetch page HTML
      let pageText = "";
      let urlMeta: Record<string, string> = {};
      try {
        const resp = await fetch(input.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; N1Bot/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        const html = await resp.text();

        // Extract meta tags
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
        const favicon = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);

        urlMeta = {
          title: (ogTitle?.[1] || titleMatch?.[1] || "").trim(),
          description: (ogDesc?.[1] || metaDesc?.[1] || "").trim(),
          ogImage: ogImage?.[1] || "",
          siteName: ogSite?.[1] || new URL(input.url).hostname,
          favicon: favicon?.[1] || "",
        };

        // Extract readable text (strip tags, limit to 3000 chars)
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 3000);
      } catch (e) {
        // If fetch fails (e.g. feishu auth required), still allow AI to work with URL
        urlMeta = { title: "", description: "", ogImage: "", siteName: new URL(input.url).hostname, favicon: "" };
        pageText = `无法报取页面内容（可能需要登录权限）。URL: ${input.url}`;
      }

      // 2. AI analysis
      const aiResp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一个内容分析助手，層于建筑设计事务所内部工作平台。用户收藏了一个 URL，请分析其内容并返回 JSON。
要求：
- title: 简洁的中文标题（如果原标题是英文则翻译），不超过 50 字
- summary: 2-3 句中文摘要，说明该页面的主要内容和价值
- keywords: 3-6 个中文关键词，用逗号分隔
- docType: 从 [brief, report, minutes, specification, checklist, schedule, other] 中选择最匹配的类型
- category: 从 [design, construction, management] 中选择最匹配的分类
返回纯 JSON，无需其他文字。`,
          },
          {
            role: "user",
            content: `URL: ${input.url}\n站点名: ${urlMeta.siteName}\n页面标题: ${urlMeta.title}\n页面描述: ${urlMeta.description}\n页面正文摘录:\n${pageText}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "url_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                keywords: { type: "string" },
                docType: { type: "string", enum: ["brief", "report", "minutes", "specification", "checklist", "schedule", "other"] },
                category: { type: "string", enum: ["design", "construction", "management"] },
              },
              required: ["title", "summary", "keywords", "docType", "category"],
              additionalProperties: false,
            },
          },
        },
      });

      let analysis = { title: urlMeta.title || "", summary: "", keywords: "", docType: "other", category: "design" };
      try {
        const rawContent = aiResp.choices?.[0]?.message?.content;
        const raw = typeof rawContent === "string" ? rawContent : null;
        if (raw) analysis = { ...analysis, ...JSON.parse(raw) };
      } catch {}

      return { analysis, urlMeta };
    }),

  // Save a URL document with AI analysis results
  saveUrlDoc: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1),
      url: z.string().url(),
      type: z.enum(["brief", "report", "minutes", "specification", "checklist", "schedule", "other"]).optional(),
      category: z.enum(["design", "construction", "management"]).optional(),
      aiSummary: z.string().optional(),
      aiKeywords: z.string().optional(),
      urlMeta: z.string().optional(), // JSON string
    }))
    .mutation(async ({ input, ctx }) => {
      return db.createDocument({
        projectId: input.projectId,
        title: input.title,
        type: input.type ?? "other",
        category: input.category ?? "design",
        fileUrl: input.url,
        aiSummary: input.aiSummary,
        aiKeywords: input.aiKeywords,
        urlMeta: input.urlMeta,
        createdBy: ctx.user.id,
      });
    }),

  // Delete an uploaded document
  deleteFile: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const doc = await db.getDocumentById(input.id);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "文档不存在" });
      if (doc.createdBy !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此文档" });
      }
      await db.deleteDocument(input.id);
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
      historyId: z.number().optional(),
      projectId: z.number().optional(),
      parentId: z.number().optional(),
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
  importFromHistory: protectedProcedure
    .input(z.object({
      historyId: z.number(),
      useEnhanced: z.boolean().optional().default(false),
      name: z.string().optional(),
      category: z.string().optional().default("ai_render"),
      tags: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const history = await db.getGenerationHistoryById(input.historyId, ctx.user.id);
      if (!history) throw new TRPCError({ code: "NOT_FOUND", message: "生成记录不存在" });
      const imageUrl = (input.useEnhanced && history.enhancedImageUrl) ? history.enhancedImageUrl : history.outputUrl;
      if (!imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "该记录没有可导入的图片" });
      // Check if already imported (same URL)
      const existing = await db.findAssetByUrl(imageUrl);
      if (existing) return { asset: existing, alreadyExists: true };
      const asset = await db.createAsset({
        name: input.name || history.title || "未命名素材",
        fileUrl: imageUrl,
        fileKey: imageUrl,
        fileType: "image/png",
        category: input.category,
        tags: input.tags,
        thumbnailUrl: imageUrl,
        uploadedBy: ctx.user.id,
        historyId: input.historyId,
        projectId: history.projectId ?? undefined,
      });
      return { asset, alreadyExists: false };
    }),
  createFolder: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      parentId: z.number().optional(),
      path: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createFolder(input);
    }),
  listByParent: protectedProcedure
    .input(z.object({ parentId: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getAssetsByParent(input.parentId ?? null);
    }),

  listByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      const { assets } = await import("../drizzle/schema");
      const { eq: _eq } = await import("drizzle-orm");
      return drizzleDb.select().from(assets)
        .where(_eq(assets.category, input.category))
        .orderBy(assets.createdAt);
    }),
  listAll: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      const { assets } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      return drizzleDb.select().from(assets)
        .where(eq(assets.isFolder, false))
        .orderBy(assets.createdAt)
        .limit(input?.limit ?? 300);
    }),
  moveAsset: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      newParentId: z.number().optional(),
      newPath: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.moveAsset(input.assetId, input.newParentId ?? null, input.newPath);
      return { success: true };
    }),
  deleteFolder: protectedProcedure
    .input(z.object({ folderId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteFolder(input.folderId);
      return { success: true };
    }),
});
// ─── Standards ────────────────────────────────────────────

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

// ─── Render Styles (出品标准：渲染风格库) ─────────────────
const renderStylesRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return db.listRenderStyles(input);
    }),
  create: protectedProcedure
    .input(z.object({
      label: z.string().min(1).max(128),
      promptHint: z.string().min(1),
      referenceImageUrl: z.string().url().optional().nullable(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createRenderStyle({
        label: input.label,
        promptHint: input.promptHint,
        referenceImageUrl: input.referenceImageUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      });
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().min(1).max(128).optional(),
      promptHint: z.string().min(1).optional(),
      referenceImageUrl: z.string().url().optional().nullable(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateRenderStyle(id, data);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteRenderStyle(input.id);
      return { success: true };
    }),
  reorder: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.reorderRenderStyles(input.orderedIds);
      return { success: true };
    }),
  uploadRefImage: protectedProcedure
    .input(z.object({
      styleId: z.number(),
      fileName: z.string(),
      fileData: z.string(),
      contentType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const key = `render-styles/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      await db.updateRenderStyle(input.styleId, { referenceImageUrl: url });
      return { url, key };
    }),
});
// ─── AI Tools ────────────────────────────────────────────
const aiToolsRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional(), capability: z.string().optional(), activeOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const { maskApiKey, decryptApiKey } = await import("./_core/crypto");
      const tools = await db.listAiTools({ activeOnly: input?.activeOnly });
      const sanitized = tools.map((t: any) => {
        const { apiKeyEncrypted, ...rest } = t;
        let apiKeyMasked: string | null = null;
        if (apiKeyEncrypted) {
          const plain = decryptApiKey(apiKeyEncrypted);
          apiKeyMasked = plain ? maskApiKey(plain) : null;
        } else if (t.apiKeyName && t.apiKeyName.startsWith('sk-')) {
          // Legacy: apiKeyName was used to store plaintext key
          apiKeyMasked = maskApiKey(t.apiKeyName);
        }
        return { ...rest, apiKeyMasked, hasApiKey: !!apiKeyEncrypted || (!!t.apiKeyName && t.apiKeyName.startsWith('sk-')) };
      });
      if (!input?.capability && !input?.category) return sanitized;
      const { inferCapabilities } = await import("../shared/toolCapabilities");
      const filtered = sanitized.filter((t: any) => {
        if (input.capability) {
          // Merge stored capabilities with dynamically inferred ones so that
          // tools created before a new capability was added are still matched.
          const stored: string[] = Array.isArray(t.capabilities) ? t.capabilities : [];
          const inferred: string[] = inferCapabilities(t.name ?? "", t.apiEndpoint ?? "");
          const merged = Array.from(new Set([...stored, ...inferred]));
          return merged.includes(input.capability);
        }
        return t.category === input.category;
      });
      return filtered;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const { maskApiKey, decryptApiKey } = await import("./_core/crypto");
      const tool = await db.getAiToolById(input.id);
      if (!tool) throw new TRPCError({ code: "NOT_FOUND", message: "工具不存在" });
      const { apiKeyEncrypted, ...rest } = tool as any;
      let apiKeyMasked: string | null = null;
      if (apiKeyEncrypted) {
        const plain = decryptApiKey(apiKeyEncrypted);
        apiKeyMasked = plain ? maskApiKey(plain) : null;
      } else if ((tool as any).apiKeyName?.startsWith('sk-')) {
        apiKeyMasked = maskApiKey((tool as any).apiKeyName);
      }
      return { ...rest, apiKeyMasked, hasApiKey: !!apiKeyEncrypted || !!(tool as any).apiKeyName?.startsWith('sk-') };
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      provider: z.string().optional(), // 工具提供商，如 xfyun, volcengine_speech
      apiEndpoint: z.string().optional(),
      apiKeyName: z.string().optional(),
      apiKey: z.string().optional(), // plaintext API key, will be encrypted before storage
      accessKeyId: z.string().optional(), // 即梦 AI 专用
      configJson: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { inferCapabilities } = await import("../shared/toolCapabilities");
      const { encryptApiKey } = await import("./_core/crypto");
      const capabilities = inferCapabilities(input.name, input.apiEndpoint);
      const capToCategory: Record<string, string> = {
        rendering: "rendering", image: "image", video: "video",
        document: "document", analysis: "analysis", layout: "layout", media: "other",
      };
      const category = (capToCategory[capabilities[0]] || "other") as any;
      const { apiKey, accessKeyId, ...rest } = input;
      const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : undefined;
      // 如果有 accessKeyId，存到 configJson 中
      const configJson = accessKeyId ? { ...(input.configJson || {}), accessKeyId } : input.configJson;
      return db.createAiTool({ ...rest, apiKeyEncrypted, category, capabilities, configJson, createdBy: ctx.user.id });
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
      apiKey: z.string().optional(), // plaintext API key, will be encrypted before storage
      accessKeyId: z.string().optional(), // 即梦 AI 专用
      configJson: z.any().optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      iconUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { encryptApiKey } = await import("./_core/crypto");
      const { id, apiKey, accessKeyId, ...data } = input;
      if (data.isDefault === true) {
        await db.clearDefaultAiTool();
      }
      const updateData: any = { ...data };
      if (apiKey !== undefined) {
        updateData.apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : null;
      }
      // 如果有 accessKeyId，更新 configJson
      if (accessKeyId !== undefined) {
        updateData.configJson = { ...(data.configJson || {}), accessKeyId };
      }
      await db.updateAiTool(id, updateData);
      return { success: true };
    }),

  setDefault: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.clearDefaultAiTool();
      await db.updateAiTool(input.id, { isDefault: true });
      return { success: true };
    }),

  // 按 capability 类别设置默认工具
  setDefaultForCapability: adminProcedure
    .input(z.object({ capability: z.string().min(1), toolId: z.number() }))
    .mutation(async ({ input }) => {
      await db.setDefaultToolForCapability(input.capability, input.toolId);
      return { success: true };
    }),

  // 按 capability 类别清除默认工具（恢复为内置 AI）
  clearDefaultForCapability: adminProcedure
    .input(z.object({ capability: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await db.clearDefaultToolForCapability(input.capability);
      return { success: true };
    }),

  // 获取所有 capability 的默认工具映射
  getCapabilityDefaults: protectedProcedure
    .query(async () => {
      return db.getAllCapabilityDefaults();
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAiTool(input.id);
      return { success: true };
    }),

  /** 调用统计：按工具和日期汇总 */
  getCallStats: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const { days } = input;
      // 1. 按工具汇总
      const toolStats = await db.getAiToolCallStats(days);
      // 2. 按日期趋势
      const dailyTrend = await db.getAiToolDailyTrend(days);
      // 3. 最近失败记录
      const recentFailures = await db.getAiToolRecentFailures(20);
      return { toolStats, dailyTrend, recentFailures };
    }),

  getStatsByUser: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const { days } = input;
      const userStats = await db.getAiToolStatsByUser(days);
      const userActionStats = await db.getAiToolStatsByUserAndAction(days);
      return { userStats, userActionStats };
    }),

  // ─── Key 池管理路由 ─────────────────────────────────────
  /** 列出某工具的所有备用 Key */
  listKeys: adminProcedure
    .input(z.object({ toolId: z.number() }))
    .query(async ({ input }) => {
      const { listToolKeys } = await import("./_core/keyPool");
      return listToolKeys(input.toolId);
    }),

  /** 添加备用 Key */
  addKey: adminProcedure
    .input(z.object({
      toolId: z.number(),
      apiKey: z.string().min(1),
      label: z.string().optional(),
      sortOrder: z.number().optional(),
      weight: z.number().min(1).max(10).optional(),
    }))
    .mutation(async ({ input }) => {
      const { addToolKey } = await import("./_core/keyPool");
      return addToolKey(input.toolId, input.apiKey, input.label, input.sortOrder, input.weight);
    }),

  /** 更新备用 Key（改标签、启停、重置冷却、更换 Key 值、调整权重） */
  updateKey: adminProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
      weight: z.number().min(1).max(10).optional(),
      apiKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { updateToolKey } = await import("./_core/keyPool");
      const { id, apiKey, ...rest } = input;
      await updateToolKey(id, { ...rest, plainApiKey: apiKey });
      return { success: true };
    }),

  /** 删除备用 Key */
  deleteKey: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const { deleteToolKey } = await import("./_core/keyPool");
      await deleteToolKey(input.id);
      return { success: true };
    }),

  getSessionStats: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const { days } = input;
      const since = Math.floor(Date.now() / 1000) - days * 86400;
      const { sql: drizzleSql, inArray: drizzleInArray } = await import('drizzle-orm');
      const { userSessions, users: usersTable } = await import('../drizzle/schema');
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return { sessionStats: [], totalSeconds: 0 };

      const rows = await drizzleDb
        .select({
          userId: userSessions.userId,
          totalSeconds: drizzleSql<number>`SUM(${userSessions.durationSeconds})`,
          sessionCount: drizzleSql<number>`COUNT(*)`,
          lastSeen: drizzleSql<number>`MAX(${userSessions.lastHeartbeat})`,
          // COUNT distinct calendar dates (UTC) within the period
          activeDays: drizzleSql<number>`COUNT(DISTINCT DATE(FROM_UNIXTIME(${userSessions.sessionStart})))`,
        })
        .from(userSessions)
        .where(drizzleSql`${userSessions.sessionStart} >= ${since}`)
        .groupBy(userSessions.userId)
        .orderBy(drizzleSql`SUM(${userSessions.durationSeconds}) DESC`);

      // Attach user info
      const userIds = rows.map((r: any) => r.userId);
      const userRows = userIds.length > 0
        ? await drizzleDb.select({ id: usersTable.id, name: usersTable.name, department: usersTable.department })
            .from(usersTable)
            .where(drizzleInArray(usersTable.id, userIds))
        : [];
      const userMap = new Map(userRows.map((u: any) => [u.id, u]));

      const totalSeconds = rows.reduce((s: number, r: any) => s + Number(r.totalSeconds), 0);

      return {
        sessionStats: rows.map((r: any) => ({
          userId: r.userId,
          userName: (userMap.get(r.userId) as any)?.name ?? null,
          department: (userMap.get(r.userId) as any)?.department ?? null,
          totalSeconds: Number(r.totalSeconds),
          totalMinutes: Math.round(Number(r.totalSeconds) / 60),
          sessionCount: Number(r.sessionCount),
          activeDays: Number(r.activeDays),
          lastSeen: r.lastSeen ? new Date(Number(r.lastSeen) * 1000).toISOString() : null,
        })),
        totalSeconds,
      };
    }),
});

// ─── Session Router ───────────────────────────────────────
const sessionRouter = router({
  start: protectedProcedure.mutation(async ({ ctx }) => {
    const now = Math.floor(Date.now() / 1000);
    const { userSessions } = await import('../drizzle/schema');
    const drizzleDb = await db.getDb();
    if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const result = await drizzleDb.insert(userSessions).values({
      userId: ctx.user.id,
      sessionStart: now,
      lastHeartbeat: now,
      durationSeconds: 0,
    });
    // Drizzle MySQL insert returns [ResultSetHeader, fields]; insertId is in result[0]
    const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
    return { sessionId: Number(insertId) };
  }),

  heartbeat: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const now = Math.floor(Date.now() / 1000);
      const { eq, and } = await import('drizzle-orm');
      const { userSessions } = await import('../drizzle/schema');
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return { ok: false };
      // Fetch current session
      const [session] = await drizzleDb
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.id, input.sessionId),
            eq(userSessions.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!session) return { ok: false };
      const elapsed = now - session.lastHeartbeat;
      // Only count gaps <= 90s (2 heartbeat intervals) as active time
      const increment = elapsed <= 90 ? elapsed : 0;
      await drizzleDb
        .update(userSessions)
        .set({
          lastHeartbeat: now,
          durationSeconds: session.durationSeconds + increment,
        })
        .where(eq(userSessions.id, input.sessionId));
      return { ok: true };
    }),

  getStats: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input }) => {
      const { userSessions } = await import('../drizzle/schema');
      const { users } = await import('../drizzle/schema');
      const { gte, eq, sql } = await import('drizzle-orm');
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return { userSessionStats: [] };
      const since = Math.floor(Date.now() / 1000) - input.days * 86400;
      const rows = await drizzleDb
        .select({
          userId: userSessions.userId,
          userName: users.name,
          totalMinutes: sql<number>`ROUND(SUM(${userSessions.durationSeconds}) / 60)`,
          sessionCount: sql<number>`COUNT(*)`,
          lastSeen: sql<number>`MAX(${userSessions.lastHeartbeat})`,
        })
        .from(userSessions)
        .leftJoin(users, eq(users.id, userSessions.userId))
        .where(gte(userSessions.sessionStart, since))
        .groupBy(userSessions.userId, users.name)
        .orderBy(sql`SUM(${userSessions.durationSeconds}) DESC`);
      return { userSessionStats: rows };
    }),
});

// ─── AI Module: Benchmarking Research ────────────────────

/** Background worker: refine an existing report based on user feedback */
async function refineBenchmarkInBackground(
  jobId: string,
  input: { currentReport: string; feedback: string; projectName: string; projectType: string; toolId?: number },
  userId: number,
  userName?: string | null,
  parentHistoryId?: number
) {
  const startTime = Date.now();
  try {
    await db.updateBenchmarkJob(jobId, { status: "processing" });

    // Load caseRefs from parent history record (most reliable source)
    // The refine job itself is brand new and has no caseRefs yet
    let storedCaseRefs: Record<string, string> | null | undefined = null;
    if (parentHistoryId) {
      try {
        const parentHistory = await db.getGenerationHistoryById(parentHistoryId, userId);
        const parentInputParams = parentHistory?.inputParams as Record<string, unknown> | null;
        if (parentInputParams?.caseRefs && typeof parentInputParams.caseRefs === 'object') {
          storedCaseRefs = parentInputParams.caseRefs as Record<string, string>;
          console.log(`[Benchmark Refine] Loaded ${Object.keys(storedCaseRefs).length} caseRefs from parentHistoryId=${parentHistoryId}`);
        }
      } catch (e) {
        console.warn('[Benchmark Refine] Failed to load parent caseRefs:', e);
      }
    }
    // Fallback: try loading from the refine job itself (legacy path)
    if (!storedCaseRefs) {
      const jobData = await db.getBenchmarkJob(jobId);
      storedCaseRefs = jobData?.caseRefs as Record<string, string> | null | undefined;
    }
    const caseRefsSection = storedCaseRefs && Object.keys(storedCaseRefs).length > 0
      ? `\n\n**已验证的案例链接（必须原样保留，不得修改或替换）**：\n${Object.entries(storedCaseRefs).map(([name, url]) => `- ${name}: ${url}`).join('\n')}\n\n注意：以 \`?q=\` 结尾的链接是搜索页，这是正常的，请原样保留，不要替换为其他 URL。`
      : '';

    const response = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: (() => {
            const bjDate2 = new Date(Date.now() + 8 * 3600 * 1000);
            const [y2, m2, d2] = bjDate2.toISOString().slice(0, 10).split('-');
            const dateStr2 = `${y2}年${m2}月${d2}日`;
            return `你是 N+1 STUDIOS 的对标调研专家。用户对已生成的对标调研报告有修改意见，请根据反馈对报告进行调整和优化。

**当前日期**：${dateStr2}（北京时间）。报告中如需标注日期，请使用此日期。${caseRefsSection}

**要求**：
- 保持报告的整体结构和专业性
- 根据用户反馈精确修改相应部分
- 不要改动用户没有提到的内容
- 严格使用上方提供的案例链接，不得自行编造或替换任何 URL
- 报告中的图片格式为 [![名称](图片URL)](案例URL)，请**原样保留**这些图片的完整格式，不得将其改写为普通图片语法
- 输出完整的修订后报告（Markdown 格式）`;
          })(),
        },
        {
          role: "user",
          content: `项目名称：${input.projectName}\n项目类型：${input.projectType}\n\n当前报告：\n${input.currentReport}\n\n用户反馈：${input.feedback}`,
        },
      ],
    }, userId);
    const content = typeof response.choices[0]?.message?.content === 'string'
      ? response.choices[0].message.content : '';
    if (!content) throw new Error('LLM 返回内容为空');
    await db.updateBenchmarkJob(jobId, { status: "done", result: content });

    // Save refined report to generation history, linked to parent
    try {
      const durationMs = Date.now() - startTime;
      const histResult = await db.createGenerationHistory({
        userId,
        module: "benchmark_report",
        title: `${input.projectName} - 案例调研报告（修订版）`,
        summary: `用户反馈：${input.feedback.slice(0, 100)}${input.feedback.length > 100 ? '…' : ''}`,
        outputContent: content,
        status: "success",
        durationMs,
        parentId: parentHistoryId || undefined,
        projectId: undefined,
        createdByName: userName || undefined,
        modelName: response.model || null,
      });
      // Also store the new history id back into the job so frontend can retrieve it
      await db.updateBenchmarkJob(jobId, { historyId: histResult.id });
      console.log(`[Benchmark Refine] Job ${jobId} done in ${durationMs}ms, historyId=${histResult.id}`);
    } catch (histErr) {
      console.error("[Benchmark Refine] Failed to save history:", histErr);
    }
  } catch (error: any) {
    console.error("[Benchmark Refine] Background job failed:", error);
    await db.updateBenchmarkJob(jobId, { status: "failed", error: error?.message || "调整失败" });
  }
}

/** Background worker: runs LLM call and saves result to DB */
async function generateBenchmarkInBackground(
  jobId: string,
  input: { projectName: string; projectType: string; requirements: string; referenceCount?: number; toolId?: number; projectId?: number },
  userId: number,
  userName: string | null
) {
  const startTime = Date.now();
  try {
    await db.updateBenchmarkJob(jobId, { status: "processing" });

    // === Load prompts from database (fallback to hardcoded defaults) ===
    const [kwPromptRow, csPromptRow, rgPromptRow] = await Promise.all([
      db.getCaseStudyPrompt("keyword_extraction"),
      db.getCaseStudyPrompt("case_selection"),
      db.getCaseStudyPrompt("report_generation"),
    ]);
    const keywordExtractionPrompt = kwPromptRow?.prompt ||
      `你是一位设计专家。请从用户的项目需求描述中，提取 4-6 个最关键的设计维度关键词（如空间类型、功能特征、设计风格、技术要求、用户体验等）。
这些关键词将用于引导案例搜索，应该具体且有区分度，避免过于宽泛。
只返回关键词列表，每行一个，无需解释。`;
    const caseSelectionPrompt = csPromptRow?.prompt ||
      `你是 N+1 STUDIOS 的对标调研专家。请仔细阅读用户提供的项目信息和需求描述，选出 {referenceCount} 个与该项目需求最匹配的对标案例名称。

选案标准：案例应在空间类型、设计元素、使用场景或设计理念上与项目需求直接相关。案例必须是真实存在的项目，使用项目官方名称（英文或中文）。**时间要求：优先选择 2022 年至今竣工或公开发布的项目**，如近三年内无足够匹配案例，可适当放宽至 2018 年后。{excludeSection}
只返回案例名称列表，每行一个，不要包含链接或额外说明。`;
    const reportGenerationPrompt = rgPromptRow?.prompt ||
      `你是 N+1 STUDIOS 的对标调研专家。请根据用户提供的项目信息和以下对标案例列表，生成一份专业的对标调研报告。

**当前日期**：{currentDate}（北京时间）。报告中如需标注日期，请使用此日期。

**对标案例及真实链接**：
{caseRefs}

**重要要求**：
- 严格使用上面提供的案例名称和链接，不要自行编造 URL
- 如果某个案例标注了"URL 未找到"，则展示案例信息时不要添加链接
- 每个案例标题后用 Markdown 链接标注来源，例如 [来源](https://www.archdaily.com/xxx)
- 如果案例数据中提供了「图片」字段（格式为 [![名称](图片URL)](案例URL)），请将这些图片**原样**嵌入该案例的分析段落中（放在设计亮点分析之前），**绝对不要修改图片的 Markdown 格式**，必须保留完整的 [![名称](图片URL)](案例URL) 结构，这样图片才能点击跳转到来源页面
报告结构：
1. **项目概述与调研目标**
2. **对标案例分析**（{referenceCount} 个案例，每个案例包含）：
   - 项目名称 + 来源链接
   - 设计单位
   - 项目概况（位置、面积、完成时间）
   - 案例图片（如有，原样嵌入 [![名称](图片URL)](案例URL) 格式，不得修改）
   - 设计亮点分析
   - 与本项目的关联性分析
3. **设计策略建议**
4. **材料与工艺参考**
5. **总结与建议**
请以 Markdown 格式输出，结构清晰，内容专业。`;

    // === Phase 0: Extract design keywords from requirements ===
    const keywordResponse = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: keywordExtractionPrompt
        },
        {
          role: "user",
          content: `项目名称：${input.projectName}\n项目类型：${input.projectType}\n项目需求：${input.requirements}`
        }
      ],
    }, userId);
    const keywordsRaw = typeof keywordResponse.choices[0]?.message?.content === 'string'
      ? keywordResponse.choices[0].message.content : '';
    const designKeywords = keywordsRaw
      .split('\n')
      .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(line => line.length > 1)
      .slice(0, 6);
    console.log(`[Benchmark] Phase 0 keywords: ${designKeywords.join(', ')}`);

    // === Phase 1: Generate case study names only ===
    // Fetch recent case names to avoid repetition
    const recentCaseNames = await db.getRecentBenchmarkCaseNames(userId, 8);
    const excludeSection = recentCaseNames.length > 0
      ? `\n**必须排除以下已调研过的案例**（请选择全新的案例）：\n${recentCaseNames.map(n => `- ${n}`).join('\n')}\n`
      : '';
    const resolvedCaseSelectionPrompt = caseSelectionPrompt
      .replace(/\{referenceCount\}/g, String(input.referenceCount || 5))
      .replace(/\{excludeSection\}/g, excludeSection);
    const phase1Response = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: resolvedCaseSelectionPrompt
        },
        {
          role: "user",
          content: `项目名称：${input.projectName}\n项目类型：${input.projectType}\n项目需求：${input.requirements}`
        }
      ],
    }, userId);

    const caseNamesRaw = typeof phase1Response.choices[0]?.message?.content === 'string'
      ? phase1Response.choices[0].message.content : '';
    const caseNames = caseNamesRaw
      .split('\n')
      .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(line => line.length > 2)
      .slice(0, input.referenceCount || 5);

    console.log(`[Benchmark] Phase 1 done: ${caseNames.length} case names extracted`);

      // === Phase 2: Search real URLs and images for each case using Tavily ===
    const [caseUrlMap, caseImageMap] = await Promise.all([
      searchCaseStudies(caseNames, input.projectType),
      searchCaseStudyImages(caseNames, input.projectType),
    ]);
    console.log(`[Benchmark] Phase 2 done: URLs for ${Object.keys(caseUrlMap).length} cases, images for ${Object.values(caseImageMap).filter(imgs => imgs.length > 0).length} cases`);
    // Persist caseUrlMap so refine can reuse the same verified URLs
    await db.updateBenchmarkJob(jobId, { caseRefs: caseUrlMap });
    // Build case reference context with real URLs and images
    const caseRefs = caseNames.map(name => {
      const url = caseUrlMap[name];
      const images = caseImageMap[name] || [];
      const urlPart = url ? `- ${name}: ${url}` : `- ${name}: (URL 未找到)`;
      const imgPart = images.length > 0
        ? `\n  图片：${images.map(img => `[![${name}](${img.imageUrl})](${img.sourcePageUrl})`).join(' ')}`
        : '';
      return urlPart + imgPart;
    }).join('\n');
    // === Phase 3: Generate full report with real URLs ====
    const bjDate = new Date(Date.now() + 8 * 3600 * 1000);
    const [y, m, d] = bjDate.toISOString().slice(0, 10).split('-');
    const dateStr = `${y}年${m}月${d}日`;
    const resolvedReportPrompt = reportGenerationPrompt
      .replace(/\{currentDate\}/g, dateStr)
      .replace(/\{caseRefs\}/g, caseRefs)
      .replace(/\{referenceCount\}/g, String(input.referenceCount || 5));
    const response = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: resolvedReportPrompt
        },
        {
          role: "user",
          content: `项目名称：${input.projectName}\n项目类型：${input.projectType}\n项目需求：${input.requirements}`
        }
      ],
    }, userId);

    const content = typeof response.choices[0]?.message?.content === 'string'
      ? response.choices[0].message.content : '';

    await db.createAiToolLog({
      toolId: input.toolId || 0,
      userId,
      action: "benchmark_research",
      inputSummary: `${input.projectName} - ${input.projectType}`,
      outputSummary: content.substring(0, 200),
      status: "success",
      durationMs: Date.now() - startTime,
    });

    const historyResult = await db.createGenerationHistory({
      userId,
      module: "benchmark_report",
      title: `${input.projectName} - 案例调研报告`,
      summary: `${input.projectType} | ${input.requirements?.substring(0, 100) || ''}`,
      inputParams: { projectName: input.projectName, projectType: input.projectType, requirements: input.requirements, caseRefs: caseUrlMap },
      outputContent: content,
      status: "success",
      durationMs: Date.now() - startTime,
      projectId: null,
      createdByName: userName,
      modelName: response.model || null,
    }).catch(() => ({ id: 0 }));
    await db.updateBenchmarkJob(jobId, { status: "done", result: content, historyId: historyResult.id });;
  } catch (error: any) {
    console.error("[Benchmark] Background job failed:", error);
    await db.createAiToolLog({
      toolId: input.toolId || 0,
      userId,
      action: "benchmark_research",
      inputSummary: `${input.projectName} - ${input.projectType}`,
      status: "failed",
      durationMs: Date.now() - startTime,
    }).catch(() => {});
    await db.updateBenchmarkJob(jobId, { status: "failed", error: error?.message || "生成失败" });
  }
}

const benchmarkRouter = router({
  /** Submit async benchmark report generation job, returns jobId immediately */
  generate: protectedProcedure
    .input(z.object({
      projectName: z.string(),
      projectType: z.string().optional().default(""),
      requirements: z.string(),
      referenceCount: z.number().min(1).max(10).optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const jobId = nanoid();
      await db.createBenchmarkJob({
        id: jobId,
        userId: ctx.user.id,
        inputParams: input as Record<string, unknown>,
      });
      // Fire-and-forget background generation
      generateBenchmarkInBackground(jobId, input, ctx.user.id, ctx.user.name || null).catch(err => {
        console.error("[Benchmark] Unhandled error:", err);
      });
      return { jobId };
    }),

  /** Poll status of a benchmark generation job */
  pollStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const job = await db.getBenchmarkJob(input.jobId);
      if (!job) return { status: "not_found" as const };
      if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (job.status === "done") {
        return { status: "done" as const, content: job.result || "", historyId: job.historyId, generatedAt: job.updatedAt?.toISOString() };
      }
      if (job.status === "failed") {
        return { status: "failed" as const, error: job.error || "生成失败" };
      }
      return { status: job.status as "pending" | "processing" };
    }),

  /** Submit async refine job, returns jobId immediately to avoid proxy timeout */
  refine: protectedProcedure
    .input(z.object({
      currentReport: z.string().min(1),
      feedback: z.string().min(1),
      projectName: z.string(),
      projectType: z.string().optional().default(""),
      toolId: z.number().optional(),
      parentHistoryId: z.number().optional(), // history record ID of the report being refined
    }))
    .mutation(async ({ input, ctx }) => {
      const jobId = nanoid();
      await db.createBenchmarkJob({
        id: jobId,
        userId: ctx.user.id,
        inputParams: { type: 'refine', ...input } as Record<string, unknown>,
      });
      // Fire-and-forget background refine
      // Pass userId so refineBenchmarkInBackground can look up parent history caseRefs
      refineBenchmarkInBackground(jobId, input, ctx.user.id, ctx.user.name, input.parentHistoryId).catch(err => {
        console.error("[Benchmark Refine] Unhandled error:", err);
      });
      return { jobId };
    }),

  // List configured case source sites (for admin management)
  listCaseSources: protectedProcedure.query(async () => {
    return db.listCaseSources(true);
  }),

  // ── Async PPT Export (avoids long-running request timeout) ──
  // In-memory job queue for PPT generation
  startExportPpt: protectedProcedure
    .input(z.object({ content: z.string().min(1), title: z.string().min(1), projectType: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const jobId = nanoid();
      // Store job in memory and start processing in background
      pptJobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });
      // Fire-and-forget: run PPT generation in background
      generatePptInBackground(jobId, input, ctx.user.id).catch(err => {
        console.error("[PPT] Background job failed:", err);
        pptJobStore.set(jobId, { status: "failed", error: err?.message || "PPT 生成失败" });
      });
      return { jobId };
    }),

  exportPptStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = pptJobStore.get(input.jobId);
      if (!job) return { status: "not_found" as const, progress: 0, stage: "" as const };
      if (job.status === "done") {
        // Clean up after delivering result (keep for 5 min)
        setTimeout(() => pptJobStore.delete(input.jobId), 5 * 60 * 1000);
        return { status: "done" as const, progress: 100, stage: "done" as const, url: job.url, title: job.title, slideCount: job.slideCount, imageCount: job.imageCount, slides: job.slides };
      }
      if (job.status === "failed") {
        setTimeout(() => pptJobStore.delete(input.jobId), 60 * 1000);
        return { status: "failed" as const, progress: 0, stage: "" as const, error: job.error };
      }
      return { status: "processing" as const, progress: job.progress || 0, stage: job.stage || "structuring" };
    }),

  // Legacy sync endpoint - redirects to async version
  exportPpt: protectedProcedure
    .input(z.object({ content: z.string().min(1), title: z.string().min(1), projectType: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Use the async pipeline and wait for it
      const jobId = nanoid();
      pptJobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });
      await generatePptInBackground(jobId, input, ctx.user.id);
      const job = pptJobStore.get(jobId);
      if (job?.status === "done") {
        return { url: job.url, title: job.title, slideCount: job.slideCount, imageCount: job.imageCount };
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PPT 生成失败" });
    }),
});
// ─── Case Study Prompts Router ────────────────────────
const caseStudyPromptsRouter = router({
  /** List all case study prompts */
  listPrompts: protectedProcedure
    .query(async () => {
      return db.listCaseStudyPrompts();
    }),

  /** Update a case study prompt */
  updatePrompt: protectedProcedure
    .input(z.object({
      phase: z.enum(["keyword_extraction", "case_selection", "report_generation"]),
      prompt: z.string().min(1),
      label: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertCaseStudyPrompt(input.phase, {
        prompt: input.prompt,
        label: input.label,
        description: input.description,
        updatedBy: ctx.user.id,
      });
      return { success: true };
    }),
});

// ─── AI Module: Rendering / Sketch ────────────────────────

async function generateRenderingInBackground(
  jobId: string,
  input: {
    prompt: string;
    style?: string;
    styleId?: number;
    toolId?: number;
    referenceImageUrl?: string;
    parentHistoryId?: number;
    materialImageUrl?: string;
    materialImageUrls?: string[]; // 多素材支持
    maskImageData?: string;
    aspectRatio?: string;
    resolution?: string;
    // 即梦专属模式
    jimengMode?: "i2i" | "inpaint" | "upscale";
    jimengMaskUrl?: string;
    jimengUpscaleResolution?: "4k" | "8k";
    jimengUpscaleScale?: number;
  },
  userId: number,
  userName: string | null
) {
  const startTime = Date.now();
  try {
    await db.updateRenderingJob(jobId, { status: "processing" });

    let fullPrompt = input.prompt;
    let styleRefImageUrl: string | null = null;

    if (input.styleId) {
      try {
        const renderStyle = await db.getRenderStyleById(input.styleId);
        if (renderStyle) {
          fullPrompt += `, ${renderStyle.promptHint}`;
          if (renderStyle.referenceImageUrl) styleRefImageUrl = renderStyle.referenceImageUrl;
        }
      } catch { /* ignore */ }
    } else if (input.style) {
      fullPrompt += `, style: ${input.style}`;
    }

    const ratioLabels: Record<string, string> = {
      "1:1": "square composition (1:1 aspect ratio)",
      "4:3": "4:3 aspect ratio landscape composition",
      "3:2": "3:2 aspect ratio landscape composition",
      "16:9": "wide cinematic 16:9 aspect ratio panoramic composition",
      "9:16": "tall portrait 9:16 aspect ratio vertical composition",
      "3:4": "3:4 aspect ratio portrait composition",
    };
    if (input.aspectRatio && ratioLabels[input.aspectRatio]) {
      fullPrompt = `[IMPORTANT: Generate image with ${ratioLabels[input.aspectRatio]}] ${fullPrompt}`;
    }

    const resolutionMap: Record<string, number> = { standard: 1024, hd: 1536, ultra: 2048 };
    const baseSize = resolutionMap[input.resolution || "standard"] || 1024;
    const aspectRatioMap: Record<string, [number, number]> = {
      "1:1": [1, 1], "4:3": [4, 3], "3:2": [3, 2],
      "16:9": [16, 9], "9:16": [9, 16], "3:4": [3, 4],
    };
    let imageSize: string | undefined;
    const ratioEntry = input.aspectRatio ? aspectRatioMap[input.aspectRatio] : undefined;
    if (ratioEntry) {
      const [rw, rh] = ratioEntry;
      const ratio = rw / rh;
      let w: number, h: number;
      if (ratio >= 1) { w = baseSize; h = Math.round(baseSize / ratio); }
      else { h = baseSize; w = Math.round(baseSize * ratio); }
      w = Math.round(w / 64) * 64;
      h = Math.round(h / 64) * 64;
      imageSize = `${w}x${h}`;
    } else if (input.resolution && input.resolution !== "standard") {
      imageSize = `${baseSize}x${baseSize}`;
    }

    let resolvedModelName = "内置图像生成";
    if (input.toolId) {
      try { const tool = await db.getAiToolById(input.toolId); if (tool?.name) resolvedModelName = tool.name; } catch { /* ignore */ }
    }

    const genOpts: Parameters<typeof generateImage>[0] = { prompt: fullPrompt };
    const originalImages: Array<{ url?: string; b64Json?: string; mimeType?: string }> = [];

    if (input.referenceImageUrl && input.maskImageData) {
      try {
        const composite = await compositeMaskOnImage(input.referenceImageUrl, input.maskImageData);
        originalImages.push({ b64Json: composite.b64, mimeType: composite.mimeType });
        fullPrompt = `[INPAINTING INSTRUCTION: The image has red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas. Keep all other areas exactly unchanged.] ${fullPrompt}`;
      } catch {
        originalImages.push({ url: input.referenceImageUrl, mimeType: "image/png" });
      }
    } else if (input.referenceImageUrl) {
      if (imageSize && ratioEntry) {
        try {
          const targetRatio = ratioEntry[0] / ratioEntry[1];
          const cropped = await cropToAspectRatio(input.referenceImageUrl, targetRatio);
          originalImages.push({ b64Json: cropped.buffer.toString("base64"), mimeType: cropped.mimeType });
        } catch { originalImages.push({ url: input.referenceImageUrl, mimeType: "image/png" }); }
      } else {
        originalImages.push({ url: input.referenceImageUrl, mimeType: "image/png" });
      }
    }
    // Support both single materialImageUrl (legacy) and multiple materialImageUrls
    const allMaterialUrls = [
      ...(input.materialImageUrls || []),
      ...(input.materialImageUrl && !(input.materialImageUrls?.includes(input.materialImageUrl)) ? [input.materialImageUrl] : []),
    ];
    for (const matUrl of allMaterialUrls) {
      const matMime = /\.png$/i.test(matUrl) ? "image/png" : /\.webp$/i.test(matUrl) ? "image/webp" : "image/jpeg";
      originalImages.push({ url: matUrl, mimeType: matMime });
    }
    if (styleRefImageUrl) originalImages.push({ url: styleRefImageUrl, mimeType: "image/png" });
    if (originalImages.length > 0) genOpts.originalImages = originalImages;
    if (imageSize) genOpts.size = imageSize;

    const result = await generateImageWithTool({
      ...genOpts,
      toolId: input.toolId,
      jimengMode: input.jimengMode,
      maskImageUrl: input.jimengMaskUrl,
      upscaleResolution: input.jimengUpscaleResolution,
      upscaleScale: input.jimengUpscaleScale,
    });

    await db.createAiToolLog({
      toolId: input.toolId || 0,
      userId,
      action: "rendering_generate",
      inputSummary: fullPrompt.substring(0, 200),
      outputSummary: result.url || "",
      status: "success",
      durationMs: Date.now() - startTime,
    });

    // 即梦智能超清模式下特殊标题
    const titlePrefix = input.jimengMode === "upscale"
      ? `即梦超清 - ${input.prompt.substring(0, 40)}`
      : input.jimengMode === "inpaint"
        ? `即梦重绘 - ${input.prompt.substring(0, 40)}`
        : input.referenceImageUrl
          ? (input.maskImageData ? `局部重绘 - ${input.prompt.substring(0, 40)}` : `图生图 - ${input.prompt.substring(0, 40)}`)
          : `AI 渲染 - ${input.prompt.substring(0, 40)}`;

    const historyResult = await db.createGenerationHistory({
      userId,
      module: "ai_render",
      title: titlePrefix,
      summary: fullPrompt.substring(0, 200),
      inputParams: {
        prompt: input.prompt,
        style: input.style,
        referenceImageUrl: input.referenceImageUrl || null,
        materialImageUrl: input.materialImageUrl || null,
        materialImageUrls: input.materialImageUrls || null,
        hasMask: !!input.maskImageData,
        aspectRatio: input.aspectRatio || null,
        resolution: input.resolution || null,
      },
      outputUrl: result.url,
      status: "success",
      durationMs: Date.now() - startTime,
      parentId: input.parentHistoryId || null,
      projectId: null,
      createdByName: userName,
      modelName: resolvedModelName,
    }).catch(() => ({ id: 0 }));

    await db.updateRenderingJob(jobId, {
      status: "done",
      resultUrl: result.url,
      resultPrompt: fullPrompt,
      historyId: historyResult.id || null,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Rendering] Job ${jobId} failed:`, errMsg);
    await db.updateRenderingJob(jobId, { status: "failed", error: errMsg.substring(0, 500) });
    await db.createAiToolLog({
      toolId: input.toolId || 0,
      userId,
      action: "rendering_generate",
      inputSummary: input.prompt.substring(0, 200),
      status: "failed",
      durationMs: Date.now() - startTime,
    });
  }
}

const renderingRouter = router({
  generate: protectedProcedure
     .input(z.object({
      prompt: z.string().min(1),
      style: z.string().optional(),
      styleId: z.number().optional(),
      toolId: z.number().optional(),
      referenceImageUrl: z.string().url().optional(),
      parentHistoryId: z.number().optional(),
      materialImageUrl: z.string().url().optional(),
      materialImageUrls: z.array(z.string().url()).max(4).optional(), // 最多 4 张素材
      maskImageData: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
      // 即梦专属模式
      jimengMode: z.enum(["i2i", "inpaint", "upscale"]).optional(),
      // inpaint 专用：mask 图 URL（已上传到 S3 的白黑 mask）
      jimengMaskUrl: z.string().url().optional(),
      // upscale 专用参数
      jimengUpscaleResolution: z.enum(["4k", "8k"]).optional(),
      jimengUpscaleScale: z.number().min(0).max(100).optional(),
      // 生成数量 1-3
      count: z.number().min(1).max(3).default(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const { count = 1, ...baseInput } = input;
      const jobIds: string[] = [];
      for (let i = 0; i < count; i++) {
        const jobId = nanoid();
        await db.createRenderingJob({
          id: jobId,
          userId: ctx.user.id,
          inputParams: baseInput as Record<string, unknown>,
        });
        generateRenderingInBackground(jobId, baseInput, ctx.user.id, ctx.user.name || null).catch(err => {
          console.error("[Rendering] Unhandled error:", err);
        });
        jobIds.push(jobId);
      }
      return { jobId: jobIds[0], jobIds };
    }),

  /** Poll status of a rendering generation job */
  pollJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const job = await db.getRenderingJob(input.jobId);
      if (!job) return { status: "not_found" as const };
      if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (job.status === "done") {
        return { status: "done" as const, url: job.resultUrl || "", prompt: job.resultPrompt || "", historyId: job.historyId };
      }
      if (job.status === "failed") {
        return { status: "failed" as const, error: job.error || "生成失败" };
      }
      return { status: job.status as "pending" | "processing" };
    }),

  /** Poll multiple rendering jobs status */
  pollJobs: protectedProcedure
    .input(z.object({ jobIds: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      const results = await Promise.all(
        input.jobIds.map(async (jobId) => {
          const job = await db.getRenderingJob(jobId);
          if (!job || job.userId !== ctx.user.id) return { jobId, status: "not_found" as const };
          if (job.status === "done") return { jobId, status: "done" as const, url: job.resultUrl || "", prompt: job.resultPrompt || "", historyId: job.historyId };
          if (job.status === "failed") return { jobId, status: "failed" as const, error: job.error || "生成失败" };
          return { jobId, status: job.status as "pending" | "processing" };
        })
      );
      return results;
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

//// ─── AI Module: Color Floor Plan (彩平) ──────────────────
const colorPlanRouter = router({
  /** List all built-in color plan prompts, optionally filtered by style */
  listPrompts: protectedProcedure
    .input(z.object({ style: z.enum(["colored", "hand_drawn", "line_drawing"]).optional() }).optional())
    .query(async ({ input }) => {
      return db.listColorPlanPrompts(input?.style);
    }),

  /** Update a built-in color plan prompt */
  updatePrompt: protectedProcedure
    .input(z.object({
      style: z.enum(["colored", "hand_drawn", "line_drawing"]).default("colored"),
      type: z.enum(["base", "reference_prefix"]),
      prompt: z.string().min(1),
      label: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertColorPlanPrompt(input.type, {
        style: input.style,
        prompt: input.prompt,
        label: input.label,
        description: input.description,
        updatedBy: ctx.user.id,
      });
      return { success: true };
    }),

  /** Upload a floor plan image (base64) and return the S3 URL */
  uploadFloorPlan: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      fileData: z.string(),
      contentType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const key = `color-plan/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url, key };
    }),

  /** Generate a floor plan from a base floor plan + optional reference image (async job) */
  generate: protectedProcedure
    .input(z.object({
      floorPlanUrl: z.string().url(),
      referenceUrl: z.string().url().optional(),
      planStyle: z.enum(["colored", "hand_drawn", "line_drawing"]).default("colored"),
      style: z.string().optional(),
      extraPrompt: z.string().optional(),
      projectId: z.number().optional(),
      parentHistoryId: z.number().optional(),
      toolId: z.number().optional(),
      // 功能分区数组：每个分区包含名称、位置（相对比例 0-1）和颜色
      zones: z.array(z.object({
        name: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        color: z.string().optional(),
      })).optional(),
      // 底图原始尺寸，用于保留画面比例
      floorPlanWidth: z.number().positive().optional(),
      floorPlanHeight: z.number().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const jobId = nanoid();
      colorPlanJobStore.set(jobId, { status: "processing" });

      // Fire-and-forget background generation
      (async () => {
        const startTime = Date.now();
        let resolvedModelName = "内置图像生成";
        if (input.toolId) {
          try { const tool = await db.getAiToolById(input.toolId); if (tool?.name) resolvedModelName = tool.name; } catch { /* ignore */ }
        } else {
          try {
            const { getDb: _getDb } = await import("./db");
            const { aiTools: _aiTools } = await import("../drizzle/schema");
            const { eq: _eq, and: _and } = await import("drizzle-orm");
            const _db = await _getDb();
            if (_db) {
              const defaults = await _db.select().from(_aiTools).where(_and(_eq(_aiTools.isDefault, true), _eq(_aiTools.isActive, true))).limit(1);
              if (defaults[0]?.name) resolvedModelName = defaults[0].name;
            }
          } catch { /* ignore */ }
        }

        const planStyle = input.planStyle ?? "colored";
        const basePromptRow = await db.getColorPlanPrompt("base", planStyle);
        const refPrefixRow = await db.getColorPlanPrompt("reference_prefix", planStyle);

        const defaultPrompts: Record<string, { base: string; refPrefix: string }> = {
          colored: {
            base: `Architectural colored floor plan. Transform the provided black-and-white or line-drawing floor plan into a richly colored architectural floor plan. Apply realistic material textures and colors: warm wood flooring for living and dining areas, light tile or stone for bathrooms and kitchens, soft carpet or parquet for bedrooms, green indoor plants, furniture with drop shadows for depth. Maintain the exact spatial layout, room boundaries, walls, doors, and windows from the original floor plan. Clean top-down orthographic view. High quality architectural presentation style.`,
            refPrefix: `[STYLE REFERENCE: The second image shows the target color style and material palette. Apply the same color scheme and material textures to the floor plan.]`,
          },
          hand_drawn: {
            base: `Architectural hand-drawn floor plan. Transform the provided floor plan into a hand-drawn style architectural plan. Apply watercolor washes for room fills with soft, organic color bleeding at edges. Use pencil-sketch line work for walls, doors, and windows with slight imperfections for a human touch. Add light watercolor textures: warm beige/cream for living areas, soft blue-grey for bathrooms, light green for plants. Maintain exact spatial layout. Top-down orthographic view with artistic, sketch-like quality.`,
            refPrefix: `[STYLE REFERENCE: The second image shows the target hand-drawn style, color palette and sketch technique. Apply the same watercolor wash style, line weight, and color tones to the floor plan.]`,
          },
          line_drawing: {
            base: `Architectural floor plan line drawing. Transform the provided floor plan into a clean, precise architectural line drawing. Use crisp black lines on white background for all walls, doors, windows, and furniture outlines. Apply minimal grey fills or hatching to differentiate spaces. No color fills, no textures. Clean, technical drafting style with consistent line weights. Top-down orthographic view. Professional architectural presentation quality.`,
            refPrefix: `[STYLE REFERENCE: The second image shows the target line drawing style and line weight convention. Apply the same drafting technique, line weights, and symbol conventions to the floor plan.]`,
          },
        };

        const defaults = defaultPrompts[planStyle] || defaultPrompts.colored;
        let prompt = basePromptRow?.prompt || defaults.base;
        if (input.style) prompt += ` Style: ${input.style}.`;
        // Inject functional zone information into prompt
        if (input.zones && input.zones.length > 0) {
          const zoneDescriptions = input.zones.map((z, i) => {
            const xPct = Math.round(z.x * 100);
            const yPct = Math.round(z.y * 100);
            const wPct = Math.round(z.w * 100);
            const hPct = Math.round(z.h * 100);
            return `Zone ${i + 1}: "${z.name}" — located at approximately ${xPct}% from left, ${yPct}% from top, spanning ${wPct}% wide and ${hPct}% tall. Furnish and decorate this area as a ${z.name} with appropriate furniture, fixtures, and materials.`;
          }).join(" ");
          prompt += ` FUNCTIONAL ZONES (MUST follow exactly): The floor plan has been divided into ${input.zones.length} labeled functional zones. ${zoneDescriptions} Each zone must be clearly identifiable by its function through appropriate furniture placement, material selection, and spatial treatment. Label each zone with its function name in the rendered output.`;
        }
        if (input.extraPrompt) prompt += ` ${input.extraPrompt}`;

        const originalImages: Array<{ url?: string; mimeType?: string }> = [
          { url: input.floorPlanUrl, mimeType: "image/png" },
        ];
        if (input.referenceUrl) {
          originalImages.push({ url: input.referenceUrl, mimeType: "image/png" });
          const refPrefix = refPrefixRow?.prompt || defaults.refPrefix;
          prompt = `${refPrefix} ` + prompt;
        }

        // 计算输出尺寸：保留底图原始比例
        let colorPlanSize: string | undefined;
        if (input.floorPlanWidth && input.floorPlanHeight) {
          const BASE = 1024; // 基准边长
          const ratio = input.floorPlanWidth / input.floorPlanHeight;
          let outW: number, outH: number;
          if (ratio >= 1) {
            // 横图或正方
            outW = BASE;
            outH = Math.round(BASE / ratio);
          } else {
            // 竖图
            outH = BASE;
            outW = Math.round(BASE * ratio);
          }
          // 将宽高对齐到 64 的倍数（大多数图像生成 API 要求）
          outW = Math.max(64, Math.round(outW / 64) * 64);
          outH = Math.max(64, Math.round(outH / 64) * 64);
          colorPlanSize = `${outW}x${outH}`;
        }

        try {
          const result = await generateImageWithTool({ prompt, originalImages, toolId: input.toolId, size: colorPlanSize });

          const historyResult = await db.createGenerationHistory({
            userId: ctx.user.id,
            module: "color_plan",
            title: `AI 彩平 - ${new Date().toLocaleDateString("zh-CN")}`,
            summary: prompt,
            inputParams: {
              floorPlanUrl: input.floorPlanUrl,
              referenceUrl: input.referenceUrl || null,
              planStyle: input.planStyle || "colored",
              style: input.style || null,
              extraPrompt: input.extraPrompt || null,
            },
            outputUrl: result.url,
            status: "success",
            durationMs: Date.now() - startTime,
            parentId: input.parentHistoryId || null,
            projectId: input.projectId || null,
            createdByName: ctx.user.name || null,
            modelName: resolvedModelName,
          }).catch(() => ({ id: 0 }));

          await db.createAiToolLog({
            toolId: input.toolId || 0,
            userId: ctx.user.id,
            action: "color_plan_generate",
            inputSummary: prompt.substring(0, 200),
            outputSummary: result.url || "",
            status: "success",
            durationMs: Date.now() - startTime,
          }).catch(() => {});

          colorPlanJobStore.set(jobId, { status: "done", url: result.url, historyId: historyResult.id });
          // Auto-clean after 10 min
          setTimeout(() => colorPlanJobStore.delete(jobId), 10 * 60 * 1000);
        } catch (error: any) {
          await db.createGenerationHistory({
            userId: ctx.user.id,
            module: "color_plan",
            title: `AI 彩平 - 失败`,
            summary: prompt.substring(0, 200),
            inputParams: { floorPlanUrl: input.floorPlanUrl },
            status: "failed",
            durationMs: Date.now() - startTime,
            createdByName: ctx.user.name || null,
            modelName: resolvedModelName,
          }).catch(() => {});
          colorPlanJobStore.set(jobId, { status: "failed", error: error?.message || "彩平生成失败" });
          setTimeout(() => colorPlanJobStore.delete(jobId), 5 * 60 * 1000);
        }
      })().catch(err => {
        console.error("[colorPlan.generate] Unhandled error:", err);
        colorPlanJobStore.set(jobId, { status: "failed", error: err?.message || "未知错误" });
      });

      return { jobId };
    }),

  /** Poll the status of an async color plan generation job */
  jobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = colorPlanJobStore.get(input.jobId);
      if (!job) return { status: "not_found" as const };
      if (job.status === "done") return { status: "done" as const, url: job.url, historyId: job.historyId };
      if (job.status === "failed") return { status: "failed" as const, error: job.error };
      return { status: "processing" as const };
    }),

  // 局部修改（Inpainting）- async job to avoid 60s gateway timeout
  inpaint: protectedProcedure
    .input(z.object({
      imageUrl: z.string(),           // 原始彩平图 URL
      maskImageData: z.string(),      // base64 mask PNG
      prompt: z.string(),             // 修改说明
      floorPlanUrl: z.string().optional(), // 底图 URL（线稿/黑白平面图），作为 AI 参考条件
      toolId: z.number().optional(),
      parentHistoryId: z.number().optional(),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const jobId = nanoid();
      colorPlanJobStore.set(jobId, { status: "processing" });

      (async () => {
        const startTime = Date.now();
        let resolvedModelName = "内置图像生成";
        if (input.toolId) {
          try { const tool = await db.getAiToolById(input.toolId); if (tool?.name) resolvedModelName = tool.name; } catch { /* ignore */ }
        }

        let originalImages: Array<{ url?: string; b64Json?: string; mimeType?: string }> = [];

        // Determine tool provider to decide how to pass the floor plan
        let toolProvider = "";
        if (input.toolId) {
          try { const tool = await db.getAiToolById(input.toolId); toolProvider = tool?.provider?.toLowerCase() || ""; } catch { /* ignore */ }
        }
        const isJimengTool = toolProvider === "jimeng" || toolProvider === "volcengine";

        // Build prompt — for Gemini multi-image, describe image order; for jimeng, mention floor plan in text
        let fullPrompt: string;
        if (input.floorPlanUrl && !isJimengTool) {
          // Gemini path: floor plan will be image[0], highlighted result will be image[1]
          fullPrompt = `[INPAINTING INSTRUCTION: You are given two reference images. Image 1 is the original floor plan (line drawing / base plan) — use it as the structural reference. Image 2 is the current colored floor plan with red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas in Image 2. Keep all other areas exactly unchanged. Use Image 1 as a guide for the spatial structure when filling the modified areas.] ${input.prompt}`;
        } else if (input.floorPlanUrl && isJimengTool) {
          // Jimeng path: can only accept one image, mention floor plan in prompt
          fullPrompt = `[INPAINTING INSTRUCTION: The image has red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas. Keep all other areas exactly unchanged. Reference the original floor plan structure when filling the modified areas.] ${input.prompt}`;
        } else {
          fullPrompt = `[INPAINTING INSTRUCTION: The image has red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas. Keep all other areas exactly unchanged.] ${input.prompt}`;
        }

        try {
          const composite = await compositeMaskOnImage(input.imageUrl, input.maskImageData);
          if (input.floorPlanUrl && !isJimengTool) {
            // Gemini: pass floor plan first, then the highlighted result image
            originalImages = [
              { url: input.floorPlanUrl, mimeType: "image/png" },
              { b64Json: composite.b64, mimeType: composite.mimeType },
            ];
          } else {
            originalImages = [{ b64Json: composite.b64, mimeType: composite.mimeType }];
          }
        } catch {
          if (input.floorPlanUrl && !isJimengTool) {
            originalImages = [
              { url: input.floorPlanUrl, mimeType: "image/png" },
              { url: input.imageUrl, mimeType: "image/png" },
            ];
          } else {
            originalImages = [{ url: input.imageUrl, mimeType: "image/png" }];
          }
        }

        try {
          const result = await generateImageWithTool({ prompt: fullPrompt, originalImages, toolId: input.toolId });

          const historyResult = await db.createGenerationHistory({
            userId: ctx.user.id,
            module: "color_plan",
            title: `彩平局部修改 - ${input.prompt.substring(0, 30)}`,
            summary: fullPrompt,
            inputParams: {
              imageUrl: input.imageUrl,
              prompt: input.prompt,
              hasMask: true,
              isInpaint: true,
              floorPlanUrl: input.floorPlanUrl || null,
            },
            outputUrl: result.url,
            status: "success",
            durationMs: Date.now() - startTime,
            parentId: input.parentHistoryId || null,
            projectId: input.projectId || null,
            createdByName: ctx.user.name || null,
            modelName: resolvedModelName,
          }).catch(() => ({ id: 0 }));

          await db.createAiToolLog({
            toolId: input.toolId || 0,
            userId: ctx.user.id,
            action: "color_plan_inpaint",
            inputSummary: input.prompt.substring(0, 200),
            outputSummary: result.url || "",
            status: "success",
            durationMs: Date.now() - startTime,
          }).catch(() => {});

          colorPlanJobStore.set(jobId, { status: "done", url: result.url, historyId: historyResult.id });
          setTimeout(() => colorPlanJobStore.delete(jobId), 10 * 60 * 1000);
        } catch (error: any) {
          await db.createGenerationHistory({
            userId: ctx.user.id,
            module: "color_plan",
            title: `彩平局部修改 - 失败`,
            summary: input.prompt.substring(0, 200),
            inputParams: { imageUrl: input.imageUrl, hasMask: true, isInpaint: true },
            status: "failed",
            durationMs: Date.now() - startTime,
            parentId: input.parentHistoryId || null,
            createdByName: ctx.user.name || null,
            modelName: resolvedModelName,
          }).catch(() => {});
          colorPlanJobStore.set(jobId, { status: "failed", error: error?.message || "局部修改失败" });
          setTimeout(() => colorPlanJobStore.delete(jobId), 5 * 60 * 1000);
        }
      })().catch(err => {
        console.error("[colorPlan.inpaint] Unhandled error:", err);
        colorPlanJobStore.set(jobId, { status: "failed", error: err?.message || "未知错误" });
      });

      return { jobId };
    }),
});

// ─── AI Module: Meeting Minutes ──────────────────────

const meetingRouter = router({
  transcribe: protectedProcedure
    .input(z.object({
      audioUrl: z.string(),
      language: z.string().optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // Use Volcengine BigASR for file transcription (no ffmpeg required)
      // If toolId is provided, use the tool's configJson credentials; otherwise fall back to env vars
      try {
        let creds: { appId: string; accessToken: string } | undefined;
        if (input.toolId) {
          try {
            const tool = await db.getAiToolById(input.toolId);
            if (tool?.configJson && typeof tool.configJson === "object") {
              const cfg = tool.configJson as Record<string, unknown>;
              if (cfg.appId && cfg.accessToken) {
                creds = { appId: String(cfg.appId), accessToken: String(cfg.accessToken) };
                console.log("[meeting.transcribe] using tool credentials from toolId:", input.toolId);
              }
            }
          } catch { /* ignore, fall back to env */ }
        }
        console.log("[meeting.transcribe] using volcengine bigasr for:", input.audioUrl);
        const text = await transcribeFileWithVolcengine(input.audioUrl, { creds });
        if (!text || text.trim().length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "音频转写完成但未识别到有效内容，请检查音频质量" });
        }
        return { text };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        console.error("[meeting.transcribe] volcengine error:", e);
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `音频识别失败: ${msg}` });
      }
    }),

  generateMinutes: protectedProcedure
    .input(z.object({
      transcript: z.string(),
      projectName: z.string().optional(),
      meetingDate: z.string().optional(),
      meetingTitle: z.string().optional(),
      meetingLocation: z.string().optional(),
      meetingAttendees: z.string().optional(),
      toolId: z.number().optional(),
      projectId: z.number().optional(),
      // Audio archive fields
      audioUrl: z.string().optional(),
      audioKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();
      try {
        const response = await invokeLLMWithUserTool({
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
              content: [
                `会议名称：${input.meetingTitle || "未命名"}`,
                `项目：${input.projectName || "未指定"}`,
                `日期：${input.meetingDate || new Date().toLocaleDateString("zh-CN")}`,
                input.meetingLocation ? `地点：${input.meetingLocation}` : null,
                input.meetingAttendees ? `参会人员：${input.meetingAttendees}` : null,
                ``,
                `录音转写文本：`,
                input.transcript,
              ].filter(Boolean).join("\n")
            }
          ],
        }, ctx.user.id, input.toolId);

        const content = typeof response.choices[0]?.message?.content === 'string'
          ? response.choices[0].message.content
          : '';

        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "meeting_minutes",
          inputSummary: `${input.meetingTitle || input.projectName || "会议"} - ${input.meetingDate || "今日"}`,
          outputSummary: content.substring(0, 200),
          status: "success",
          durationMs: Date.now() - startTime,
        });

        // Record in generation history
        const historyResult = await db.createGenerationHistory({
          userId: ctx.user.id,
          module: "meeting_minutes",
          title: `${input.meetingTitle || input.projectName || "会议"} - 会议纪要`,
          summary: `${input.meetingDate || "今日"} | ${input.meetingLocation ? input.meetingLocation + " | " : ""}${content.substring(0, 100)}`,
          inputParams: { projectName: input.projectName, meetingDate: input.meetingDate, meetingTitle: input.meetingTitle, meetingLocation: input.meetingLocation, meetingAttendees: input.meetingAttendees },
          status: "success",
          durationMs: Date.now() - startTime,
          projectId: null,
          createdByName: ctx.user.name || null,
          modelName: response.model || null,
        }).catch(() => ({ id: 0 }));

        // Archive to project documents library if projectId is provided
        let documentId: number | undefined;
        if (input.projectId) {
          const docTitle = `${input.meetingTitle || "会议纪要"} · ${input.meetingDate || new Date().toLocaleDateString("zh-CN")}`;
          const docResult = await db.createDocument({
            projectId: input.projectId,
            title: docTitle,
            content,
            type: "minutes",
            category: "management",
            audioUrl: input.audioUrl || null,
            audioKey: input.audioKey || null,
            createdBy: ctx.user.id,
          }).catch(() => ({ id: 0 }));
          documentId = docResult.id || undefined;
        }

        return { content, generatedAt: new Date().toISOString(), historyId: historyResult.id, documentId };
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
  // Auto-save transcript as a draft document during recording
  saveDraft: protectedProcedure
    .input(z.object({
      transcript: z.string(),
      meetingTitle: z.string().optional(),
      meetingDate: z.string().optional(),
      projectId: z.number().optional(),
      draftId: z.number().optional(), // if set, update existing draft
    }))
    .mutation(async ({ input, ctx }) => {
      const title = `[草稿] ${input.meetingTitle || "会议纪要"} · ${input.meetingDate || new Date().toLocaleDateString("zh-CN")}`;
      if (input.draftId) {
        // Update existing draft
        await db.updateDocument(input.draftId, { content: input.transcript, title });
        return { draftId: input.draftId };
      } else {
        // Create new draft document
        const doc = await db.createDocument({
          projectId: input.projectId ?? null,
          title,
          content: input.transcript,
          type: "minutes",
          category: "management",
          createdBy: ctx.user.id,
        });
        return { draftId: doc.id };
      }
    }),
});
// ─── Admin ────────────────────────────────────────────────

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

  listPendingUsers: adminProcedure.query(async () => {
    return db.listPendingUsers();
  }),

  approveUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await db.approveUser(input.userId);
      return { success: true };
    }),

  revokeUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await db.revokeUser(input.userId);
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
  // ─── Team Task Stats ───────────────────────────────────
  getMemberTaskStats: adminProcedure.query(async () => {
    return db.getMemberTaskStats();
  }),
  getMemberAiStats: adminProcedure.query(async () => {
    return db.getMemberAiStats();
  }),

  analyzePerformance: adminProcedure
    .input(z.object({
      statsJson: z.string(),
      aiToolId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { statsJson, aiToolId } = input;
      const stats = JSON.parse(statsJson);

      const memberLines = (stats as any[]).map((m) => {
        const completionRate = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
        const overdueRate = m.done > 0 ? Math.round((m.overdueCompleted / m.done) * 100) : 0;
        return `- ${m.name}：总任务 ${m.total} 个，已完成 ${m.done} 个（完成率 ${completionRate}%），提前完成 ${m.earlyCompleted} 个，延期完成 ${m.overdueCompleted} 个（延期率 ${overdueRate}%），进行中 ${m.inProgress} 个，逾期未完成 ${m.overdueIncomplete} 个`;
      }).join('\n');

      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        {
          role: 'system',
          content: '你是一位专业的团队管理顾问，擅长根据任务数据分析团队成员的工作表现。请用中文撰写分析报告，风格专业、客观、建设性，避免过度批评。报告应包含：1) 整体团队表现概述；2) 各成员表现亮点与改进建议；3) 团队协作建议。',
        },
        {
          role: 'user',
          content: `请根据以下团队成员任务完成数据，生成一份员工表现分析报告：\n\n${memberLines}\n\n请重点分析任务完成率、提前/延期完成情况，并给出具体的改进建议。`,
        },
      ];

       const llmResult = await invokeLLMWithUserTool({ messages }, undefined, aiToolId);
      return { report: llmResult.choices[0]?.message?.content || '' };
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
// ─── Media Content Generation ───────────────────────────────────

const mediaRouter = router({
  generate: protectedProcedure
    .input(z.object({
      platform: z.enum(["xiaohongshu", "wechat", "instagram"]),
      topic: z.string().min(1),
      projectName: z.string().optional(),
      style: z.string().optional(),
      referenceImageUrl: z.string().url().optional(),
      additionalNotes: z.string().optional(),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();

      const platformConfig: Record<string, { name: string; systemPrompt: string; imagePrompt: string }> = {
        xiaohongshu: {
          name: "小红书",
          systemPrompt: `你是一位专业的建筑设计小红书内容创作者，为 N+1 STUDIOS 建筑设计事务所撰写内容。
请根据主题生成小红书风格的图文内容，返回严格的 JSON 格式：
{
  "title": "吸引眼球的标题，含表情符号，15字以内",
  "content": "正文内容，300-500字，分段落，每段开头用表情符号，口语化但专业",
  "tags": ["标签1", "标签2", ...],
  "coverImagePrompt": "用于生成封面图的英文描述，建筑摄影风格"
}
注意：小红书风格要求标题吸引人、内容有干货、标签精准。内容要体现专业性和设计美学。`,
          imagePrompt: "architectural photography, modern design, professional",
        },
        wechat: {
          name: "公众号",
          systemPrompt: `你是一位专业的建筑设计微信公众号编辑，为 N+1 STUDIOS 建筑设计事务所撰写文章。
请根据主题生成公众号风格的文章内容，返回严格的 JSON 格式：
{
  "title": "文章标题，正式且有吸引力，20字以内",
  "summary": "摘要，50-80字，用于分享卡片显示",
  "content": "正文内容，800-1200字，分段落并带小标题，专业且有深度",
  "coverImagePrompt": "用于生成封面图的英文描述，建筑摄影风格"
}
注意：公众号文章要求专业深度、逻辑清晰、有观点输出。体现事务所的专业水准和设计思考。`,
          imagePrompt: "architectural design, editorial photography, minimalist",
        },
        instagram: {
          name: "Instagram",
          systemPrompt: `You are a professional architectural design Instagram content creator for N+1 STUDIOS, an architecture firm.
Generate Instagram-style content based on the topic. Return strict JSON format:
{
  "caption": "English caption, 100-200 words, engaging and professional, with line breaks",
  "hashtags": ["#hashtag1", "#hashtag2", ...],
  "coverImagePrompt": "English description for generating cover image, architectural photography style"
}
Note: Instagram content should be visually driven, use professional English, include relevant architecture/design hashtags. The tone should be sophisticated yet approachable.`,
          imagePrompt: "architectural photography, Instagram aesthetic, high contrast",
        },
      };

      const config = platformConfig[input.platform];
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid platform" });

      try {
        // Step 1: Generate text content via LLM
        const userMessage = [
          `主题：${input.topic}`,
          input.projectName ? `项目名称：${input.projectName}` : "",
          input.style ? `风格偏好：${input.style}` : "",
          input.additionalNotes ? `补充说明：${input.additionalNotes}` : "",
        ].filter(Boolean).join("\n");

        const llmResponse = await invokeLLMWithUserTool({
          messages: [
            { role: "system", content: config.systemPrompt },
            { role: "user", content: userMessage },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "media_content",
              strict: true,
              schema: input.platform === "instagram" ? {
                type: "object",
                properties: {
                  caption: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                  coverImagePrompt: { type: "string" },
                },
                required: ["caption", "hashtags", "coverImagePrompt"],
                additionalProperties: false,
              } : input.platform === "xiaohongshu" ? {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  coverImagePrompt: { type: "string" },
                },
                required: ["title", "content", "tags", "coverImagePrompt"],
                additionalProperties: false,
              } : {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  content: { type: "string" },
                  coverImagePrompt: { type: "string" },
                },
                required: ["title", "summary", "content", "coverImagePrompt"],
                additionalProperties: false,
              },
            },
          },
        }, ctx.user.id);

        const rawContent = llmResponse.choices[0].message.content;
        const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        const textContent = JSON.parse(contentStr || "{}");

        // Step 2: Generate cover image
        let coverImageUrl: string | null = null;
        try {
          const imagePrompt = textContent.coverImagePrompt || `${config.imagePrompt}, ${input.topic}`;
          const genOpts: Parameters<typeof generateImage>[0] = { prompt: imagePrompt };
          if (input.referenceImageUrl) {
            genOpts.originalImages = [{ url: input.referenceImageUrl, mimeType: "image/png" }];
          }
          const imageResult = await generateImage(genOpts);
          coverImageUrl = imageResult.url || null;
        } catch (imgErr) {
          console.error("[Media] Cover image generation failed:", imgErr);
          // Continue without image
        }

        // Step 3: Record in history
        const historyResult = await db.createGenerationHistory({
          userId: ctx.user.id,
          module: `media_${input.platform}`,
          title: `${config.name} - ${input.topic.substring(0, 40)}`,
          summary: input.topic.substring(0, 200),
          inputParams: { platform: input.platform, topic: input.topic, style: input.style },
          outputUrl: coverImageUrl,
          outputContent: typeof textContent === 'string' ? textContent : JSON.stringify(textContent),
          status: "success",
          durationMs: Date.now() - startTime,
          projectId: null,
          createdByName: ctx.user.name || null,
          modelName: llmResponse.model || null,
        }).catch(() => ({ id: 0 }));

        return {
          platform: input.platform,
          textContent,
          coverImageUrl,
          durationMs: Date.now() - startTime,
          historyId: historyResult.id,
        };
      } catch (error: any) {
        await db.createGenerationHistory({
          userId: ctx.user.id,
          module: `media_${input.platform}`,
          title: `${config.name} - ${input.topic.substring(0, 40)}`,
          summary: error?.message || "Generation failed",
          inputParams: { platform: input.platform, topic: input.topic },
          status: "failed",
          durationMs: Date.now() - startTime,
          projectId: null,
        }).catch(() => {});

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `${config.name}内容生成失败，请稍后重试`,
        });
      }
    }),
});

// ─── History ────────────────────────────────────────────────────

const historyRouter = router({
  list: protectedProcedure
    .input(z.object({
      module: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return db.listGenerationHistory(ctx.user.id, {
        module: input?.module,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      // All records (including ai_video) are now in generation_history
      return db.getGenerationHistoryById(input.id, ctx.user.id);
    }),
  /** Get edit chain: all items sharing the same root ancestor */
  getEditChain: protectedProcedure
    .input(z.object({ rootId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getEditChain(input.rootId, ctx.user.id);
    }),
  /** List root items (items with no parent, or latest in each chain) grouped for thumbnail grid */
  listGrouped: protectedProcedure
    .input(z.object({
      module: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return db.listGroupedHistory(ctx.user.id, {
        module: input?.module,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
    }),

  /** Delete a generation history item (own records for members, any record for admin) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === "admin";
      // Lightweight check: only fetch module + inputParams (avoids full row SELECT)
      const item = await db.getGenerationHistoryModuleById(input.id, ctx.user.id);
      if (item?.module === "ai_video") {
        const params = typeof item.inputParams === "string" ? JSON.parse(item.inputParams) : item.inputParams;
        const videoHistoryId = (params as any)?.videoHistoryId;
        if (videoHistoryId) await db.deleteVideoHistory(videoHistoryId);
      }
      await db.deleteGenerationHistory(input.id, ctx.user.id, isAdmin);
      return { success: true };
    }),

  /** Batch delete generation history items (own records for members, any record for admin) */
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === "admin";
      // Fetch module info for all ids in parallel (lightweight: only module + inputParams)
      const itemInfos = await Promise.all(
        input.ids.map((id) => db.getGenerationHistoryModuleById(id, ctx.user.id))
      );
      // Cascade-delete video_history records in parallel
      const videoCascades = itemInfos
        .map((item, i) => ({ item, id: input.ids[i] }))
        .filter(({ item }) => item?.module === "ai_video")
        .map(({ item }) => {
          const params = typeof item!.inputParams === "string" ? JSON.parse(item!.inputParams) : item!.inputParams;
          return (params as any)?.videoHistoryId as number | undefined;
        })
        .filter(Boolean) as number[];
      await Promise.all(videoCascades.map((vid) => db.deleteVideoHistory(vid)));
      // Delete all generation_history records in parallel
      await Promise.all(input.ids.map((id) => db.deleteGenerationHistory(id, ctx.user.id, isAdmin)));
      return { success: true, deleted: input.ids.length };
    }),
  /** Admin delete a generation history item by project (for project document management) */
  adminDelete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteGenerationHistory(input.id, ctx.user.id, true);
      return { success: true };
    }),

  /** Associate or disassociate a generation history item with a project */
  updateProject: protectedProcedure
    .input(z.object({
      historyId: z.number(),
      projectId: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getGenerationHistoryById(input.historyId, ctx.user.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      if (input.projectId !== null) {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      }
      await db.updateGenerationHistoryProject(input.historyId, input.projectId);
      return { success: true };
    }),
});

// ─── Feedback (满意度反馈) ───────────────────────────────────

const feedbackRouter = router({
  /** Submit or update feedback for a generation result */
  submit: protectedProcedure
    .input(z.object({
      module: z.string().min(1),
      historyId: z.number().optional(),
      rating: z.enum(["satisfied", "unsatisfied"]),
      comment: z.string().optional(),
      contextJson: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if feedback already exists for this history item
      if (input.historyId) {
        const existing = await db.getFeedbackByHistoryId(input.historyId, ctx.user.id);
        if (existing) {
          // Update existing feedback
          await db.updateFeedback(existing.id, {
            rating: input.rating,
            comment: input.comment || undefined,
          });
          return { id: existing.id, updated: true };
        }
      }
      const result = await db.createFeedback({
        userId: ctx.user.id,
        module: input.module,
        historyId: input.historyId,
        rating: input.rating,
        comment: input.comment,
        contextJson: input.contextJson,
      });
      return { id: result.id, updated: false };
    }),

  /** Get feedback for a specific history item */
  getByHistoryId: protectedProcedure
    .input(z.object({ historyId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getFeedbackByHistoryId(input.historyId, ctx.user.id);
    }),

  /** Get feedback statistics (admin only) */
  stats: adminProcedure
    .input(z.object({ module: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.getFeedbackStats(input?.module);
    }),

  /** Get feedback trend over time (admin only) */
  trend: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(365).optional(),
      module: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return db.getFeedbackTrend(input?.days || 30, input?.module);
    }),

  /** Get recent feedback entries (admin only) */
  recent: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      module: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return db.getRecentFeedback(input?.limit || 20, input?.module);
    }),
});

// ─── Image Enhancement (Magnific/Freepik) ──────────────────────────────────
const enhanceRouter = router({
  /** Submit an image enhancement task via Freepik/Magnific API */
  submit: protectedProcedure
    .input(z.object({
      historyId: z.number(),
      scale: z.enum(["x2", "x4", "x8", "x16"]).default("x2"),
      optimizedFor: z.enum([
        "standard", "art_n_illustration", "videogame_assets", "soft_portraits",
        "hard_portraits", "nature_n_landscapes", "films_n_photography",
        "3d_renders", "science_fiction_n_horror",
      ]).default("3d_renders"),
      prompt: z.string().optional(),
      creativity: z.number().min(-10).max(10).optional(),
      hdr: z.number().min(-10).max(10).optional(),
      resemblance: z.number().min(-10).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getGenerationHistoryById(input.historyId, ctx.user.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "生成记录不存在" });
      if (!item.outputUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "该记录没有可增强的图片" });

      const { taskId } = await submitEnhanceTask({
        imageUrl: item.outputUrl,
        scale: input.scale,
        optimizedFor: input.optimizedFor,
        prompt: input.prompt,
        creativity: input.creativity,
        hdr: input.hdr,
        resemblance: input.resemblance,
      });

      await db.updateEnhanceStatus(input.historyId, {
        enhanceTaskId: taskId,
        enhanceStatus: "processing",
        enhanceParams: {
          scale: input.scale,
          optimizedFor: input.optimizedFor,
          prompt: input.prompt,
          creativity: input.creativity,
          hdr: input.hdr,
          resemblance: input.resemblance,
        },
      });

      return { taskId, status: "processing" as const };
    }),

  /** Poll the status of an enhancement task */
  status: protectedProcedure
    .input(z.object({ historyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await db.getGenerationHistoryById(input.historyId, ctx.user.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "生成记录不存在" });

      if (!item.enhanceTaskId || item.enhanceStatus === "idle" || item.enhanceStatus === null) {
        return { status: (item.enhanceStatus ?? "idle") as string, enhancedImageUrl: item.enhancedImageUrl ?? null };
      }

      if (item.enhanceStatus === "done" || item.enhanceStatus === "failed") {
        return { status: item.enhanceStatus as string, enhancedImageUrl: item.enhancedImageUrl ?? null };
      }

      // Poll Freepik API
      const result = await getEnhanceTaskStatus(item.enhanceTaskId);
      if (result.status === "done" && result.outputUrl) {
        // Download from Freepik CDN (has expiring token) and re-upload to our S3 for permanent URL
        let permanentUrl = result.outputUrl;
        try {
          permanentUrl = await downloadAndStoreEnhancedImage(result.outputUrl, input.historyId);
        } catch (storageErr) {
          console.error("[enhance] Failed to store enhanced image to S3, using Freepik URL as fallback:", storageErr);
        }
        await db.updateEnhanceStatus(input.historyId, {
          enhanceStatus: "done",
          enhancedImageUrl: permanentUrl,
        });
        return { status: "done" as string, enhancedImageUrl: permanentUrl };
      } else if (result.status === "failed") {
        await db.updateEnhanceStatus(input.historyId, { enhanceStatus: "failed" });
        return { status: "failed" as string, enhancedImageUrl: null };
      }

      return { status: "processing" as string, enhancedImageUrl: null };
    }),

  /** Submit enhancement for an arbitrary image URL (no historyId needed) */
  submitUrl: protectedProcedure
    .input(z.object({
      imageUrl: z.string().url(),
      scale: z.enum(["x2", "x4", "x8", "x16"]).default("x2"),
      optimizedFor: z.enum([
        "standard", "art_n_illustration", "videogame_assets", "soft_portraits",
        "hard_portraits", "nature_n_landscapes", "films_n_photography",
        "3d_renders", "science_fiction_n_horror",
      ]).default("3d_renders"),
      prompt: z.string().optional(),
      creativity: z.number().min(-10).max(10).optional(),
      hdr: z.number().min(-10).max(10).optional(),
      resemblance: z.number().min(-10).max(10).optional(),
    }))
    .mutation(async ({ input }) => {
      const { taskId } = await submitEnhanceTask({
        imageUrl: input.imageUrl,
        scale: input.scale,
        optimizedFor: input.optimizedFor,
        prompt: input.prompt,
        creativity: input.creativity,
        hdr: input.hdr,
        resemblance: input.resemblance,
      });
      return { taskId, status: "processing" as const };
    }),
  /** Poll enhancement status by taskId (no historyId needed) */
  pollTaskId: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const result = await getEnhanceTaskStatus(input.taskId);
      if (result.status === "done" && result.outputUrl) {
        // Store to S3 for permanent URL
        let permanentUrl = result.outputUrl;
        try {
          permanentUrl = await downloadAndStoreEnhancedImage(result.outputUrl, Date.now());
        } catch (err) {
          console.error("[enhance.pollTaskId] S3 store failed, using Freepik URL:", err);
        }
        return { status: "done" as const, enhancedImageUrl: permanentUrl };
      } else if (result.status === "failed") {
        return { status: "failed" as const, enhancedImageUrl: null };
      }
      return { status: "processing" as const, enhancedImageUrl: null };
    }),
  /** Reset enhancement so user can re-enhance */
  reset: protectedProcedure
    .input(z.object({ historyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getGenerationHistoryById(input.historyId, ctx.user.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "生成记录不存在" });
      await db.updateEnhanceStatus(input.historyId, {
        enhanceStatus: "idle",
        enhanceTaskId: null,
        enhancedImageUrl: null,
      });
      return { success: true };
    }),
});

// ─── AI Module: Presentation ───────────────────────────────────────────────

// In-memory job store for presentation generation (shared with benchmark PPT)
const presentationJobStore = pptJobStore; // reuse same store, prefixed jobIds

async function generatePresentationInBackground(
  jobId: string,
  input: { title: string; content: string; imageUrls?: string[]; toolId?: number; layoutPackStyleGuide?: any },
  userId?: number
) {
  try {
    presentationJobStore.set(jobId, { status: "processing", progress: 10, stage: "structuring" });

    // Build image context string for LLM
    const imageContext = input.imageUrls && input.imageUrls.length > 0
      ? `\n\n用户提供了 ${input.imageUrls.length} 张项目图片，请在合适的幻灯片中引用它们（用 userImage:0, userImage:1 等占位符标注在 pexelsQuery 字段中，以便后续处理）。`
      : "";

    // Resolve tool name for model logging
    let resolvedModelName = "内置 AI";
    if (input.toolId) {
      try {
        const tool = await db.getAiToolById(input.toolId);
        if (tool?.name) resolvedModelName = tool.name;
      } catch { /* ignore */ }
    }

    // Build layout pack style hint for LLM
    const layoutPackHint = input.layoutPackStyleGuide
      ? (() => {
          const sg = input.layoutPackStyleGuide;
          const cp = sg.colorPalette || {};
          const typo = sg.typography || {};
          const isDark = sg.tone === "dark";
          const layoutPreference = isDark
            ? "偏好深色背景版式（section_intro、cover），减少浅色版式的比例"
            : "偏好浅色背景版式（insight、case_study、toc），减少深色版式的比例";
          return `\n\n【参考版式包风格指南 - 请严格遵守】
该演示文稿的视觉风格已由版式包定义，请在内容结构和版式选择上严格参考：
- 设计风格关键词：${(sg.styleKeywords || []).join("、")}
- 整体调性：${isDark ? "深色系（深色背景为主）" : sg.tone === "light" ? "浅色系（浅色背景为主）" : "深浅混合"}
- 正式程度：${sg.formality === "formal" ? "正式专业" : sg.formality === "creative" ? "创意活泼" : "中性平衡"}
- 字体风格：${typo.style || ""}
- 主色调：${cp.primary || ""} / 背景色：${cp.background || ""} / 强调色：${cp.accent || ""}
- 版式偏好：${layoutPreference}
- 已识别版式类型：${(sg.layouts || []).map((l: any) => l.name || l.type || "").filter(Boolean).join("、") || "通用版式"}
请在版式选择比例和内容调性上严格匹配该风格，确保生成的 PPT 与参考版式包视觉一致。`;
        })()
      : "";

    const structureResponse = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: `你是 N+1 STUDIOS 的建筑设计演示文稿制作专家。请根据用户提供的演示内容，生成约 10-15 页的 PPT 结构。
页面结构要求：
- 第 1 页：封面（layout: cover），包含演示标题和副标题
- 第 2 页：目录（layout: toc），列出主要章节
- 中间页：根据内容类型选择合适版式（见下方说明），每页聚焦一个主题
- 最后 1 页：总结（layout: summary）

版式选择指引（中间页）：
- section_intro：章节导入页，适合介绍新主题或章节开头，深色背景，大标题
- case_study：案例研究页，适合展示具体项目或案例，左文右图布局
- insight：洞察/分析页，适合展示研究发现或设计理念，图片配文字
- quote：引言页，适合展示核心观点或重要引用，大字排版，强视觉冲击
- comparison：对比页，适合左右对比两个方案/概念/数据
- timeline：时间轴页，适合展示项目进程、设计演变或历史脉络
- data_highlight：数据展示页，适合突出关键数字或指标，大号数字配说明

每页字段说明：
- title: 页面标题
- subtitle: 副标题或简短说明（可为空字符串）
- bullets: 要点列表（每页 3-5 条，简洁精炼；timeline 版式每条代表一个时间节点，格式为「年份/阶段 — 内容」；comparison 版式前半条为左侧内容，后半条为右侧内容；data_highlight 版式每条格式为「数字 — 说明」）
- sourceName: 内容来源（可为空字符串）
- pexelsQuery: 英文图片搜索关键词（描述建筑/空间视觉特征，如 "modern office interior minimalist design"）；如用户提供了图片，对应页面用 userImage:N 格式；quote/comparison/timeline/data_highlight 版式可留空字符串
- layout: cover / toc / section_intro / case_study / insight / quote / comparison / timeline / data_highlight / summary

重要：
- 版式要多样化，避免连续使用同一种版式
- pexelsQuery 必须是英文，且要具体描述建筑/空间的视觉特征
- 每页要点精炼，不超过 5 条
- 内容忠实于用户提供的资料，不要编造${imageContext}${layoutPackHint}`},
        { role: "user", content: `演示标题：${input.title}\n\n演示内容：\n${input.content}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "presentation_structure",
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
                    sourceName: { type: "string" },
                    pexelsQuery: { type: "string" },
                    layout: { type: "string", enum: ["cover", "toc", "section_intro", "case_study", "insight", "quote", "comparison", "timeline", "data_highlight", "summary"] }
                  },
                  required: ["title", "subtitle", "bullets", "sourceName", "pexelsQuery", "layout"],
                  additionalProperties: false
                }
              }
            },
            required: ["slides"],
            additionalProperties: false
          }
        }
      }
    }, userId, input.toolId);

    const structureContent = typeof structureResponse.choices[0]?.message?.content === 'string'
      ? structureResponse.choices[0].message.content
      : '{"slides":[]}';
    const slideData = JSON.parse(structureContent) as {
      slides: Array<{
        title: string; subtitle: string; bullets: string[];
        sourceName: string; pexelsQuery: string; layout: string;
      }>
    };

    // Stage 2: Fetch images
    presentationJobStore.set(jobId, { status: "processing", progress: 25, stage: "generating_images" });
     const imageBase64Map: Map<number, { data: string; ext: string }> = new Map();
    const imageUrlMap: Map<number, string> = new Map(); // slide index -> image URL for preview
    // First, load user-provided images
    if (input.imageUrls && input.imageUrls.length > 0) {
      for (let i = 0; i < input.imageUrls.length; i++) {
        try {
          const b64 = await downloadImageAsBase64(input.imageUrls[i]);
          if (b64) {
            const mimeMatch = b64.match(/^data:(image\/\w+);/);
            const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'jpeg';
            const rawB64 = b64.replace(/^data:image\/\w+;base64,/, '');
            // Store user images at negative indices to distinguish from Pexels
            imageBase64Map.set(-(i + 1), { data: rawB64, ext });
          }
        } catch (err) {
          console.error(`[Presentation] Failed to load user image ${i}:`, err);
        }
      }
    }

    // Then fetch Pexels images for slides that need them
    const slidesNeedingImages = slideData.slides
      .map((s, i) => ({ index: i, query: s.pexelsQuery, layout: s.layout }))
      .filter(s => s.query && s.query.trim().length > 0 && !s.query.startsWith('userImage:'));

    for (let ci = 0; ci < slidesNeedingImages.length; ci++) {
      const cs = slidesNeedingImages[ci];
      try {
        const pexelsResults = await searchPexelsImages(cs.query, 3);
        for (const pr of pexelsResults) {
          if (pr.url) {
            const b64 = await downloadImageAsBase64(pr.url);
            if (b64) {
              const mimeMatch = b64.match(/^data:(image\/\w+);/);
              const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'jpeg';
              const rawB64 = b64.replace(/^data:image\/\w+;base64,/, '');
              imageBase64Map.set(cs.index, { data: rawB64, ext });
              imageUrlMap.set(cs.index, pr.url); // save URL for preview
              break;
            }
          }
        }
      } catch (err) {
        console.error(`[Presentation] Failed to fetch Pexels image for "${cs.query}":`, err);
      }
      const imgProgress = 25 + Math.round((ci + 1) / Math.max(slidesNeedingImages.length, 1) * 40);
      presentationJobStore.set(jobId, { status: "processing", progress: imgProgress, stage: "generating_images" });
    }

    // Assign user images to slides that requested them
    slideData.slides.forEach((s, i) => {
      const userImgMatch = s.pexelsQuery.match(/^userImage:(\d+)$/);
      if (userImgMatch) {
        const userImgIdx = parseInt(userImgMatch[1]);
        const userImg = imageBase64Map.get(-(userImgIdx + 1));
        if (userImg) {
          imageBase64Map.set(i, userImg);
          // Use original user-provided URL for preview
          if (input.imageUrls && input.imageUrls[userImgIdx]) {
            imageUrlMap.set(i, input.imageUrls[userImgIdx]);
          }
        }
      }
    });

    // Stage 3: Build PPTX
    presentationJobStore.set(jobId, { status: "processing", progress: 70, stage: "building_pptx" });

    const PptxCtor = await getPptxGenJS();
    const pptx = new PptxCtor();
    pptx.author = "N+1 STUDIOS";
    pptx.company = "N+1 STUDIOS";
    pptx.title = input.title;
    pptx.layout = "LAYOUT_16x9";

    // Base color palette (N+1 STUDIOS default)
    let C = {
      charcoal: "1A1A2E", slate: "2D2D3F", warmGray: "F5F0EB", cream: "FAF8F5",
      copper: "B87333", copperLight: "D4956B", copperDark: "8B5E3C",
      text: "2C2C2C", textLight: "6B6560", textOnDark: "E8E4DF",
      white: "FFFFFF", divider: "D4CFC8", tagBg: "EDE8E2",
    };
    let F = { title: "Microsoft YaHei", body: "Microsoft YaHei" };

    // Override with layout pack colors/fonts if provided
    if (input.layoutPackStyleGuide) {
      const sg = input.layoutPackStyleGuide;
      const cp = sg.colorPalette;
      if (cp) {
        // Helper: strip leading # and ensure 6-char hex
        const hex = (v: string) => v ? v.replace(/^#/, "").padEnd(6, "0").slice(0, 6).toUpperCase() : "";
        if (cp.primary) {
          C.copper = hex(cp.primary);
          C.copperLight = hex(cp.primary); // use primary as accent
          C.copperDark = hex(cp.primary);
        }
        if (cp.background) {
          // Decide dark vs light theme based on tone
          const isDark = sg.tone === "dark";
          if (isDark) {
            C.charcoal = hex(cp.background);
            C.slate = hex(cp.background);
            C.warmGray = hex(cp.secondary || cp.background);
            C.cream = hex(cp.secondary || cp.background);
          } else {
            C.warmGray = hex(cp.background);
            C.cream = hex(cp.background);
            if (cp.secondary) {
              C.charcoal = hex(cp.secondary);
              C.slate = hex(cp.secondary);
            }
          }
        }
        if (cp.text) {
          C.text = hex(cp.text);
          C.textLight = hex(cp.text);
        }
        if (cp.accent) {
          C.copper = hex(cp.accent);
          C.copperLight = hex(cp.accent);
        }
      }
      const typo = sg.typography;
      if (typo) {
        if (typo.titleFont) F.title = typo.titleFont;
        if (typo.bodyFont) F.body = typo.bodyFont;
      }
      console.log(`[Presentation] Applied layout pack style: tone=${sg.tone}, primary=${C.copper}, font=${F.title}`);
    }
    let caseIdx = 0;

    for (let i = 0; i < slideData.slides.length; i++) {
      const sd = slideData.slides[i];
      const s = pptx.addSlide();
      const hasImage = imageBase64Map.has(i);

      if (sd.layout === "cover") {
        s.background = { color: C.charcoal };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.2, w: 0.03, h: 2.5, fill: { color: C.copper } });
        s.addText(sd.title, { x: 1.1, y: 1.3, w: 7.5, h: 1.0, fontSize: 32, fontFace: F.title, color: C.white, bold: true, lineSpacingMultiple: 1.2 });
        s.addText(sd.subtitle || "演示文稿", { x: 1.1, y: 2.4, w: 7.5, h: 0.5, fontSize: 16, fontFace: F.body, color: C.copperLight });
        s.addShape(pptx.ShapeType.rect, { x: 1.1, y: 3.2, w: 2.0, h: 0.025, fill: { color: C.copper } });
        s.addText("N+1 STUDIOS", { x: 1.1, y: 3.6, w: 4, h: 0.35, fontSize: 14, fontFace: F.title, color: C.copper, bold: true });
        s.addText(new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long" }), { x: 1.1, y: 4.0, w: 4, h: 0.3, fontSize: 11, fontFace: F.body, color: C.textLight });
        if (hasImage) {
          const imgData = imageBase64Map.get(i)!;
          s.addImage({ data: `image/${imgData.ext};base64,${imgData.data}`, x: 5.5, y: 0.04, w: 4.5, h: 5.59 });
          s.addShape(pptx.ShapeType.rect, { x: 5.0, y: 0.04, w: 1.0, h: 5.59, fill: { color: C.charcoal, transparency: 50 } });
        }
      } else if (sd.layout === "toc") {
        s.background = { color: C.cream };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: 5.63, fill: { color: C.copper } });
        s.addText("目录", { x: 0.8, y: 0.4, w: 2, h: 0.35, fontSize: 10, fontFace: F.body, color: C.copper, bold: true, charSpacing: 3 });
        s.addText(sd.title, { x: 0.8, y: 0.8, w: 8, h: 0.6, fontSize: 22, fontFace: F.title, color: C.text, bold: true });
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.5, w: 8.4, h: 0.01, fill: { color: C.divider } });
        const tocContent: any[] = [];
        for (let t = 0; t < sd.bullets.length; t++) {
          tocContent.push({ text: String(t + 1).padStart(2, "0"), options: { fontSize: 20, fontFace: F.title, color: C.copper, bold: true, paraSpaceAfter: 4 } });
          tocContent.push({ text: `    ${sd.bullets[t]}`, options: { fontSize: 13, fontFace: F.body, color: C.text, paraSpaceAfter: 16, lineSpacingMultiple: 1.3 } });
        }
        s.addText(tocContent, { x: 0.8, y: 1.7, w: 8.4, h: 3.5, valign: "top" });
      } else if (sd.layout === "section_intro") {
        s.background = { color: C.warmGray };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        s.addText(sd.title, { x: 0.8, y: 1.6, w: 8.4, h: 0.7, fontSize: 24, fontFace: F.title, color: C.text, bold: true });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 0.8, y: 2.3, w: 8.4, h: 0.4, fontSize: 13, fontFace: F.body, color: C.textLight, italic: true });
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.9, w: 1.5, h: 0.02, fill: { color: C.copper } });
        const introBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 13, fontFace: F.body, color: C.text, bullet: { code: "2014" }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
        s.addText(introBullets as any, { x: 0.8, y: 3.2, w: 8.4, h: 2.0, valign: "top" });
      } else if (sd.layout === "case_study") {
        caseIdx++;
        s.background = { color: C.cream };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.03, fill: { color: C.copper } });
        if (hasImage) {
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.35, w: 0.55, h: 0.55, fill: { color: C.copper }, rectRadius: 0.06 });
          s.addText(String(caseIdx).padStart(2, "0"), { x: 0.6, y: 0.35, w: 0.55, h: 0.55, fontSize: 14, fontFace: F.title, color: C.white, bold: true, align: "center", valign: "middle" });
          s.addText(sd.title, { x: 1.3, y: 0.3, w: 3.8, h: 0.65, fontSize: 18, fontFace: F.title, color: C.text, bold: true });
          if (sd.subtitle) s.addText(sd.subtitle, { x: 1.3, y: 0.95, w: 3.8, h: 0.35, fontSize: 10, fontFace: F.body, color: C.copper, italic: true });
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.4, w: 4.5, h: 0.01, fill: { color: C.divider } });
          const caseBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 11, fontFace: F.body, color: C.text, bullet: { code: "25AA", color: C.copper }, paraSpaceAfter: 7, lineSpacingMultiple: 1.4 } }));
          s.addText(caseBullets as any, { x: 0.6, y: 1.55, w: 4.5, h: 3.2, valign: "top" });
          const imgData = imageBase64Map.get(i)!;
          s.addImage({ data: `image/${imgData.ext};base64,${imgData.data}`, x: 5.3, y: 0.3, w: 4.4, h: 4.95, rounding: true });
        } else {
          s.addText(sd.title, { x: 1.3, y: 0.3, w: 8, h: 0.65, fontSize: 20, fontFace: F.title, color: C.text, bold: true });
          if (sd.subtitle) s.addText(sd.subtitle, { x: 1.3, y: 0.95, w: 8, h: 0.35, fontSize: 11, fontFace: F.body, color: C.copper, italic: true });
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.5, w: 8.8, h: 0.01, fill: { color: C.divider } });
          const caseBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 13, fontFace: F.body, color: C.text, bullet: { code: "25AA", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
          s.addText(caseBullets as any, { x: 0.8, y: 1.7, w: 8.4, h: 3.0, valign: "top" });
        }
        s.addText("N+1 STUDIOS  |  演示文稿", { x: 7.5, y: 5.25, w: 2.2, h: 0.2, fontSize: 7, fontFace: F.body, color: C.textLight, align: "right" });
      } else if (sd.layout === "insight") {
        s.background = { color: C.warmGray };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.03, fill: { color: C.copper } });
        if (hasImage) {
          const imgData = imageBase64Map.get(i)!;
          s.addImage({ data: `image/${imgData.ext};base64,${imgData.data}`, x: 0.5, y: 0.3, w: 9.0, h: 2.8, rounding: true });
          s.addText(sd.title, { x: 0.5, y: 3.25, w: 9, h: 0.5, fontSize: 18, fontFace: F.title, color: C.text, bold: true });
          s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.8, w: 1.2, h: 0.02, fill: { color: C.copper } });
          const insightBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 11, fontFace: F.body, color: C.text, bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 6, lineSpacingMultiple: 1.3 } }));
          s.addText(insightBullets as any, { x: 0.5, y: 3.95, w: 9, h: 1.3, valign: "top" });
        } else {
          s.addText(sd.title, { x: 0.8, y: 0.5, w: 8.4, h: 0.6, fontSize: 22, fontFace: F.title, color: C.text, bold: true });
          if (sd.subtitle) s.addText(sd.subtitle, { x: 0.8, y: 1.1, w: 8.4, h: 0.35, fontSize: 12, fontFace: F.body, color: C.copper, italic: true });
          s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.6, w: 1.5, h: 0.02, fill: { color: C.copper } });
          const insightBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 13, fontFace: F.body, color: C.text, bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
          s.addText(insightBullets as any, { x: 0.8, y: 1.8, w: 8.4, h: 3.5, valign: "top" });
        }
      } else if (sd.layout === "quote") {
        // 引言页：全屏深色背景 + 大字引言 + 左侧铜色竖线
        s.background = { color: C.charcoal };
        if (hasImage) {
          const imgData = imageBase64Map.get(i)!;
          s.addImage({ data: `image/${imgData.ext};base64,${imgData.data}`, x: 0, y: 0, w: 10, h: 5.63 });
          s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 5.63, fill: { color: C.charcoal, transparency: 40 } });
        }
        s.addShape(pptx.ShapeType.rect, { x: 0.7, y: 1.0, w: 0.06, h: 3.5, fill: { color: C.copper } });
        // 引号装饰
        s.addText("“", { x: 1.0, y: 0.7, w: 1.5, h: 1.0, fontSize: 72, fontFace: F.title, color: C.copper, bold: true, valign: "top" });
        s.addText(sd.title, { x: 1.1, y: 1.2, w: 8.0, h: 1.8, fontSize: 28, fontFace: F.title, color: C.white, bold: true, lineSpacingMultiple: 1.4 });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 1.1, y: 3.2, w: 8.0, h: 0.5, fontSize: 14, fontFace: F.body, color: C.copperLight, italic: true });
        if (sd.bullets.length > 0) {
          s.addShape(pptx.ShapeType.rect, { x: 1.1, y: 3.9, w: 3.0, h: 0.02, fill: { color: C.copper, transparency: 40 } });
          s.addText(sd.bullets[0], { x: 1.1, y: 4.1, w: 8.0, h: 0.4, fontSize: 12, fontFace: F.body, color: C.textOnDark });
        }
        s.addText("N+1 STUDIOS", { x: 7.5, y: 5.25, w: 2.2, h: 0.2, fontSize: 7, fontFace: F.body, color: C.textLight, align: "right" });
      } else if (sd.layout === "comparison") {
        // 对比页：左右分屏，中间铜色分隔线
        s.background = { color: C.cream };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        s.addText(sd.title, { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 18, fontFace: F.title, color: C.text, bold: true, align: "center" });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 0.5, y: 0.65, w: 9, h: 0.3, fontSize: 11, fontFace: F.body, color: C.textLight, italic: true, align: "center" });
        // 分隔线
        s.addShape(pptx.ShapeType.rect, { x: 4.85, y: 1.1, w: 0.03, h: 4.2, fill: { color: C.copper } });
        // 左侧标题
        const midIdx = Math.ceil(sd.bullets.length / 2);
        const leftBullets = sd.bullets.slice(0, midIdx);
        const rightBullets = sd.bullets.slice(midIdx);
        s.addShape(pptx.ShapeType.rect, { x: 0.4, y: 1.0, w: 4.2, h: 0.55, fill: { color: C.copper } });
        s.addText(leftBullets[0] || "方案 A", { x: 0.4, y: 1.0, w: 4.2, h: 0.55, fontSize: 14, fontFace: F.title, color: C.white, bold: true, align: "center", valign: "middle" });
        // 右侧标题
        s.addShape(pptx.ShapeType.rect, { x: 5.1, y: 1.0, w: 4.2, h: 0.55, fill: { color: C.slate } });
        s.addText(rightBullets[0] || "方案 B", { x: 5.1, y: 1.0, w: 4.2, h: 0.55, fontSize: 14, fontFace: F.title, color: C.white, bold: true, align: "center", valign: "middle" });
        // 左侧内容
        const leftContent = leftBullets.slice(1).map(b => ({ text: b, options: { fontSize: 12, fontFace: F.body, color: C.text, bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
        if (leftContent.length > 0) s.addText(leftContent as any, { x: 0.4, y: 1.7, w: 4.2, h: 3.5, valign: "top" });
        // 右侧内容
        const rightContent = rightBullets.slice(1).map(b => ({ text: b, options: { fontSize: 12, fontFace: F.body, color: C.text, bullet: { code: "25B8", color: C.slate }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
        if (rightContent.length > 0) s.addText(rightContent as any, { x: 5.1, y: 1.7, w: 4.2, h: 3.5, valign: "top" });
        s.addText("N+1 STUDIOS", { x: 7.5, y: 5.25, w: 2.2, h: 0.2, fontSize: 7, fontFace: F.body, color: C.textLight, align: "right" });
      } else if (sd.layout === "timeline") {
        // 时间轴页：深色背景 + 水平时间轴线 + 节点圆点
        s.background = { color: C.slate };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        s.addText(sd.title, { x: 0.8, y: 0.2, w: 8.4, h: 0.55, fontSize: 20, fontFace: F.title, color: C.white, bold: true });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 0.8, y: 0.75, w: 8.4, h: 0.3, fontSize: 11, fontFace: F.body, color: C.copperLight, italic: true });
        // 时间轴主线
        s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 2.9, w: 9.0, h: 0.04, fill: { color: C.copper } });
        const tlCount = Math.min(sd.bullets.length, 5);
        const tlStep = 9.0 / (tlCount + 1);
        for (let t = 0; t < tlCount; t++) {
          const bx = 0.5 + tlStep * (t + 1);
          const parts = sd.bullets[t].split(" — ");
          const label = parts[0] || "";
          const desc = parts[1] || sd.bullets[t];
          // 节点圆点
          s.addShape(pptx.ShapeType.ellipse, { x: bx - 0.15, y: 2.75, w: 0.3, h: 0.3, fill: { color: C.copper } });
          // 年份标签（圆点上方）
          s.addText(label, { x: bx - 0.7, y: 2.2, w: 1.4, h: 0.4, fontSize: 11, fontFace: F.title, color: C.copper, bold: true, align: "center" });
          // 垂直连接线
          s.addShape(pptx.ShapeType.rect, { x: bx - 0.01, y: 2.6, w: 0.02, h: 0.15, fill: { color: C.copper, transparency: 30 } });
          // 描述文字（圆点下方）
          s.addText(desc, { x: bx - 0.8, y: 3.1, w: 1.6, h: 1.8, fontSize: 10, fontFace: F.body, color: C.textOnDark, align: "center", lineSpacingMultiple: 1.4 });
        }
        s.addText("N+1 STUDIOS", { x: 7.5, y: 5.25, w: 2.2, h: 0.2, fontSize: 7, fontFace: F.body, color: C.textLight, align: "right" });
      } else if (sd.layout === "data_highlight") {
        // 数据展示页：深色背景 + 大号数字 + 说明文字
        s.background = { color: C.charcoal };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        s.addText(sd.title, { x: 0.8, y: 0.15, w: 8.4, h: 0.5, fontSize: 18, fontFace: F.title, color: C.white, bold: true });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 0.8, y: 0.65, w: 8.4, h: 0.3, fontSize: 11, fontFace: F.body, color: C.copperLight, italic: true });
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.1, w: 8.4, h: 0.01, fill: { color: C.copper, transparency: 50 } });
        const dataItems = sd.bullets.slice(0, 4);
        const cols = dataItems.length <= 2 ? dataItems.length : dataItems.length <= 4 ? 2 : 3;
        const rows = Math.ceil(dataItems.length / cols);
        const cellW = 8.4 / cols;
        const cellH = rows === 1 ? 3.5 : 1.8;
        dataItems.forEach((b, idx) => {
          const parts = b.split(" — ");
          const num = parts[0] || "";
          const desc = parts[1] || b;
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const cx = 0.8 + col * cellW;
          const cy = 1.3 + row * (cellH + 0.3);
          s.addText(num, { x: cx, y: cy, w: cellW, h: cellH * 0.6, fontSize: rows === 1 ? 52 : 36, fontFace: F.title, color: C.copper, bold: true, align: "center", valign: "bottom" });
          s.addText(desc, { x: cx, y: cy + cellH * 0.6, w: cellW, h: cellH * 0.4, fontSize: 12, fontFace: F.body, color: C.textOnDark, align: "center", valign: "top", lineSpacingMultiple: 1.3 });
        });
        s.addText("N+1 STUDIOS", { x: 7.5, y: 5.25, w: 2.2, h: 0.2, fontSize: 7, fontFace: F.body, color: C.textLight, align: "right" });
      } else if (sd.layout === "summary") {
        s.background = { color: C.charcoal };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.copper } });
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 0.6, w: 0.03, h: 1.5, fill: { color: C.copper } });
        s.addText(sd.title, { x: 1.1, y: 0.7, w: 8, h: 0.7, fontSize: 24, fontFace: F.title, color: C.white, bold: true });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 1.1, y: 1.4, w: 8, h: 0.35, fontSize: 12, fontFace: F.body, color: C.copperLight });
        s.addShape(pptx.ShapeType.rect, { x: 1.1, y: 2.1, w: 8, h: 0.01, fill: { color: C.copper, transparency: 50 } });
        const summaryBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 12, fontFace: F.body, color: C.textOnDark, bullet: { code: "25B8", color: C.copper }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
        s.addText(summaryBullets as any, { x: 1.1, y: 2.3, w: 8, h: 2.5, valign: "top" });
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.0, w: 10, h: 0.63, fill: { color: C.slate } });
        s.addText("N+1 STUDIOS", { x: 0.8, y: 5.05, w: 3, h: 0.5, fontSize: 14, fontFace: F.title, color: C.copper, bold: true });
        s.addText("感谢您的关注", { x: 6, y: 5.05, w: 3.5, h: 0.5, fontSize: 11, fontFace: F.body, color: C.textLight, align: "right" });
      } else {
        s.background = { color: C.cream };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.03, fill: { color: C.copper } });
        s.addText(sd.title, { x: 0.8, y: 0.4, w: 8.4, h: 0.6, fontSize: 22, fontFace: F.title, color: C.text, bold: true });
        if (sd.subtitle) s.addText(sd.subtitle, { x: 0.8, y: 1.0, w: 8.4, h: 0.35, fontSize: 12, fontFace: F.body, color: C.copper, italic: true });
        s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.5, w: 1.5, h: 0.02, fill: { color: C.copper } });
        const textBullets = sd.bullets.map(b => ({ text: b, options: { fontSize: 13, fontFace: F.body, color: C.text, bullet: { code: "2014" }, paraSpaceAfter: 10, lineSpacingMultiple: 1.5 } }));
        s.addText(textBullets as any, { x: 0.8, y: 1.7, w: 8.4, h: 3.5, valign: "top" });
        s.addText("N+1 STUDIOS", { x: 7.5, y: 5.25, w: 2.2, h: 0.2, fontSize: 7, fontFace: F.body, color: C.textLight, align: "right" });
      }
    }

    // Stage 4: Export and upload
    presentationJobStore.set(jobId, { status: "processing", progress: 85, stage: "building_pptx" });
    const presStartTime = Date.now();
    const pptxBase64 = await pptx.write({ outputType: "base64" }) as string;
    const pptxBuffer = Buffer.from(pptxBase64, "base64");
    const fileKey = `pptx/pres_${nanoid()}-${input.title}.pptx`;
    const { url } = await storagePut(fileKey, pptxBuffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation");

    // Stage 4.5: Generate slide preview images (PPTX → PDF → PNG)
    presentationJobStore.set(jobId, { status: "processing", progress: 90, stage: "building_pptx" });
    const previewImages = await convertPptxToPreviewImages(pptxBuffer, jobId);

    // Build slide preview data (title, subtitle, bullets, layout, imageUrl, styleGuide)
    const slidePreviews: PptSlidePreview[] = slideData.slides.map((s, i) => ({
      title: s.title,
      subtitle: s.subtitle,
      bullets: s.bullets,
      layout: s.layout,
      imageUrl: imageUrlMap.get(i),
      styleGuide: input.layoutPackStyleGuide || undefined,
    }));
    let presentationHistoryId: number | undefined;
    if (userId) {
      try {
        const historyRow = await db.createGenerationHistory({
          userId,
          module: "presentation",
          title: `${input.title} - 演示文稿`,
          summary: `${slideData.slides.length} 页幻灯片，${imageBase64Map.size} 张配图`,
          outputUrl: url,
          status: "success",
          durationMs: Date.now() - presStartTime,
        });
        presentationHistoryId = (historyRow as any)[0]?.insertId ?? (historyRow as any).insertId;
      } catch {}
    }
    presentationJobStore.set(jobId, {
      status: "done",
      url,
      title: input.title,
      slideCount: slideData.slides.length,
      imageCount: imageBase64Map.size,
      historyId: presentationHistoryId,
      slides: slidePreviews,
      previewImages,
    });
    console.log(`[Presentation] Job ${jobId} completed: ${slideData.slides.length} slides, ${imageBase64Map.size} images`);

  } catch (err: any) {
    console.error("[Presentation] Background job failed:", err);
    presentationJobStore.set(jobId, { status: "failed", error: err?.message || "演示文稿生成失败" });
  }
}

// ─── Field Templates Router ─────────────────────────────────────────────────
const fieldTemplatesRouter = router({
  list: protectedProcedure.query(async () => {
    return db.listProjectFieldTemplates();
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().max(256).optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createProjectFieldTemplate({
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder ?? 0,
        isDefault: false,
      });
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      description: z.string().max(256).optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateProjectFieldTemplate(id, data);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProjectFieldTemplate(input.id);
      return { success: true };
    }),
});

const presentationRouter = router({
  generate: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      imageUrls: z.array(z.string()).optional(),
      toolId: z.number().optional(),
      layoutPackId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const jobId = `pres_${nanoid()}`;
      presentationJobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });

      // Load layout pack style guide if provided
      let layoutPackStyleGuide: any = null;
      if (input.layoutPackId) {
        try {
          const drizzleDb = await db.getDb();
          if (drizzleDb) {
            const { layoutPacks } = await import("../drizzle/schema");
            const { eq: _eq, and: _and } = await import("drizzle-orm");
            const [pack] = await drizzleDb.select().from(layoutPacks)
              .where(_and(_eq(layoutPacks.id, input.layoutPackId), _eq(layoutPacks.userId, ctx.user.id)))
              .limit(1);
            if (pack?.status === "done" && pack.styleGuide) {
              layoutPackStyleGuide = pack.styleGuide;
            }
          }
        } catch (e) { console.error("[Presentation] Failed to load layout pack:", e); }
      }

      generatePresentationInBackground(jobId, { ...input, layoutPackStyleGuide }, ctx.user.id).catch(err => {
        console.error("[Presentation] Background job failed:", err);
        presentationJobStore.set(jobId, { status: "failed", error: err?.message || "演示文稿生成失败" });
      });
      return { jobId };
    }),
  status: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = presentationJobStore.get(input.jobId);
      if (!job) return { status: "not_found" as const, progress: 0, stage: "" as const };
      if (job.status === "done") {
        setTimeout(() => presentationJobStore.delete(input.jobId), 5 * 60 * 1000);
        return { status: "done" as const, progress: 100, stage: "done" as const, url: job.url, title: job.title, slideCount: job.slideCount, imageCount: job.imageCount, historyId: job.historyId, slides: job.slides, pageImages: job.pageImages, pageSummaries: job.pageSummaries, previewImages: job.previewImages };
      }
      if (job.status === "failed") {
        setTimeout(() => presentationJobStore.delete(input.jobId), 60 * 1000);
        return { status: "failed" as const, progress: 0, stage: "" as const, error: job.error };
      }
      return { status: "processing" as const, progress: job.progress || 0, stage: job.stage || "structuring", currentPage: job.currentPage, totalPages: job.totalPages };
    }),
  convertFromFile: protectedProcedure
    .input(z.object({
      fileUrls: z.array(z.string()).min(1),
      fileType: z.enum(["pdf", "images"]),
      title: z.string().optional(),
      toolId: z.number().optional(),
      inpaintToolId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const jobId = `pres_convert_${nanoid()}`;
      presentationJobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });
      generatePresentationFromFileInBackground(jobId, input, ctx.user.id).catch(err => {
        console.error("[PresentationConvert] Background job failed:", err);
        presentationJobStore.set(jobId, { status: "failed", error: err?.message || "文件转换失败" });
      });
      return { jobId };
    }),
});

// ─── Presentation: Convert from File (PDF/Images → PPTX) ──────────────────

async function generatePresentationFromFileInBackground(
  jobId: string,
  input: { fileUrls: string[]; fileType: "pdf" | "images"; title?: string; toolId?: number; inpaintToolId?: number },
  userId?: number
) {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const https = await import("https");
  const http = await import("http");

  try {
    presentationJobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });

    // ── Step 1: Collect page images ──────────────────────────────────────────
    const pageImageBase64s: Array<{ data: string; ext: string; url: string }> = [];
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pres-convert-"));

    const downloadToFile = (url: string, destPath: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const proto = url.startsWith("https") ? https : http;
        const file = fs.createWriteStream(destPath);
        proto.get(url, (res: any) => {
          res.pipe(file);
          file.on("finish", () => { file.close(); resolve(); });
        }).on("error", (err: any) => { fs.unlink(destPath, () => {}); reject(err); });
      });
    };

    if (input.fileType === "pdf") {
      // Download PDF and convert each page to PNG using pdfjs-dist (no system dependency)
      const pdfPath = path.join(tmpDir, "input.pdf");
      await downloadToFile(input.fileUrls[0], pdfPath);
      const imgOutDir = path.join(tmpDir, "pages");
      fs.mkdirSync(imgOutDir, { recursive: true });
      // Update job store with pdf_converting stage and per-page progress
      presentationJobStore.set(jobId, { status: "processing", progress: 5, stage: "pdf_converting", currentPage: 0, totalPages: 0 });
      const pngFiles = await pdfToImages(pdfPath, imgOutDir, "page", {
        dpi: 150,
        format: "png",
        onProgress: (current, total) => {
          // Map page conversion to 5-18% of overall progress
          const pdfProgress = 5 + Math.round((current / total) * 13);
          presentationJobStore.set(jobId, {
            status: "processing",
            progress: pdfProgress,
            stage: "pdf_converting",
            currentPage: current,
            totalPages: total,
          });
        },
      });
      for (const pngPath of pngFiles.slice(0, 30)) {
        const buf = fs.readFileSync(pngPath);
        pageImageBase64s.push({ data: buf.toString("base64"), ext: "png", url: "" });
      }
    } else {
      // Direct image URLs
      for (const imgUrl of input.fileUrls.slice(0, 30)) {
        try {
          const b64 = await downloadImageAsBase64(imgUrl);
          if (b64) {
            const mimeMatch = b64.match(/^data:(image\/\w+);/);
            const ext = mimeMatch ? mimeMatch[1].split("/")[1] : "jpeg";
            const raw = b64.replace(/^data:image\/\w+;base64,/, "");
            pageImageBase64s.push({ data: raw, ext, url: imgUrl });
          }
        } catch (e) { console.error("[PresentationConvert] Failed to load image:", e); }
      }
    }

    if (pageImageBase64s.length === 0) {
      throw new Error("未能提取任何页面图片，请检查文件格式");
    }

    presentationJobStore.set(jobId, { status: "processing", progress: 20, stage: "structuring" });

    // ── Step 2: AI analyze each page ─────────────────────────────────────────
    const slideAnalyses: Array<{
      bgColor: string;
      textElements: Array<{ text: string; x: number; y: number; w: number; h: number; fontSize: number; bold: boolean; color: string; align: string }>;
      imageRegions: Array<{ x: number; y: number; w: number; h: number; description: string }>;
      hasMultipleImages: boolean;
      pageWidth: number;
      pageHeight: number;
    }> = [];

    const totalPages = pageImageBase64s.length;
    for (let i = 0; i < totalPages; i++) {
      const pg = pageImageBase64s[i];
      const progress = 20 + Math.round((i / totalPages) * 50);
      presentationJobStore.set(jobId, { status: "processing", progress, stage: "structuring" });

      try {
        const analysisResp = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `你是一个专业的PPT页面布局分析专家。请分析给定的幻灯片页面图片，提取其中的所有文字元素和图片区域信息，以便用pptxgenjs精确重建该页面。

重要规则：
1. 坐标系：x/y/w/h 均为百分比值（0-100），相对于页面宽高
2. 文字元素：提取所有可见文字，包括标题、正文、标注说明、页码等
3. 图片区域：识别页面中的图片/插图/照片区域（不包括背景色块）
4. 如果页面有多张独立图片（如2张效果图并排），分别列出每张图片的区域
5. 背景色：使用十六进制颜色值（如 #F5F0EB）
6. 文字颜色：使用十六进制颜色值
7. fontSize：估算字号（标题通常36-60pt，正文14-18pt，说明文字10-12pt）
8. align：left/center/right
9. 如果整页就是一张图片（无独立文字），imageRegions 填满整页（x:0,y:0,w:100,h:100），textElements 为空数组`
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url" as const,
                  image_url: { url: `data:image/${pg.ext};base64,${pg.data}`, detail: "high" as const }
                },
                {
                  type: "text" as const,
                  text: "请分析这张幻灯片页面，提取所有文字元素和图片区域信息。"
                }
              ]
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "slide_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  bgColor: { type: "string", description: "背景色十六进制值" },
                  pageWidth: { type: "number", description: "页面宽高比的宽度（如16）" },
                  pageHeight: { type: "number", description: "页面宽高比的高度（如9）" },
                  hasMultipleImages: { type: "boolean", description: "页面是否有多张独立图片" },
                  textElements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        x: { type: "number" }, y: { type: "number" },
                        w: { type: "number" }, h: { type: "number" },
                        fontSize: { type: "number" },
                        bold: { type: "boolean" },
                        color: { type: "string" },
                        align: { type: "string" }
                      },
                      required: ["text","x","y","w","h","fontSize","bold","color","align"],
                      additionalProperties: false
                    }
                  },
                  imageRegions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        x: { type: "number" }, y: { type: "number" },
                        w: { type: "number" }, h: { type: "number" },
                        description: { type: "string" }
                      },
                      required: ["x","y","w","h","description"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["bgColor","pageWidth","pageHeight","hasMultipleImages","textElements","imageRegions"],
                additionalProperties: false
              }
            }
          }
        });
        const content = typeof analysisResp.choices[0]?.message?.content === "string"
          ? analysisResp.choices[0].message.content : "{}";
        const parsed = JSON.parse(content);
        slideAnalyses.push(parsed);
      } catch (e) {
        console.error(`[PresentationConvert] Page ${i} analysis failed:`, e);
        // Fallback: treat whole page as image
        slideAnalyses.push({
          bgColor: "#FFFFFF", pageWidth: 16, pageHeight: 9,
          textElements: [], imageRegions: [{ x: 0, y: 0, w: 100, h: 100, description: "page" }],
          hasMultipleImages: false
        });
      }
    }

    presentationJobStore.set(jobId, { status: "processing", progress: 72, stage: "building_pptx" });
    // ── Step 2.5: Remove text from images ──────────────────────────────────────
    // Always erase text regions using sharp (fill with bg color).
    // If inpaintToolId is set, additionally use AI inpainting for better quality.
    const inpaintedPageImages: Array<{ data: string; ext: string; url: string }> = [...pageImageBase64s];

    // Default: use sharp to paint bg-colored rectangles over text areas (no AI needed)
    for (let i = 0; i < pageImageBase64s.length; i++) {
      const pg = pageImageBase64s[i];
      const analysis = slideAnalyses[i];
      if (!analysis.textElements || analysis.textElements.length === 0) continue;
      try {
        const sharpMod = (await import("sharp")).default;
        const imgBuf = Buffer.from(pg.data, "base64");
        const meta = await sharpMod(imgBuf).metadata();
        const imgW = meta.width || 800;
        const imgH = meta.height || 600;
        // Parse bg color
        const bgHex = (analysis.bgColor || "#FFFFFF").replace("#", "");
        const bgR = parseInt(bgHex.slice(0, 2), 16) || 255;
        const bgG = parseInt(bgHex.slice(2, 4), 16) || 255;
        const bgB = parseInt(bgHex.slice(4, 6), 16) || 255;
        // Build composites: one solid-color patch per text element
        const composites: any[] = [];
        for (const el of analysis.textElements) {
          const rx = Math.max(0, Math.round((el.x / 100) * imgW) - 4);
          const ry = Math.max(0, Math.round((el.y / 100) * imgH) - 4);
          const rw = Math.min(imgW - rx, Math.round((el.w / 100) * imgW) + 8);
          const rh = Math.min(imgH - ry, Math.round((el.h / 100) * imgH) + 8);
          if (rw <= 0 || rh <= 0) continue;
          const patch = await sharpMod({
            create: { width: rw, height: rh, channels: 3, background: { r: bgR, g: bgG, b: bgB } }
          }).png().toBuffer();
          composites.push({ input: patch, left: rx, top: ry });
        }
        if (composites.length > 0) {
          const cleaned = await sharpMod(imgBuf).composite(composites).png().toBuffer();
          inpaintedPageImages[i] = { data: cleaned.toString("base64"), ext: "png", url: pg.url };
        }
      } catch (e) {
        console.error(`[PresentationConvert] Sharp text erase failed for page ${i}:`, e);
      }
    }

    if (input.inpaintToolId) {
      const totalInpaintPages = pageImageBase64s.length;
      for (let i = 0; i < totalInpaintPages; i++) {
        const pg = pageImageBase64s[i];
        const analysis = slideAnalyses[i];
        if (!analysis.textElements || analysis.textElements.length === 0) continue;
        const inpaintProgress = 72 + Math.round((i / totalInpaintPages) * 15);
        presentationJobStore.set(jobId, { status: "processing", progress: inpaintProgress, stage: "inpainting" });
        try {
          const sharpMod = (await import("sharp")).default;
          const imgBuf = Buffer.from(pg.data, "base64");
          const meta = await sharpMod(imgBuf).metadata();
          const imgW = meta.width || 800;
          const imgH = meta.height || 600;
          // Get tool info to determine provider
          const toolRow = await db.getAiToolById(input.inpaintToolId);
          const provider = toolRow?.provider || "";
          if (provider === "jimeng" || provider === "volcengine") {
            // ── 即梦 Inpainting: generate mask image ──
            // Create a black mask with white regions over text areas
            const maskBuf = await sharpMod({
              create: { width: imgW, height: imgH, channels: 3, background: { r: 0, g: 0, b: 0 } }
            }).png().toBuffer();
            // Draw white rectangles over text regions
            const maskComposites: any[] = [];
            for (const el of analysis.textElements) {
              const rx = Math.max(0, Math.round((el.x / 100) * imgW) - 4);
              const ry = Math.max(0, Math.round((el.y / 100) * imgH) - 4);
              const rw = Math.min(imgW - rx, Math.round((el.w / 100) * imgW) + 8);
              const rh = Math.min(imgH - ry, Math.round((el.h / 100) * imgH) + 8);
              const whitePatch = await sharpMod({
                create: { width: rw, height: rh, channels: 3, background: { r: 255, g: 255, b: 255 } }
              }).png().toBuffer();
              maskComposites.push({ input: whitePatch, left: rx, top: ry });
            }
            const finalMask = maskComposites.length > 0
              ? await sharpMod(maskBuf).composite(maskComposites).png().toBuffer()
              : maskBuf;
            // Upload original and mask to S3
            const origKey = `presentations/inpaint/${jobId}-page${i}-orig.png`;
            const maskKey = `presentations/inpaint/${jobId}-page${i}-mask.png`;
            const [{ url: origUrl }, { url: maskUrl }] = await Promise.all([
              storagePut(origKey, imgBuf, "image/png"),
              storagePut(maskKey, finalMask, "image/png"),
            ]);
            // Call jimeng inpainting
            const inpaintResult = await generateImageWithTool({
              toolId: input.inpaintToolId,
              prompt: "Remove all text from the image, fill with the surrounding background texture and color, keep the rest of the image unchanged",
              originalImages: [{ url: origUrl, mimeType: "image/png" }],
              jimengMode: "inpaint",
              maskImageUrl: maskUrl
            });
            if (inpaintResult?.url) {
              // Download the inpainted image and store as base64
              try {
                const dlResp = await fetch(inpaintResult.url, { signal: AbortSignal.timeout(60000) });
                if (dlResp.ok) {
                  const dlBuf = Buffer.from(await dlResp.arrayBuffer());
                  inpaintedPageImages[i] = { data: dlBuf.toString("base64"), ext: "png", url: inpaintResult.url };
                }
              } catch (dlErr) {
                console.error(`[PresentationConvert] Failed to download inpainted image:`, dlErr);
              }
            }
          } else {
            // ── Gemini / other: composite red-highlight mask onto image, then call generateImageWithTool ──
            // This mirrors the colorPlan.inpaint approach: red overlay marks edit areas,
            // INPAINTING INSTRUCTION prompt tells the model to only modify marked regions.

            // Step 1: Build a white/black mask buffer (white = text area, black = keep)
            const maskBuf = await sharpMod({
              create: { width: imgW, height: imgH, channels: 3, background: { r: 0, g: 0, b: 0 } }
            }).png().toBuffer();
            const maskComposites: any[] = [];
            for (const el of analysis.textElements) {
              const rx = Math.max(0, Math.round((el.x / 100) * imgW) - 4);
              const ry = Math.max(0, Math.round((el.y / 100) * imgH) - 4);
              const rw = Math.min(imgW - rx, Math.round((el.w / 100) * imgW) + 8);
              const rh = Math.min(imgH - ry, Math.round((el.h / 100) * imgH) + 8);
              if (rw <= 0 || rh <= 0) continue;
              const whitePatch = await sharpMod({
                create: { width: rw, height: rh, channels: 3, background: { r: 255, g: 255, b: 255 } }
              }).png().toBuffer();
              maskComposites.push({ input: whitePatch, left: rx, top: ry });
            }
            const finalMaskBuf = maskComposites.length > 0
              ? await sharpMod(maskBuf).composite(maskComposites).png().toBuffer()
              : maskBuf;
            const maskBase64 = finalMaskBuf.toString("base64");

            // Step 2: Composite red highlight onto original image (same as compositeMaskOnImage)
            const { compositeMaskOnImage: _compositeMaskFn } = await import("./imageProcessor");
            // Upload original to S3 so compositeMaskOnImage can fetch it
            const origKey = `presentations/inpaint/${jobId}-page${i}-orig.png`;
            const { url: origUrl } = await storagePut(origKey, imgBuf, "image/png");
            const compositeResult = await _compositeMaskFn(origUrl, maskBase64);

            // Step 3: Call generateImageWithTool with the highlighted image + INPAINTING INSTRUCTION
            const inpaintPrompt = `[INPAINTING INSTRUCTION: The image has red-highlighted areas marking regions to modify. ONLY modify the content within the red-marked areas. Keep all other areas exactly unchanged.] Remove all text from the red-highlighted areas. Fill those areas with the surrounding background color and texture so the result looks natural and seamless.`;
            const inpaintResult = await generateImageWithTool({
              toolId: input.inpaintToolId,
              prompt: inpaintPrompt,
              originalImages: [{ b64Json: compositeResult.b64, mimeType: compositeResult.mimeType }]
            });
            if (inpaintResult?.url) {
              try {
                const dlResp = await fetch(inpaintResult.url, { signal: AbortSignal.timeout(60000) });
                if (dlResp.ok) {
                  const dlBuf = Buffer.from(await dlResp.arrayBuffer());
                  inpaintedPageImages[i] = { data: dlBuf.toString("base64"), ext: "png", url: inpaintResult.url };
                }
              } catch (dlErr) {
                console.error(`[PresentationConvert] Failed to download inpainted image:`, dlErr);
              }
            }
          }
        } catch (e) {
          console.error(`[PresentationConvert] Inpainting failed for page ${i}:`, e);
          // Keep original image on failure
        }
      }
    }
    // ── Step 3: Build PPTX with pptxgenjs ────────────────────────────────────
    const PptxGenJS = await getPptxGenJS();
    const pptx = new PptxGenJS();
    // Determine slide dimensions from actual pixel dimensions of first page image
    const sharpForDims = (await import("sharp")).default;
    let slideW = 10, slideH = 5.625; // default 16:9
    try {
      const firstPg = pageImageBase64s[0];
      const firstMeta = await sharpForDims(Buffer.from(firstPg.data, "base64")).metadata();
      const pixW = firstMeta.width || 1920;
      const pixH = firstMeta.height || 1080;
      // Use 10 inches as base width, scale height proportionally
      slideW = 10;
      slideH = Math.round((10 * pixH / pixW) * 1000) / 1000;
    } catch (e) {
      console.error("[PresentationConvert] Could not determine slide dimensions:", e);
    }
    pptx.defineLayout({ name: "CUSTOM", width: slideW, height: slideH });
    pptx.layout = "CUSTOM";
    for (let i = 0; i < inpaintedPageImages.length; i++) {
      const pg = inpaintedPageImages[i];
      const analysis = slideAnalyses[i];
      const slide = pptx.addSlide();
      // Background color
      const bgHex = (analysis.bgColor || "#FFFFFF").replace("#", "");
      slide.background = { fill: bgHex };

      // Add image regions
      if (analysis.imageRegions && analysis.imageRegions.length > 0) {
        for (const region of analysis.imageRegions) {
          // Crop the region from the page image using sharp
          try {
            const sharp = (await import("sharp")).default;
            const imgBuf = Buffer.from(pg.data, "base64");
            const meta = await sharp(imgBuf).metadata();
            const imgW = meta.width || 800;
            const imgH = meta.height || 600;
            const cropX = Math.round((region.x / 100) * imgW);
            const cropY = Math.round((region.y / 100) * imgH);
            const cropW = Math.max(1, Math.round((region.w / 100) * imgW));
            const cropH = Math.max(1, Math.round((region.h / 100) * imgH));
            const cropped = await sharp(imgBuf)
              .extract({ left: cropX, top: cropY, width: Math.min(cropW, imgW - cropX), height: Math.min(cropH, imgH - cropY) })
              .png().toBuffer();
            const croppedB64 = cropped.toString("base64");
            slide.addImage({
              data: `data:image/png;base64,${croppedB64}`,
              x: `${region.x}%`, y: `${region.y}%`,
              w: `${region.w}%`, h: `${region.h}%`,
              sizing: { type: "contain", w: `${region.w}%`, h: `${region.h}%` }
            });
          } catch (e) {
            // Fallback: use full page image
            slide.addImage({
              data: `data:image/${pg.ext};base64,${pg.data}`,
              x: `${region.x}%`, y: `${region.y}%`,
              w: `${region.w}%`, h: `${region.h}%`
            });
          }
        }
      }

      // Add text elements
      if (analysis.textElements && analysis.textElements.length > 0) {
        for (const el of analysis.textElements) {
          if (!el.text || el.text.trim() === "") continue;
          const colorHex = (el.color || "#000000").replace("#", "");
          try {
            slide.addText(el.text, {
              x: `${el.x}%`, y: `${el.y}%`,
              w: `${el.w}%`, h: `${el.h}%`,
              fontSize: Math.max(8, Math.min(72, el.fontSize || 16)),
              bold: el.bold || false,
              color: colorHex,
              align: (el.align as "left" | "center" | "right") || "left",
              fontFace: "Microsoft YaHei",
              wrap: true,
              valign: "top",
              margin: 0
            });
          } catch (e) {
            console.error(`[PresentationConvert] addText failed on page ${i}:`, e);
          }
        }
      }
    }

    // ── Step 4: Save and upload ───────────────────────────────────────────────
    presentationJobStore.set(jobId, { status: "processing", progress: 88, stage: "building_pptx" });
    const pptxBuffer: Buffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
    const fileName = `${input.title || "presentation"}-converted-${Date.now()}.pptx`;
    const { url: pptxUrl } = await storagePut(
      `presentations/${fileName}`,
      pptxBuffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    // Save to history
    if (userId) {
      await db.createGenerationHistory({
        userId,
        module: "presentation",
        title: input.title || `转换文稿 (${pageImageBase64s.length}页)`,
        summary: `从文件转换，共 ${pageImageBase64s.length} 页`,
        outputUrl: pptxUrl,
        status: "success",
        durationMs: 0,
      }).catch((e: any) => { console.error("[PresentationConvert] History save failed:", e); });
    }

    // ── Step 5: Generate PPTX preview images (PPTX → PDF → PNG) ──────────────
    presentationJobStore.set(jobId, { status: "processing", progress: 93, stage: "building_pptx" });
    const previewImages = await convertPptxToPreviewImages(pptxBuffer, jobId);

    // Also upload original page images for the "source vs result" comparison panel
    const pageImageUrls: string[] = [];
    const pageSummaries: Array<{ texts: string[]; imageCount: number }> = [];
    for (let i = 0; i < pageImageBase64s.length; i++) {
      const pg = pageImageBase64s[i];
      const analysis = slideAnalyses[i];
      try {
        const imgBuf = Buffer.from(pg.data, "base64");
        const previewKey = `presentations/previews/${jobId}-page${i + 1}.${pg.ext}`;
        const { url: previewUrl } = await storagePut(previewKey, imgBuf, `image/${pg.ext}`);
        pageImageUrls.push(previewUrl);
      } catch (e) {
        pageImageUrls.push(pg.url || "");
      }
      const texts = (analysis?.textElements || [])
        .map((el: any) => el.text?.trim())
        .filter((t: string) => t && t.length > 0)
        .slice(0, 5);
      pageSummaries.push({
        texts,
        imageCount: (analysis?.imageRegions || []).length
      });
    }
    // Cleanup temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    presentationJobStore.set(jobId, {
      status: "done", url: pptxUrl,
      title: input.title || `转换文稿 (${pageImageBase64s.length}页)`,
      slideCount: pageImageBase64s.length,
      imageCount: pageImageBase64s.length,
      slides: [],
      pageImages: pageImageUrls,
      pageSummaries,
      previewImages,
    });
  } catch (err: any) {
    console.error("[PresentationConvert] Failed:", err);
    presentationJobStore.set(jobId, { status: "failed", error: err?.message || "文件转换失败" });
  }
}

// ─── Personal Tasks Router ──────────────────────────────────────────────────
const personalTasksRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["todo", "in_progress", "done", "all"]).optional().default("all"),
    }))
    .query(async ({ ctx, input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return [];
      const { personalTasks: pt } = await import("../drizzle/schema");
      const { eq: _eq, and: _and, desc: _desc } = await import("drizzle-orm");
      const rows = await drizzleDb
        .select()
        .from(pt)
        .where(
          input.status === "all"
            ? _eq(pt.userId, ctx.user.id)
            : _and(_eq(pt.userId, ctx.user.id), _eq(pt.status, input.status))
        )
        .orderBy(_desc(pt.createdAt));
      return rows;
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(512),
      notes: z.string().optional(),
      priority: z.enum(["urgent", "high", "medium", "low"]).optional().default("medium"),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { personalTasks: pt } = await import("../drizzle/schema");
      const { eq: _eq, desc: _desc } = await import("drizzle-orm");
      await drizzleDb.insert(pt).values({
        userId: ctx.user.id,
        title: input.title,
        notes: input.notes,
        priority: input.priority,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      });
      const [created] = await drizzleDb.select().from(pt).where(_eq(pt.userId, ctx.user.id)).orderBy(_desc(pt.createdAt)).limit(1);
      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(512).optional(),
      notes: z.string().optional(),
      priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      startDate: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { personalTasks: pt } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const { id, startDate, dueDate, ...rest } = input;
      await drizzleDb.update(pt)
        .set({
          ...rest,
          ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
          ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        })
        .where(_and(_eq(pt.id, id), _eq(pt.userId, ctx.user.id)));
      const [updated] = await drizzleDb.select().from(pt).where(_eq(pt.id, id));
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { personalTasks: pt } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      await drizzleDb.delete(pt)
        .where(_and(_eq(pt.id, input.id), _eq(pt.userId, ctx.user.id)));
      return { success: true };
    }),
});


// ─── Layout Packs Router (AI 学习版式) ──────────────────────────────────────
const layoutPacksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return [];
    const { layoutPacks } = await import("../drizzle/schema");
    const { eq: _eq, desc: _desc } = await import("drizzle-orm");
    return drizzleDb
      .select()
      .from(layoutPacks)
      .where(_eq(layoutPacks.userId, ctx.user.id))
      .orderBy(_desc(layoutPacks.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      sourceType: z.enum(["pptx", "images", "pdf"]),
      sourceFileUrl: z.string().url(),
      sourceFileKey: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { layoutPacks } = await import("../drizzle/schema");
      const { eq: _eq, desc: _desc } = await import("drizzle-orm");

      await drizzleDb.insert(layoutPacks).values({
        userId: ctx.user.id,
        name: input.name,
        sourceType: input.sourceType,
        sourceFileUrl: input.sourceFileUrl,
        sourceFileKey: input.sourceFileKey,
        status: "pending",
      });

      const [newPack] = await drizzleDb
        .select()
        .from(layoutPacks)
        .where(_eq(layoutPacks.userId, ctx.user.id))
        .orderBy(_desc(layoutPacks.createdAt))
        .limit(1);

      if (!newPack) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建版式包失败" });

      extractLayoutPackAsync(newPack.id, input.sourceType, input.sourceFileUrl).catch(console.error);

      return { id: newPack.id, status: "pending" as const };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { layoutPacks } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [pack] = await drizzleDb
        .select()
        .from(layoutPacks)
        .where(_and(_eq(layoutPacks.id, input.id), _eq(layoutPacks.userId, ctx.user.id)))
        .limit(1);
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      return pack;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { layoutPacks } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      await drizzleDb
        .delete(layoutPacks)
        .where(_and(_eq(layoutPacks.id, input.id), _eq(layoutPacks.userId, ctx.user.id)));
      return { success: true };
    }),

  retry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { layoutPacks } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [pack] = await drizzleDb
        .select()
        .from(layoutPacks)
        .where(_and(_eq(layoutPacks.id, input.id), _eq(layoutPacks.userId, ctx.user.id)))
        .limit(1);
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      if (!pack.sourceFileUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "源文件 URL 不存在" });
      await drizzleDb.update(layoutPacks)
        .set({ status: "pending", errorMessage: null })
        .where(_eq(layoutPacks.id, pack.id));
      extractLayoutPackAsync(pack.id, pack.sourceType, pack.sourceFileUrl).catch(console.error);
      return { success: true };
    }),
});

// ─── AI 版式提取后台任务 ──────────────────────────────────────────────────────
async function extractLayoutPackAsync(
  packId: number,
  sourceType: "pptx" | "images" | "pdf",
  fileUrl: string
): Promise<void> {
  const drizzleDb = await db.getDb();
  if (!drizzleDb) return;
  const { layoutPacks } = await import("../drizzle/schema");
  const { eq: _eq } = await import("drizzle-orm");

  try {
    await drizzleDb.update(layoutPacks).set({ status: "processing" }).where(_eq(layoutPacks.id, packId));

    const sourceDesc = sourceType === "pptx" ? "PowerPoint 演示文稿" : sourceType === "pdf" ? "PDF 文档" : "图片集";

    // Convert file to image(s) for LLM visual analysis
    // The LLM API supports image_url but not file_url/file for PDFs
    let imageContent: { type: "image_url"; image_url: { url: string; detail: "high" } }[] = [];
    const tmpFiles: string[] = [];

    try {
      const { execSync } = await import("child_process");
      const { writeFileSync, readFileSync, readdirSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");

      const tmpDir = tmpdir();
      const uid = `lp_${packId}_${Date.now()}`;

      if (sourceType === "images") {
        // Direct image URL - use as-is
        imageContent = [{ type: "image_url", image_url: { url: fileUrl, detail: "high" } }];
      } else {
        // PDF or PPTX: download and convert to images
        const tmpFile = join(tmpDir, `${uid}.pdf`);
        tmpFiles.push(tmpFile);

        // Download the file
        const fileResp = await fetch(fileUrl);
        if (!fileResp.ok) throw new Error(`下载文件失败: ${fileResp.status}`);
        const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
        writeFileSync(tmpFile, fileBuffer);

        const tmpImgDir = join(tmpDir, uid);
        execSync(`mkdir -p "${tmpImgDir}"`);
        tmpFiles.push(tmpImgDir);

        // Step 1: Convert ALL pages to JPEG at moderate resolution for uniform sampling
        // Using pdfjs-dist (no system dependency)
        await pdfToImages(tmpFile, tmpImgDir, "page", { dpi: 72, format: "jpeg" });

        const allImgFiles = readdirSync(tmpImgDir)
          .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
          .sort();

        // Uniformly sample up to 10 pages across the entire document
        const MAX_SAMPLES = 10;
        let sampledFiles: string[];
        if (allImgFiles.length <= MAX_SAMPLES) {
          sampledFiles = allImgFiles;
        } else {
          sampledFiles = [];
          for (let i = 0; i < MAX_SAMPLES; i++) {
            const idx = Math.round(i * (allImgFiles.length - 1) / (MAX_SAMPLES - 1));
            if (!sampledFiles.includes(allImgFiles[idx])) sampledFiles.push(allImgFiles[idx]);
          }
        }

        for (const imgFile of sampledFiles) {
          const imgPath = join(tmpImgDir, imgFile);
          const imgBase64 = readFileSync(imgPath).toString("base64");
          const mime = imgFile.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
          imageContent.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${imgBase64}`, detail: "high" },
          });
        }

        if (imageContent.length === 0) throw new Error("未能从文件中提取页面图片");
      }
    } catch (convErr: any) {
      console.warn(`[LayoutPack] Image conversion failed, using text-only fallback:`, convErr.message);
      // Fallback: text-only analysis (no visual)
    } finally {
      // Cleanup temp files
      try {
        const { execSync } = await import("child_process");
        for (const f of tmpFiles) {
          try { execSync(`rm -rf "${f}"`); } catch {}
        }
      } catch {}
    }

    const BUILT_IN_LAYOUT_IDS = [
      { id: "cover", desc: "封面页：大标题 + 副标题 + 封面背景图" },
      { id: "toc", desc: "目录页：章节列表和章节编号" },
      { id: "section_intro", desc: "章节开头页：章节标题 + 简短说明文字" },
      { id: "case_study", desc: "案例分析页：案例图片 + 标题 + 分析要点" },
      { id: "insight", desc: "洞察观点页：标题 + 多条观点内容" },
      { id: "quote", desc: "引用页：大字引语 + 来源" },
      { id: "comparison", desc: "对比页：左右两列对比内容" },
      { id: "timeline", desc: "时间轴页：时间线 + 节点事件" },
      { id: "data_highlight", desc: "数据页：大数字高亮 + 指标说明" },
      { id: "summary", desc: "总结页：要点列表 + 结论" },
    ];

    const layoutIdList = BUILT_IN_LAYOUT_IDS.map(l => `  - ${l.id}: ${l.desc}`).join("\n");

    const userContent: any[] = [
      ...imageContent,
      {
        type: "text" as const,
        text: imageContent.length > 0
          ? `这是一份${sourceDesc}（文件：${fileUrl.split("/").pop()}）的均匀采样截图（共 ${imageContent.length} 张，按页码顺序排列）。\n请仔细观察每张截图的视觉设计，分析整份文件的设计风格。`
          : `请根据文件类型（${sourceDesc}）生成一个典型的建筑设计风格版式包。文件：${fileUrl.split("/").pop()}`,
      },
    ];

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一个专业的演示文稿设计分析师，擅长从视觉截图中学习品牌风格。

你的任务：分析提供的${sourceDesc}页面截图，提取其设计风格特征，生成可复用的版式包。

分析要求：
1. 配色：从截图中识别主要配色，输出准确的 hex 色値
2. 字体：判断标题和正文的字体风格（无衡山等线、几何、现代无衰线等）
3. 调性：整体设计调性（深色/浅色/混合）和风格（正式/创意/中性）
4. 版式映射：将每张截图映射到以下内置版式 ID 之一，并描述该截图看起来像什么、适合展示什么内容：
${layoutIdList}

输出要求：
- packName: 版式包名称（简洁描述风格，如「深色几何风建筑风格」）
- description: 2-3句话描述这份文件的设计风格
- colorPalette: 从截图中识别的实际配色（hex）
- typography: 字体风格判断
- styleKeywords: 3-5个风格关键词
- tone: dark/light/mixed
- formality: formal/creative/neutral
- layouts: 将每张截图映射为一个版式条目，包含 mappedLayoutId（内置版式 ID）、visualDescription（这张截图看起来像什么）、contentSuggestion（建议用于展示什么内容）`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "layout_pack_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              packName: { type: "string" },
              description: { type: "string" },
              colorPalette: {
                type: "object",
                properties: {
                  primary: { type: "string" },
                  secondary: { type: "string" },
                  background: { type: "string" },
                  text: { type: "string" },
                  accent: { type: "string" },
                },
                required: ["primary", "secondary", "background", "text", "accent"],
                additionalProperties: false,
              },
              typography: {
                type: "object",
                properties: {
                  titleFont: { type: "string" },
                  bodyFont: { type: "string" },
                  style: { type: "string" },
                },
                required: ["titleFont", "bodyFont", "style"],
                additionalProperties: false,
              },
              styleKeywords: { type: "array", items: { type: "string" } },
              tone: { type: "string", enum: ["dark", "light", "mixed"] },
              formality: { type: "string", enum: ["formal", "creative", "neutral"] },
              layouts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    mappedLayoutId: { type: "string", enum: ["cover", "toc", "section_intro", "case_study", "insight", "quote", "comparison", "timeline", "data_highlight", "summary"] },
                    visualDescription: { type: "string" },
                    contentSuggestion: { type: "string" },
                    hasImage: { type: "boolean" },
                    colorScheme: { type: "string" },
                  },
                  required: ["mappedLayoutId", "visualDescription", "contentSuggestion", "hasImage", "colorScheme"],
                  additionalProperties: false,
                },
              },
            },
            required: ["packName", "description", "colorPalette", "typography", "styleKeywords", "tone", "formality", "layouts"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("未获得 AI 分析结果");
    const analysis = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

    await drizzleDb.update(layoutPacks).set({
      name: analysis.packName,
      description: analysis.description,
      status: "done",
      styleGuide: {
        colorPalette: analysis.colorPalette,
        typography: analysis.typography,
        styleKeywords: analysis.styleKeywords,
        tone: analysis.tone,
        formality: analysis.formality,
      },
      layouts: analysis.layouts,
      thumbnails: [],
    }).where(_eq(layoutPacks.id, packId));

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error(`[LayoutPack] Extraction failed for pack ${packId}:`, msg);
    await drizzleDb.update(layoutPacks).set({
      status: "failed",
      errorMessage: msg,
    }).where(_eq(layoutPacks.id, packId));
  }
}

// ─── Graphic Style Packs Router ─────────────────────────────────────────────

const graphicStylePacksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return [];
    const { graphicStylePacks } = await import("../drizzle/schema");
    const { eq: _eq, desc: _desc } = await import("drizzle-orm");
    return drizzleDb.select().from(graphicStylePacks).where(_eq(graphicStylePacks.userId, ctx.user.id)).orderBy(_desc(graphicStylePacks.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      sourceType: z.enum(["images", "pdf"]),
      sourceFileUrl: z.string().url(),
      sourceFileKey: z.string(),
      // 批量上传：多图 URL 数组（可选，不传则退化为单图）
      sourceFileUrls: z.array(z.string().url()).min(1).max(20).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { graphicStylePacks } = await import("../drizzle/schema");
      const { eq: _eq, desc: _desc } = await import("drizzle-orm");
      // 多图模式：sourceFileUrls 包含所有图片 URL，sourceFileUrl 取第一张（向后兼容）
      const allUrls = input.sourceFileUrls && input.sourceFileUrls.length > 0
        ? input.sourceFileUrls
        : [input.sourceFileUrl];
      await drizzleDb.insert(graphicStylePacks).values({
        userId: ctx.user.id, name: input.name, sourceType: input.sourceType,
        sourceFileUrl: allUrls[0], sourceFileKey: input.sourceFileKey, status: "pending",
        sourceFileUrls: allUrls,
      });
      const [newPack] = await drizzleDb.select().from(graphicStylePacks).where(_eq(graphicStylePacks.userId, ctx.user.id)).orderBy(_desc(graphicStylePacks.createdAt)).limit(1);
      if (!newPack) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建版式包失败" });
      extractGraphicStylePackAsync(newPack.id, input.sourceType, allUrls).catch(console.error);
      return { id: newPack.id, status: "pending" as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicStylePacks } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      await drizzleDb.delete(graphicStylePacks).where(_and(_eq(graphicStylePacks.id, input.id), _eq(graphicStylePacks.userId, ctx.user.id)));
      return { success: true };
    }),

  retry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicStylePacks } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [pack] = await drizzleDb.select().from(graphicStylePacks).where(_and(_eq(graphicStylePacks.id, input.id), _eq(graphicStylePacks.userId, ctx.user.id))).limit(1);
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      if (!pack.sourceFileUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "没有原始文件" });
      await drizzleDb.update(graphicStylePacks).set({ status: "pending", errorMessage: null }).where(_eq(graphicStylePacks.id, input.id));
      const retryUrls = (pack.sourceFileUrls as string[] | null) || [pack.sourceFileUrl];
      extractGraphicStylePackAsync(pack.id, pack.sourceType, retryUrls).catch(console.error);
      return { success: true };
    }),

  // 根据素材库图片 URL 查找对应的版式包（用于从素材库选择版式包）
  getByAssetUrl: protectedProcedure
    .input(z.object({ fileUrl: z.string().url() }))
    .query(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) return null;
      const { graphicStylePacks } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [pack] = await drizzleDb.select().from(graphicStylePacks)
        .where(_and(_eq(graphicStylePacks.sourceFileUrl, input.fileUrl), _eq(graphicStylePacks.userId, ctx.user.id)))
        .limit(1);
      return pack ?? null;
    }),
});

// ─── Graphic Layout Router ────────────────────────────────────────────────────

const graphicLayoutRouter = router({
  generate: protectedProcedure
    .input(z.object({
      packId: z.number().optional(),
      stylePrompt: z.string().optional(), // 直接传入提取的风格提示词，替代 packId
      docType: z.enum(["brand_manual", "product_detail", "project_board", "custom"]),
      pageCount: z.number().min(1).max(10).default(1),
      aspectRatio: z.string().optional().default("3:4"),
      contentText: z.string().min(1),
      // 新格式：支持 per_page / by_type 两种模式
      assetConfig: z.discriminatedUnion("mode", [
        z.object({
          mode: z.literal("per_page"),
          // key 为页面索引字符串（"0","1",...），每页最多 5 张
          pages: z.record(z.string(), z.array(z.string().url()).max(5)),
        }),
        z.object({
          mode: z.literal("by_type"),
          // key 为类型名称（文件夹名），每类最多 20 张
          groups: z.record(z.string(), z.array(z.string().url()).max(20)),
        }),
      ]).optional(),
      // 展层兼容旧格式
      assetUrls: z.array(z.string()).optional(),
      title: z.string().optional(),
      imageToolId: z.number().optional(),
      planToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, desc: _desc } = await import("drizzle-orm");
      // 将 assetConfig 和旧的 assetUrls 合并存入 JSON 字段
      const storedAssets = input.assetConfig ?? (input.assetUrls ? { mode: "legacy", urls: input.assetUrls } : { mode: "legacy", urls: [] });
      await drizzleDb.insert(graphicLayoutJobs).values({
        userId: ctx.user.id, packId: input.packId ?? null, docType: input.docType,
        pageCount: input.pageCount, aspectRatio: input.aspectRatio ?? "3:4", contentText: input.contentText,
        assetUrls: storedAssets, title: input.title ?? null, stylePrompt: input.stylePrompt ?? null, status: "pending",
      });
      const [newJob] = await drizzleDb.select().from(graphicLayoutJobs).where(_eq(graphicLayoutJobs.userId, ctx.user.id)).orderBy(_desc(graphicLayoutJobs.createdAt)).limit(1);
      if (!newJob) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建排版任务失败" });
      generateGraphicLayoutAsync(newJob.id, ctx.user.id, input.imageToolId, input.stylePrompt, input.planToolId).catch(console.error);
      return { id: newJob.id, status: "pending" as const };
    }),

  status: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      // Use raw SQL to bypass MySQL REPEATABLE READ isolation (same fix as benchmark/rendering jobs)
      // Also auto-timeout stale jobs (pending/processing for >15min) on every status check
      await db.timeoutStaleGraphicLayoutJobs(15 * 60 * 1000);
      const job = await db.getGraphicLayoutJobRaw(input.id, ctx.user.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      // Auto-repair legacy records: fix duplicate/empty textBlock ids on load
      const rawPages = (job.pages as any[] | null) ?? [];
      if (rawPages.length > 0) {
        const drizzleDb = await db.getDb();
        if (drizzleDb) {
          const { graphicLayoutJobs } = await import("../drizzle/schema");
          const { eq: _eq } = await import("drizzle-orm");
          const { sanitizeJobPages } = await import("./graphicLayoutService");
          const { pages: fixedPages, dirty } = sanitizeJobPages(rawPages);
          if (dirty) {
            await drizzleDb.update(graphicLayoutJobs).set({ pages: fixedPages }).where(_eq(graphicLayoutJobs.id, job.id));
            console.log(`[GraphicLayout] Auto-repaired duplicate textBlock ids for job ${job.id}`);
            return { ...job, pages: fixedPages };
          }
        }
      }
      return job;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) return [];
    const { graphicLayoutJobs } = await import("../drizzle/schema");
    const { eq: _eq, desc: _desc } = await import("drizzle-orm");
    // Return summary only (no full pages/htmlPages) to reduce payload size
    const rows = await drizzleDb.select({
      id: graphicLayoutJobs.id,
      userId: graphicLayoutJobs.userId,
      packId: graphicLayoutJobs.packId,
      docType: graphicLayoutJobs.docType,
      pageCount: graphicLayoutJobs.pageCount,
      aspectRatio: graphicLayoutJobs.aspectRatio,
      contentText: graphicLayoutJobs.contentText,
      assetUrls: graphicLayoutJobs.assetUrls,
      title: graphicLayoutJobs.title,
      stylePrompt: graphicLayoutJobs.stylePrompt,
      status: graphicLayoutJobs.status,
      errorMessage: graphicLayoutJobs.errorMessage,
      createdAt: graphicLayoutJobs.createdAt,
      updatedAt: graphicLayoutJobs.updatedAt,
      pages: graphicLayoutJobs.pages,
    }).from(graphicLayoutJobs).where(_eq(graphicLayoutJobs.userId, ctx.user.id)).orderBy(_desc(graphicLayoutJobs.createdAt)).limit(30);
    // Only include the first page thumbnail to avoid sending all page images
    return rows.map(row => {
      const pages = (row.pages as any[] | null) ?? [];
      const firstPage = pages[0];
      return {
        ...row,
        pages: firstPage ? [{ pageIndex: 0, imageUrl: firstPage.imageUrl ?? null, backgroundColor: firstPage.backgroundColor ?? "#1a1a1a" }] : []
      };
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      await drizzleDb.delete(graphicLayoutJobs).where(_and(_eq(graphicLayoutJobs.id, input.id), _eq(graphicLayoutJobs.userId, ctx.user.id)));
      return { success: true };
    }),

  updateTextLayer: protectedProcedure
    .input(z.object({ jobId: z.number(), pageIndex: z.number(), layerId: z.string(), text: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs).where(_and(_eq(graphicLayoutJobs.id, input.jobId), _eq(graphicLayoutJobs.userId, ctx.user.id))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const pages = (job.pages as any[]) ?? [];
      const updatedPages = pages.map((page: any) => {
        if (page.pageIndex !== input.pageIndex) return page;
        return { ...page, textLayers: (page.textLayers ?? []).map((layer: any) => layer.id === input.layerId ? { ...layer, text: input.text } : layer) };
      });
      await drizzleDb.update(graphicLayoutJobs).set({ pages: updatedPages }).where(_eq(graphicLayoutJobs.id, input.jobId));
      return { success: true };
    }),

  // Inpainting: 局部重绘文字区域
  inpaintTextBlock: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      pageIndex: z.number(),
      blockId: z.string(),
      newText: z.string(),
      imageToolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // 若未指定工具，自动读取 AI 工具管理中"图像生成"的默认工具
      const resolvedImageToolId = input.imageToolId ?? (await db.getDefaultToolForCapability("image_generation")) ?? null;
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs).where(_and(_eq(graphicLayoutJobs.id, input.jobId), _eq(graphicLayoutJobs.userId, ctx.user.id))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const pages = (job.pages as any[]) ?? [];
      const page = pages.find((p: any) => p.pageIndex === input.pageIndex);
      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "页面不存在" });
      const block = (page.textBlocks ?? []).find((b: any) => b.id === input.blockId);
      if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "文字块不存在" });

      // Use compositeImageUrl (full image with all text rendered) as the base for inpainting,
      // so AI can see all existing text and correctly modify only the target block.
      // Fall back to imageUrl (raw background) if compositeImageUrl is not available.
      const originalImageUrl: string = page.compositeImageUrl ?? page.imageUrl ?? "";
      if (!originalImageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "原始图片不存在" });

      const imgW: number = page.imageSize?.width ?? 1024;
      const imgH: number = page.imageSize?.height ?? 1365;

      // 用红色覆盖层标记文字区域（与彩平图局部修改一致），让 AI 理解需要修改的范围
      let compositeB64: string;
      let compositeMimeType = "image/png";
      // Hoisted so actualWidth/actualHeight are available in the return value after the try block
      let actualWidth: number = imgW;
      let actualHeight: number = imgH;
      try {
        const sharp = (await import("sharp")).default;
        // 扩展重绘区域 20px 确保覆盖完整
        const padding = 20;
        // 先下载原图，再读取实际尺寸（DB 存储的 imageSize 可能与实际图片不一致）
        const imgResp = await fetch(originalImageUrl, { signal: AbortSignal.timeout(30000) });
        if (!imgResp.ok) throw new Error(`Failed to fetch original image: ${imgResp.status}`);
        const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
        const meta = await sharp(imgBuffer).metadata();
        const actualW = meta.width ?? imgW;
        const actualH = meta.height ?? imgH;
        actualWidth = actualW;
        actualHeight = actualH;
        if (actualW !== imgW || actualH !== imgH) {
          console.warn(`[inpaintTextBlock] DB imageSize (${imgW}x${imgH}) differs from actual (${actualW}x${actualH}), using actual`);
        }
        // 防御性处理：DB JSON 中字段可能为 undefined/null
        const bx = isFinite(Number(block.x)) ? Number(block.x) : 0;
        const by = isFinite(Number(block.y)) ? Number(block.y) : 0;
        const bw = isFinite(Number(block.width)) ? Number(block.width) : 0;
        const bh = isFinite(Number(block.height)) ? Number(block.height) : 0;
        const mx = Math.max(0, Math.round(bx) - padding);
        const my = Math.max(0, Math.round(by) - padding);
        const mw = Math.min(actualW - mx, Math.round(bw) + padding * 2);
        const mh = Math.min(actualH - my, Math.round(bh) + padding * 2);

        if (mw > 0 && mh > 0) {
          // 创建半透明红色覆盖层（仅覆盖文字区域）
          const overlayPixels = Buffer.alloc(mw * mh * 4);
          for (let i = 0; i < mw * mh; i++) {
            overlayPixels[i * 4] = 255;   // R
            overlayPixels[i * 4 + 1] = 60;  // G
            overlayPixels[i * 4 + 2] = 60;  // B
            overlayPixels[i * 4 + 3] = 120; // A (半透明)
          }
          const overlay = await sharp(overlayPixels, { raw: { width: mw, height: mh, channels: 4 } })
            .png()
            .toBuffer();

          // 合成：原图 + 红色覆盖层
          const compositeBuffer = await sharp(imgBuffer)
            .composite([{ input: overlay, left: mx, top: my, blend: "over" }])
            .png()
            .toBuffer();
          compositeB64 = compositeBuffer.toString("base64");
        } else {
          // 文字块坐标超出图像边界，降级为直接使用原图
          console.warn(`[inpaintTextBlock] block out of bounds (mx=${mx} my=${my} mw=${mw} mh=${mh}), using original image`);
          compositeB64 = imgBuffer.toString("base64");
        }
      } catch (err) {
        console.error("[inpaintTextBlock] Failed to generate red overlay composite:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "生成标注图失败" });
      }

      // 构建 inpainting prompt（与彩平图局部修改保持一致的指令格式）
      const inpaintPrompt = `[INPAINTING INSTRUCTION: The image has a red-highlighted area marking the region to modify. ONLY modify the content within the red-marked area. Keep all other areas exactly unchanged.] Replace the text in the red-highlighted region with: "${input.newText}". Keep the same font style, size (approximately ${block.fontSize}px), color (${block.color}), alignment (${block.align}), and background. Only change the text content, preserve everything else exactly.`;

      // 调用图像 API 进行 inpainting（传入红色标注合成图）
      const result = await generateImageWithTool({
        prompt: inpaintPrompt,
        originalImages: [
          { b64Json: compositeB64, mimeType: compositeMimeType },
        ],
        size: `${imgW}x${imgH}`,
        toolId: resolvedImageToolId,
      });

      const newImageUrl = result.url ?? "";
      if (!newImageUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Inpainting 返回空图片" });

      // Update textBlocks with new text, keep imageUrl (raw background) unchanged,
      // update compositeImageUrl to the new inpainted result (which already has all text rendered).
      const updatedTextBlocks = (page.textBlocks ?? []).map((b: any) =>
        b.id === input.blockId ? { ...b, text: input.newText } : b
      );

      // Re-composite the new inpainted image with remaining text blocks using server-side canvas
      // to ensure Chinese text accuracy for all blocks.
      let newCompositeImageUrl: string | undefined = newImageUrl;
      try {
        const { compositeTextOnImage } = await import("./compositeTextOnImage");
        const recomposite = await compositeTextOnImage({
          backgroundImageUrl: page.imageUrl ?? newImageUrl,
          textBlocks: updatedTextBlocks,
          imageWidth: actualWidth,
          imageHeight: actualHeight,
          outputKeyPrefix: `graphic-layout/composite-job${input.jobId}-p${input.pageIndex}`,
        });
        if (recomposite) newCompositeImageUrl = recomposite;
      } catch (compositeErr) {
        console.warn("[inpaintTextBlock] Re-composite failed, using inpainted image directly:", compositeErr);
      }

      const updatedPages = pages.map((p: any) => {
        if (p.pageIndex !== input.pageIndex) return p;
        return {
          ...p,
          // imageUrl stays as the raw background (no text) — used as base for future inpainting
          compositeImageUrl: newCompositeImageUrl,
          textBlocks: updatedTextBlocks,
        };
      });
      await drizzleDb.update(graphicLayoutJobs).set({ pages: updatedPages }).where(_eq(graphicLayoutJobs.id, input.jobId));
      return { success: true, newImageUrl: newCompositeImageUrl ?? newImageUrl, actualWidth, actualHeight };
    }),

  // ─── 导出 PDF ──────────────────────────────────────────────────────────────
  exportPdf: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs)
        .where(_and(_eq(graphicLayoutJobs.id, input.jobId), _eq(graphicLayoutJobs.userId, ctx.user.id)))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "done") throw new TRPCError({ code: "BAD_REQUEST", message: "排版尚未完成" });
      const pages = (job.pages as any[]) ?? [];
      if (pages.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "无页面数据" });

      // 计算 PDF 页面尺寸（单位 pt，1mm ≈ 2.8346pt）
      const aspectRatio = job.aspectRatio ?? "3:4";
      const PAGE_SIZES: Record<string, [number, number]> = {
        "3:4":  [595, 793],
        "4:3":  [793, 595],
        "1:1":  [595, 595],
        "16:9": [842, 474],
        "9:16": [474, 842],
        "A4":   [595, 842],
        "A3":   [1191, 842],
      };
      const [pageW, pageH] = PAGE_SIZES[aspectRatio] ?? [595, 793];

      // 下载所有页面图片（使用 Node.js 18+ 内置 fetch）
      const imageBuffers: Array<{ buf: Buffer; idx: number }> = [];
      const sortedPages = [...pages].sort((a: any, b: any) => a.pageIndex - b.pageIndex);
      for (const page of sortedPages) {
        // Prefer compositeImageUrl (full image with text rendered) for export
        const exportUrl = page.compositeImageUrl ?? page.imageUrl;
        if (!exportUrl) continue;
        try {
          const res = await fetch(exportUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          imageBuffers.push({ buf, idx: page.pageIndex });
        } catch (err) {
          console.error(`[exportPdf] Failed to fetch page ${page.pageIndex}:`, err);
        }
      }
      if (imageBuffers.length === 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "所有页面图片下载失败" });

      // 用 pdfkit 生成 PDF
      const PDFDocument = (await import("pdfkit")).default;
      const pdfChunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
        doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));
        doc.on("end", resolve);
        doc.on("error", reject);
        for (const { buf } of imageBuffers) {
          doc.addPage({ size: [pageW, pageH], margin: 0 });
          try {
            doc.image(buf, 0, 0, { width: pageW, height: pageH });
          } catch (e) {
            console.error("[exportPdf] Failed to embed image:", e);
          }
        }
        doc.end();
      });
      const pdfBuffer = Buffer.concat(pdfChunks);

      // 上传到 S3
      const fileKey = `graphic-layout-pdf/${ctx.user.id}/${input.jobId}-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
      return { url, filename: `${job.title || "排版"}.pdf` };
    }),

  // ─── 导出图片 ZIP ────────────────────────────────────────────────────────────
  exportImages: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs)
        .where(_and(_eq(graphicLayoutJobs.id, input.jobId), _eq(graphicLayoutJobs.userId, ctx.user.id)))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "done") throw new TRPCError({ code: "BAD_REQUEST", message: "排版尚未完成" });
      const pages = (job.pages as any[]) ?? [];
      if (pages.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "无页面数据" });

      // 下载所有页面图片
      const sortedPages = [...pages].sort((a: any, b: any) => a.pageIndex - b.pageIndex);
      const imageEntries: Array<{ buf: Buffer; filename: string }> = [];
      for (const page of sortedPages) {
        // Prefer compositeImageUrl (full image with text rendered) for export
        const exportUrl = page.compositeImageUrl ?? page.imageUrl;
        if (!exportUrl) continue;
        try {
          const res = await fetch(exportUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          // 尝试从 URL 提取扩展名，默认 jpg
          const urlPath = new URL(exportUrl).pathname;
          const ext = urlPath.match(/\.(png|jpg|jpeg|webp)$/i)?.[1] ?? "jpg";
          const paddedIdx = String(page.pageIndex + 1).padStart(2, "0");
          imageEntries.push({ buf, filename: `page-${paddedIdx}.${ext}` });
        } catch (err) {
          console.error(`[exportImages] Failed to fetch page ${page.pageIndex}:`, err);
        }
      }
      if (imageEntries.length === 0) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "所有页面图片下载失败" });

      // 用 archiver 打包为 ZIP
      const archiver = (await import("archiver")).default;
      const zipChunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("data", (chunk: Buffer) => zipChunks.push(chunk));
        archive.on("end", resolve);
        archive.on("error", reject);
        for (const { buf, filename } of imageEntries) {
          archive.append(buf, { name: filename });
        }
        archive.finalize();
      });
      const zipBuffer = Buffer.concat(zipChunks);

      // 上传到 S3
      const safeTitle = (job.title || "排版").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
      const fileKey = `graphic-layout-images/${ctx.user.id}/${input.jobId}-${Date.now()}.zip`;
      const { url } = await storagePut(fileKey, zipBuffer, "application/zip");
      return { url, filename: `${safeTitle}-图片.zip`, pageCount: imageEntries.length };
    }),

  /** 列出图文排版提示词配置 */
  listPrompts: protectedProcedure.query(async () => {
    return db.listGraphicLayoutPrompts();
  }),

  /** 更新图文排版提示词配置 */
  updatePrompt: protectedProcedure
    .input(z.object({
      type: z.enum(["layout_plan_system", "image_generation"]),
      prompt: z.string().min(1),
      label: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertGraphicLayoutPrompt(input.type, {
        prompt: input.prompt,
        label: input.label,
        description: input.description,
        updatedBy: ctx.user.id,
      });
      return { success: true };
    }),

  // 从参考图直接提取风格提示词（自然语言字符串）
  extractStylePrompt: protectedProcedure
    .input(z.object({
      imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
      packId: z.number().optional(),
    }).refine(data => data.imageUrls || data.packId, {
      message: "必须提供 imageUrls 或 packId 之一",
    }))
    .mutation(async ({ input }) => {
      let imageUrls: string[] = [];
      if (input.packId) {
        // 从数据库查询版式包的 fileUrl
        const pack = await db.getGraphicStylePackById(input.packId);
        if (!pack || pack.status !== "done") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "版式包不存在或未完成提取" });
        }
        imageUrls = [pack.sourceFileUrl ?? ""].filter(Boolean);
      } else if (input.imageUrls) {
        imageUrls = input.imageUrls;
      }
      const { invokeLLM } = await import("./_core/llm");
      const imageContents: any[] = [];
      for (const url of imageUrls.slice(0, 6)) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          const ct = res.headers.get("content-type") || "image/jpeg";
          imageContents.push({ type: "image_url", image_url: { url: `data:${ct};base64,${b64}`, detail: "high" } });
        } catch { /* skip */ }
      }
      if (imageContents.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "图片加载失败，请检查图片地址" });
      }
      const response = await invokeLLM({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a senior art director. Analyze the provided design reference image(s) and write a concise visual style prompt that captures the essence of this design.\n\nWrite in Chinese if the design contains Chinese text, otherwise in English. Cover in 3-5 sentences:\n- Overall mood and aesthetic feeling\n- Color palette (name the actual colors you see, include hex codes for distinctive colors)\n- Typography character (weight, scale contrast, style)\n- Layout structure (how images and text relate, spatial rhythm, density, margins)\n- Any distinctive visual techniques or elements\n\nWrite as a direct style instruction to an image generation AI. Be specific and vivid, not generic. Start with the most distinctive visual characteristic.`,
          },
          {
            role: "user",
            content: [
              ...imageContents,
              { type: "text", text: `Analyze ${imageContents.length > 1 ? "these " + imageContents.length + " reference images" : "this reference image"} and write a style prompt I can use to generate designs in this style.` },
            ],
          },
        ],
      });
      const stylePrompt = response.choices[0]?.message?.content;
      if (!stylePrompt || typeof stylePrompt !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "提取失败，请重试" });
      }
      return { stylePrompt: stylePrompt.trim() };
    }),
  // ─── Update Job (关联项目/修改标题) ─────────────────────────────────────────
  updateJob: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs).where(_and(_eq(graphicLayoutJobs.id, input.id), _eq(graphicLayoutJobs.userId, ctx.user.id))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "排版记录不存在" });
      const updateData: Record<string, any> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (Object.keys(updateData).length > 0) {
        await drizzleDb.update(graphicLayoutJobs).set(updateData).where(_eq(graphicLayoutJobs.id, input.id));
      }
      return { success: true };
    }),
  // ─── Save pages to Asset Library ─────────────────────────────────────────────
  saveToAssets: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      pageIndices: z.array(z.number()).optional(), // 不传则保存所有页
      projectId: z.number().optional(),
      category: z.string().optional().default("graphic_layout"),
      tags: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs).where(_and(_eq(graphicLayoutJobs.id, input.jobId), _eq(graphicLayoutJobs.userId, ctx.user.id))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "排版记录不存在" });
      if (job.status !== "done") throw new TRPCError({ code: "BAD_REQUEST", message: "排版尚未完成" });
      const pages = (job.pages as any[]) ?? [];
      const targetPages = input.pageIndices
        ? pages.filter((p: any) => input.pageIndices!.includes(p.pageIndex))
        : pages;
      if (targetPages.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "没有可保存的页面" });
      const savedAssets: any[] = [];
      for (const page of targetPages) {
        const imageUrl: string = page.imageUrl ?? "";
        if (!imageUrl) continue;
        const assetName = `${job.title || "排版"} - 第${page.pageIndex + 1}页`;
        const asset = await db.createAsset({
          name: assetName,
          fileUrl: imageUrl,
          fileKey: imageUrl,
          fileType: "image/png",
          category: input.category ?? "graphic_layout",
          tags: input.tags,
          thumbnailUrl: imageUrl,
          uploadedBy: ctx.user.id,
          projectId: input.projectId,
        });
        savedAssets.push(asset);
      }
      return { savedCount: savedAssets.length, assets: savedAssets };
    }),

  // ─── 删除文字块（从 pages 数据中移除，不重绘图像） ──────────────────────────
  deleteTextBlock: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      pageIndex: z.number(),
      blockId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { graphicLayoutJobs } = await import("../drizzle/schema");
      const { eq: _eq, and: _and } = await import("drizzle-orm");
      const [job] = await drizzleDb.select().from(graphicLayoutJobs)
        .where(_and(_eq(graphicLayoutJobs.id, input.jobId), _eq(graphicLayoutJobs.userId, ctx.user.id)))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const pages = (job.pages as any[]) ?? [];
      const updatedPages = pages.map((p: any) => {
        if (p.pageIndex !== input.pageIndex) return p;
        return {
          ...p,
          textBlocks: (p.textBlocks ?? []).filter((b: any) => b.id !== input.blockId),
        };
      });
      await drizzleDb.update(graphicLayoutJobs).set({ pages: updatedPages }).where(_eq(graphicLayoutJobs.id, input.jobId));
      return { success: true };
    }),
});
// ─── Graphic Style Pack Async Extraction ──────────────────────────────────────

async function extractGraphicStylePackAsync(packId: number, sourceType: string, fileUrls: string | string[]) {
  const drizzleDb = await db.getDb();
  if (!drizzleDb) return;
  const { graphicStylePacks } = await import("../drizzle/schema");
  const { eq: _eq } = await import("drizzle-orm");
  await drizzleDb.update(graphicStylePacks).set({ status: "processing" }).where(_eq(graphicStylePacks.id, packId));
  // 统一处理：单图或多图
  const urlList = Array.isArray(fileUrls) ? fileUrls : [fileUrls];
  try {
    const { execSync } = await import("child_process");
    const { mkdtempSync, readFileSync, readdirSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const tmpDir = mkdtempSync(join(tmpdir(), "graphic-style-"));
    const imageContent: any[] = [];
    try {
      const { writeFileSync } = await import("fs");
      const tmpImgDir = join(tmpDir, "imgs");
      execSync(`mkdir -p "${tmpImgDir}"`);
      // 处理每一个 URL（支持图片和 PDF）
      for (let urlIdx = 0; urlIdx < urlList.length; urlIdx++) {
        const fileUrl = urlList[urlIdx];
        const fileExt = fileUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
        const localFile = join(tmpDir, `source-${urlIdx}.${fileExt}`);
        const fileResp = await fetch(fileUrl);
        if (!fileResp.ok) {
          console.warn(`[GraphicStylePack] Failed to download ${fileUrl}: HTTP ${fileResp.status}, skipping`);
          continue;
        }
        const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
        writeFileSync(localFile, fileBuffer);
        if (sourceType === "pdf" && fileExt === "pdf") {
          // Convert PDF pages to JPEG
          const pdfImgDir = join(tmpImgDir, `pdf-${urlIdx}`);
          execSync(`mkdir -p "${pdfImgDir}"`);
          const allPdfPages = await pdfToImages(localFile, pdfImgDir, "page", { dpi: 150, format: "jpeg" });
          const pdfFiles = readdirSync(pdfImgDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
          const maxPdfSamples = Math.min(6, pdfFiles.length);
          const pdfStep = Math.max(1, Math.floor(pdfFiles.length / maxPdfSamples));
          for (let i = 0; i < pdfFiles.length && imageContent.length < 12; i += pdfStep) {
            const imgBase64 = readFileSync(join(pdfImgDir, pdfFiles[i])).toString("base64");
            const ext = pdfFiles[i].split(".").pop()?.toLowerCase();
            const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
            imageContent.push({ type: "image_url", image_url: { url: `data:${mime};base64,${imgBase64}`, detail: "high" } });
          }
        } else {
          // 图片文件：直接使用
          const imgExt = ["jpg", "jpeg", "png", "webp"].includes(fileExt) ? fileExt : "jpg";
          const destFile = join(tmpImgDir, `img-${urlIdx}.${imgExt}`);
          execSync(`cp "${localFile}" "${destFile}"`);
          if (imageContent.length < 12) {
            const imgBase64 = readFileSync(destFile).toString("base64");
            const mime = imgExt === "png" ? "image/png" : imgExt === "webp" ? "image/webp" : "image/jpeg";
            imageContent.push({ type: "image_url", image_url: { url: `data:${mime};base64,${imgBase64}`, detail: "high" } });
          }
        }
      }
      if (imageContent.length === 0) throw new Error("未能从文件中提取页面图片");
    } catch (convErr: any) {
      try { execSync(`rm -rf "${tmpDir}"`); } catch {}
      throw new Error(`图片处理失败：${convErr.message}`);
    } finally {
      try { execSync(`rm -rf "${tmpDir}"`); } catch {}
    }
    const response = await invokeLLM({
      messages: [
        { role: "system", content: `You are a senior brand designer and creative director. Your job is to look at these design screenshots and capture their visual DNA — the essence that makes this design feel the way it does.

Approach this like a designer, not a data extractor. Look at the whole before the parts:
- What is the emotional register? (austere, warm, bold, quiet, technical, editorial...)
- How does space work? Is it dense and information-rich, or spacious and minimal?
- What is the relationship between image and text? Who dominates?
- What makes this design distinctive — what would you immediately copy if you were designing something in this style?

Then extract the specific color values you actually see in the screenshots (read hex values directly, not guesses). Write the description as a creative brief — vivid, specific, useful to a designer who hasn't seen the reference.` },
        { role: "user", content: [
          ...imageContent,
          { type: "text" as const, text: `Analyze these ${imageContent.length} design screenshots. Write a creative brief capturing the visual DNA of this style. Be specific about what you see.` },
        ] },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "graphic_style_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              packName: { type: "string", description: "Short descriptive name for this style, e.g. 'Dark Minimalist Brand', 'Warm Editorial'" },
              description: { type: "string", description: "Rich creative brief: mood, personality, spatial rhythm, image-text relationship, what makes it distinctive. 3-5 sentences. Write as if briefing a designer who hasn't seen the reference." },
              colorPalette: { type: "object", properties: { primary: { type: "string", description: "Most prominent brand/accent color, exact hex read from image" }, secondary: { type: "string", description: "Secondary color, exact hex" }, background: { type: "string", description: "Page background color, exact hex" }, text: { type: "string", description: "Main text color, exact hex" }, accent: { type: "string", description: "Accent/highlight color, exact hex" } }, required: ["primary", "secondary", "background", "text", "accent"], additionalProperties: false },
              typography: { type: "object", properties: { titleFont: { type: "string", description: "Title font character, e.g. 'bold condensed sans-serif', 'light elegant serif'" }, bodyFont: { type: "string", description: "Body font character" }, style: { type: "string", description: "Typography personality, e.g. 'high contrast scale, editorial', 'uniform weight, technical'" } }, required: ["titleFont", "bodyFont", "style"], additionalProperties: false },
              layoutPatterns: { type: "array", items: { type: "object", properties: { patternName: { type: "string" }, visualDescription: { type: "string", description: "How this layout looks and feels" }, contentSuggestion: { type: "string", description: "What content works best here" } }, required: ["patternName", "visualDescription", "contentSuggestion"], additionalProperties: false } },
              styleKeywords: { type: "array", items: { type: "string" }, description: "5-8 keywords capturing the visual personality" },
              tone: { type: "string", enum: ["dark", "light", "mixed"] },
              density: { type: "string", enum: ["sparse", "balanced", "dense"] },
            },
            required: ["packName", "description", "colorPalette", "typography", "layoutPatterns", "styleKeywords", "tone", "density"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("未获得 AI 分析结果");
    const analysis = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    await drizzleDb.update(graphicStylePacks).set({
      name: analysis.packName, status: "done",
      styleGuide: { description: analysis.description, colorPalette: analysis.colorPalette, typography: analysis.typography, layoutPatterns: analysis.layoutPatterns, styleKeywords: analysis.styleKeywords, tone: analysis.tone, density: analysis.density },
      thumbnails: [],
    }).where(_eq(graphicStylePacks.id, packId));
    // 自动同步到素材库：版式包处理完成后写入 assets 表（category='layout_pack'）
    try {
      const [updatedPack] = await drizzleDb.select().from(graphicStylePacks).where(_eq(graphicStylePacks.id, packId)).limit(1);
      if (updatedPack?.sourceFileUrl) {
        const { assets } = await import("../drizzle/schema");
        const { and: _and2, eq: _eq2 } = await import("drizzle-orm");
        // Check if already synced (same fileUrl + layout_pack category)
        const existing = await drizzleDb.select({ id: assets.id }).from(assets)
          .where(_and2(_eq2(assets.fileUrl, updatedPack.sourceFileUrl), _eq2(assets.category, "layout_pack"))).limit(1);
        if (existing.length === 0) {
          await drizzleDb.insert(assets).values({
            name: updatedPack.name,
            description: "图文排版版式包参考图",
            category: "layout_pack",
            tags: "版式包,图文排版",
            fileUrl: updatedPack.sourceFileUrl,
            fileKey: updatedPack.sourceFileKey ?? "",
            fileType: "image/png",
            thumbnailUrl: updatedPack.sourceFileUrl,
            uploadedBy: updatedPack.userId,
          });
          console.log(`[GraphicStylePack] Auto-synced pack ${packId} to assets table`);
        }
      }
    } catch (syncErr: any) {
      console.error(`[GraphicStylePack] Failed to sync pack ${packId} to assets:`, syncErr.message);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error(`[GraphicStylePack] Extraction failed for pack ${packId}:`, msg);
    await drizzleDb.update(graphicStylePacks).set({ status: "failed", errorMessage: msg }).where(_eq(graphicStylePacks.id, packId));
  }
}

// ─── Graphic Layout Async Generation ─────────────────────────────────────────

// ─── Analysis Image Router ──────────────────────────────────────────────────

async function generateAnalysisImageInBackground(
  jobId: string,
  input: {
    type: "material" | "soft_furnishing";
    toolId?: number;
    referenceImageUrl: string;
    referenceImageContentType?: string;
    extraPrompt?: string;
    width?: number;
    height?: number;
  },
  userId: number,
  userName: string | null
) {
  try {
    await db.updateAnalysisImageJob(jobId, { status: "processing" });

    // Get built-in prompt for this type
    const builtinPrompt = await db.getAnalysisImagePrompt(input.type);
    const basePrompt = builtinPrompt?.prompt ?? (
      input.type === "material"
        ? "Generate a professional material palette board based on the reference image."
        : "Generate a professional soft furnishing mood board based on the reference image."
    );
    const fullPrompt = input.extraPrompt ? `${basePrompt}\n\n${input.extraPrompt}` : basePrompt;

    await db.updateAnalysisImageJob(jobId, { fullPrompt });

    // Build size string if width/height provided
    const sizeStr = (input.width && input.height) ? `${input.width}x${input.height}` : undefined;

    // Detect mimeType from URL extension or contentType
    const refMimeType = input.referenceImageContentType ||
      (/\.png$/i.test(input.referenceImageUrl) ? "image/png" :
       /\.webp$/i.test(input.referenceImageUrl) ? "image/webp" :
       "image/jpeg");

    // Generate image
    let resultUrl: string;
    if (input.toolId) {
      const result = await generateImageWithTool({
        toolId: input.toolId,
        prompt: fullPrompt,
        originalImages: [{ url: input.referenceImageUrl, mimeType: refMimeType }],
        size: sizeStr,
      });
      resultUrl = result.url;
    } else {
      const result = await generateImage({
        prompt: fullPrompt,
        originalImages: [{ url: input.referenceImageUrl, mimeType: refMimeType }],
        size: sizeStr,
      });
      resultUrl = result.url || "";
    }

    // Save to generationHistory
    const historyEntry = await db.createGenerationHistory({
      userId,
      module: "analysis_image",
      title: input.type === "material" ? "材质搜配图" : "软装搜配图",
      outputUrl: resultUrl,
      inputParams: { type: input.type, toolId: input.toolId, referenceImageUrl: input.referenceImageUrl, fullPrompt },
    });

    await db.updateAnalysisImageJob(jobId, { status: "done", resultUrl, historyId: historyEntry.id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error(`[AnalysisImage] Generation failed for job ${jobId}:`, msg);
    await db.updateAnalysisImageJob(jobId, { status: "failed", error: msg });
  }
}

const analysisImageRouter = router({
  /** Get all built-in prompts */
  listPrompts: protectedProcedure.query(async () => {
    return db.listAnalysisImagePrompts();
  }),

  /** Update a built-in prompt */
  updatePrompt: protectedProcedure
    .input(z.object({
      type: z.enum(["material", "soft_furnishing"]),
      prompt: z.string().min(1),
      label: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertAnalysisImagePrompt(input.type, {
        prompt: input.prompt,
        label: input.label,
        description: input.description,
        updatedBy: ctx.user.id,
      });
      return { success: true };
    }),

  /** Submit a new analysis image generation job (supports count=1..3 parallel jobs) */
  submit: protectedProcedure
    .input(z.object({
      type: z.enum(["material", "soft_furnishing"]),
      toolId: z.number().optional(),
      referenceImageUrl: z.string().url(),
      referenceImageContentType: z.string().optional(),
      extraPrompt: z.string().optional(),
      // 图片比例，格式 "WxH"，如 "1024x1024"
      aspectRatio: z.string().optional(),
      // 生成数量 1-3
      count: z.number().min(1).max(3).default(1),
    }))
    .mutation(async ({ input, ctx }) => {
      // Parse width/height from aspectRatio string
      let width: number | undefined;
      let height: number | undefined;
      if (input.aspectRatio) {
        const parts = input.aspectRatio.split("x");
        if (parts.length === 2) {
          width = parseInt(parts[0], 10);
          height = parseInt(parts[1], 10);
        }
      }

      const jobIds: string[] = [];
      for (let i = 0; i < input.count; i++) {
        const jobId = nanoid();
        await db.createAnalysisImageJob({
          id: jobId,
          userId: ctx.user.id,
          type: input.type,
          toolId: input.toolId ?? null,
          referenceImageUrl: input.referenceImageUrl,
          width: width ?? null,
          height: height ?? null,
        });
        generateAnalysisImageInBackground(
          jobId,
          { ...input, width, height },
          ctx.user.id,
          ctx.user.name || null
        ).catch(console.error);
        jobIds.push(jobId);
      }

      return { jobId: jobIds[0], jobIds };
    }),

  /** Poll single job status */
  pollJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const job = await db.getAnalysisImageJob(input.jobId);
      if (!job) return { status: "not_found" as const };
      if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (job.status === "done") {
        return { status: "done" as const, url: job.resultUrl || "", historyId: job.historyId };
      }
      if (job.status === "failed") {
        return { status: "failed" as const, error: job.error || "生成失败" };
      }
      return { status: job.status as "pending" | "processing" };
    }),

  /** Poll multiple jobs status */
  pollJobs: protectedProcedure
    .input(z.object({ jobIds: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      const results = await Promise.all(
        input.jobIds.map(async (jobId) => {
          const job = await db.getAnalysisImageJob(jobId);
          if (!job || job.userId !== ctx.user.id) return { jobId, status: "not_found" as const };
          if (job.status === "done") return { jobId, status: "done" as const, url: job.resultUrl || "", historyId: job.historyId };
          if (job.status === "failed") return { jobId, status: "failed" as const, error: job.error || "生成失败" };
          return { jobId, status: job.status as "pending" | "processing" };
        })
      );
      return results;
    }),
});

// ─── Main Router ─────────────────────────────────────────────────────────

export const appRouter = router({system: systemRouter,
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
  renderStyles: renderStylesRouter,
  aiTools: aiToolsRouter,
  benchmark: benchmarkRouter,
  caseStudyPrompts: caseStudyPromptsRouter,
  rendering: renderingRouter,
  colorPlan: colorPlanRouter,
  meeting: meetingRouter,
  admin: adminRouter,
  upload: uploadRouter,
  media: mediaRouter,
  history: historyRouter,
  feedback: feedbackRouter,
  enhance: enhanceRouter,
  presentation: presentationRouter,
  fieldTemplates: fieldTemplatesRouter,
  personalTasks: personalTasksRouter,
  layoutPacks: layoutPacksRouter,
  graphicStylePacks: graphicStylePacksRouter,
  graphicLayout: graphicLayoutRouter,
  video: router({
    generate: protectedProcedure
      .input(
        z.object({
          mode: z.enum(["text-to-video", "image-to-video"]),
          prompt: z.string().min(1),
          duration: z.number().min(1).max(8),
          toolId: z.number(),
          inputImageUrl: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tool = await db.getAiToolById(input.toolId);
        if (!tool) throw new TRPCError({ code: "NOT_FOUND", message: "工具不存在" });

        const jobId = nanoid();
        const result = await generateVideoWithTool({
          mode: input.mode,
          prompt: input.prompt,
          duration: input.duration,
          inputImageUrl: input.inputImageUrl,
          tool: {
            id: tool.id,
            name: tool.name,
            apiEndpoint: tool.apiEndpoint || undefined,
            apiKeyEncrypted: tool.apiKeyEncrypted || undefined,
            configJson: (tool.configJson as Record<string, unknown> | undefined) || undefined,
          },
        });

        const videoInsert = await db.db.insert(db.videoHistory).values({
          userId: ctx.user.id,
          toolId: input.toolId,
          mode: input.mode,
          prompt: input.prompt,
          duration: input.duration,
          inputImageUrl: input.inputImageUrl,
          taskId: result.taskId,
          status: result.status,
          outputVideoUrl: result.videoUrl,
          errorMessage: result.errorMessage,
        });
        const videoId = videoInsert[0].insertId;

        // Create a proxy entry in generation_history so video records share the same
        // delete/list/query flow as all other modules — no ID offset tricks needed.
        const ghStatus = result.status === "failed" ? "failed" : "processing";
        await db.createGenerationHistory({
          userId: ctx.user.id,
          module: "ai_video",
          title: (input.prompt || "AI 视频").slice(0, 60),
          summary: input.prompt || null,
          inputParams: {
            videoHistoryId: videoId,
            taskId: result.taskId,
            mode: input.mode,
            duration: input.duration,
            toolId: input.toolId,
          },
          outputUrl: input.inputImageUrl || null, // thumbnail placeholder until video completes
          status: ghStatus,
        });

        // 任务提交阶段即失败时发送通知
        if (result.status === "failed") {
          await notifyOwner({
            title: "视频生成失败",
            content: `工具：${tool.name}\n模式：${input.mode === "text-to-video" ? "文生视频" : "图生视频"}\n描述：${input.prompt.slice(0, 100)}\n失败原因：${result.errorMessage || "API 调用失败，请检查工具配置"}`,
          }).catch(() => {});
        }

        return {
          taskId: result.taskId,
          status: result.status,
          videoUrl: result.videoUrl,
          errorMessage: result.errorMessage,
        };
      }),
    getStatus: protectedProcedure
      .input(z.object({ taskId: z.string() }))
      .query(async ({ input, ctx }) => {
        const records = await db.listVideoHistory(ctx.user.id);
        const record = records.find((r: any) => r.taskId === input.taskId);
        if (!record) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }

        // 如果任务还在进行中，调用 API 查询最新状态
        if (record.status === "pending" || record.status === "processing") {
          try {
            const tool = record.toolId ? await db.getAiToolById(record.toolId) : null;
            if (tool && record.taskId) {
              const apiStatus = await queryVideoTaskStatus(
                record.taskId,
                {
                  name: tool.name,
                  apiKeyEncrypted: tool.apiKeyEncrypted || undefined,
                  configJson: (tool.configJson as Record<string, unknown> | undefined) || undefined,
                },
                (record.mode as "text-to-video" | "image-to-video") || "text-to-video"
              );
              // 当任务完成时，将视频转存到 S3 以获得永久 URL
              let permanentVideoUrl = apiStatus.videoUrl;
              if (apiStatus.status === "completed" && apiStatus.videoUrl) {
                try {
                  const videoResp = await fetch(apiStatus.videoUrl);
                  if (videoResp.ok) {
                    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
                    const s3Key = `video-history/${ctx.user.id}/${record.id}-${Date.now()}.mp4`;
                    const { url: s3Url } = await storagePut(s3Key, videoBuffer, "video/mp4");
                    permanentVideoUrl = s3Url;
                  }
                } catch (s3Err) {
                  console.error("[video.getStatus] 视频转存 S3 失败，使用原始 URL:", s3Err);
                }
              }
              // 更新数据库中的状态
              // 生成缩略图：图生视频用首帧图，文生视频用 AI 生成预览图
              let thumbnailUrl: string | undefined = undefined;
              if (apiStatus.status === "completed") {
                if (record.mode === "image-to-video" && record.inputImageUrl) {
                  // 图生视频：直接用输入图片作为封面
                  thumbnailUrl = record.inputImageUrl;
                } else if (record.mode === "text-to-video") {
                  // 文生视频：用 AI 生成一张预览图
                  try {
                    const { generateImage } = await import("./_core/imageGeneration");
                    const { url: previewUrl } = await generateImage({
                      prompt: (record.prompt || "architectural space").slice(0, 200),
                    });
                    if (previewUrl) thumbnailUrl = previewUrl;
                  } catch (imgErr) {
                    console.warn("[video.getStatus] 缩略图生成失败，跳过:", imgErr);
                  }
                }
              }
              await db.updateVideoHistory(record.id, {
                status: apiStatus.status,
                outputVideoUrl: permanentVideoUrl,
                errorMessage: apiStatus.errorMessage,
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
              });
              // Sync the generation_history proxy entry for this video
              try {
                const ghStatus = apiStatus.status === "completed" ? "success" : apiStatus.status === "failed" ? "failed" : "processing";
                await db.syncVideoProxyEntry(record.id, ctx.user.id, {
                  status: ghStatus,
                  outputUrl: thumbnailUrl || undefined,
                });
              } catch (syncErr) {
                console.warn("[video.getStatus] proxy sync failed:", syncErr);
              }
              // 状态变为 failed 时发送通知（进入此分支时 record.status 必为 pending/processing）
              if (apiStatus.status === "failed") {
                await notifyOwner({
                  title: "视频生成失败",
                  content: `工具：${tool.name}\n模式：${record.mode === "text-to-video" ? "文生视频" : "图生视频"}\n描述：${record.prompt?.slice(0, 100) || ""}\n任务 ID：${record.taskId}\n失败原因：${apiStatus.errorMessage || "视频生成任务超时或被拒绝，请检查工具配置"}`,
                }).catch(() => {});
              }
              return {
                status: apiStatus.status,
                videoUrl: permanentVideoUrl,
                errorMessage: apiStatus.errorMessage,
                progress: apiStatus.progress || 0,
                recordId: record.id,
              };
            }
          } catch (err) {
            console.error("[video.getStatus] API 查询失败:", err);
            // 查询失败时返回数据库中的状态
          }
        }

        // 已完成或失败，直接返回数据库中的状态
        let progress = 0;
        if (record.status === "pending") progress = 10;
        else if (record.status === "processing") progress = 50;
        else if (record.status === "completed") progress = 100;
        // 如果已完成但 URL 是临时链接（aigc-cloud.com），尝试重新下载并转存到 S3
        let finalVideoUrl = record.outputVideoUrl;
        if (record.status === "completed" && record.outputVideoUrl && record.outputVideoUrl.includes("aigc-cloud.com")) {
          try {
            const videoResp = await fetch(record.outputVideoUrl);
            if (videoResp.ok) {
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const s3Key = `video-history/${ctx.user.id}/${record.id}-${Date.now()}.mp4`;
              const { url: s3Url } = await storagePut(s3Key, videoBuffer, "video/mp4");
              finalVideoUrl = s3Url;
              await db.updateVideoHistory(record.id, { outputVideoUrl: s3Url });
            }
          } catch (s3Err) {
            console.error("[video.getStatus] 已完成视频转存 S3 失败:", s3Err);
          }
        }
        return {
          status: record.status,
          videoUrl: finalVideoUrl,
          errorMessage: record.errorMessage,
          progress,
          recordId: record.id,
         };
      }),
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input, ctx }) => {
        return await db.listVideoHistory(ctx.user.id);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteVideoHistory(input.id);
        return { success: true };
      }),
    regenerate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const records = await db.listVideoHistory(ctx.user.id);
        const record = records.find((r: any) => r.id === input.id);
        if (!record) throw new TRPCError({ code: "NOT_FOUND" });
        if (!record.toolId) throw new TRPCError({ code: "NOT_FOUND", message: "工具 ID 不存在" });
        const tool = await db.getAiToolById(record.toolId);
        if (!tool) throw new TRPCError({ code: "NOT_FOUND", message: "工具不存在" });
        const result = await generateVideoWithTool({
          mode: record.mode,
          prompt: record.prompt,
          duration: record.duration,
          inputImageUrl: record.inputImageUrl || undefined,
          tool: {
            id: tool.id,
            name: tool.name,
            apiEndpoint: tool.apiEndpoint || undefined,
            apiKeyEncrypted: tool.apiKeyEncrypted || undefined,
            configJson: (tool.configJson as Record<string, unknown> | undefined) || undefined,
          },
        });
        await db.updateVideoHistory(input.id, {
          taskId: result.taskId,
          status: result.status,
          outputVideoUrl: result.videoUrl,
          errorMessage: result.errorMessage,
        });
        return {
          taskId: result.taskId,
          status: result.status,
          videoUrl: result.videoUrl,
        };
      }),
  }),
  apiTokens: router({
    generateOpenClaw: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(256),
        expiresInDays: z.number().min(1).max(365).default(365),
      }))
      .mutation(async ({ input, ctx }) => {
        const { token, tokenPreview } = await db.generateOpenClawToken(
          ctx.user.id,
          input.name,
          input.expiresInDays
        );
        return { token, tokenPreview };
      }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const tokens = await db.getApiTokensByUserId(ctx.user.id);
      return tokens.map((t) => ({
        id: t.id,
        name: t.name,
        tokenPreview: t.tokenPreview,
        type: t.type,
        expiresAt: t.expiresAt,
        lastUsedAt: t.lastUsedAt,
        callCount: t.callCount,
        isActive: t.isActive,
        createdAt: t.createdAt,
      }));
    }),
    revoke: protectedProcedure
      .input(z.object({ tokenId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const success = await db.revokeApiToken(input.tokenId, ctx.user.id);
        return { success };
      }),
  }),
  analysisImage: analysisImageRouter,
  session: sessionRouter,
});
export type AppRouter = typeof appRouter;

