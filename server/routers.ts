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

    const structureResponse = await invokeLLM({
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
    });

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
    pptx.title = `${input.title} - 对标调研报告`;
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
        s.addText(sd.subtitle || "对标调研报告", {
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

        // Record in generation history
        const historyResult = await db.createGenerationHistory({
          userId: ctx.user.id,
          module: "benchmark_report",
          title: `${input.projectName} - 对标调研报告`,
          summary: `${input.projectType} | ${input.requirements?.substring(0, 100) || ''}`,
          inputParams: { projectName: input.projectName, projectType: input.projectType, requirements: input.requirements },
          status: "success",
          durationMs: Date.now() - startTime,
        }).catch(() => ({ id: 0 }));

        return { content, generatedAt: new Date().toISOString(), historyId: historyResult.id };
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

const renderingRouter = router({
  generate: protectedProcedure
    .input(z.object({
      prompt: z.string().min(1),
      style: z.string().optional(),
      toolId: z.number().optional(),
      referenceImageUrl: z.string().url().optional(),
      parentHistoryId: z.number().optional(),
      materialImageUrl: z.string().url().optional(),
      maskImageData: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();

      // Build prompt with style and aspect ratio instruction
      let fullPrompt = input.prompt;
      if (input.style) fullPrompt += `, style: ${input.style}`;

      // Strongly enforce aspect ratio in prompt for better compliance
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

      // Calculate image size from aspect ratio and resolution
      const resolutionMap: Record<string, number> = {
        standard: 1024,
        hd: 1536,
        ultra: 2048,
      };
      const baseSize = resolutionMap[input.resolution || "standard"] || 1024;

      const aspectRatioMap: Record<string, [number, number]> = {
        "1:1": [1, 1],
        "4:3": [4, 3],
        "3:2": [3, 2],
        "16:9": [16, 9],
        "9:16": [9, 16],
        "3:4": [3, 4],
      };

      let imageSize: string | undefined;
      const ratioEntry = input.aspectRatio ? aspectRatioMap[input.aspectRatio] : undefined;
      if (ratioEntry) {
        const [rw, rh] = ratioEntry;
        const ratio = rw / rh;
        let w: number, h: number;
        if (ratio >= 1) {
          w = baseSize;
          h = Math.round(baseSize / ratio);
        } else {
          h = baseSize;
          w = Math.round(baseSize * ratio);
        }
        // Round to nearest 64 for model compatibility
        w = Math.round(w / 64) * 64;
        h = Math.round(h / 64) * 64;
        imageSize = `${w}x${h}`;
      } else if (input.resolution && input.resolution !== "standard") {
        imageSize = `${baseSize}x${baseSize}`;
      }

      try {
        const genOpts: Parameters<typeof generateImage>[0] = { prompt: fullPrompt };

        // Collect original images: reference + optional material
        const originalImages: Array<{ url?: string; b64Json?: string; mimeType?: string }> = [];
        if (input.referenceImageUrl) {
          originalImages.push({ url: input.referenceImageUrl, mimeType: "image/png" });
        }
        if (input.materialImageUrl) {
          originalImages.push({ url: input.materialImageUrl, mimeType: "image/png" });
        }
        // If mask data is provided, include it as a base64 image
        if (input.maskImageData) {
          const maskBase64 = input.maskImageData.replace(/^data:image\/\w+;base64,/, "");
          originalImages.push({ b64Json: maskBase64, mimeType: "image/png" });
        }
        if (originalImages.length > 0) {
          genOpts.originalImages = originalImages;
        }

        // Only pass size for pure text-to-image (no reference image).
        // When editing an existing image, the API may add black bars to
        // pad the reference to the target size, so we rely on the prompt
        // to guide the aspect ratio instead.
        if (imageSize && !input.referenceImageUrl) {
          genOpts.size = imageSize;
        }

        const result = await generateImage(genOpts);

        await db.createAiToolLog({
          toolId: input.toolId || 0,
          userId: ctx.user.id,
          action: "rendering_generate",
          inputSummary: fullPrompt.substring(0, 200),
          outputSummary: result.url || "",
          status: "success",
          durationMs: Date.now() - startTime,
        });

        // Record in generation history with edit chain support
        const historyResult = await db.createGenerationHistory({
          userId: ctx.user.id,
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
        }).catch(() => ({ id: 0 }));

        return { url: result.url, prompt: fullPrompt, historyId: historyResult.id };
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

        // Record in generation history
        const historyResult = await db.createGenerationHistory({
          userId: ctx.user.id,
          module: "meeting_minutes",
          title: `${input.projectName || "会议"} - 会议纪要`,
          summary: `${input.meetingDate || "今日"} | ${content.substring(0, 100)}`,
          inputParams: { projectName: input.projectName, meetingDate: input.meetingDate },
          status: "success",
          durationMs: Date.now() - startTime,
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

        const llmResponse = await invokeLLM({
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
        });

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
          status: "success",
          durationMs: Date.now() - startTime,
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
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return db.listGroupedHistory(ctx.user.id, {
        module: input?.module,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
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
  media: mediaRouter,
  history: historyRouter,
  feedback: feedbackRouter,
});

export type AppRouter = typeof appRouter;
