/**
 * generateImageWithTool
 *
 * When a toolId is provided and the tool has a configured external API
 * (apiEndpoint + apiKeyEncrypted), this helper calls that external API
 * instead of the built-in Forge API.
 *
 * Currently supports:
 *   - provider: "gemini" → Google Generative Language API (Nano Banana / Imagen)
 *   - fallback → built-in generateImage()
 */

import { getAiToolById } from "server/db";
import { decryptApiKey } from "./crypto";
import { storagePut } from "server/storage";
import { generateImage, type GenerateImageOptions } from "./imageGeneration";

export type GenerateWithToolOptions = GenerateImageOptions & {
  toolId?: number | null;
};

/**
 * Call the Gemini generateContent API for image generation.
 * Returns the generated image as a Buffer.
 */
async function callGeminiImageApi(opts: {
  apiKey: string;
  modelName: string;
  baseUrl: string;
  prompt: string;
  referenceImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }>;
  imageSize?: string;
  aspectRatio?: string;
}): Promise<Buffer> {
  const { apiKey, modelName, baseUrl, prompt, referenceImages, imageSize, aspectRatio } = opts;

  // Build the request URL
  const url = `${baseUrl.replace(/\/$/, "")}/models/${modelName}:generateContent?key=${apiKey}`;

  // Build contents array
  const parts: any[] = [{ text: prompt }];

  // Add reference images if provided
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      if (img.b64Json) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || "image/jpeg",
            data: img.b64Json,
          },
        });
      } else if (img.url) {
        // Fetch the image and convert to base64
        const imgResp = await fetch(img.url);
        if (imgResp.ok) {
          const imgBuf = await imgResp.arrayBuffer();
          const b64 = Buffer.from(imgBuf).toString("base64");
          const mimeType = imgResp.headers.get("content-type") || img.mimeType || "image/jpeg";
          parts.push({
            inlineData: {
              mimeType,
              data: b64,
            },
          });
        }
      }
    }
  }

  // Build generation config
  const imageConfig: Record<string, string> = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (imageSize) imageConfig.imageSize = imageSize;

  const body: Record<string, any> = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000), // 3 min timeout for Pro model
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Gemini API request failed (${response.status} ${response.statusText})${detail ? `: ${detail.substring(0, 500)}` : ""}`
    );
  }

  const result = await response.json();

  // Extract image from response
  const responseParts: any[] = result.candidates?.[0]?.content?.parts || [];

  // Skip thought parts, find the last image part (final output)
  const imageParts = responseParts.filter(
    (p: any) => p.inlineData && !p.thought
  );

  if (imageParts.length === 0) {
    // Check for error in response
    const textPart = responseParts.find((p: any) => p.text);
    throw new Error(
      `Gemini API returned no image. ${textPart ? "Response: " + textPart.text?.substring(0, 200) : "No image parts in response."}`
    );
  }

  // Use the last image part (final rendered image)
  const lastImagePart = imageParts[imageParts.length - 1];
  return Buffer.from(lastImagePart.inlineData.data, "base64");
}

/**
 * Generate an image using the specified AI tool, or fall back to built-in AI.
 */
export async function generateImageWithTool(
  opts: GenerateWithToolOptions
): Promise<{ url: string; modelName?: string }> {
  const { toolId, ...genOpts } = opts;

  // If no toolId, use built-in AI
  if (!toolId) {
    const result = await generateImage(genOpts);
    return { url: result.url || "" };
  }

  // Fetch tool config
  const tool = await getAiToolById(toolId);

  // If tool has no external API configured, fall back to built-in AI
  if (!tool || !tool.apiEndpoint || !tool.apiKeyEncrypted) {
    console.log(`[generateImageWithTool] Tool ${toolId} has no external API, using built-in AI`);
    const result = await generateImage(genOpts);
    return { url: result.url || "", modelName: tool?.name };
  }

  // Decrypt API key
  const apiKey = decryptApiKey(tool.apiKeyEncrypted);
  if (!apiKey) {
    console.error(`[generateImageWithTool] Failed to decrypt API key for tool ${toolId}, falling back to built-in AI`);
    const result = await generateImage(genOpts);
    return { url: result.url || "", modelName: tool.name };
  }

  const provider = tool.provider?.toLowerCase() || "gemini";
  const config = (tool.configJson as Record<string, string> | null) || {};
  const modelName = config.modelName || "gemini-3-pro-image-preview";

  console.log(`[generateImageWithTool] Using external API: provider=${provider}, model=${modelName}, tool="${tool.name}"`);

  try {
    let imageBuffer: Buffer;

    if (provider === "gemini") {
      // Parse size into aspectRatio and imageSize for Gemini API
      let aspectRatio = config.aspectRatio || "1:1";
      let imageSize = config.imageSize || "1K";

      // Override with opts.size if provided (e.g. "1024x768" → "4:3")
      if (genOpts.size) {
        const [w, h] = genOpts.size.split("x").map(Number);
        if (w && h) {
          // Convert pixel size to closest Gemini aspect ratio
          const ratio = w / h;
          if (ratio > 1.7) aspectRatio = "16:9";
          else if (ratio > 1.2) aspectRatio = "4:3";
          else if (ratio < 0.6) aspectRatio = "9:16";
          else if (ratio < 0.85) aspectRatio = "3:4";
          else aspectRatio = "1:1";
        }
      }

      imageBuffer = await callGeminiImageApi({
        apiKey,
        modelName,
        baseUrl: tool.apiEndpoint,
        prompt: genOpts.prompt,
        referenceImages: genOpts.originalImages,
        imageSize,
        aspectRatio,
      });
    } else {
      // Unknown provider — fall back to built-in AI
      console.warn(`[generateImageWithTool] Unknown provider "${provider}", falling back to built-in AI`);
      const result = await generateImage(genOpts);
      return { url: result.url || "", modelName: tool.name };
    }

    // Upload to S3
    const { url } = await storagePut(
      `generated/${Date.now()}-${modelName}.png`,
      imageBuffer,
      "image/png"
    );

    return { url, modelName: tool.name };
  } catch (err) {
    console.error(`[generateImageWithTool] External API failed for tool ${toolId}:`, err);
    throw err; // Don't silently fall back — let the user know the selected API failed
  }
}
