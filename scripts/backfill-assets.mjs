/**
 * Backfill script: sync all project-linked image history records to the assets library.
 * Run once: node scripts/backfill-assets.mjs
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql connection string
const url = new URL(DATABASE_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log("[Backfill] Connected to database");

const IMAGE_MODULES = ["ai_render", "color_plan", "analysis_image", "layout_design"];
const placeholders = IMAGE_MODULES.map(() => "?").join(",");

// Fetch all project-linked image history records
const [records] = await conn.execute(
  `SELECT id, userId, module, title, outputUrl, projectId, inputParams
   FROM generation_history
   WHERE projectId IS NOT NULL AND module IN (${placeholders})`,
  IMAGE_MODULES
);

console.log(`[Backfill] Found ${records.length} project-linked image history records`);

let synced = 0;
let skipped = 0;
let failed = 0;

for (const item of records) {
  try {
    if (item.module === "layout_design") {
      // Get jobId from inputParams
      let inputParams = item.inputParams;
      if (typeof inputParams === "string") {
        try { inputParams = JSON.parse(inputParams); } catch { inputParams = {}; }
      }
      const jobId = inputParams?.jobId;
      if (!jobId) continue;

      // Fetch the graphicLayoutJob
      const [jobs] = await conn.execute(
        `SELECT id, userId, title, status, pages FROM graphic_layout_jobs WHERE id = ? AND userId = ? LIMIT 1`,
        [jobId, item.userId]
      );
      const job = jobs[0];
      if (!job || job.status !== "done") continue;

      let pages = job.pages;
      if (typeof pages === "string") {
        try { pages = JSON.parse(pages); } catch { pages = []; }
      }
      if (!Array.isArray(pages)) continue;

      for (const page of pages) {
        const imageUrl = page.imageUrl ?? "";
        if (!imageUrl) continue;

        // Check if already in assets
        const [existing] = await conn.execute(
          `SELECT id, projectId FROM assets WHERE fileUrl = ? LIMIT 1`,
          [imageUrl]
        );

        if (existing.length === 0) {
          const name = `${job.title || "排版"} - 第${page.pageIndex + 1}页`;
          await conn.execute(
            `INSERT INTO assets (name, fileUrl, fileKey, fileType, category, thumbnailUrl, uploadedBy, projectId, createdAt)
             VALUES (?, ?, ?, 'image/png', 'graphic_layout', ?, ?, ?, NOW())`,
            [name, imageUrl, imageUrl, imageUrl, item.userId, item.projectId]
          );
          synced++;
        } else if (!existing[0].projectId) {
          await conn.execute(
            `UPDATE assets SET projectId = ? WHERE id = ?`,
            [item.projectId, existing[0].id]
          );
          synced++;
        } else {
          skipped++;
        }
      }
    } else {
      // ai_render / color_plan / analysis_image
      const imageUrl = item.outputUrl;
      if (!imageUrl) continue;

      const [existing] = await conn.execute(
        `SELECT id, projectId FROM assets WHERE fileUrl = ? LIMIT 1`,
        [imageUrl]
      );

      if (existing.length === 0) {
        await conn.execute(
          `INSERT INTO assets (name, fileUrl, fileKey, fileType, category, thumbnailUrl, uploadedBy, historyId, projectId, createdAt)
           VALUES (?, ?, ?, 'image/png', ?, ?, ?, ?, ?, NOW())`,
          [item.title || "未命名素材", imageUrl, imageUrl, item.module, imageUrl, item.userId, item.id, item.projectId]
        );
        synced++;
      } else if (!existing[0].projectId) {
        await conn.execute(
          `UPDATE assets SET projectId = ? WHERE id = ?`,
          [item.projectId, existing[0].id]
        );
        synced++;
      } else {
        skipped++;
      }
    }
  } catch (e) {
    console.error(`[Backfill] Failed to sync history ${item.id}:`, e.message);
    failed++;
  }
}

await conn.end();

console.log(`[Backfill] Done! synced=${synced}, skipped=${skipped}, failed=${failed}, total=${records.length}`);
