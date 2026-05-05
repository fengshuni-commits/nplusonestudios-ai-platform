import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  model?: string; // 可选，默认 gemini-2.5-flash
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id, tool_calls } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    // Gemini requires a non-empty name on function_response messages.
    // Use the name field if provided, otherwise leave it undefined (OpenAI-compat models don't need it).
    const normalized: Record<string, unknown> = { role, tool_call_id, content };
    if (name) normalized.name = name;
    return normalized;
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    const normalized: Record<string, unknown> = { role, content: contentParts[0].text };
    if (name) normalized.name = name;
    if (tool_calls && tool_calls.length > 0) normalized.tool_calls = tool_calls;
    return normalized;
  }

  const normalized: Record<string, unknown> = { role, content: contentParts };
  if (name) normalized.name = name;
  if (tool_calls && tool_calls.length > 0) normalized.tool_calls = tool_calls;
  return normalized;
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    model,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: model ?? "gemini-2.5-flash",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768
  payload.thinking = {
    "budget_tokens": 128
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000), // 3 min timeout to prevent socket hang
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

/**
 * Invoke LLM using the user's configured default AI tool (if available),
 * falling back to the built-in Forge API.
 *
 * @param params - Same as invokeLLM params
 * @param userId - The user ID to look up their default tool
 */
export async function invokeLLMWithUserTool(
  params: InvokeParams,
  userId?: number,
  toolId?: number
): Promise<InvokeResult> {
  // Try to get user's default tool with an API key
  if (userId) {
    try {
      const { getDb } = await import("../db");
      const { aiTools } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { decryptApiKey } = await import("./crypto");
      const db = await getDb();
      if (db) {
        // If toolId is specified, use that specific tool; otherwise use default
        const defaultTools = toolId
          ? await db.select().from(aiTools).where(eq(aiTools.id, toolId)).limit(1)
          : await db.select().from(aiTools).where(and(eq(aiTools.isDefault, true), eq(aiTools.isActive, true))).limit(1);

        if (defaultTools.length > 0) {
          const tool = defaultTools[0] as any;

          // Use key pool rotation (primary key + extra keys)
          const { pickKey: _pickKey, reportSuccess: _reportSuccess, reportFailure: _reportFailure } = await import("./keyPool");
          const poolKey = await _pickKey(tool.id, tool.apiKeyEncrypted || null);

          // Legacy fallback: plaintext key stored in apiKeyName
          let apiKey: string | null = poolKey?.apiKey ?? null;
          if (!apiKey && tool.apiKeyName && tool.apiKeyName.startsWith("sk-")) {
            apiKey = tool.apiKeyName;
          }
          const _llmPoolKeyId = poolKey?.id ?? 0;

          if (apiKey && tool.apiEndpoint) {
            // Use the user's tool
            const {
              messages,
              tools: toolsParam,
              toolChoice,
              tool_choice,
              outputSchema,
              output_schema,
              responseFormat,
              response_format,
            } = params;

            // Determine model name: prefer configJson.modelName, then tool.name
            const configJson = tool.configJson as Record<string, unknown> | null;
            let modelName: string = (configJson?.modelName as string) || tool.name || "gpt-4o";

            // Google Gemini OpenAI-compat endpoint requires "models/" prefix
            const isGoogleEndpoint = tool.apiEndpoint.includes("generativelanguage.googleapis.com");
            if (isGoogleEndpoint && modelName && !modelName.startsWith("models/")) {
              modelName = `models/${modelName}`;
            }

            const payload: Record<string, unknown> = {
              model: modelName,
              messages: messages.map(normalizeMessage),
            };

            if (toolsParam && toolsParam.length > 0) {
              payload.tools = toolsParam;
            }

            const normalizedToolChoice = normalizeToolChoice(
              toolChoice || tool_choice,
              toolsParam
            );
            if (normalizedToolChoice) {
              payload.tool_choice = normalizedToolChoice;
            }

            const normalizedResponseFormat = normalizeResponseFormat({
              responseFormat,
              response_format,
              outputSchema,
              output_schema,
            });
            if (normalizedResponseFormat) {
              payload.response_format = normalizedResponseFormat;
            }

            // Normalize endpoint: ensure it ends with /chat/completions
            let endpoint = tool.apiEndpoint.trim();
            if (!endpoint.endsWith("/chat/completions")) {
              endpoint = `${endpoint.replace(/\/$/, "")}/chat/completions`;
            }

            const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(300000), // 5 minutes for reasoning models
            });

            if (response.ok) {
              await _reportSuccess(tool.id, _llmPoolKeyId).catch(() => {});
              return (await response.json()) as InvokeResult;
            }
            // Tool call failed
            await _reportFailure(tool.id, _llmPoolKeyId).catch(() => {});
            if (toolId) {
              // Explicit toolId: surface error directly, no silent fallback
              const errBody = await response.text().catch(() => "");
              throw new Error(`AI 工具「${tool.name}」调用失败 (${response.status})：${errBody.substring(0, 300)}`);
            }
            console.warn(`[LLM] User tool "${tool.name}" failed (${response.status}), falling back to built-in API`);
          } else if (toolId) {
            // toolId specified but no apiKey or endpoint configured
            throw new Error(`AI 工具「${tool.name}」配置不完整，请检查 API Key 和接口地址`);
          }
        } else if (toolId) {
          // toolId specified but tool not found in DB
          throw new Error(`AI 工具 (id=${toolId}) 不存在或未启用，请在工具管理中检查`);
        }
      }
    } catch (err: any) {
      // Re-throw explicit tool errors; only swallow errors during default-tool lookup
      if (toolId || err?.message?.startsWith('AI 工具')) throw err;
      console.warn("[LLM] Failed to load user tool, falling back to built-in API:", err);
    }
  }

  // Fallback to built-in API (only reached when no toolId was specified)
  return invokeLLM(params);
}
