/**
 * Magnific Image Enhancement Service
 * Uses Freepik API (Magnific Upscaler Creative) for AI-powered image upscaling
 * Docs: https://docs.freepik.com/api-reference/image-upscaler-creative/post-image-upscaler
 *
 * Key API facts:
 * - POST /v1/ai/image-upscaler  → submit task, returns { data: { task_id, status } }
 * - GET  /v1/ai/image-upscaler/{task-id} → poll, returns { data: { task_id, status, generated: string[] } }
 * - `image` field must be Base64-encoded bytes (NOT a URL)
 * - `scale_factor` values: "2x" | "4x" | "8x" | "16x"
 * - `hdr` controls definition/detail level (replaces "detail")
 * - Statuses: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
 * - On completion, `generated` is an array of URL strings
 */

const FREEPIK_API_BASE = "https://api.freepik.com/v1/ai";

export type MagnificScale = "x2" | "x4" | "x8" | "x16";
export type MagnificOptimizedFor =
  | "standard"
  | "art_n_illustration"
  | "videogame_assets"
  | "soft_portraits"
  | "hard_portraits"
  | "nature_n_landscapes"
  | "films_n_photography"
  | "3d_renders"
  | "science_fiction_n_horror";

export interface MagnificEnhanceParams {
  imageUrl: string;
  scale?: MagnificScale;
  optimizedFor?: MagnificOptimizedFor;
  prompt?: string;
  creativity?: number; // -10 to 10
  hdr?: number;        // -10 to 10 (definition/detail level)
  resemblance?: number; // -10 to 10
  fractality?: number;  // -10 to 10
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
 * Download an image from a URL and convert it to Base64
 * Required because Freepik API accepts Base64 image bytes, not URLs
 */
async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image for enhancement: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

/**
 * Convert our internal scale format ("x2") to Freepik API format ("2x")
 */
function toFreepikScale(scale: MagnificScale): string {
  // Our internal: "x2" | "x4" | "x8" | "x16"
  // Freepik API:  "2x" | "4x" | "8x" | "16x"
  return scale.replace(/^x/, "") + "x";
}

/**
 * Submit an image enhancement task to Freepik/Magnific API
 * Returns a task ID for polling
 */
export async function submitEnhanceTask(
  params: MagnificEnhanceParams
): Promise<{ taskId: string }> {
  const apiKey = getApiKey();

  // Download and convert image to Base64 (required by Freepik API)
  const imageBase64 = await imageUrlToBase64(params.imageUrl);

  const body: Record<string, unknown> = {
    image: imageBase64,
    scale_factor: toFreepikScale(params.scale ?? "x2"),
    optimized_for: params.optimizedFor ?? "3d_renders",
    engine: "magnific_sparkle",
  };

  if (params.prompt) body.prompt = params.prompt;
  if (params.creativity !== undefined) body.creativity = params.creativity;
  if (params.hdr !== undefined) body.hdr = params.hdr;
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

  const data = (await response.json()) as {
    data?: { task_id?: string; status?: string };
    task_id?: string;
  };

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
      task_id?: string;
      status?: string;
      generated?: string[]; // array of URL strings on completion
      error?: string;
    };
  };

  const payload = data?.data;
  const status = payload?.status ?? "IN_PROGRESS";

  // Map Freepik status to our internal status
  // Freepik statuses: CREATED | IN_PROGRESS | COMPLETED | FAILED
  let internalStatus: MagnificTaskResult["status"] = "processing";
  if (status === "COMPLETED") {
    internalStatus = "done";
  } else if (status === "FAILED") {
    internalStatus = "failed";
  } else {
    // CREATED or IN_PROGRESS
    internalStatus = "processing";
  }

  // generated is an array of URL strings (not objects)
  const outputUrl = payload?.generated?.[0] ?? undefined;
  const errorMsg = payload?.error;

  return {
    taskId,
    status: internalStatus,
    outputUrl,
    error: errorMsg,
  };
}
