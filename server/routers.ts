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
import { generateVideoWithTool, queryVideoTaskStatus } from "./_core/generateVideoWithTool";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { compositeMaskOnImage, cropToAspectRatio } from "./imageProcessor";
import { submitEnhanceTask, getEnhanceTaskStatus, downloadAndStoreEnhancedImage } from "./magnific";
import { nanoid } from "nanoid";
import { searchCaseStudies } from "./tavily";
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

// ─── PPT Job Store (in-memory async queue) ──────────────
type PptJob =
  | { status: "processing"; progress: number; stage: string }
  | { status: "done"; url: string; title: string; slideCount: number; imageCount: number }
  | { status: "failed"; error: string };

const pptJobStore = new Map<string, PptJob>();

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
      // 权限检查：仅项目创建者和任务负责人可修改状态
      const task = await db.getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const project = await db.getProjectById(task.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.createdBy !== ctx.user.id && task.assigneeId !== ctx.user.id) {
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
      const project = await db.getProjectById(task.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const isCreator = project.createdBy === ctx.user.id;
      const isAssignee = task.assigneeId === ctx.user.id;
      const isReviewer = task.reviewerId === ctx.user.id;
      if (!isCreator && !isAssignee && !isReviewer) {
        throw new TRPCError({ code: "FORBIDDEN", message: "你没有权限修改任务" });
      }
      // Assignees can only update progress/progressNote, not status or other fields
      if (isAssignee && !isCreator) {
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
      await drizzleDb.update(tasks).set({
        approval: true,
        status: 'done',
        updatedAt: new Date(),
      }).where(eq(tasks.id, input.id));
      return { success: true };
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
      const key = `project-docs/${input.projectId}/${nanoid()}-${input.fileName}`;
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
      return sanitized.filter((t: any) => {
        if (input.capability) {
          const caps: string[] = Array.isArray(t.capabilities) ? t.capabilities : [];
          return caps.includes(input.capability);
        }
        return t.category === input.category;
      });
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
      // 如果有 accessKeyId，更新 configJson
      if (accessKeyId !== undefined) {
        updateData.configJson = { ...(data.configJson || {}), accessKeyId };
      }
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
            return `你是 N+1 STUDIOS 的建筑设计对标调研专家。用户对已生成的对标调研报告有修改意见，请根据反馈对报告进行调整和优化。

**当前日期**：${dateStr2}（北京时间）。报告中如需标注日期，请使用此日期。${caseRefsSection}

**要求**：
- 保持报告的整体结构和专业性
- 根据用户反馈精确修改相应部分
- 不要改动用户没有提到的内容
- 严格使用上方提供的案例链接，不得自行编造或替换任何 URL
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

    // === Phase 1: Generate case study names only ===
    const phase1Response = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: `你是 N+1 STUDIOS 的建筑设计对标调研专家。请根据用户提供的项目信息，列出 ${input.referenceCount || 5} 个最相关的对标案例名称。

**要求**：
- 只返回案例名称列表，每行一个，无需其他内容
- 案例必须是真实存在的建筑项目，优先选择在 ArchDaily、谷德设计等主流建筑媒体上有详细介绍的项目
- 案例名称必须是项目的真实英文或中文名称，例如"Apple Park"、"腾讯滨海大厦"、"华为松山湖研发中心"，不要使用描述性短语
- 优先选择知名度高、在建筑媒体上有大量报道的项目，确保 Tavily 搜索能找到真实链接
- 不要包含任何链接或额外说明

直接输出案例名称列表，每行一个。`
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

    // === Phase 2: Search real URLs for each case using Tavily ===
    const caseUrlMap = await searchCaseStudies(caseNames, input.projectType);
    console.log(`[Benchmark] Phase 2 done: searched URLs for ${Object.keys(caseUrlMap).length} cases (projectType: ${input.projectType})`);

    // Persist caseUrlMap so refine can reuse the same verified URLs
    await db.updateBenchmarkJob(jobId, { caseRefs: caseUrlMap });

    // Build case reference context with real URLs
    const caseRefs = caseNames.map(name => {
      const url = caseUrlMap[name];
      return url ? `- ${name}: ${url}` : `- ${name}: (URL 未找到)`;
    }).join('\n');

    // === Phase 3: Generate full report with real URLs ===
    const response = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: (() => {
            const bjDate = new Date(Date.now() + 8 * 3600 * 1000);
            const [y, m, d] = bjDate.toISOString().slice(0, 10).split('-');
            const dateStr = `${y}年${m}月${d}日`;
            return `你是 N+1 STUDIOS 的建筑设计对标调研专家。请根据用户提供的项目信息和以下对标案例列表，生成一份专业的对标调研报告。

**当前日期**：${dateStr}（北京时间）。报告中如需标注日期，请使用此日期。

**对标案例及真实链接**：
${caseRefs}

**重要要求**：
- 严格使用上面提供的案例名称和链接，不要自行编造 URL
- 如果某个案例标注了“URL 未找到”，则展示案例信息时不要添加链接
- 每个案例标题后用 Markdown 链接标注来源，例如 [来源](https://www.archdaily.com/xxx)

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

请以 Markdown 格式输出，结构清晰，内容专业。`;
          })()
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
        return { status: "done" as const, progress: 100, stage: "done" as const, url: job.url, title: job.title, slideCount: job.slideCount, imageCount: job.imageCount };
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

// ─── AI Module: Rendering / Sketch ───────────────────────

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
    maskImageData?: string;
    aspectRatio?: string;
    resolution?: string;
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
    if (input.materialImageUrl) originalImages.push({ url: input.materialImageUrl, mimeType: "image/png" });
    if (styleRefImageUrl) originalImages.push({ url: styleRefImageUrl, mimeType: "image/png" });
    if (originalImages.length > 0) genOpts.originalImages = originalImages;
    if (imageSize) genOpts.size = imageSize;

    const result = await generateImageWithTool({ ...genOpts, toolId: input.toolId });

    await db.createAiToolLog({
      toolId: input.toolId || 0,
      userId,
      action: "rendering_generate",
      inputSummary: fullPrompt.substring(0, 200),
      outputSummary: result.url || "",
      status: "success",
      durationMs: Date.now() - startTime,
    });

    const historyResult = await db.createGenerationHistory({
      userId,
      module: "ai_render",
      title: input.referenceImageUrl
        ? (input.maskImageData ? `局部重绘 - ${input.prompt.substring(0, 40)}` : `图生图 - ${input.prompt.substring(0, 40)}`)
        : `AI 渲染 - ${input.prompt.substring(0, 40)}`,
      summary: fullPrompt.substring(0, 200),
      inputParams: {
        prompt: input.prompt,
        style: input.style,
        referenceImageUrl: input.referenceImageUrl || null,
        materialImageUrl: input.materialImageUrl || null,
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
      maskImageData: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Async mode: create job immediately and return jobId
      const jobId = nanoid();
      await db.createRenderingJob({
        id: jobId,
        userId: ctx.user.id,
        inputParams: input as Record<string, unknown>,
      });
      // Fire-and-forget background generation
      generateRenderingInBackground(jobId, input, ctx.user.id, ctx.user.name || null).catch(err => {
        console.error("[Rendering] Unhandled error:", err);
      });
      return { jobId };
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

  /** Generate a colorized floor plan from a base floor plan + optional reference image */
  generate: protectedProcedure
    .input(z.object({
      floorPlanUrl: z.string().url(),
      referenceUrl: z.string().url().optional(),
      style: z.string().optional(),
      extraPrompt: z.string().optional(),
      projectId: z.number().optional(),
      parentHistoryId: z.number().optional(),
      toolId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();

      // Resolve tool name for modelName annotation
      let resolvedModelName = "内置图像生成";
      if (input.toolId) {
        try {
          const tool = await db.getAiToolById(input.toolId);
          if (tool?.name) resolvedModelName = tool.name;
        } catch { /* ignore */ }
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

      let prompt =
        `Architectural colored floor plan. ` +
        `Transform the provided black-and-white or line-drawing floor plan into a richly colored architectural floor plan. ` +
        `Apply realistic material textures and colors: warm wood flooring for living and dining areas, ` +
        `light tile or stone for bathrooms and kitchens, soft carpet or parquet for bedrooms, ` +
        `green indoor plants, furniture with drop shadows for depth. ` +
        `Maintain the exact spatial layout, room boundaries, walls, doors, and windows from the original floor plan. ` +
        `Clean top-down orthographic view. High quality architectural presentation style.`;

      if (input.style) prompt += ` Style: ${input.style}.`;
      if (input.extraPrompt) prompt += ` ${input.extraPrompt}`;

      const originalImages: Array<{ url?: string; mimeType?: string }> = [
        { url: input.floorPlanUrl, mimeType: "image/png" },
      ];
      if (input.referenceUrl) {
        originalImages.push({ url: input.referenceUrl, mimeType: "image/png" });
        prompt =
          `[STYLE REFERENCE: The second image shows the target color style and material palette. ` +
          `Apply the same color scheme and material textures to the floor plan.] ` + prompt;
      }

      try {
        const result = await generateImageWithTool({ prompt, originalImages, toolId: input.toolId });

        const historyResult = await db.createGenerationHistory({
          userId: ctx.user.id,
          module: "color_plan",
          title: `AI 彩平 - ${new Date().toLocaleDateString("zh-CN")}`,
          summary: prompt.substring(0, 200),
          inputParams: {
            floorPlanUrl: input.floorPlanUrl,
            referenceUrl: input.referenceUrl || null,
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

        // Log tool usage
        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "color_plan_generate",
          inputSummary: prompt.substring(0, 200),
          outputSummary: result.url || "",
          status: "success",
          durationMs: Date.now() - startTime,
        }).catch(() => {});

        return { url: result.url, historyId: historyResult.id };
      } catch (error) {
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "彩平生成失败，请稍后重试" });
      }
    }),
});

// ─── AI Module: Meeting Minutes ──────────────────────

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
      meetingTitle: z.string().optional(),
      meetingLocation: z.string().optional(),
      meetingAttendees: z.string().optional(),
      toolId: z.number().optional(),
      projectId: z.number().optional(),
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
        }, ctx.user.id);

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

        return { content, generatedAt: new Date().toISOString(), historyId: historyResult.id };
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
          outputContent: typeof textContent === 'string' ? textContent : null,
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
      // ai_video items use offset id (>1000000); resolve to videoHistory
      if (input.id > 1000000) {
        const realId = input.id - 1000000;
        const v = await db.getVideoHistoryById(realId, ctx.user.id);
        if (!v) return null;
        return {
          id: v.id + 1000000,
          userId: v.userId,
          projectId: v.projectId || null,
          module: "ai_video" as const,
          title: (v.prompt || "").slice(0, 60) || "AI 视频",
          inputText: v.prompt || "",
          inputImageUrl: v.inputImageUrl || null,
          outputUrl: v.outputVideoUrl || null,
          outputText: null,
          outputContent: null,
          summary: null,
          inputParams: null,
          status: v.status,
          errorMessage: v.errorMessage || null,
          metadata: { ...(typeof v.metadata === 'object' && v.metadata ? v.metadata : {}), taskId: v.taskId, mode: v.mode, duration: v.duration, videoHistoryId: v.id },
          parentId: null,
          enhancedImageUrl: null,
          chainLength: 1,
          latestOutputUrl: v.outputVideoUrl || null,
          latestTitle: (v.prompt || "").slice(0, 60) || "AI 视频",
          latestEnhancedImageUrl: null,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        };
      }
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
      await db.deleteGenerationHistory(input.id, ctx.user.id, isAdmin);
      return { success: true };
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
  input: { title: string; content: string; imageUrls?: string[] },
  userId?: number
) {
  try {
    presentationJobStore.set(jobId, { status: "processing", progress: 10, stage: "structuring" });

    // Build image context string for LLM
    const imageContext = input.imageUrls && input.imageUrls.length > 0
      ? `\n\n用户提供了 ${input.imageUrls.length} 张项目图片，请在合适的幻灯片中引用它们（用 userImage:0, userImage:1 等占位符标注在 pexelsQuery 字段中，以便后续处理）。`
      : "";

    const structureResponse = await invokeLLMWithUserTool({
      messages: [
        {
          role: "system",
          content: `你是 N+1 STUDIOS 的建筑设计演示文稿制作专家。请根据用户提供的演示内容，生成约 10-15 页的 PPT 结构。

页面结构要求：
- 第 1 页：封面（layout: cover），包含演示标题和副标题
- 第 2 页：目录（layout: toc），列出主要章节
- 中间页：内容页（layout: section_intro / case_study / insight），每页聚焦一个主题
- 最后 1 页：总结（layout: summary）

每页字段说明：
- title: 页面标题
- subtitle: 副标题或简短说明（可为空字符串）
- bullets: 要点列表（每页 3-5 条，简洁精炼）
- sourceName: 内容来源（可为空字符串）
- pexelsQuery: 英文图片搜索关键词（描述建筑/空间视觉特征，如 "modern office interior minimalist design"）；如用户提供了图片，对应页面用 userImage:N 格式
- layout: cover / toc / section_intro / case_study / insight / summary

重要：
- pexelsQuery 必须是英文，且要具体描述建筑/空间的视觉特征
- 每页要点精炼，不超过 5 条
- 内容忠实于用户提供的资料，不要编造${imageContext}`,
        },
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

    // Stage 2: Fetch images
    presentationJobStore.set(jobId, { status: "processing", progress: 25, stage: "generating_images" });
    const imageBase64Map: Map<number, { data: string; ext: string }> = new Map();

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

    const C = {
      charcoal: "1A1A2E", slate: "2D2D3F", warmGray: "F5F0EB", cream: "FAF8F5",
      copper: "B87333", copperLight: "D4956B", copperDark: "8B5E3C",
      text: "2C2C2C", textLight: "6B6560", textOnDark: "E8E4DF",
      white: "FFFFFF", divider: "D4CFC8", tagBg: "EDE8E2",
    };
    const F = { title: "Microsoft YaHei", body: "Microsoft YaHei" };
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

    presentationJobStore.set(jobId, {
      status: "done",
      url,
      title: input.title,
      slideCount: slideData.slides.length,
      imageCount: imageBase64Map.size,
    });
    console.log(`[Presentation] Job ${jobId} completed: ${slideData.slides.length} slides, ${imageBase64Map.size} images`);

    if (userId) {
      await db.createGenerationHistory({
        userId,
        module: "presentation",
        title: `${input.title} - 演示文稿`,
        summary: `${slideData.slides.length} 页幻灯片，${imageBase64Map.size} 张配图`,
        outputUrl: url,
        status: "success",
        durationMs: Date.now() - presStartTime,
      }).catch(() => {});
    }

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
    }))
    .mutation(async ({ ctx, input }) => {
      const jobId = `pres_${nanoid()}`;
      presentationJobStore.set(jobId, { status: "processing", progress: 5, stage: "structuring" });
      generatePresentationInBackground(jobId, input, ctx.user.id).catch(err => {
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
        return { status: "done" as const, progress: 100, stage: "done" as const, url: job.url, title: job.title, slideCount: job.slideCount, imageCount: job.imageCount };
      }
      if (job.status === "failed") {
        setTimeout(() => presentationJobStore.delete(input.jobId), 60 * 1000);
        return { status: "failed" as const, progress: 0, stage: "" as const, error: job.error };
      }
      return { status: "processing" as const, progress: job.progress || 0, stage: job.stage || "structuring" };
    }),
});

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

        await db.db.insert(db.videoHistory).values({
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
              await db.updateVideoHistory(record.id, {
                status: apiStatus.status,
                outputVideoUrl: permanentVideoUrl,
                errorMessage: apiStatus.errorMessage,
              });
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
});

export type AppRouter = typeof appRouter;
