/**
 * PDF → Image conversion using pdfjs-dist + canvas
 * Replaces the pdftoppm system command which is not available in the deployment environment.
 *
 * Key: must set GlobalWorkerOptions.workerSrc to the absolute path of pdf.worker.mjs
 * BEFORE calling getDocument(). Setting it to "" or a non-existent path causes
 * "No GlobalWorkerOptions.workerSrc specified" error in pdfjs-dist v4+.
 */

import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

// Resolve the worker path at module load time (works in both dev and production)
const _require = createRequire(import.meta.url);
const WORKER_PATH = _require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

// Resolve standard fonts path to suppress font warnings
let STANDARD_FONT_DATA_URL: string | undefined;
try {
  const fontsDir = path.dirname(_require.resolve("pdfjs-dist/package.json"));
  STANDARD_FONT_DATA_URL = `file://${path.join(fontsDir, "standard_fonts")}/`;
} catch {
  // Optional - not critical
}

// Lazy-load pdfjs-dist to avoid startup overhead
let _pdfjsLib: any = null;
async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);
  // Must set workerSrc to the absolute path of the worker file
  // This must be done ONCE before any getDocument() call
  _pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_PATH;
  return _pdfjsLib;
}

export interface PdfToImagesOptions {
  /** DPI / scale factor. Default: 150dpi (scale ~2.08) */
  dpi?: number;
  /** Output format: "png" | "jpeg". Default: "png" */
  format?: "png" | "jpeg";
  /** Only convert specific pages (1-indexed). If omitted, converts all pages. */
  pages?: number[];
}

/**
 * Convert a local PDF file to images.
 * Returns an array of absolute file paths to the generated images.
 *
 * @param pdfPath  Absolute path to the input PDF file
 * @param outDir   Directory where output images will be written
 * @param prefix   Filename prefix (e.g. "slide" → "slide-1.png", "slide-2.png", ...)
 * @param options  Conversion options
 */
export async function pdfToImages(
  pdfPath: string,
  outDir: string,
  prefix: string,
  options: PdfToImagesOptions = {}
): Promise<string[]> {
  const { dpi = 150, format = "png", pages } = options;

  // pdfjs uses 72dpi as base; scale accordingly
  const scale = dpi / 72;

  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  const loadingTask = pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    ...(STANDARD_FONT_DATA_URL ? { standardFontDataUrl: STANDARD_FONT_DATA_URL } : {}),
  });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const pageNums = pages
    ? pages.filter((p) => p >= 1 && p <= totalPages)
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  // Dynamically import canvas (native Node.js canvas)
  const { createCanvas } = await import("canvas");

  // Ensure output directory exists
  fs.mkdirSync(outDir, { recursive: true });

  const outputPaths: string[] = [];

  for (const pageNum of pageNums) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const ctx = canvas.getContext("2d");

    // pdfjs-dist expects a canvas context compatible with the browser Canvas API
    await page.render({
      canvasContext: ctx as any,
      viewport,
    }).promise;

    const ext = format === "jpeg" ? "jpg" : "png";
    const outFile = path.join(outDir, `${prefix}-${pageNum}.${ext}`);

    if (format === "jpeg") {
      fs.writeFileSync(outFile, canvas.toBuffer("image/jpeg", { quality: 0.9 }));
    } else {
      fs.writeFileSync(outFile, canvas.toBuffer("image/png"));
    }

    outputPaths.push(outFile);
    page.cleanup();
  }

  return outputPaths;
}
