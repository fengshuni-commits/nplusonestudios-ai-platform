/**
 * compositeTextOnImage.ts
 *
 * Server-side utility: draws textBlocks onto a background image using @napi-rs/canvas.
 * Used to produce a "composite" image for REST API callers who don't have the
 * frontend HTML overlay layer.
 *
 * Chinese characters are rendered using Noto Sans CJK SC (pre-installed on the server).
 */

import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";
import { storagePut } from "./storage";

// Resolve the fonts directory bundled alongside this module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "assets", "fonts");

// ── Font registration (idempotent) ──────────────────────────────────────────

let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  // Try bundled fonts first (works in both dev sandbox and CloudRun container)
  const candidates = [
    { path: path.join(FONTS_DIR, "NotoSansCJKsc-Regular.otf"), family: "NotoSansCJKsc" },
    { path: path.join(FONTS_DIR, "NotoSansCJKsc-Bold.otf"), family: "NotoSansCJKsc-Bold" },
    { path: path.join(FONTS_DIR, "NotoSansCJKsc-Medium.otf"), family: "NotoSansCJKsc-Medium" },
  ];
  // Fallback: system font path (dev sandbox)
  const systemDir = "/usr/share/fonts/opentype/noto";
  const fallbacks = [
    { path: path.join(systemDir, "NotoSansCJKsc-Regular.otf"), family: "NotoSansCJKsc" },
    { path: path.join(systemDir, "NotoSansCJKsc-Bold.otf"), family: "NotoSansCJKsc-Bold" },
    { path: path.join(systemDir, "NotoSansCJKsc-Medium.otf"), family: "NotoSansCJKsc-Medium" },
  ];
  let registered = 0;
  for (let i = 0; i < candidates.length; i++) {
    const sources = [candidates[i], fallbacks[i]];
    for (const src of sources) {
      try {
        GlobalFonts.registerFromPath(src.path, src.family);
        console.log(`[compositeText] Registered font: ${src.family} from ${src.path}`);
        registered++;
        break;
      } catch (_) {
        // try next source
      }
    }
  }
  if (registered > 0) {
    fontsRegistered = true;
    console.log(`[compositeText] ${registered}/3 fonts registered successfully`);
  } else {
    console.warn("[compositeText] WARNING: No CJK fonts registered — Chinese text will not render");
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TextBlock {
  id: string;
  role: "title" | "subtitle" | "body" | "caption" | "label";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
}

export interface CompositeOptions {
  /** URL of the AI-generated background image */
  backgroundImageUrl: string;
  /** Text blocks to draw on top */
  textBlocks: TextBlock[];
  /** Canvas dimensions (should match the image) */
  imageWidth: number;
  imageHeight: number;
  /** S3 key prefix for the output file */
  outputKeyPrefix?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pick font family and weight based on role */
function getFontSpec(role: TextBlock["role"], fontSize: number): string {
  // Use the font's embedded family name "Noto Sans CJK SC" which is what @napi-rs/canvas
  // actually registers regardless of the alias we pass to registerFromPath.
  switch (role) {
    case "title":
      return `bold ${fontSize}px "Noto Sans CJK SC"`;
    case "subtitle":
      return `600 ${fontSize}px "Noto Sans CJK SC"`;
    default:
      return `${fontSize}px "Noto Sans CJK SC"`;
  }
}

/** Wrap text into lines that fit within maxWidth */
function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number
): string[] {
  // Split on explicit newlines first
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    // For CJK text, try character-by-character wrapping
    let current = "";
    for (const char of para) {
      const test = current + char;
      if (ctx.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Downloads the background image, draws all textBlocks on top,
 * uploads the result to S3, and returns the public URL.
 *
 * Returns null if compositing fails (caller should fall back to original imageUrl).
 */
export async function compositeTextOnImage(
  options: CompositeOptions
): Promise<string | null> {
  const { backgroundImageUrl, textBlocks, imageWidth, imageHeight, outputKeyPrefix } = options;

  if (!textBlocks || textBlocks.length === 0) {
    // Nothing to composite — return null so caller uses original
    return null;
  }

  try {
    ensureFonts();

    // Load background image from URL
    const bgImage = await loadImage(backgroundImageUrl);

    // Create canvas at the original image resolution
    const canvas = createCanvas(imageWidth, imageHeight);
    const ctx = canvas.getContext("2d");

    // Draw background
    ctx.drawImage(bgImage, 0, 0, imageWidth, imageHeight);

    // Draw each text block
    for (const block of textBlocks) {
      if (!block.text?.trim()) continue;

      const fontSize = Math.max(8, block.fontSize ?? 16);
      ctx.font = getFontSpec(block.role, fontSize);
      ctx.fillStyle = block.color ?? "#ffffff";
      ctx.textBaseline = "top";

      const lineHeight = fontSize * 1.35;
      const padding = Math.max(2, Math.round(fontSize * 0.15));
      const availableWidth = block.width - padding * 2;

      const lines = wrapText(ctx, block.text, availableWidth);

      // Align: compute x offset per line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineY = block.y + padding + i * lineHeight;

        // Stop drawing if we've exceeded the block height
        if (lineY + lineHeight > block.y + block.height) break;

        let lineX: number;
        if (block.align === "center") {
          const lineW = ctx.measureText(line).width;
          lineX = block.x + padding + (availableWidth - lineW) / 2;
        } else if (block.align === "right") {
          const lineW = ctx.measureText(line).width;
          lineX = block.x + block.width - padding - lineW;
        } else {
          lineX = block.x + padding;
        }

        ctx.fillText(line, lineX, lineY);
      }
    }

    // Export to PNG buffer
    const pngBuffer = canvas.toBuffer("image/png");

    // Upload to S3
    const suffix = Math.random().toString(36).slice(2, 8);
    const key = `${outputKeyPrefix ?? "graphic-layout/composite"}-${suffix}.png`;
    const { url } = await storagePut(key, pngBuffer, "image/png");

    return url;
  } catch (err) {
    console.error("[compositeText] Failed to composite text on image:", err);
    return null;
  }
}
