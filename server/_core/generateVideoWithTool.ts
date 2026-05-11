/**
 * 视频生成工具路由
 * 支持通过不同的视频生成工具（即梦、Runway 等）生成视频
 */

import {
  submitJimengVideoTask,
  queryJimengVideoTask,
  submitSeedanceVideoTask,
  querySeedanceVideoTask,
  getSeedanceModelId,
  submitVeo3VideoTask,
  queryVeo3VideoTask,
  type VideoSubmitResponse,
  type VideoStatusResponse,
} from "./volcengine";

export interface VideoGenerationInput {
  mode: "text-to-video" | "image-to-video";
  prompt: string;
  duration: number; // 5 或 10 秒
  resolution?: "480p" | "720p" | "1080p"; // 视频分辨率
  inputImageUrl?: string; // 图生视频时的首帧图
  toolId?: number;
  tool?: {
    id: number;
    name: string;
    apiEndpoint?: string;
    apiKeyEncrypted?: string;
    configJson?: Record<string, unknown>;
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
 */
export async function generateVideoWithTool(
  input: VideoGenerationInput
): Promise<VideoGenerationOutput> {
  if (!input.tool) {
    throw new Error("未指定视频生成工具");
  }

  const toolName = input.tool.name.toLowerCase();

  if (toolName.includes("seedance") || toolName.includes("Seedance")) {
    return generateVideoWithSeedance(input);
  }

  if (toolName.includes("jimeng") || toolName.includes("即梦")) {
    return generateVideoWithJimeng(input);
  }

  if (toolName.includes("veo")) {
    return generateVideoWithVeo3(input);
  }

  if (toolName.includes("runway")) {
    throw new Error("Runway 视频生成暂未支持，敬请期待");
  }

  if (toolName.includes("pika")) {
    throw new Error("Pika 视频生成暂未支持，敬请期待");
  }

  throw new Error(`不支持的视频生成工具: ${input.tool.name}`);
}

/**
 * Seedance 2.0 Pro 视频生成实现（火山方舟 ModelArk API）
 * 工具配置：apiKeyEncrypted 存储 ARK API Key（直接存储，无需 configJson）
 */
async function generateVideoWithSeedance(
  input: VideoGenerationInput
): Promise<VideoGenerationOutput> {
  const { decryptApiKey } = await import("./crypto");

  if (!input.tool?.apiKeyEncrypted) {
    throw new Error("Seedance 工具配置不完整（缺少 ARK API Key）");
  }

  const arkApiKey = decryptApiKey(input.tool.apiKeyEncrypted);
  if (!arkApiKey) {
    throw new Error("无法解密 Seedance ARK API Key");
  }

  const duration = (input.duration === 10 ? 10 : 5) as 5 | 10;

  const seedanceModelId = getSeedanceModelId(input.tool?.name ?? "");
  const result: VideoSubmitResponse = await submitSeedanceVideoTask(arkApiKey, {
    mode: input.mode,
    prompt: input.prompt,
    duration,
    resolution: input.resolution ?? "1080p",
    ratio: "16:9",
    inputImageUrl: input.inputImageUrl,
  }, seedanceModelId);

  return {
    taskId: result.taskId,
    status: result.status,
    errorMessage: result.errorMessage,
  };
}

/**
 * 即梦视频生成实现
 */
async function generateVideoWithJimeng(
  input: VideoGenerationInput
): Promise<VideoGenerationOutput> {
  const { decryptApiKey } = await import("./crypto");

  if (!input.tool?.apiKeyEncrypted || !input.tool?.configJson?.accessKeyId) {
    throw new Error("即梦工具配置不完整（缺少 AccessKeyID 或 SecretAccessKey）");
  }

  const accessKeyId = input.tool.configJson.accessKeyId as string;
  const secretAccessKey = decryptApiKey(input.tool.apiKeyEncrypted);

  if (!secretAccessKey) {
    throw new Error("无法解密即梦 SecretAccessKey");
  }

  const result: VideoSubmitResponse = await submitJimengVideoTask(
    { accessKeyId, secretAccessKey },
    {
      mode: input.mode,
      prompt: input.prompt,
      duration: input.duration,
      inputImageUrl: input.inputImageUrl,
    }
  );

  return {
    taskId: result.taskId,
    status: result.status,
    errorMessage: result.errorMessage,
  };
}

/**
 * 查询视频生成任务状态
 */
export async function queryVideoTaskStatus(
  taskId: string,
  tool: {
    name: string;
    apiKeyEncrypted?: string;
    configJson?: Record<string, unknown>;
  },
  mode: "text-to-video" | "image-to-video" = "text-to-video"
): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  errorMessage?: string;
  progress?: number;
}> {
  const toolName = tool.name.toLowerCase();

  if (toolName.includes("seedance")) {
    return querySeedanceVideoStatus(taskId, tool);
  }

  if (toolName.includes("jimeng") || toolName.includes("即梦")) {
    return queryJimengVideoStatus(taskId, tool, mode);
  }

  if (toolName.includes("veo")) {
    return queryVeo3VideoStatus(taskId, tool);
  }

  throw new Error(`不支持的视频生成工具: ${tool.name}`);
}

/**
 * 查询 Seedance 任务状态
 */
async function querySeedanceVideoStatus(
  taskId: string,
  tool: {
    apiKeyEncrypted?: string;
    configJson?: Record<string, unknown>;
  }
): Promise<VideoStatusResponse> {
  const { decryptApiKey } = await import("./crypto");

  if (!tool.apiKeyEncrypted) {
    throw new Error("Seedance 工具配置不完整（缺少 ARK API Key）");
  }

  const arkApiKey = decryptApiKey(tool.apiKeyEncrypted);
  if (!arkApiKey) {
    throw new Error("无法解密 Seedance ARK API Key");
  }

  return querySeedanceVideoTask(arkApiKey, taskId);
}

/**
 * Veo 3 视频生成实现（PiAPI）
 * 工具配置：apiKeyEncrypted 存储 PiAPI Key，configJson.taskType 可指定 veo3-video 或 veo3-video-fast
 */
async function generateVideoWithVeo3(
  input: VideoGenerationInput
): Promise<VideoGenerationOutput> {
  const { decryptApiKey } = await import("./crypto");

  if (!input.tool?.apiKeyEncrypted) {
    throw new Error("Veo3 工具配置不完整（缺少 PiAPI Key）");
  }

  const piApiKey = decryptApiKey(input.tool.apiKeyEncrypted);
  if (!piApiKey) {
    throw new Error("无法解密 Veo3 PiAPI Key");
  }

  const taskType = (input.tool.configJson?.taskType as "veo3-video" | "veo3-video-fast") ?? "veo3-video-fast";

  // Map duration number to string format
  const durationMap: Record<number, "4s" | "6s" | "8s"> = { 4: "4s", 5: "4s", 6: "6s", 8: "8s", 10: "8s" };
  const durationStr = durationMap[input.duration] ?? "8s";

  const result: VideoSubmitResponse = await submitVeo3VideoTask(piApiKey, {
    mode: input.mode,
    prompt: input.prompt,
    duration: durationStr,
    resolution: (input.resolution as "720p" | "1080p") ?? "720p",
    aspectRatio: "16:9",
    generateAudio: false,
    inputImageUrl: input.inputImageUrl,
    taskType,
  });

  return {
    taskId: result.taskId,
    status: result.status,
    errorMessage: result.errorMessage,
  };
}

/**
 * 查询 Veo3 任务状态
 */
async function queryVeo3VideoStatus(
  taskId: string,
  tool: {
    apiKeyEncrypted?: string;
    configJson?: Record<string, unknown>;
  }
): Promise<VideoStatusResponse> {
  const { decryptApiKey } = await import("./crypto");

  if (!tool.apiKeyEncrypted) {
    throw new Error("Veo3 工具配置不完整（缺少 PiAPI Key）");
  }

  const piApiKey = decryptApiKey(tool.apiKeyEncrypted);
  if (!piApiKey) {
    throw new Error("无法解密 Veo3 PiAPI Key");
  }

  return queryVeo3VideoTask(piApiKey, taskId);
}

/**
 * 查询即梦任务状态
 */
async function queryJimengVideoStatus(
  taskId: string,
  tool: {
    apiKeyEncrypted?: string;
    configJson?: Record<string, unknown>;
  },
  mode: "text-to-video" | "image-to-video"
): Promise<VideoStatusResponse> {
  const { decryptApiKey } = await import("./crypto");

  if (!tool.apiKeyEncrypted || !tool.configJson?.accessKeyId) {
    throw new Error("即梦工具配置不完整");
  }

  const accessKeyId = tool.configJson.accessKeyId as string;
  const secretAccessKey = decryptApiKey(tool.apiKeyEncrypted);

  if (!secretAccessKey) {
    throw new Error("无法解密即梦 SecretAccessKey");
  }

  return queryJimengVideoTask({ accessKeyId, secretAccessKey }, taskId, mode);
}
