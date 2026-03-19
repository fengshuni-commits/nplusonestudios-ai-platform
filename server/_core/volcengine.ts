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
 */
export async function generateImageWithJimeng(
  config: VolcengineConfig,
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const body: Record<string, unknown> = {
    req_key: "jimeng_t2i_v3.1",
    prompt: request.prompt,
    negative_prompt: request.negativePrompt || "",
    width: request.width || 1024,
    height: request.height || 1024,
    seed: -1,
    return_url: true,
  };

  const result = await callVolcengineVisualApi(
    config,
    "JimengT2IV31SubmitTask",
    body
  );

  return result as ImageGenerationResponse;
}

/**
 * 调用即梦 AI 图生图 API
 */
export async function enhanceImageWithJimeng(
  config: VolcengineConfig,
  imageUrl: string,
  prompt: string,
  negativePrompt?: string
): Promise<ImageGenerationResponse> {
  return generateImageWithJimeng(config, {
    prompt,
    negativePrompt,
    imageUrl,
  });
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

  if (request.mode === "image-to-video" && request.inputImageUrl) {
    // 图生视频（首帧）
    action = "JimengI2VFirstV301080SubmitTask";
    reqKey = "jimeng_i2v_first_v30_1080p";
    body.req_key = reqKey;
    body.image_url = request.inputImageUrl;
  } else {
    // 文生视频
    action = "JimengT2VV301080PSubmitTask";
    reqKey = "jimeng_t2v_v30_1080p";
    body.req_key = reqKey;
  }

  try {
    const result = await callVolcengineVisualApi(config, action, body);

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

  if (mode === "image-to-video") {
    action = "JimengI2VFirstV301080GetResult";
    reqKey = "jimeng_i2v_first_v30_1080p";
  } else {
    action = "JimengT2VV301080PGetResult";
    reqKey = "jimeng_t2v_v30_1080p";
  }

  try {
    const result = await callVolcengineVisualApi(config, action, {
      req_key: reqKey,
      task_id: taskId,
    });

    const data = result.data as Record<string, unknown> | undefined;
    const status = (data?.status as string) || "";
    const videoUrl = data?.video_url as string | undefined;
    const errorMessage = data?.error_message as string | undefined;

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
