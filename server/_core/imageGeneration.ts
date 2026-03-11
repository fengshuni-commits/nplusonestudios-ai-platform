/**
 * Image generation helper using internal ImageService
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { storagePut } from "server/storage";
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  size?: string; // e.g. "1024x1024", "1536x1024", "1024x1536"
};

export type GenerateImageResponse = {
  url?: string;
};

/**
 * Post-process the generated image to enforce the target aspect ratio.
 * If the API ignores the size parameter, we crop the result to match.
 */
async function enforceAspectRatio(
  buffer: Buffer,
  targetSize: string
): Promise<Buffer> {
  const [targetW, targetH] = targetSize.split("x").map(Number);
  if (!targetW || !targetH) return buffer;

  const targetRatio = targetW / targetH;

  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();
    const actualW = metadata.width || 0;
    const actualH = metadata.height || 0;
    if (!actualW || !actualH) return buffer;

    const actualRatio = actualW / actualH;
    // If ratio is already close enough (within 5%), no need to crop
    if (Math.abs(actualRatio - targetRatio) / targetRatio < 0.05) {
      return buffer;
    }

    // Center-crop to target ratio
    let cropW: number, cropH: number;
    if (actualRatio > targetRatio) {
      // Image is wider than target — crop width
      cropH = actualH;
      cropW = Math.round(actualH * targetRatio);
    } else {
      // Image is taller than target — crop height
      cropW = actualW;
      cropH = Math.round(actualW / targetRatio);
    }

    const left = Math.round((actualW - cropW) / 2);
    const top = Math.round((actualH - cropH) / 2);

    const cropped = await sharp(buffer)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(targetW, targetH, { fit: "fill" })
      .png()
      .toBuffer();

    return cropped;
  } catch (err) {
    console.error("enforceAspectRatio failed, returning original:", err);
    return buffer;
  }
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  // Build the full URL by appending the service path to the base URL
  const baseUrl = ENV.forgeApiUrl.endsWith("/")
    ? ENV.forgeApiUrl
    : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/GenerateImage",
    baseUrl
  ).toString();

  // Build request body with size parameter in multiple formats for compatibility
  const body: Record<string, any> = {
    prompt: options.prompt,
    original_images: options.originalImages || [],
  };

  if (options.size) {
    // Send size in multiple formats to maximize compatibility
    body.size = options.size; // "1024x768" format
    // Also parse into width/height for APIs that use separate fields
    const [w, h] = options.size.split("x").map(Number);
    if (w && h) {
      body.width = w;
      body.height = h;
      body.image_size = options.size;
    }
  }

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    image: {
      b64Json: string;
      mimeType: string;
    };
  };
  const base64Data = result.image.b64Json;
  let buffer: Buffer = Buffer.from(base64Data, "base64");

  // Post-process: enforce target aspect ratio if the API ignored the size parameter
  if (options.size) {
    buffer = await enforceAspectRatio(buffer, options.size) as Buffer;
  }

  // Save to S3
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    result.image.mimeType
  );
  return {
    url,
  };
}
