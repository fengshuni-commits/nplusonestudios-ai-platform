import crypto from "crypto";

/**
 * 火山引擎（即梦 AI）API 调用模块
 * 使用火山引擎标准 HMAC-SHA256 V4 签名
 * 参考：https://www.volcengine.com/docs/6369/67269
 */

export interface VolcengineConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

// ─── 签名工具函数 ───────────────────────────────────────────────

function hmac(secret: string | Buffer, s: string): Buffer {
  return crypto.createHmac("sha256", secret).update(s, "utf8").digest();
}

function hash(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function uriEscape(str: string): string {
  try {
    return encodeURIComponent(str)
      .replace(/[^A-Za-z0-9_.~\-%]+/g, encodeURIComponent)
      .replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch {
    return "";
  }
}

function queryParamsToString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const val = params[key];
      if (val === undefined || val === null) return undefined;
      const escapedKey = uriEscape(key);
      if (!escapedKey) return undefined;
      return `${escapedKey}=${uriEscape(val)}`;
    })
    .filter((v): v is string => v !== undefined)
    .join("&");
}

function getDateTimeNow(): string {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

const HEADER_KEYS_TO_IGNORE = new Set([
  "authorization",
  "content-type",
  "content-length",
  "user-agent",
  "presigned-expires",
  "expect",
]);

function getSignHeaders(
  originHeaders: Record<string, string>,
  needSignHeaders: string[] = []
): [string, string] {
  function trimHeaderValue(header: string): string {
    return header.toString().trim().replace(/\s+/g, " ");
  }

  const needSignSet = new Set(
    [...needSignHeaders, "x-date", "host"].map((k) => k.toLowerCase())
  );

  let h = Object.keys(originHeaders).filter(
    (k) =>
      needSignSet.has(k.toLowerCase()) &&
      !HEADER_KEYS_TO_IGNORE.has(k.toLowerCase())
  );

  const signedHeaderKeys = h
    .map((k) => k.toLowerCase())
    .sort()
    .join(";");

  const canonicalHeaders = h
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
    .map((k) => `${k.toLowerCase()}:${trimHeaderValue(originHeaders[k])}`)
    .join("\n");

  return [signedHeaderKeys, canonicalHeaders];
}

/**
 * 生成火山引擎 HMAC-SHA256 签名（Authorization 头）
 */
function signRequest(params: {
  headers: Record<string, string>;
  query: Record<string, string>;
  method: string;
  pathName?: string;
  accessKeyId: string;
  secretAccessKey: string;
  serviceName: string;
  region: string;
  body?: string;
}): string {
  const {
    headers,
    query,
    method,
    pathName = "/",
    accessKeyId,
    secretAccessKey,
    serviceName,
    region,
    body = "",
  } = params;

  const datetime = headers["X-Date"];
  const date = datetime.substring(0, 8); // YYYYMMDD

  const [signedHeaders, canonicalHeaders] = getSignHeaders(headers);

  const canonicalRequest = [
    method.toUpperCase(),
    pathName,
    queryParamsToString(query) || "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    hash(body),
  ].join("\n");

  const credentialScope = [date, region, serviceName, "request"].join("/");
  const stringToSign = [
    "HMAC-SHA256",
    datetime,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");

  const kDate = hmac(secretAccessKey, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  return [
    "HMAC-SHA256",
    `Credential=${accessKeyId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(" ");
}

/**
 * 调用火山引擎 Visual API（即梦系列）
 * 端点：https://visual.volcengineapi.com
 */
async function callVolcengineVisualApi(
  config: VolcengineConfig,
  action: string,
  body: Record<string, unknown>,
  version = "2024-06-06"
): Promise<Record<string, unknown>> {
  const host = "visual.volcengineapi.com";
  const region = config.region || "cn-north-1";
  const serviceName = "cv";
  const datetime = getDateTimeNow();
  const bodyStr = JSON.stringify(body);

  const query: Record<string, string> = {
    Action: action,
    Version: version,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Host: host,
    "X-Date": datetime,
  };

  const authorization = signRequest({
    headers,
    query,
    method: "POST",
    pathName: "/",
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    serviceName,
    region,
    body: bodyStr,
  });

  const queryString = queryParamsToString(query);
  const url = `https://${host}/?${queryString}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body: bodyStr,
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`火山引擎 API 错误: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

// ─── 图片生成 ───────────────────────────────────────────────────

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
}

export interface ImageGenerationResponse {
  data?: {
    image_urls?: Array<{ url: string }>;
    binary_data_base64?: string[];
  };
  code?: number;
  message?: string;
  status?: number;
  error?: {
    message: string;
    code: string;
  };
}

/**
 * 调用即梦 AI 文生图 API（视觉生成 3.1）
 * 即梦使用异步任务模式：先提交任务，再轮询结果
 */
export async function generateImageWithJimeng(
  config: VolcengineConfig,
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const body: Record<string, unknown> = {
    req_key: "jimeng_t2i_v31",
    prompt: request.prompt,
    width: request.width || 1024,
    height: request.height || 1024,
    seed: -1,
  };

  // Step 1: 提交异步任务（使用通用接口 CVSync2AsyncSubmitTask，version=2022-08-31）
  const submitResult = await callVolcengineVisualApi(
    config,
    "CVSync2AsyncSubmitTask",
    body,
    "2022-08-31"
  );

  const submitData = submitResult.data as Record<string, unknown> | undefined;
  const taskId = submitData?.task_id as string | undefined;

  if (!taskId) {
    console.error("[Jimeng] Submit task failed, response:", JSON.stringify(submitResult).substring(0, 500));
    throw new Error(`即梦提交任务失败: ${(submitResult.message as string) || JSON.stringify(submitResult).substring(0, 200)}`);
  }

  console.log(`[Jimeng] Task submitted, task_id=${taskId}, polling for result...`);

  // Step 2: 轮询任务结果（最多 60s，每 3s 一次）
  // 查询接口：CVSync2AsyncGetResult，req_json 中设置 return_url=true
  const reqJson = JSON.stringify({ return_url: true });
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResult = await callVolcengineVisualApi(
      config,
      "CVSync2AsyncGetResult",
      { req_key: "jimeng_t2i_v31", task_id: taskId, req_json: reqJson },
      "2022-08-31"
    );
    const pollCode = pollResult.code as number | undefined;
    if (pollCode !== 10000) {
      const errMsg = (pollResult.message as string) || "未知错误";
      throw new Error(`即梦查询任务失败 (code=${pollCode}): ${errMsg}`);
    }
    const pollData = pollResult.data as Record<string, unknown> | undefined;
    const status = pollData?.status as string | undefined;
    console.log(`[Jimeng] Poll attempt ${i + 1}/${maxAttempts}, status=${status}`);
    // status: "done" = 成功, "failed" = 失败, 其他 = 处理中
    if (status === "done") {
      const imageUrls = pollData?.image_urls as string[] | undefined;
      if (imageUrls && imageUrls.length > 0) {
        // 文档返回的是字符串数组，转换为对象数组
        return { data: { image_urls: imageUrls.map(url => ({ url })) } } as ImageGenerationResponse;
      }
      throw new Error("即梦任务成功但无图片 URL");
    } else if (status === "failed" || status === "error") {
      const errMsg = (pollData?.message as string) || "未知错误";
      throw new Error(`即梦任务失败: ${errMsg}`);
    }
    // 其他状态（in_queue / processing 等）继续轮询
  }

  throw new Error("即梦任务超时（60秒），请稍后重试");
}

/**
 * 调用即梦 AI 图生图 API（图生图 3.0 - 智能参考）
 * req_key: jimeng_i2i_v30
 */
export async function imageToImageWithJimeng(
  config: VolcengineConfig,
  imageUrl: string,
  prompt: string,
  options?: { width?: number; height?: number; seed?: number }
): Promise<ImageGenerationResponse> {
  const body: Record<string, unknown> = {
    req_key: "jimeng_i2i_v30",
    prompt,
    image_urls: [imageUrl],
    width: options?.width || 1024,
    height: options?.height || 1024,
    seed: options?.seed ?? -1,
  };

  const submitResult = await callVolcengineVisualApi(
    config,
    "CVSync2AsyncSubmitTask",
    body,
    "2022-08-31"
  );

  const submitData = submitResult.data as Record<string, unknown> | undefined;
  const taskId = submitData?.task_id as string | undefined;

  if (!taskId) {
    console.error("[Jimeng i2i] Submit task failed:", JSON.stringify(submitResult).substring(0, 500));
    throw new Error(`即梦图生图提交失败: ${(submitResult.message as string) || JSON.stringify(submitResult).substring(0, 200)}`);
  }

  console.log(`[Jimeng i2i] Task submitted, task_id=${taskId}, polling...`);

  const reqJson = JSON.stringify({ return_url: true });
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResult = await callVolcengineVisualApi(
      config,
      "CVSync2AsyncGetResult",
      { req_key: "jimeng_i2i_v30", task_id: taskId, req_json: reqJson },
      "2022-08-31"
    );
    const pollCode = pollResult.code as number | undefined;
    if (pollCode !== 10000) {
      throw new Error(`即梦图生图查询失败 (code=${pollCode}): ${(pollResult.message as string) || "未知错误"}`);
    }
    const pollData = pollResult.data as Record<string, unknown> | undefined;
    const status = pollData?.status as string | undefined;
    console.log(`[Jimeng i2i] Poll ${i + 1}/${maxAttempts}, status=${status}`);
    if (status === "done") {
      const imageUrls = pollData?.image_urls as string[] | undefined;
      if (imageUrls && imageUrls.length > 0) {
        return { data: { image_urls: imageUrls.map(url => ({ url })) } } as ImageGenerationResponse;
      }
      throw new Error("即梦图生图任务成功但无图片 URL");
    } else if (status === "failed" || status === "error") {
      throw new Error(`即梦图生图任务失败: ${(pollData?.message as string) || "未知错误"}`);
    }
  }
  throw new Error("即梦图生图任务超时（60秒），请稍后重试");
}

/**
 * 调用即梦 AI 交互编辑 Inpainting API
 * req_key: jimeng_image2image_dream_inpaint
 * imageUrl: 原图 URL
 * maskUrl: mask 图 URL（白色=重绘区域，黑色=保留区域）
 * prompt: 编辑描述（消除场景输入"删除"）
 */
export async function inpaintWithJimeng(
  config: VolcengineConfig,
  imageUrl: string,
  maskUrl: string,
  prompt: string
): Promise<ImageGenerationResponse> {
  const body: Record<string, unknown> = {
    req_key: "jimeng_image2image_dream_inpaint",
    image_urls: [imageUrl, maskUrl],
    prompt,
    seed: -1,
  };

  const submitResult = await callVolcengineVisualApi(
    config,
    "CVSync2AsyncSubmitTask",
    body,
    "2022-08-31"
  );

  const submitData = submitResult.data as Record<string, unknown> | undefined;
  const taskId = submitData?.task_id as string | undefined;

  if (!taskId) {
    console.error("[Jimeng inpaint] Submit task failed:", JSON.stringify(submitResult).substring(0, 500));
    throw new Error(`即梦 Inpainting 提交失败: ${(submitResult.message as string) || JSON.stringify(submitResult).substring(0, 200)}`);
  }

  console.log(`[Jimeng inpaint] Task submitted, task_id=${taskId}, polling...`);

  const reqJson = JSON.stringify({ return_url: true });
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResult = await callVolcengineVisualApi(
      config,
      "CVSync2AsyncGetResult",
      { req_key: "jimeng_image2image_dream_inpaint", task_id: taskId, req_json: reqJson },
      "2022-08-31"
    );
    const pollCode = pollResult.code as number | undefined;
    if (pollCode !== 10000) {
      throw new Error(`即梦 Inpainting 查询失败 (code=${pollCode}): ${(pollResult.message as string) || "未知错误"}`);
    }
    const pollData = pollResult.data as Record<string, unknown> | undefined;
    const status = pollData?.status as string | undefined;
    console.log(`[Jimeng inpaint] Poll ${i + 1}/${maxAttempts}, status=${status}`);
    if (status === "done") {
      const imageUrls = pollData?.image_urls as string[] | undefined;
      if (imageUrls && imageUrls.length > 0) {
        return { data: { image_urls: imageUrls.map(url => ({ url })) } } as ImageGenerationResponse;
      }
      throw new Error("即梦 Inpainting 任务成功但无图片 URL");
    } else if (status === "failed" || status === "error") {
      throw new Error(`即梦 Inpainting 任务失败: ${(pollData?.message as string) || "未知错误"}`);
    }
  }
  throw new Error("即梦 Inpainting 任务超时（60秒），请稍后重试");
}

/**
 * 调用即梦 AI 智能超清 API
 * req_key: jimeng_i2i_seed3_tilesr_cvtob
 * 支持将图像超清到 4K/8K
 */
export async function upscaleWithJimeng(
  config: VolcengineConfig,
  imageUrl: string,
  options?: { resolution?: "4k" | "8k"; scale?: number }
): Promise<ImageGenerationResponse> {
  const body: Record<string, unknown> = {
    req_key: "jimeng_i2i_seed3_tilesr_cvtob",
    image_urls: [imageUrl],
    resolution: options?.resolution || "4k",
    scale: options?.scale ?? 50,
  };

  const submitResult = await callVolcengineVisualApi(
    config,
    "CVSync2AsyncSubmitTask",
    body,
    "2022-08-31"
  );

  const submitData = submitResult.data as Record<string, unknown> | undefined;
  const taskId = submitData?.task_id as string | undefined;

  if (!taskId) {
    console.error("[Jimeng upscale] Submit task failed:", JSON.stringify(submitResult).substring(0, 500));
    throw new Error(`即梦智能超清提交失败: ${(submitResult.message as string) || JSON.stringify(submitResult).substring(0, 200)}`);
  }

  console.log(`[Jimeng upscale] Task submitted, task_id=${taskId}, polling...`);

  const reqJson = JSON.stringify({ return_url: true });
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResult = await callVolcengineVisualApi(
      config,
      "CVSync2AsyncGetResult",
      { req_key: "jimeng_i2i_seed3_tilesr_cvtob", task_id: taskId, req_json: reqJson },
      "2022-08-31"
    );
    const pollCode = pollResult.code as number | undefined;
    if (pollCode !== 10000) {
      throw new Error(`即梦智能超清查询失败 (code=${pollCode}): ${(pollResult.message as string) || "未知错误"}`);
    }
    const pollData = pollResult.data as Record<string, unknown> | undefined;
    const status = pollData?.status as string | undefined;
    console.log(`[Jimeng upscale] Poll ${i + 1}/${maxAttempts}, status=${status}`);
    if (status === "done") {
      const imageUrls = pollData?.image_urls as string[] | undefined;
      if (imageUrls && imageUrls.length > 0) {
        return { data: { image_urls: imageUrls.map(url => ({ url })) } } as ImageGenerationResponse;
      }
      throw new Error("即梦智能超清任务成功但无图片 URL");
    } else if (status === "failed" || status === "error") {
      throw new Error(`即梦智能超清任务失败: ${(pollData?.message as string) || "未知错误"}`);
    }
  }
  throw new Error("即梦智能超清任务超时（60秒），请稍后重试");
}

/**
 * 调用即梦 AI 图生图 API（旧版兼容）
 * @deprecated 请使用 imageToImageWithJimeng
 */
export async function enhanceImageWithJimeng(
  config: VolcengineConfig,
  imageUrl: string,
  prompt: string,
  negativePrompt?: string
): Promise<ImageGenerationResponse> {
  return imageToImageWithJimeng(config, imageUrl, prompt);
}

// ─── 视频生成 ───────────────────────────────────────────────────

export interface VideoSubmitRequest {
  mode: "text-to-video" | "image-to-video";
  prompt: string;
  duration?: number; // 秒数：5 或 10，默认 5
  aspectRatio?: string; // "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9"
  inputImageUrl?: string; // 图生视频时的首帧图
}

export interface VideoSubmitResponse {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage?: string;
}

export interface VideoStatusResponse {
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
  progress?: number;
}

/**
 * 提交即梦视频生成任务（1080P）
 */
export async function submitJimengVideoTask(
  config: VolcengineConfig,
  request: VideoSubmitRequest
): Promise<VideoSubmitResponse> {
  const frames = request.duration === 10 ? 241 : 121; // 5s=121帧, 10s=241帧

  let action: string;
  let reqKey: string;
  const body: Record<string, unknown> = {
    prompt: request.prompt,
    seed: -1,
    aspect_ratio: request.aspectRatio || "16:9",
    frames,
  };

  // 即梦 3.0 Pro 统一使用 CVSync2AsyncSubmitTask，req_key 固定为 jimeng_ti2v_v30_pro
  action = "CVSync2AsyncSubmitTask";
  reqKey = "jimeng_ti2v_v30_pro";
  body.req_key = reqKey;

  if (request.mode === "image-to-video" && request.inputImageUrl) {
    // 图生视频（首帧）：传入图片 URL
    body.image_urls = [request.inputImageUrl];
  }

  try {
    const result = await callVolcengineVisualApi(config, action, body, "2022-08-31");

    const data = result.data as Record<string, unknown> | undefined;
    const taskId = (data?.task_id as string) || "";

    if (!taskId) {
      const message = (result.message as string) || "未知错误";
      const code = result.code as number;
      throw new Error(`提交任务失败 (code=${code}): ${message}`);
    }

    return {
      taskId,
      status: "pending",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      taskId: "",
      status: "failed",
      errorMessage: message,
    };
  }
}

/**
 * 查询即梦视频生成任务状态
 */
export async function queryJimengVideoTask(
  config: VolcengineConfig,
  taskId: string,
  mode: "text-to-video" | "image-to-video" = "text-to-video"
): Promise<VideoStatusResponse> {
  let action: string;
  let reqKey: string;

  // 即梦 3.0 Pro 统一使用 CVSync2AsyncGetResult
  action = "CVSync2AsyncGetResult";
  reqKey = "jimeng_ti2v_v30_pro";

  try {
    const result = await callVolcengineVisualApi(config, action, {
      req_key: reqKey,
      task_id: taskId,
    }, "2022-08-31");

    const data = result.data as Record<string, unknown> | undefined;
    const status = (data?.status as string) || "";
    // Pro 版返回格式：data.video_url 或 data.videos[0].url
    const videos = data?.videos as Array<Record<string, unknown>> | undefined;
    const videoUrl = (data?.video_url as string | undefined) || (videos?.[0]?.url as string | undefined);
    const errorMessage = (data?.error_message as string | undefined) || (data?.message as string | undefined);

    let mappedStatus: VideoStatusResponse["status"];
    let progress: number;

    if (status === "done" || status === "completed") {
      mappedStatus = "completed";
      progress = 100;
    } else if (status === "failed" || status === "error") {
      mappedStatus = "failed";
      progress = 0;
    } else if (status === "in_queue" || status === "pending") {
      mappedStatus = "pending";
      progress = 10;
    } else {
      // processing / running / generating
      mappedStatus = "processing";
      progress = 50;
    }

    return {
      status: mappedStatus,
      videoUrl,
      errorMessage,
      progress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      status: "failed",
      errorMessage: message,
      progress: 0,
    };
  }
}

/**
 * 生成 HMAC-SHA256 签名（保留兼容旧接口）
 * @deprecated 请使用新的 signRequest 函数
 */
export function generateHmacSignature(
  secretAccessKey: string,
  body: string,
  timestamp: string
): string {
  const message = `${body}${timestamp}`;
  return crypto
    .createHmac("sha256", secretAccessKey)
    .update(message)
    .digest("hex");
}

// ─── Seedance 2.0 Pro (火山方舟 ModelArk API) ─────────────────────────────────

export interface SeedanceVideoRequest {
  mode: "text-to-video" | "image-to-video";
  prompt: string;
  duration: 5 | 10;
  resolution?: "720p" | "1080p";
  ratio?: string;
  inputImageUrl?: string;
  generateAudio?: boolean;
}

const SEEDANCE_ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";
const SEEDANCE_MODEL = "doubao-seedance-2-0-260128";

/**
 * 提交 Seedance 2.0 Pro 视频生成任务（火山方舟 ModelArk API）
 */
export async function submitSeedanceVideoTask(
  arkApiKey: string,
  request: SeedanceVideoRequest
): Promise<VideoSubmitResponse> {
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: request.prompt || " " },
  ];

  if (request.mode === "image-to-video" && request.inputImageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: request.inputImageUrl },
    });
  }

  const body: Record<string, unknown> = {
    model: SEEDANCE_MODEL,
    content,
    duration: request.duration ?? 5,
    ratio: request.ratio ?? "16:9",
    resolution: request.resolution ?? "1080p",
    watermark: false,
    generate_audio: request.generateAudio ?? false,
  };

  try {
    const resp = await fetch(`${SEEDANCE_ARK_BASE}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${arkApiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      const errMsg =
        (json.error as Record<string, unknown>)?.message as string ||
        JSON.stringify(json);
      throw new Error(`Seedance API 错误 (${resp.status}): ${errMsg}`);
    }

    const taskId = json.id as string;
    if (!taskId) throw new Error("Seedance API 未返回任务 ID");

    return { taskId, status: "pending" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return { taskId: "", status: "failed", errorMessage: message };
  }
}

/**
 * 查询 Seedance 2.0 Pro 视频生成任务状态
 */
export async function querySeedanceVideoTask(
  arkApiKey: string,
  taskId: string
): Promise<VideoStatusResponse> {
  try {
    const resp = await fetch(
      `${SEEDANCE_ARK_BASE}/contents/generations/tasks/${taskId}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${arkApiKey}`,
        },
      }
    );

    const json = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      const errMsg =
        (json.error as Record<string, unknown>)?.message as string ||
        JSON.stringify(json);
      throw new Error(`Seedance 查询错误 (${resp.status}): ${errMsg}`);
    }

    const status = json.status as string;
    const content = json.content as Record<string, unknown> | undefined;
    const videoUrl = content?.video_url as string | undefined;

    let mappedStatus: VideoStatusResponse["status"];
    let progress: number;

    if (status === "succeeded") {
      mappedStatus = "completed";
      progress = 100;
    } else if (status === "failed" || status === "cancelled") {
      mappedStatus = "failed";
      progress = 0;
    } else if (status === "queued") {
      mappedStatus = "pending";
      progress = 10;
    } else {
      mappedStatus = "processing";
      progress = 50;
    }

    return { status: mappedStatus, videoUrl, progress };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return { status: "failed", errorMessage: message, progress: 0 };
  }
}
