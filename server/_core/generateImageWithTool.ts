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
import { generateImageWithJimeng, imageToImageWithJimeng, inpaintWithJimeng, upscaleWithJimeng, type VolcengineConfig } from "./volcengine";

export type GenerateWithToolOptions = GenerateImageOptions & {
  toolId?: number | null;
  // 即梦专属模式
  jimengMode?: "i2i" | "inpaint" | "upscale";
  // inpaint 专用：mask 图 URL
  maskImageUrl?: string;
  // upscale 专用参数
  upscaleResolution?: "4k" | "8k";
  upscaleScale?: number;
};

/**
 * Call the Qwen-Image (DashScope) API for image generation.
 * Returns the generated image URL directly (DashScope returns a URL, not base64).
 */
async function callQwenImageApi(opts: {
  apiKey: string;
  modelName: string;
  apiEndpoint: string;
  prompt: string;
  size?: string;
}): Promise<Buffer> {
  const { apiKey, modelName, apiEndpoint, prompt, size } = opts;

  const body: Record<string, any> = {
    model: modelName,
    input: {
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
    },
    parameters: {
      prompt_extend: true,
      watermark: false,
      size: size || "1024*1024",
    },
  };

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000), // 2 min timeout
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Qwen-Image API request failed (${response.status} ${response.statusText})${
        detail ? ": " + detail.substring(0, 500) : ""
      }`
    );
  }

  const result = await response.json();

  // Extract image URL from DashScope response
  const imageUrl: string | undefined =
    result?.output?.choices?.[0]?.message?.content?.[0]?.image;

  if (!imageUrl) {
    throw new Error(
      `Qwen-Image API returned no image. Response: ${JSON.stringify(result).substring(0, 300)}`
    );
  }

  // Fetch the image and return as Buffer (URL expires in 24h)
  const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(60000) });
  if (!imgResp.ok) {
    throw new Error(`Failed to download Qwen-Image result (${imgResp.status})`);
  }
  const imgBuf = await imgResp.arrayBuffer();
  return Buffer.from(imgBuf);
}

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
        const imgResp = await fetch(img.url, { signal: AbortSignal.timeout(30000) });
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
  // Exception: jimeng/volcengine uses HMAC auth and does NOT need apiEndpoint
  const _toolProvider = tool?.provider?.toLowerCase() || "";
  const _isJimeng = _toolProvider === "jimeng" || _toolProvider === "volcengine";
  if (!tool || (!tool.apiEndpoint && !_isJimeng) || !tool.apiKeyEncrypted) {
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

  // Auto-detect provider from apiEndpoint if not explicitly set
  let provider = tool.provider?.toLowerCase() || "";
  if (!provider) {
    const ep = tool.apiEndpoint || "";
    if (ep.includes("dashscope.aliyuncs.com")) {
      provider = "qwen";
    } else if (ep.includes("generativelanguage.googleapis.com")) {
      provider = "gemini";
    } else {
      provider = "unknown";
    }
  }
  const config = (tool.configJson as Record<string, string> | null) || {};
  // For qwen/dashscope, use imageModel (wanx series) for image generation
  const modelName = config.imageModel || config.modelName || (provider === "qwen" ? "wanx2.1-t2i-turbo" : "gemini-2.0-flash-exp-image-generation");

  console.log(`[generateImageWithTool] Using external API: provider=${provider}, model=${modelName}, tool="${tool.name}"`);

  try {
    let imageBuffer: Buffer;

    if (provider === "qwen") {
      // DashScope native async endpoint for wanx image generation
      // Step 1: Submit task
      const submitUrl = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";

      // wanx size format: "1024*1024"
      let wanxSize = "1024*1024";
      if (genOpts.size) {
        wanxSize = genOpts.size.replace("x", "*");
      }

      const submitResp = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify({
          model: modelName,
          input: { prompt: genOpts.prompt },
          parameters: { size: wanxSize, n: 1 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!submitResp.ok) {
        const detail = await submitResp.text().catch(() => "");
        throw new Error(
          `DashScope task submission failed (${submitResp.status})${detail ? ": " + detail.substring(0, 400) : ""}`
        );
      }

      const submitJson = await submitResp.json();
      const taskId: string | undefined = submitJson?.output?.task_id;
      if (!taskId) {
        throw new Error(`DashScope returned no task_id. Response: ${JSON.stringify(submitJson).substring(0, 300)}`);
      }

      // Step 2: Poll for result (max 120s, every 3s)
      const taskUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
      const maxAttempts = 40;
      let imageUrl: string | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollResp = await fetch(taskUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!pollResp.ok) continue;
        const pollJson = await pollResp.json();
        const status: string = pollJson?.output?.task_status || "";
        if (status === "SUCCEEDED") {
          imageUrl = pollJson?.output?.results?.[0]?.url;
          break;
        } else if (status === "FAILED") {
          const errMsg = pollJson?.output?.message || "Unknown error";
          throw new Error(`DashScope task failed: ${errMsg}`);
        }
        // PENDING or RUNNING — keep polling
      }

      if (!imageUrl) {
        throw new Error("DashScope task timed out or returned no image URL");
      }

      // Step 3: Download the image
      const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(60000) });
      if (!imgResp.ok) {
        throw new Error(`Failed to download DashScope image (${imgResp.status})`);
      }
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
    } else if (provider === "gemini") {
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
        baseUrl: tool.apiEndpoint || "",
        prompt: genOpts.prompt,
        referenceImages: genOpts.originalImages,
        imageSize,
        aspectRatio,
      });
    } else if (provider === "jimeng" || provider === "volcengine") {
      // 即梦 AI (火山引擎) 图像生成
      const volcengineConfig: VolcengineConfig = {
        accessKeyId: config.accessKeyId || "",
        secretAccessKey: apiKey,
      };
      if (!volcengineConfig.accessKeyId) {
        throw new Error("即梦 AI 缺少 AccessKeyID 配置");
      }

      let jimengImageUrl: string;

      if (opts.jimengMode === "upscale") {
        // ── 智能超清模式 ──
        const refUrl = genOpts.originalImages?.[0]?.url;
        if (!refUrl) throw new Error("即梦智能超清需要提供原图 URL");
        const upscaleResp = await upscaleWithJimeng(volcengineConfig, refUrl, {
          resolution: opts.upscaleResolution || "4k",
          scale: opts.upscaleScale ?? 50,
        });
        if (!upscaleResp.data?.image_urls?.[0]?.url) {
          throw new Error(`即梦智能超清返回无效响应: ${JSON.stringify(upscaleResp).substring(0, 300)}`);
        }
        jimengImageUrl = upscaleResp.data.image_urls[0].url;
      } else if (opts.jimengMode === "inpaint" && opts.maskImageUrl) {
        // ── Inpainting 模式 ──
        const refUrl = genOpts.originalImages?.[0]?.url;
        if (!refUrl) throw new Error("即梦 Inpainting 需要提供原图 URL");
        const inpaintResp = await inpaintWithJimeng(
          volcengineConfig,
          refUrl,
          opts.maskImageUrl,
          genOpts.prompt
        );
        if (!inpaintResp.data?.image_urls?.[0]?.url) {
          throw new Error(`即梦 Inpainting 返回无效响应: ${JSON.stringify(inpaintResp).substring(0, 300)}`);
        }
        jimengImageUrl = inpaintResp.data.image_urls[0].url;
      } else if (opts.jimengMode === "i2i" || genOpts.originalImages?.[0]?.url) {
        // ── 图生图模式（有参考图时自动使用）──
        const refUrl = genOpts.originalImages?.[0]?.url;
        if (!refUrl) {
          // 无参考图，降级到文生图
          const response = await generateImageWithJimeng(volcengineConfig, {
            prompt: genOpts.prompt,
            negativePrompt: config.negativePrompt,
            width: genOpts.size ? parseInt(genOpts.size.split("x")[0]) : 1024,
            height: genOpts.size ? parseInt(genOpts.size.split("x")[1]) : 1024,
          });
          if (!response.data?.image_urls?.[0]?.url) {
            throw new Error(`即梦 API 返回无效响应: ${JSON.stringify(response).substring(0, 300)}`);
          }
          jimengImageUrl = response.data.image_urls[0].url;
        } else {
          const i2iResp = await imageToImageWithJimeng(
            volcengineConfig,
            refUrl,
            genOpts.prompt,
            {
              width: genOpts.size ? parseInt(genOpts.size.split("x")[0]) : 1024,
              height: genOpts.size ? parseInt(genOpts.size.split("x")[1]) : 1024,
            }
          );
          if (!i2iResp.data?.image_urls?.[0]?.url) {
            throw new Error(`即梦图生图返回无效响应: ${JSON.stringify(i2iResp).substring(0, 300)}`);
          }
          jimengImageUrl = i2iResp.data.image_urls[0].url;
        }
      } else {
        // ── 文生图模式 ──
        const response = await generateImageWithJimeng(volcengineConfig, {
          prompt: genOpts.prompt,
          negativePrompt: config.negativePrompt,
          width: genOpts.size ? parseInt(genOpts.size.split("x")[0]) : 1024,
          height: genOpts.size ? parseInt(genOpts.size.split("x")[1]) : 1024,
        });
        if (!response.data?.image_urls?.[0]?.url) {
          throw new Error(`即梦 API 返回无效响应: ${JSON.stringify(response).substring(0, 300)}`);
        }
        jimengImageUrl = response.data.image_urls[0].url;
      }

      const imgResp = await fetch(jimengImageUrl, { signal: AbortSignal.timeout(60000) });
      if (!imgResp.ok) {
        throw new Error(`Failed to download 即梦 image (${imgResp.status})`);
      }
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
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
