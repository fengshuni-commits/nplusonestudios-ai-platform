/**
 * 视频生成工具路由
 * 支持通过不同的视频生成工具（即梦、Runway 等）生成视频
 */

import { generateImageWithJimeng } from "./volcengine";
import { storagePut } from "../storage";

export interface VideoGenerationInput {
  mode: "text-to-video" | "image-to-video";
  prompt: string;
  duration: number; // 1-8 秒
  inputImageUrl?: string; // 图生视频时的首帧图
  toolId?: number;
  tool?: {
    id: number;
    name: string;
    apiEndpoint?: string;
    apiKeyEncrypted?: string;
    configJson?: Record<string, any>;
  };
}

export interface VideoGenerationOutput {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
}

/**
 * 通过指定工具生成视频
 * @param input 视频生成参数
 * @returns 任务 ID 和状态
 */
export async function generateVideoWithTool(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
  if (!input.tool) {
    throw new Error("未指定视频生成工具");
  }

  const toolName = input.tool.name.toLowerCase();

  // 即梦视频生成
  if (toolName.includes("jimeng") || toolName.includes("即梦")) {
    return generateVideoWithJimeng(input);
  }

  // Runway 视频生成（预留）
  if (toolName.includes("runway")) {
    throw new Error("Runway 视频生成暂未支持，敬请期待");
  }

  // Pika 视频生成（预留）
  if (toolName.includes("pika")) {
    throw new Error("Pika 视频生成暂未支持，敬请期待");
  }

  throw new Error(`不支持的视频生成工具: ${input.tool.name}`);
}

/**
 * 即梦视频生成实现
 */
async function generateVideoWithJimeng(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
  const { decryptApiKey } = await import("./crypto");

  if (!input.tool?.apiKeyEncrypted || !input.tool?.configJson?.accessKeyId) {
    throw new Error("即梦工具配置不完整（缺少 AccessKeyID 或 SecretAccessKey）");
  }

  const accessKeyId = input.tool.configJson.accessKeyId;
  const secretAccessKey = decryptApiKey(input.tool.apiKeyEncrypted);

  if (!secretAccessKey) {
    throw new Error("无法解密即梦 SecretAccessKey");
  }

  // 调用即梦 API 生成视频
  const jimengResponse = await callJimengVideoApi({
    mode: input.mode,
    prompt: input.prompt,
    duration: input.duration,
    inputImageUrl: input.inputImageUrl,
    accessKeyId,
    secretAccessKey,
  });

  return {
    taskId: jimengResponse.taskId,
    status: jimengResponse.status,
    videoUrl: jimengResponse.videoUrl,
    errorMessage: jimengResponse.errorMessage,
  };
}

interface JimengVideoApiInput {
  mode: "text-to-video" | "image-to-video";
  prompt: string;
  duration: number;
  inputImageUrl?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * 调用即梦视频生成 API
 * 即梦 API 文档：https://www.jimeng.io/docs/api
 */
async function callJimengVideoApi(input: JimengVideoApiInput): Promise<{
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
}> {
  const { generateHmacSignature } = await import("./volcengine");

  const apiEndpoint = "https://api.jimeng.io/v1/video/generate";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // 构建请求体
  const requestBody = {
    mode: input.mode,
    prompt: input.prompt,
    duration: input.duration,
    ...(input.inputImageUrl && { input_image_url: input.inputImageUrl }),
  };

  // 生成签名
  const signature = generateHmacSignature(
    input.secretAccessKey,
    JSON.stringify(requestBody),
    timestamp
  );

  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key-Id": input.accessKeyId,
        "X-Signature": signature,
        "X-Timestamp": timestamp,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`即梦 API 错误: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    return {
      taskId: data.task_id || data.id,
      status: data.status === "completed" ? "completed" : "processing",
      videoUrl: data.video_url || data.output_url,
      errorMessage: data.error_message,
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
 * 查询视频生成任务状态
 */
export async function queryVideoTaskStatus(
  taskId: string,
  tool: {
    name: string;
    apiKeyEncrypted?: string;
    configJson?: Record<string, any>;
  }
): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
}> {
  const toolName = tool.name.toLowerCase();

  if (toolName.includes("jimeng") || toolName.includes("即梦")) {
    return queryJimengTaskStatus(taskId, tool);
  }

  throw new Error(`不支持的视频生成工具: ${tool.name}`);
}

/**
 * 查询即梦任务状态
 */
async function queryJimengTaskStatus(
  taskId: string,
  tool: {
    apiKeyEncrypted?: string;
    configJson?: Record<string, any>;
  }
): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
}> {
  const { decryptApiKey } = await import("./crypto");

  if (!tool.apiKeyEncrypted || !tool.configJson?.accessKeyId) {
    throw new Error("即梦工具配置不完整");
  }

  const accessKeyId = tool.configJson.accessKeyId;
  const secretAccessKey = decryptApiKey(tool.apiKeyEncrypted);

  if (!secretAccessKey) {
    throw new Error("无法解密即梦 SecretAccessKey");
  }

  const { generateHmacSignature } = await import("./volcengine");

  const apiEndpoint = `https://api.jimeng.io/v1/video/status/${taskId}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = generateHmacSignature(secretAccessKey, "", timestamp);

  try {
    const response = await fetch(apiEndpoint, {
      method: "GET",
      headers: {
        "X-Access-Key-Id": accessKeyId,
        "X-Signature": signature,
        "X-Timestamp": timestamp,
      },
    });

    if (!response.ok) {
      throw new Error(`即梦 API 错误: ${response.status}`);
    }

    const data = await response.json();

    return {
      status: data.status === "completed" ? "completed" : data.status === "failed" ? "failed" : "processing",
      videoUrl: data.video_url || data.output_url,
      errorMessage: data.error_message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      status: "failed",
      errorMessage: message,
    };
  }
}
