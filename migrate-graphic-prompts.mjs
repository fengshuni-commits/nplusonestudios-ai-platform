import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

// Load env
dotenv.config({ path: ".env" });
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const conn = await createConnection(dbUrl);

// Create table
await conn.execute(`CREATE TABLE IF NOT EXISTS \`graphic_layout_prompts\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`type\` enum('layout_plan_system','image_generation') NOT NULL,
  \`label\` varchar(128) NOT NULL,
  \`prompt\` text NOT NULL,
  \`description\` text,
  \`updatedBy\` int,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`graphic_layout_prompts_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`graphic_layout_prompts_type_unique\` UNIQUE(\`type\`)
)`);
console.log("✓ Table created");

// Insert default prompts
const layoutPlanPrompt = `你是一个专业的品牌视觉设计师。请为图文排版页面规划排版结构，输出每个文字块的内容和位置。

规则：
- 文字块不得超出页面边界，不得相互重叠
- 每个文字块的 x/y 是左上角坐标，width/height 是文字区域尺寸（单位 px）
- 留出足够边距（至少 40px）
- fontSize 单位 px，标题 48-80px，副标题 24-36px，正文 16-22px
- 最多 6 个文字块
- 严格使用版式包中提取的配色方案，不得使用默认黑白配色
- 排版结构应忠实还原参考版式的视觉层次和空间分布`;

const imageGenPrompt = `Professional brand design, high-end architectural studio aesthetic. Strictly follow the color scheme from the style guide. Clean layout with precise typography placement. No watermarks, no extra decorations, photorealistic quality.`;

await conn.execute(
  `INSERT INTO \`graphic_layout_prompts\` (\`type\`, \`label\`, \`prompt\`, \`description\`) VALUES
   ('layout_plan_system', '排版规划系统提示词', ?, '控制 AI 排版规划的行为。版式包风格、页面尺寸等参数会自动注入，此处填写通用规则和质量要求。'),
   ('image_generation', '图像生成风格提示词', ?, '追加到每个图像生成 prompt 末尾的风格描述。使用英文效果更好。')
   ON DUPLICATE KEY UPDATE \`updatedAt\` = \`updatedAt\``,
  [layoutPlanPrompt, imageGenPrompt]
);
console.log("✓ Default prompts inserted");

await conn.end();
console.log("Migration complete");
