/**
 * compositeTextOnImage.ts
 *
 * Server-side utility: draws textBlocks onto a background image using sharp + SVG.
 * This approach is more reliable than @napi-rs/canvas for CJK text rendering
 * because sharp bundles pango/harfbuzz/fontconfig which handle Chinese characters natively.
 *
 * Used to produce a "composite" image for REST API callers who don't have the
 * frontend HTML overlay layer.
 */
import sharp from "sharp";
import { storagePut } from "./storage";

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

/** Escape XML special characters for SVG text content */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Get font-weight based on role */
function getFontWeight(role: TextBlock["role"]): string {
  switch (role) {
    case "title": return "bold";
    case "subtitle": return "600";
    default: return "normal";
  }
}

/** Get SVG text-anchor from align */
function getTextAnchor(align: TextBlock["align"]): string {
  switch (align) {
    case "center": return "middle";
    case "right": return "end";
    default: return "start";
  }
}

/** Compute x position for text based on alignment within block */
function getTextX(block: TextBlock): number {
  const padding = Math.max(2, Math.round(block.fontSize * 0.15));
  switch (block.align) {
    case "center": return block.x + block.width / 2;
    case "right": return block.x + block.width - padding;
    default: return block.x + padding;
  }
}

/**
 * Simple text wrapping: split text into lines that fit within maxWidth.
 * Estimates character width: CJK ~1.0em, Latin ~0.6em.
 */
function wrapTextToLines(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);

  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }

    let current = "";
    let currentWidth = 0;

    for (const char of para) {
      const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(char);
      const charWidth = isCJK ? fontSize : fontSize * 0.6;

      if (currentWidth + charWidth > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
        currentWidth = charWidth;
      } else {
        current += char;
        currentWidth += charWidth;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/**
 * Build an SVG overlay containing all text blocks.
 * The SVG is transparent except for the text, so it can be composited over the background.
 */
function buildSvgOverlay(
  textBlocks: TextBlock[],
  canvasWidth: number,
  canvasHeight: number
): string {
  const textElements: string[] = [];

  for (const block of textBlocks) {
    if (!block.text?.trim()) continue;

    const fontSize = Math.max(8, block.fontSize ?? 16);
    const lineHeight = fontSize * 1.35;
    const padding = Math.max(2, Math.round(fontSize * 0.15));
    const availableWidth = block.width - padding * 2;
    const fontWeight = getFontWeight(block.role);
    const textAnchor = getTextAnchor(block.align);
    const textX = getTextX(block);
    const color = escapeXml(block.color ?? "#ffffff");
    // Font family: use system CJK fonts with fallbacks
    const fontFamily = "Noto Sans CJK SC, Noto Sans SC, WenQuanYi Micro Hei, sans-serif";

    const lines = wrapTextToLines(block.text, availableWidth, fontSize);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line && i > 0) continue; // skip empty lines except first
      // SVG text y is the baseline; add fontSize to convert from top-based coords
      const lineY = block.y + padding + i * lineHeight + fontSize;

      // Stop drawing if we've exceeded the block height
      if (lineY - fontSize > block.y + block.height) break;

      textElements.push(
        `<text ` +
        `x="${textX}" ` +
        `y="${lineY}" ` +
        `font-family="${escapeXml(fontFamily)}" ` +
        `font-size="${fontSize}" ` +
        `font-weight="${fontWeight}" ` +
        `fill="${color}" ` +
        `text-anchor="${textAnchor}"` +
        `>${escapeXml(line)}</text>`
      );
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${canvasWidth}" height="${canvasHeight}" ` +
    `viewBox="0 0 ${canvasWidth} ${canvasHeight}">` +
    textElements.join("") +
    `</svg>`
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
/**
 * Downloads the background image, draws all textBlocks on top using SVG + sharp,
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
    // Download background image
    const bgResponse = await fetch(backgroundImageUrl);
    if (!bgResponse.ok) {
      throw new Error(`Failed to download background image: HTTP ${bgResponse.status}`);
    }
    const bgBuffer = Buffer.from(await bgResponse.arrayBuffer());

    // Get actual image dimensions from the downloaded image
    const bgMeta = await sharp(bgBuffer).metadata();
    const actualWidth = bgMeta.width ?? imageWidth;
    const actualHeight = bgMeta.height ?? imageHeight;

    // Scale text block coordinates if actual image size differs from expected
    const scaleX = actualWidth / imageWidth;
    const scaleY = actualHeight / imageHeight;

    const scaledBlocks: TextBlock[] = textBlocks.map(block => ({
      ...block,
      x: Math.round(block.x * scaleX),
      y: Math.round(block.y * scaleY),
      width: Math.round(block.width * scaleX),
      height: Math.round(block.height * scaleY),
      fontSize: Math.round(block.fontSize * Math.min(scaleX, scaleY)),
    }));

    // Build SVG overlay
    const svgOverlay = buildSvgOverlay(scaledBlocks, actualWidth, actualHeight);
    const svgBuffer = Buffer.from(svgOverlay, "utf-8");

    // Composite SVG text over background image using sharp
    const resultBuffer = await sharp(bgBuffer)
      .composite([{
        input: svgBuffer,
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer();

    // Upload to S3
    const suffix = Math.random().toString(36).slice(2, 8);
    const key = `${outputKeyPrefix ?? "graphic-layout/composite"}-${suffix}.png`;
    const { url } = await storagePut(key, resultBuffer, "image/png");

    console.log(`[compositeText] Successfully composited ${textBlocks.length} text blocks onto image (${actualWidth}x${actualHeight})`);
    return url;
  } catch (err) {
    console.error("[compositeText] Failed to composite text on image:", err);
    return null;
  }
}
