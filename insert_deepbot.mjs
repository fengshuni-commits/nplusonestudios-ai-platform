import { createCipheriv, createHash, randomBytes } from "crypto";
import { createConnection } from "mysql2/promise";

// Replicate encryptApiKey from server/_core/crypto.ts
function encryptApiKey(plaintext) {
  const secret = process.env.JWT_SECRET || "";
  const keyMaterial = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

const apiKey = process.env.DEEPBOT_API_KEY;
if (!apiKey) {
  console.error("DEEPBOT_API_KEY not set");
  process.exit(1);
}

const encrypted = encryptApiKey(apiKey);
console.log("Encrypted key length:", encrypted.length);

const conn = await createConnection(process.env.DATABASE_URL);

// Check if already exists
const [existing] = await conn.execute(
  "SELECT id FROM ai_tools WHERE name = 'DeepBot gpt-image-2' LIMIT 1"
);
if (existing.length > 0) {
  console.log("Tool already exists with id:", existing[0].id);
  await conn.end();
  process.exit(0);
}

await conn.execute(
  `INSERT INTO ai_tools (name, description, category, provider, apiEndpoint, apiKeyEncrypted, capabilities, isActive, isDefault, sortOrder)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    "DeepBot gpt-image-2",
    "DeepBot gpt-image-2 图像生成接口，支持最多5张参考图，支持5种尺寸",
    "image",
    "deepbot",
    "https://deepbot.plus/tool/gpt4/v1/images/generations",
    encrypted,
    JSON.stringify(["rendering", "image"]),
    true,
    false,
    0,
  ]
);

const [rows] = await conn.execute(
  "SELECT id, name, provider, isActive FROM ai_tools WHERE name = 'DeepBot gpt-image-2'"
);
console.log("Inserted:", rows[0]);
await conn.end();
