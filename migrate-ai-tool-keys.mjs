/**
 * Migration: Create ai_tool_keys table
 * Run: node migrate-ai-tool-keys.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFileSync } from "fs";

// Load env
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = `CREATE TABLE IF NOT EXISTS \`ai_tool_keys\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`toolId\` int NOT NULL,
  \`apiKeyEncrypted\` text NOT NULL,
  \`label\` varchar(128),
  \`isActive\` boolean NOT NULL DEFAULT true,
  \`failCount\` int NOT NULL DEFAULT 0,
  \`lastSuccessAt\` int,
  \`lastFailAt\` int,
  \`cooldownUntil\` int,
  \`successCount\` int NOT NULL DEFAULT 0,
  \`sortOrder\` int NOT NULL DEFAULT 0,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`ai_tool_keys_id\` PRIMARY KEY(\`id\`)
);`;

const conn = await mysql.createConnection(DATABASE_URL);
try {
  await conn.execute(sql);
  console.log("✓ ai_tool_keys table created (or already exists)");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
