import crypto from "crypto";
import https from "https";

/**
 * 火山引擎（即梦 AI）API 调用模块
 * 支持 HMAC-SHA256 签名鉴权
 */

export interface VolcengineConfig {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string; // 图生图时提供
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
}

export interface ImageGenerationResponse {
  data?: {
    image_urls?: Array<{ url: string }>;
  };
  error?: {
    message: string;
    code: string;
  };
}

/**
 * 生成 HMAC-SHA256 签名（用于即梦视频 API）
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

/**
 * 生成火山引擎 API 签名
 * 参考：https://www.volcengine.com/docs/6477/1219375
 */
function generateSignature(
  method: string,
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  body: string,
  secretAccessKey: string
): string {
  // 1. 规范化请求行
  const canonicalRequest = [
    method,
    path,
    Object.keys(query)
      .sort()
      .map((k) => `${k}=${encodeURIComponent(query[k])}`)
      .join("&"),
  ].join("\n");

  // 2. 规范化请求头（只包含特定的 header）
  const signedHeaders = ["content-type", "host", "x-date"].sort();
  const canonicalHeaders = signedHeaders
    .map((h) => `${h}:${(headers[h] || "").trim()}`)
    .join("\n");

  // 3. 计算 payload hash
  const payloadHash = crypto
    .createHash("sha256")
    .update(body || "")
    .digest("hex");

  // 4. 构建待签名字符串
  const canonicalRequest2 = [
    canonicalRequest,
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  // 5. 计算签名
  const signature = crypto
    .createHmac("sha256", secretAccessKey)
    .update(canonicalRequest2)
    .digest("hex");

  return signature;
}

/**
 * 调用即梦 AI 文生图 API
 */
export async function generateImageWithJimeng(
  config: VolcengineConfig,
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  return new Promise((resolve, reject) => {
    const host = "visual.volcengineapi.com";
    const path = "/api/v1/bm3.image_generation.v2";
    const method = "POST";

    // 构建请求体
    const body = JSON.stringify({
      req: {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || "",
        width: request.width || 512,
        height: request.height || 512,
        steps: request.steps || 20,
        scale: request.scale || 7.5,
        seed: -1,
        return_url: true,
      },
    });

    // 构建请求头
    const timestamp = new Date().toISOString();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      host: host,
      "x-date": timestamp,
      authorization: "", // 将在下面填充
    };

    // 生成签名
    const signature = generateSignature(
      method,
      path,
      {},
      headers,
      body,
      config.secretAccessKey
    );

    // 构建 Authorization 头
    headers.authorization = `HMAC-SHA256 Credential=${config.accessKeyId}, SignedHeaders=content-type;host;x-date, Signature=${signature}`;

    // 发送 HTTPS 请求
    const options = {
      hostname: host,
      path: path,
      method: method,
      headers: headers,
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data) as ImageGenerationResponse;
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.write(body);
    req.end();
  });
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
