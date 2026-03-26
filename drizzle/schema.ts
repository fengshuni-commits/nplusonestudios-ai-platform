import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, longtext } from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  avatar: text("avatar"),
  department: varchar("department", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  approved: boolean("approved").default(false).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  code: varchar("code", { length: 64 }),
  description: text("description"),
  clientName: varchar("clientName", { length: 256 }),
  status: mysqlEnum("status", ["planning", "design", "construction", "completed", "archived"]).default("planning").notNull(),
  phase: mysqlEnum("phase", ["concept", "schematic", "development", "documentation", "bidding", "construction", "closeout"]).default("concept").notNull(),
  companyProfile: text("companyProfile"),
  businessGoal: text("businessGoal"),
  clientProfile: text("clientProfile"),
  projectOverview: text("projectOverview"),
  coverImage: text("coverImage"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Project Custom Fields (自定义项目信息条) ────────────
export const projectCustomFields = mysqlTable("project_custom_fields", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  fieldName: varchar("fieldName", { length: 256 }).notNull(),
  fieldValue: text("fieldValue"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProjectCustomField = typeof projectCustomFields.$inferSelect;
export type InsertProjectCustomField = typeof projectCustomFields.$inferInsert;

// ─── Project Field Templates (信息类别模板，管理员配置) ────
export const projectFieldTemplates = mysqlTable("project_field_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 256 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  isDefault: boolean("isDefault").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProjectFieldTemplate = typeof projectFieldTemplates.$inferSelect;
export type InsertProjectFieldTemplate = typeof projectFieldTemplates.$inferInsert;

// ─── Project Members ─────────────────────────────────────
export const projectMembers = mysqlTable("project_members", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["lead", "designer", "engineer", "viewer"]).default("designer").notNull(),
  addedBy: int("addedBy"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type ProjectMember = typeof projectMembers.$inferSelect;

// ─── Tasks (Kanban) ──────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["backlog", "todo", "in_progress", "review", "done"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  category: mysqlEnum("category", ["design", "construction", "management", "other"]).default("design").notNull(),
  assigneeId: int("assigneeId"),
  startDate: timestamp("startDate"),
  dueDate: timestamp("dueDate"),
  progress: int("progress").default(0),
  parentId: int("parentId"),
  reviewerId: int("reviewerId"),
  sortOrder: int("sortOrder").default(0),
  createdBy: int("createdBy"),
  approval: boolean("approval").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Documents ───────────────────────────────────────────
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  title: varchar("title", { length: 512 }).notNull(),
  content: text("content"),
  type: mysqlEnum("type", ["brief", "report", "minutes", "specification", "checklist", "schedule", "other"]).default("other").notNull(),
  category: mysqlEnum("category", ["design", "construction", "management"]).default("design").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  version: int("version").default(1),
  parentId: int("parentId"),
  createdBy: int("createdBy"),
  // AI analysis fields for URL documents
  aiSummary: text("aiSummary"),
  aiKeywords: text("aiKeywords"),
  urlMeta: text("urlMeta"), // JSON: { favicon, siteName, ogImage, ... }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Assets (素材库) ─────────────────────────────────────
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 128 }),
  tags: text("tags"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  fileType: varchar("fileType", { length: 64 }),
  fileSize: int("fileSize"),
  thumbnailUrl: text("thumbnailUrl"),
  uploadedBy: int("uploadedBy"),
  historyId: int("historyId"),
  projectId: int("projectId"),
  parentId: int("parentId"),
  isFolder: boolean("isFolder").default(false).notNull(),
  path: varchar("path", { length: 1024 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

// ─── Standards (出品标准库) ──────────────────────────────
export const standards = mysqlTable("standards", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  content: text("content"),
  category: mysqlEnum("category", ["design_spec", "construction_spec", "quality_checklist", "material_spec", "other"]).default("other").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  version: int("version").default(1),
  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Standard = typeof standards.$inferSelect;
export type InsertStandard = typeof standards.$inferInsert;

// ─── AI Tools Configuration ─────────────────────────────
export const aiTools = mysqlTable("ai_tools", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["rendering", "document", "image", "video", "layout", "analysis", "other"]).default("other").notNull(),
  provider: varchar("provider", { length: 128 }),
  apiEndpoint: text("apiEndpoint"),
  apiKeyName: varchar("apiKeyName", { length: 128 }),
  apiKeyEncrypted: text("apiKeyEncrypted"),
  configJson: json("configJson"),
  capabilities: json("capabilities").$type<string[]>(),
  isActive: boolean("isActive").default(true),
  isDefault: boolean("isDefault").default(false),
  iconUrl: text("iconUrl"),
  sortOrder: int("sortOrder").default(0),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiTool = typeof aiTools.$inferSelect;
export type InsertAiTool = typeof aiTools.$inferInsert;

// ─── AI Tool Usage Logs ─────────────────────────────────
export const aiToolLogs = mysqlTable("ai_tool_logs", {
  id: int("id").autoincrement().primaryKey(),
  toolId: int("toolId").notNull(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  action: varchar("action", { length: 256 }),
  inputSummary: text("inputSummary"),
  outputSummary: text("outputSummary"),
  status: mysqlEnum("status", ["success", "failed", "pending"]).default("pending").notNull(),
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiToolLog = typeof aiToolLogs.$inferSelect;

// ─── API Tokens (OpenClaw 专用 API Token) ──────────────
export const apiTokens = mysqlTable("api_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(),
  tokenPreview: varchar("tokenPreview", { length: 20 }).notNull(), // 前 10 个字符用于显示
  type: mysqlEnum("type", ["openclaw", "webhook", "general"]).default("general").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  callCount: int("callCount").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiToken = typeof apiTokens.$inferSelect;
export type InsertApiToken = typeof apiTokens.$inferInsert;

// ─── Suppliers (供应商) ──────────────────────────────────
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  contactPerson: varchar("contactPerson", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  category: varchar("category", { length: 128 }),
  address: text("address"),
  notes: text("notes"),
  rating: int("rating"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

// ─── Procurement (采购清单) ──────────────────────────────
export const procurements = mysqlTable("procurements", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  itemName: varchar("itemName", { length: 512 }).notNull(),
  specification: text("specification"),
  quantity: int("quantity").default(1),
  unit: varchar("unit", { length: 32 }),
  estimatedCost: int("estimatedCost"),
  actualCost: int("actualCost"),
  supplierId: int("supplierId"),
  status: mysqlEnum("status", ["pending", "ordered", "shipped", "received", "cancelled"]).default("pending").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Procurement = typeof procurements.$inferSelect;
export type InsertProcurement = typeof procurements.$inferInsert;

// ─── Webhooks (OpenClaw integration) ────────────────────
export const webhooks = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  url: text("url").notNull(),
  secret: varchar("secret", { length: 256 }),
  events: text("events"),
  isActive: boolean("isActive").default(true),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

// ─── API Keys (OpenClaw integration) ────────────────────
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  keyHash: varchar("keyHash", { length: 256 }).notNull(),
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
  permissions: text("permissions"),
  isActive: boolean("isActive").default(true),
  lastUsedAt: timestamp("lastUsedAt"),
  expiresAt: timestamp("expiresAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─── Workflow Templates ─────────────────────────────────
export const workflowTemplates = mysqlTable("workflow_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["project_init", "design_review", "construction", "delivery", "custom"]).default("custom").notNull(),
  stepsJson: json("stepsJson"),
  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;

// ─── Workflow Instances ─────────────────────────────────
export const workflowInstances = mysqlTable("workflow_instances", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull(),
  projectId: int("projectId"),
  name: varchar("name", { length: 256 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "completed", "cancelled"]).default("active").notNull(),
  currentStep: int("currentStep").default(0),
  stepsData: json("stepsData"),
  startedBy: int("startedBy"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type WorkflowInstance = typeof workflowInstances.$inferSelect;

// ─── Case Source Sites (案例来源网站配置) ───────────────
export const caseSources = mysqlTable("case_sources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  baseUrl: text("baseUrl").notNull(),
  description: text("description"),
  /** CSS selector for project images on detail pages */
  imageSelector: varchar("imageSelector", { length: 512 }),
  /** CSS selector for project title */
  titleSelector: varchar("titleSelector", { length: 512 }),
  /** CSS selector for project description */
  descSelector: varchar("descSelector", { length: 512 }),
  /** Image URL domain (e.g. images.adsttc.com for ArchDaily) */
  imageDomain: varchar("imageDomain", { length: 256 }),
  /** Preferred image size keyword in URL (e.g. large_jpg, newsletter) */
  preferredSize: varchar("preferredSize", { length: 64 }),
  isActive: boolean("isActive").default(true),
  sortOrder: int("sortOrder").default(0),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CaseSource = typeof caseSources.$inferSelect;
export type InsertCaseSource = typeof caseSources.$inferInsert;

// ─── Generation History (生成记录) ──────────────────────
export const generationHistory = mysqlTable("generation_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Module: benchmark_report, benchmark_ppt, ai_render, meeting_minutes */
  module: varchar("module", { length: 64 }).notNull(),
  /** Human-readable title for the generation */
  title: varchar("title", { length: 512 }).notNull(),
  /** Brief description or summary */
  summary: text("summary"),
  /** Input parameters (JSON) */
  inputParams: json("inputParams"),
  /** Output URL (e.g. PPT download link, image URL) */
  outputUrl: text("outputUrl"),
  /** Output content (e.g. report text, for text-based outputs) */
  outputContent: text("outputContent"),
  /** Status: success, failed, processing */
  status: mysqlEnum("status", ["success", "failed", "processing"]).default("success").notNull(),
  /** Duration in milliseconds */
  durationMs: int("durationMs"),
  /** Parent history ID for edit chain (null = root/first generation) */
  parentId: int("parentId"),
  /** Associated project ID (optional) */
  projectId: int("projectId"),
  /** Creator name (denormalized for display, from users.name at creation time) */
  createdByName: varchar("createdByName", { length: 256 }),
  /** Enhanced image URL after Magnific upscaling */
  enhancedImageUrl: text("enhancedImageUrl"),
  /** Magnific/Freepik task ID for polling */
  enhanceTaskId: varchar("enhanceTaskId", { length: 128 }),
  /** Enhancement status: idle, processing, done, failed */
  enhanceStatus: mysqlEnum("enhanceStatus", ["idle", "processing", "done", "failed"]).default("idle"),
  /** Enhancement params (JSON: scale, optimized_for, creativity, detail, resemblance) */
  enhanceParams: json("enhanceParams"),
  /** Model name used for generation (e.g. qwen-plus, gpt-4o, flux-dev) */
  modelName: varchar("modelName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GenerationHistory = typeof generationHistory.$inferSelect;
export type InsertGenerationHistory = typeof generationHistory.$inferInsert;

// ─── Feedback (满意度反馈) ─────────────────────────────
export const feedback = mysqlTable("feedback", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Module: benchmark_report, benchmark_ppt, ai_render, meeting_minutes, media_xiaohongshu, media_wechat, media_instagram */
  module: varchar("module", { length: 64 }).notNull(),
  /** Related generation history ID (optional) */
  historyId: int("historyId"),
  /** Rating: satisfied or unsatisfied */
  rating: mysqlEnum("rating", ["satisfied", "unsatisfied"]).notNull(),
  /** Optional text feedback for improvement suggestions */
  comment: text("comment"),
  /** Snapshot of input params for context */
  contextJson: json("contextJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;

// ─── Benchmark Jobs (异步对标调研任务) ─────────────────────
export const benchmarkJobs = mysqlTable("benchmark_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(), // UUID job ID
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "done", "failed"]).default("pending").notNull(),
  /** Input params JSON */
  inputParams: json("inputParams").notNull(),
  /** Generated report content */
  result: text("result"),
  /** Error message if failed */
  error: text("error"),
  /** Case references: JSON map of caseName -> URL (set after Phase 2 search) */
  caseRefs: json("caseRefs"),
  /** Related generation history ID (set on completion) */
  historyId: int("historyId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BenchmarkJob = typeof benchmarkJobs.$inferSelect;
export type InsertBenchmarkJob = typeof benchmarkJobs.$inferInsert;

// ─── Render Styles (出品标准：渲染风格库) ─────────────────────────────────────
export const renderStyles = mysqlTable("render_styles", {
  id: int("id").autoincrement().primaryKey(),
  /** Display name shown in the UI dropdown */
  label: varchar("label", { length: 128 }).notNull(),
  /** Prompt hint injected into image generation prompt */
  promptHint: text("promptHint").notNull(),
  /** Reference image URL (S3) used as style reference for AI generation; nullable */
  referenceImageUrl: text("referenceImageUrl"),
  /** Display order (ascending) */
  sortOrder: int("sortOrder").default(0).notNull(),
  /** Whether this style is active and visible in the dropdown */
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RenderStyle = typeof renderStyles.$inferSelect;
export type InsertRenderStyle = typeof renderStyles.$inferInsert;

// ─── AI Tool Defaults per Capability ─────────────────────
// 每个 capability 类别可以独立设置一个默认工具
export const aiToolDefaults = mysqlTable("ai_tool_defaults", {
  id: int("id").autoincrement().primaryKey(),
  /** capability 标识，如 "image_generation"、"document"、"analysis" */
  capability: varchar("capability", { length: 64 }).notNull().unique(),
  /** 对应的默认工具 ID（引用 ai_tools.id） */
  toolId: int("toolId").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiToolDefault = typeof aiToolDefaults.$inferSelect;
export type InsertAiToolDefault = typeof aiToolDefaults.$inferInsert;

// ─── Video Generation History ────────────────────────────
// 存储用户的视频生成历史记录
export const videoHistory = mysqlTable("video_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  toolId: int("toolId"), // 使用的视频生成工具 ID
  mode: mysqlEnum("mode", ["text-to-video", "image-to-video"]).notNull(),
  prompt: text("prompt").notNull(), // 文生视频的描述词或图生视频的额外描述
  duration: int("duration").notNull(), // 视频时长（秒），1-8
  inputImageUrl: text("inputImageUrl"), // 图生视频时的首帧图 URL
  outputVideoUrl: text("outputVideoUrl"), // 生成的视频 URL
  taskId: varchar("taskId", { length: 256 }), // 第三方 API 的任务 ID（用于查询状态）
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"), // 失败时的错误信息
  metadata: json("metadata"), // 存储额外信息（如 API 响应、参数等）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoHistory = typeof videoHistory.$inferSelect;
export type InsertVideoHistory = typeof videoHistory.$inferInsert;

// ─── Personal Tasks ──────────────────────────────────────
// 个人任务：仅对创建者可见，不关联项目，不在团队视图中显示
export const personalTasks = mysqlTable("personal_tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  notes: text("notes"),
  priority: mysqlEnum("priority", ["urgent", "high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", ["todo", "in_progress", "done"]).default("todo").notNull(),
  startDate: timestamp("startDate"),
  dueDate: timestamp("dueDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PersonalTask = typeof personalTasks.$inferSelect;
export type InsertPersonalTask = typeof personalTasks.$inferInsert;
