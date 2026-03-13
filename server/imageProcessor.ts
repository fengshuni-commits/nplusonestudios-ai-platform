/**
 * Server-side image processing utilities for inpainting and aspect ratio.
 * Uses sharp for image manipulation.
 */

/**
 * Composite a mask onto the original image to create an inpainting reference.
 * The mask (white = edit area, black = keep) is overlaid as a semi-transparent
 * red highlight so the AI model can visually understand which region to modify.
 *
 * @param originalImageUrl - URL of the original image
 * @param maskBase64 - Base64 encoded PNG mask (black/white)
 * @returns Base64 encoded composite image (PNG)
 */
export async function compositeMaskOnImage(
  originalImageUrl: string,
  maskBase64: string
): Promise<{ b64: string; mimeType: string }> {
  // Dynamically import sharp
  const sharp = (await import("sharp")).default;

  // Fetch original image
  const imgResponse = await fetch(originalImageUrl);
  if (!imgResponse.ok) throw new Error("Failed to fetch original image for mask composite");
  const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

  // Get original image metadata
  const originalMeta = await sharp(imgBuffer).metadata();
  const width = originalMeta.width || 1024;
  const height = originalMeta.height || 1024;

  // Decode mask from base64
  const maskBuffer = Buffer.from(maskBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");

  // Resize mask to match original image dimensions
  const resizedMask = await sharp(maskBuffer)
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();

  // Create a red overlay where mask is white (edit area)
  // RGBA: red channel with alpha based on mask brightness
  const overlayPixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // resizedMask is raw RGBA or grayscale; handle both
    const maskVal = resizedMask[i * (resizedMask.length / (width * height) >= 4 ? 4 : 1)] || 0;
    const alpha = maskVal > 128 ? 100 : 0; // Semi-transparent red for edit areas
    overlayPixels[i * 4] = 255;     // R
    overlayPixels[i * 4 + 1] = 60;  // G
    overlayPixels[i * 4 + 2] = 60;  // B
    overlayPixels[i * 4 + 3] = alpha; // A
  }

  const overlay = await sharp(overlayPixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  // Composite: original + red overlay
  const composite = await sharp(imgBuffer)
    .composite([{ input: overlay, blend: "over" }])
    .png()
    .toBuffer();

  return {
    b64: composite.toString("base64"),
    mimeType: "image/png",
  };
}

/**
 * Crop/resize an image to a target aspect ratio (center crop).
 * Returns the processed image as a URL after uploading to S3.
 *
 * @param imageUrl - URL of the source image
 * @param targetRatio - Target width/height ratio (e.g., 16/9)
 * @returns Buffer of the cropped image
 */
export async function cropToAspectRatio(
  imageUrl: string,
  targetRatio: number
): Promise<{ buffer: Buffer; mimeType: string }> {
  const sharp = (await import("sharp")).default;

  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error("Failed to fetch image for cropping");
  const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());

  const meta = await sharp(imgBuffer).metadata();
  const srcW = meta.width || 1024;
  const srcH = meta.height || 1024;
  const srcRatio = srcW / srcH;

  let cropW: number, cropH: number, left: number, top: number;

  if (srcRatio > targetRatio) {
    // Source is wider than target → crop width
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    left = Math.round((srcW - cropW) / 2);
    top = 0;
  } else {
    // Source is taller than target → crop height
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    left = 0;
    top = Math.round((srcH - cropH) / 2);
  }

  const cropped = await sharp(imgBuffer)
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toBuffer();

  return { buffer: cropped, mimeType: "image/png" };
}
