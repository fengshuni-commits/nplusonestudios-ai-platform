/**
 * Magnific Image Enhancement Service
 * Uses Freepik API (Magnific Upscaler Creative) for AI-powered image upscaling
 * Docs: https://docs.freepik.com/api-reference/image-upscaler-creative/image-upscaler
 */

const FREEPIK_API_BASE = "https://api.freepik.com/v1/ai";

export type MagnificScale = "x2" | "x4" | "x8" | "x16";
export type MagnificOptimizedFor =
  | "default"
  | "art_and_illustrations"
  | "videogames"
  | "portraits"
  | "landscapes"
  | "architecture"
  | "3d_renders"
  | "science_fiction"
  | "anime"
  | "photography";

export interface MagnificEnhanceParams {
  imageUrl: string;
  scale?: MagnificScale;
  optimizedFor?: MagnificOptimizedFor;
  prompt?: string;
  creativity?: number; // -10 to 10
  detail?: number; // -10 to 10
  resemblance?: number; // -10 to 10
  fractality?: number; // -10 to 10
}

export interface MagnificTaskResult {
  taskId: string;
  status: "idle" | "processing" | "done" | "failed";
  outputUrl?: string;
  error?: string;
}

function getApiKey(): string {
  const key = process.env.FREEPIK_API_KEY;
  if (!key) throw new Error("FREEPIK_API_KEY is not configured");
  return key;
}

/**
 * Submit an image enhancement task to Freepik/Magnific API
 * Returns a task ID for polling
 */
export async function submitEnhanceTask(
  params: MagnificEnhanceParams
): Promise<{ taskId: string }> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    image_url: params.imageUrl,
    scale: params.scale ?? "x2",
    optimized_for: params.optimizedFor ?? "3d_renders",
    engine: "magnific_sparkle",
  };

  if (params.prompt) body.prompt = params.prompt;
  if (params.creativity !== undefined) body.creativity = params.creativity;
  if (params.detail !== undefined) body.detail = params.detail;
  if (params.resemblance !== undefined) body.resemblance = params.resemblance;
  if (params.fractality !== undefined) body.fractality = params.fractality;

  const response = await fetch(`${FREEPIK_API_BASE}/image-upscaler`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-freepik-api-key": apiKey,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Freepik API error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as { data?: { task_id?: string }; task_id?: string };
  const taskId = data?.data?.task_id ?? data?.task_id;
  if (!taskId) {
    throw new Error(`Freepik API did not return a task_id: ${JSON.stringify(data)}`);
  }

  return { taskId };
}

/**
 * Poll the status of an enhancement task
 */
export async function getEnhanceTaskStatus(
  taskId: string
): Promise<MagnificTaskResult> {
  const apiKey = getApiKey();

  const response = await fetch(
    `${FREEPIK_API_BASE}/image-upscaler/${taskId}`,
    {
      headers: {
        "x-freepik-api-key": apiKey,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Freepik API error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as {
    data?: {
      status?: string;
      generated?: Array<{ url?: string }>;
      error?: string;
    };
    status?: string;
    generated?: Array<{ url?: string }>;
  };

  const payload = data?.data ?? data;
  const status = payload?.status ?? "processing";

  // Map Freepik status to our internal status
  let internalStatus: MagnificTaskResult["status"] = "processing";
  if (status === "DONE" || status === "done" || status === "completed") {
    internalStatus = "done";
  } else if (status === "FAILED" || status === "failed" || status === "error") {
    internalStatus = "failed";
  } else if (status === "IN_PROGRESS" || status === "processing" || status === "PENDING" || status === "pending") {
    internalStatus = "processing";
  }

  const outputUrl =
    payload?.generated?.[0]?.url ?? undefined;

  const errorMsg = (payload as { error?: string } | undefined)?.error;

  return {
    taskId,
    status: internalStatus,
    outputUrl,
    error: errorMsg,
  };
}
