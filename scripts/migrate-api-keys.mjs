/**
 * Migration script: encrypt plaintext API keys in ai_tools table.
 * Reads apiKeyName (plaintext), encrypts it, stores in apiKeyEncrypted.
 * Run: node scripts/migrate-api-keys.mjs
 */

import { createCipheriv, createHash, randomBytes } from "crypto";
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "fallback-dev-secret";

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

function getDerivedKey() {
  return createHash("sha256").update(JWT_SECRET).digest();
}

function encryptApiKey(plaintext) {
  const key = getDerivedKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

async function main() {
  const conn = await createConnection(DATABASE_URL);
  
  // Find tools with plaintext key but no encrypted key
  const [rows] = await conn.execute(
    "SELECT id, name, apiKeyName FROM ai_tools WHERE apiKeyName IS NOT NULL AND apiKeyName != '' AND apiKeyEncrypted IS NULL"
  );
  
  console.log(`Found ${rows.length} tools with plaintext API keys to migrate.`);
  
  let migrated = 0;
  for (const row of rows) {
    const encrypted = encryptApiKey(row.apiKeyName);
    await conn.execute(
      "UPDATE ai_tools SET apiKeyEncrypted = ? WHERE id = ?",
      [encrypted, row.id]
    );
    console.log(`  Migrated: ${row.name} (id=${row.id})`);
    migrated++;
  }
  
  console.log(`\nMigration complete: ${migrated} keys encrypted.`);
  await conn.end();
}

main().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
