/**
 * Volcengine BigASR File Transcription
 * Uses the 大模型录音文件识别标准版API
 * Docs: https://www.volcengine.com/docs/6561/1354868
 *
 * Flow:
 *   1. POST /api/v3/auc/bigmodel/submit  → get task_id from response header X-Api-Request-Id
 *   2. Poll POST /api/v3/auc/bigmodel/query until X-Api-Status-Code == 20000000
 *   3. Return result.text
 */

import { randomUUID } from "crypto";

const BASE_URL = "https://openspeech.bytedance.com";
const SUBMIT_PATH = "/api/v3/auc/bigmodel/submit";
const QUERY_PATH = "/api/v3/auc/bigmodel/query";

// Map file extension / mime to volcengine format param
function detectFormat(fileNameOrUrl: string): string {
  const lower = fileNameOrUrl.toLowerCase();
  if (lower.includes(".wav")) return "wav";
  if (lower.includes(".mp3")) return "mp3";
  if (lower.includes(".ogg")) return "ogg";
  if (lower.includes(".m4a") || lower.includes(".mp4") || lower.includes(".aac")) return "mp3"; // treat as mp3 container
  if (lower.includes(".flac")) return "wav"; // fallback
  return "mp3"; // safe default
}

function buildHeaders(taskId: string, creds?: { appId: string; accessToken: string }): Record<string, string> {
  const appId = creds?.appId || process.env.VOLCENGINE_ASR_APP_ID!;
  const accessToken = creds?.accessToken || process.env.VOLCENGINE_ASR_ACCESS_TOKEN!;
  return {
    "Content-Type": "application/json",
    "X-Api-App-Key": appId,
    "X-Api-Access-Key": accessToken,
    "X-Api-Resource-Id": "volc.bigasr.auc",
    "X-Api-Request-Id": taskId,
    "X-Api-Sequence": "-1",
  };
}

/**
 * Submit a transcription task.
 * Returns the task_id (same UUID we generated and passed in the header).
 */
async function submitTask(audioUrl: string, taskId: string, creds?: { appId: string; accessToken: string }): Promise<void> {
  const format = detectFormat(audioUrl);
  const body = {
    user: { uid: "nplus1-platform" },
    audio: {
      url: audioUrl,
      format,
      language: "zh-CN",
    },
    request: {
      model_name: "bigmodel",
      enable_punc: true,
      enable_itn: true,
      show_utterances: true,
    },
  };

  const res = await fetch(`${BASE_URL}${SUBMIT_PATH}`, {
    method: "POST",
    headers: buildHeaders(taskId, creds),
    body: JSON.stringify(body),
  });

  const statusCode = res.headers.get("X-Api-Status-Code");
  const text = await res.text();

  // 20000000 = success, other values = error
  if (statusCode !== "20000000") {
    throw new Error(
      `Volcengine ASR submit failed: status=${statusCode} body=${text}`
    );
  }
}

interface UtteranceResult {
  start_time: number;
  end_time: number;
  text: string;
  definite: boolean;
}

interface QueryResult {
  done: boolean;
  text?: string;
  utterances?: UtteranceResult[];
  error?: string;
}

/**
 * Query the task status once.
 */
async function queryTask(taskId: string, creds?: { appId: string; accessToken: string }): Promise<QueryResult> {
  const res = await fetch(`${BASE_URL}${QUERY_PATH}`, {
    method: "POST",
    headers: buildHeaders(taskId, creds),
    body: JSON.stringify({}),
  });

  const statusCode = res.headers.get("X-Api-Status-Code");
  const text = await res.text();

  // 20000000 = done successfully
  if (statusCode === "20000000") {
    let result: { text?: string; utterances?: UtteranceResult[] } = {};
    try {
      const parsed = JSON.parse(text);
      result = parsed.result ?? {};
    } catch {
      // ignore parse errors, use empty result
    }
    return { done: true, text: result.text ?? "", utterances: result.utterances };
  }

  // 20000001 = still processing
  if (statusCode === "20000001") {
    return { done: false };
  }

  // Any other code = error
  return { done: true, error: `Volcengine ASR query failed: status=${statusCode} body=${text}` };
}

/**
 * Transcribe an audio file by URL using Volcengine BigASR.
 * Polls until done or timeout (default 10 minutes).
 * Returns the full transcript text.
 */
export async function transcribeFileWithVolcengine(
  audioUrl: string,
  options: { timeoutMs?: number; pollIntervalMs?: number; creds?: { appId: string; accessToken: string } } = {}
): Promise<string> {
  const { timeoutMs = 10 * 60 * 1000, pollIntervalMs = 5000, creds } = options;
  const taskId = randomUUID();
  console.log(`[VolcASR] Submitting task ${taskId} for ${audioUrl}`);
  await submitTask(audioUrl, taskId, creds);
  console.log(`[VolcASR] Task ${taskId} submitted, polling...`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const result = await queryTask(taskId, creds);
    if (!result.done) {
      console.log(`[VolcASR] Task ${taskId} still processing...`);
      continue;
    }

    if (result.error) {
      throw new Error(result.error);
    }

    const text = result.text ?? "";
    console.log(`[VolcASR] Task ${taskId} done, text length=${text.length}`);
    return text;
  }

  throw new Error(`Volcengine ASR task ${taskId} timed out after ${timeoutMs}ms`);
}
