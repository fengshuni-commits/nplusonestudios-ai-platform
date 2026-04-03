import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Create table
await conn.execute(`CREATE TABLE IF NOT EXISTS \`case_study_prompts\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`phase\` enum('keyword_extraction','case_selection','report_generation') NOT NULL,
  \`label\` varchar(128) NOT NULL,
  \`prompt\` text NOT NULL,
  \`description\` text,
  \`updatedBy\` int,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`case_study_prompts_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`case_study_phase_unique\` UNIQUE(\`phase\`)
)`);
console.log('Table created');

const keywordPrompt = `你是一位设计专家。请从用户的项目需求描述中，提取 4-6 个最关键的设计维度关键词（如空间类型、功能特征、设计风格、技术要求、用户体验等）。
这些关键词将用于引导案例搜索，应该具体且有区分度，避免过于宽泛。
只返回关键词列表，每行一个，无需解释。`;

const caseSelectionPrompt = `你是 N+1 STUDIOS 的对标调研专家。请仔细阅读用户提供的项目信息和需求描述，选出 {referenceCount} 个与该项目需求最匹配的对标案例名称。

选案标准：案例应在空间类型、设计元素、使用场景或设计理念上与项目需求直接相关。案例必须是真实存在的项目，使用项目官方名称（英文或中文）。**时间要求：优先选择 2022 年至今竣工或公开发布的项目**，如近三年内无足够匹配案例，可适当放宽至 2018 年后。{excludeSection}
只返回案例名称列表，每行一个，不要包含链接或额外说明。`;

const reportPrompt = `你是 N+1 STUDIOS 的对标调研专家。请根据用户提供的项目信息和以下对标案例列表，生成一份专业的对标调研报告。

**当前日期**：{currentDate}（北京时间）。报告中如需标注日期，请使用此日期。

**对标案例及真实链接**：
{caseRefs}

**重要要求**：
- 严格使用上面提供的案例名称和链接，不要自行编造 URL
- 如果某个案例标注了"URL 未找到"，则展示案例信息时不要添加链接
- 每个案例标题后用 Markdown 链接标注来源，例如 [来源](https://www.archdaily.com/xxx)
- 如果案例数据中提供了「图片」字段（格式为 [![名称](图片URL)](案例URL)），请将这些图片**原样**嵌入该案例的分析段落中（放在设计亮点分析之前），**绝对不要修改图片的 Markdown 格式**，必须保留完整的 [![名称](图片URL)](案例URL) 结构，这样图片才能点击跳转到来源页面
报告结构：
1. **项目概述与调研目标**
2. **对标案例分析**（{referenceCount} 个案例，每个案例包含）：
   - 项目名称 + 来源链接
   - 设计单位
   - 项目概况（位置、面积、完成时间）
   - 案例图片（如有，原样嵌入 [![名称](图片URL)](案例URL) 格式，不得修改）
   - 设计亮点分析
   - 与本项目的关联性分析
3. **设计策略建议**
4. **材料与工艺参考**
5. **总结与建议**
请以 Markdown 格式输出，结构清晰，内容专业。`;

await conn.execute(
  `INSERT IGNORE INTO case_study_prompts (phase, label, prompt, description) VALUES (?, ?, ?, ?)`,
  ['keyword_extraction', '关键词提取', keywordPrompt, '用于从项目需求中提取搜索关键词，关键词将引导后续案例搜索']
);
await conn.execute(
  `INSERT IGNORE INTO case_study_prompts (phase, label, prompt, description) VALUES (?, ?, ?, ?)`,
  ['case_selection', '案例筛选', caseSelectionPrompt, '用于筛选对标案例名称。{referenceCount} 会被替换为案例数量，{excludeSection} 会被替换为需要排除的历史案例列表']
);
await conn.execute(
  `INSERT IGNORE INTO case_study_prompts (phase, label, prompt, description) VALUES (?, ?, ?, ?)`,
  ['report_generation', '报告生成', reportPrompt, '用于生成最终调研报告。{currentDate} 替换为当前日期，{caseRefs} 替换为案例列表，{referenceCount} 替换为案例数量']
);
console.log('Default prompts inserted');

await conn.end();
