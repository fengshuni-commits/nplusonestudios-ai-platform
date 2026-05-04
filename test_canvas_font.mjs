import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { writeFileSync } from "fs";
import path from "path";

const fontsDir = "/home/ubuntu/nplus1_ai_platform/server/assets/fonts";

// Register fonts exactly as compositeTextOnImage does
const fontFiles = [
  ["NotoSansCJKsc-Regular.otf", "Noto Sans CJK SC"],
  ["NotoSansCJKsc-Bold.otf", "Noto Sans CJK SC"],
  ["NotoSansCJKsc-Medium.otf", "Noto Sans CJK SC"],
];

for (const [file, family] of fontFiles) {
  const fp = path.join(fontsDir, file);
  try {
    GlobalFonts.registerFromPath(fp, family);
    console.log("Registered:", family, "from", fp);
  } catch (e) {
    console.error("Failed to register:", file, e.message);
  }
}

console.log("All registered families:", GlobalFonts.families);

// Test 1: Draw Chinese text with bold
const canvas = createCanvas(800, 200);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, 800, 200);

ctx.font = 'bold 64px "Noto Sans CJK SC"';
ctx.fillStyle = "#333333";
ctx.fillText("AP2402 铝型材展示推柜", 20, 80);

ctx.font = '32px "Noto Sans CJK SC"';
ctx.fillStyle = "#666666";
ctx.fillText("副标题文字 Subtitle Text", 20, 140);

const buf = canvas.toBuffer("image/png");
writeFileSync("/home/ubuntu/test_canvas_output.png", buf);
console.log("Test image written, size:", buf.length, "bytes");

// Check if text was actually drawn by sampling pixels
const { loadImage } = await import("@napi-rs/canvas");
const img = await loadImage("/home/ubuntu/test_canvas_output.png");
const canvas2 = createCanvas(img.width, img.height);
const ctx2 = canvas2.getContext("2d");
ctx2.drawImage(img, 0, 0);
const pixel = ctx2.getImageData(50, 60, 1, 1).data;
console.log("Pixel at (50,60) - should be dark if text rendered:", pixel[0], pixel[1], pixel[2]);
const bgPixel = ctx2.getImageData(700, 180, 1, 1).data;
console.log("Background pixel at (700,180) - should be white (255,255,255):", bgPixel[0], bgPixel[1], bgPixel[2]);
