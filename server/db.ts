import crypto from "node:crypto";
import { eq, desc, like, and, sql, inArray, or, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  projects, InsertProject, Project,
  projectMembers,
  tasks, InsertTask, Task,
  documents, InsertDocument,
  assets, InsertAsset,
  standards, InsertStandard,
  aiTools, InsertAiTool,
  aiToolLogs,
  suppliers, InsertSupplier,
  procurements, InsertProcurement,
  webhooks, InsertWebhook,
  apiKeys, InsertApiKey,
  workflowTemplates, InsertWorkflowTemplate,
  workflowInstances,
  feedback, InsertFeedback,
  projectCustomFields, InsertProjectCustomField,
  projectFieldTemplates, InsertProjectFieldTemplate,
  generationHistory,
  InsertGenerationHistory,
  benchmarkJobs,
  renderStyles, InsertRenderStyle,
  aiToolDefaults,
  videoHistory, InsertVideoHistory,
  apiTokens, InsertApiToken, ApiToken,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Execute a DB operation with one automatic retry on ECONNRESET */
// ─── API Token Helpers ──────────────────────────────────
export async function generateOpenClawToken(
  userId: number,
  name: string,
  expiresInDays: number = 365
): Promise<{ token: string; tokenPreview: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  // 生成随机 token
  const token = `sk_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const tokenHash = hashToken(token);
  const tokenPreview = token.substring(0, 10);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await db.insert(apiTokens).values({
    userId,
    name,
    tokenHash,
    tokenPreview,
    type: "openclaw",
    expiresAt,
    isActive: true,
  });

  return { token, tokenPreview };
}

export async function getApiTokensByUserId(userId: number): Promise<ApiToken[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(apiTokens.createdAt);
}

export async function revokeApiToken(tokenId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(apiTokens)
    .set({ isActive: false })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));

  return true;
}

export async function verifyApiToken(token: string): Promise<{ userId: number; type: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const tokenHash = hashToken(token);
  const record = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), eq(apiTokens.isActive, true)))
    .limit(1);

  if (record.length === 0) return null;

  const tokenRecord = record[0];
  if (new Date() > tokenRecord.expiresAt) return null;

  // 更新最后使用时间 + 递增调用次数
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date(), callCount: sql`${apiTokens.callCount} + 1` })
    .where(eq(apiTokens.id, tokenRecord.id));

  return { userId: tokenRecord.userId, type: tokenRecord.type };
}

// Token 哈希函数 - 使用 Node.js 原生 crypto 避免运行时差异
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err?.code === 'ECONNRESET' || err?.cause?.code === 'ECONNRESET') {
      // Reset the connection pool and retry once
      console.warn('[Database] ECONNRESET detected, resetting connection and retrying...');
      _db = null;
      await getDb();
      return await fn();
    }
    throw err;
  }
}

// ─── Users ───────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  // Owner is always approved
  if (user.openId === ENV.ownerOpenId) { values.approved = true; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await withRetry(async () => {
    const db = await getDb();
    if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  });
}

export async function approveUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ approved: true }).where(eq(users.id, userId));
}

export async function revokeUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ approved: false }).where(eq(users.id, userId));
}

export async function listPendingUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.approved, false)).orderBy(desc(users.createdAt));
}

export async function getUserByOpenId(openId: string) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  });
}

export async function getUserById(userId: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  });
}

export async function updateApiTokenLastUsed(token: string): Promise<void> {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return;
    const tokenHash = await hashToken(token);
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date(), callCount: sql`${apiTokens.callCount} + 1` })
      .where(eq(apiTokens.tokenHash, tokenHash));
  });
}

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ─── Projects ────────────────────────────────────────────

export async function listProjects(opts?: { search?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.search) conditions.push(or(like(projects.name, `%${opts.search}%`), like(projects.code, `%${opts.search}%`)));
  if (opts?.status) conditions.push(eq(projects.status, opts.status as any));
  const rows = await db.select().from(projects).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(desc(projects.updatedAt));
  if (rows.length === 0) return [];
  // Attach clientName and summary from project_custom_fields for each project
  const projectIds = rows.map(r => r.id);
  // Fetch all custom fields for these projects (to derive clientName + summary)
  const allCustomFields = await db.select({
    projectId: projectCustomFields.projectId,
    fieldName: projectCustomFields.fieldName,
    fieldValue: projectCustomFields.fieldValue,
    sortOrder: projectCustomFields.sortOrder,
    createdAt: projectCustomFields.createdAt,
  }).from(projectCustomFields)
    .where(inArray(projectCustomFields.projectId, projectIds))
    .orderBy(projectCustomFields.sortOrder, projectCustomFields.createdAt);

  // Group by projectId
  const fieldsByProject = new Map<number, typeof allCustomFields>();
  for (const f of allCustomFields) {
    if (!fieldsByProject.has(f.projectId)) fieldsByProject.set(f.projectId, []);
    fieldsByProject.get(f.projectId)!.push(f);
  }

  return rows.map(r => {
    const fields = fieldsByProject.get(r.id) || [];
    const clientField = fields.find(f => f.fieldName === '甲方名称');
    // Summary: prefer 项目概况, else first field with value
    const summaryField = fields.find(f => f.fieldName === '项目概况') || fields.find(f => f.fieldValue?.trim());
    return {
      ...r,
      clientNameDisplay: clientField?.fieldValue ?? null,
      summaryDisplay: summaryField?.fieldValue ?? null,
    };
  });
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data);
  return { id: result[0].insertId };
}

export async function updateProject(id: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(projectCustomFields).where(eq(projectCustomFields.projectId, id));
  await db.delete(tasks).where(eq(tasks.projectId, id));
  await db.delete(documents).where(eq(documents.projectId, id));
  await db.delete(projectMembers).where(eq(projectMembers.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}

// ─── Project Custom Fields ─────────────────────────────

export async function listProjectCustomFields(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectCustomFields)
    .where(eq(projectCustomFields.projectId, projectId))
    .orderBy(projectCustomFields.sortOrder, projectCustomFields.createdAt);
}

export async function createProjectCustomField(data: InsertProjectCustomField) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectCustomFields).values(data);
  return { id: result[0].insertId };
}

export async function updateProjectCustomField(id: number, data: Partial<InsertProjectCustomField>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projectCustomFields).set(data).where(eq(projectCustomFields.id, id));
}

export async function deleteProjectCustomField(id: number) {
  const db = await getDb();
  if (!db) return;
   await db.delete(projectCustomFields).where(eq(projectCustomFields.id, id));
}

// ─── Project Field Templates ──────────────────────────────────────

export async function listProjectFieldTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectFieldTemplates)
    .orderBy(projectFieldTemplates.sortOrder, projectFieldTemplates.createdAt);
}

export async function createProjectFieldTemplate(data: InsertProjectFieldTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectFieldTemplates).values(data);
  return { id: result[0].insertId };
}

export async function updateProjectFieldTemplate(id: number, data: Partial<InsertProjectFieldTemplate>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projectFieldTemplates).set(data).where(eq(projectFieldTemplates.id, id));
}

export async function deleteProjectFieldTemplate(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(projectFieldTemplates).where(eq(projectFieldTemplates.id, id));
}

/// ─── Project Members ───────────────────────────────────────────────────

export async function listProjectMembers(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  // Join with users to get member info
  return db.select({
    id: projectMembers.id,
    projectId: projectMembers.projectId,
    userId: projectMembers.userId,
    role: projectMembers.role,
    addedBy: projectMembers.addedBy,
    joinedAt: projectMembers.joinedAt,
    userName: users.name,
    userEmail: users.email,
    userAvatar: users.avatar,
    userDepartment: users.department,
  }).from(projectMembers)
    .leftJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(projectMembers.joinedAt);
}

export async function addProjectMember(data: { projectId: number; userId: number; role?: string; addedBy?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if already a member
  const existing = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, data.projectId), eq(projectMembers.userId, data.userId)))
    .limit(1);
  if (existing.length > 0) return { id: existing[0].id };
  const result = await db.insert(projectMembers).values({
    projectId: data.projectId,
    userId: data.userId,
    role: (data.role || "designer") as any,
    addedBy: data.addedBy,
  });
  return { id: result[0].insertId };
}

export async function removeProjectMember(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function updateProjectMemberRole(projectId: number, userId: number, role: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(projectMembers)
    .set({ role: role as any })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function isProjectMember(projectId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: projectMembers.id }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return result.length > 0;
}

// ─── Project Generation History (by projectId) ────

export async function listProjectGenerationHistory(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  // Return records with user info for display
  return db.select({
    id: generationHistory.id,
    userId: generationHistory.userId,
    module: generationHistory.module,
    title: generationHistory.title,
    summary: generationHistory.summary,
    outputUrl: generationHistory.outputUrl,
    outputContent: generationHistory.outputContent,
    status: generationHistory.status,
    parentId: generationHistory.parentId,
    projectId: generationHistory.projectId,
    createdByName: generationHistory.createdByName,
    createdAt: generationHistory.createdAt,
    // Join user info
    userName: users.name,
    userAvatar: users.avatar,
  }).from(generationHistory)
    .leftJoin(users, eq(generationHistory.userId, users.id))
    .where(eq(generationHistory.projectId, projectId))
    .orderBy(desc(generationHistory.createdAt));
}

export async function deleteGenerationHistory(id: number, userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return;
  // Admin can delete any record; regular user can only delete their own
  const conditions = isAdmin
    ? [eq(generationHistory.id, id)]
    : [eq(generationHistory.id, id), eq(generationHistory.userId, userId)];
  // Also delete children in the edit chain
  const children = await db.select({ id: generationHistory.id }).from(generationHistory)
    .where(eq(generationHistory.parentId, id));
  for (const child of children) {
    await deleteGenerationHistory(child.id, userId, isAdmin);
  }
  await db.delete(generationHistory).where(and(...conditions));
}

/// ─── Tasks ───────────────────────────────────────────────
export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return null;
  return await db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(rows => rows[0] || null);
}

export async function listTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      category: tasks.category,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      assigneeAvatar: users.avatar,
      reviewerId: tasks.reviewerId,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      progress: tasks.progress,
      parentId: tasks.parentId,
      sortOrder: tasks.sortOrder,
      createdBy: tasks.createdBy,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.sortOrder, desc(tasks.createdAt));
  return rows;
}

export async function listMyTasks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const taskFields = {
    id: tasks.id,
    projectId: tasks.projectId,
    title: tasks.title,
    description: tasks.description,
    status: tasks.status,
    priority: tasks.priority,
    category: tasks.category,
    assigneeId: tasks.assigneeId,
    reviewerId: tasks.reviewerId,
    startDate: tasks.startDate,
    dueDate: tasks.dueDate,
    progress: tasks.progress,
    parentId: tasks.parentId,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    projectName: projects.name,
  };
  // 执行中：分配给我的任务（状态不是 done）
  const assignedRows = await db
    .select({ ...taskFields, role: sql<string>`'assignee'` })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, userId), sql`${tasks.status} != 'done'`))
    .orderBy(tasks.dueDate, desc(tasks.createdAt));
  // 待审核：我是审核人，且任务进度为 100% 且状态不是 done
  const reviewRows = await db
    .select({ ...taskFields, role: sql<string>`'reviewer'` })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(tasks.reviewerId, userId),
      sql`${tasks.progress} = 100`,
      sql`${tasks.status} != 'done'`
    ))
    .orderBy(tasks.dueDate, desc(tasks.createdAt));
  return [...assignedRows, ...reviewRows];
}

export async function listSubTasks(parentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.parentId, parentId)).orderBy(tasks.sortOrder, desc(tasks.createdAt));
}

export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(data);
  return { id: result[0].insertId };
}

export async function updateTaskStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ status: status as any }).where(eq(tasks.id, id));
}

export async function updateTask(id: number, data: Partial<InsertTask>) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function getRecentTasks(limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.status, "todo")).orderBy(desc(tasks.createdAt)).limit(limit);
}

// ─── Documents ───────────────────────────────────────────

export async function listDocumentsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.updatedAt));
}

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return { id: result[0].insertId };
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0];
}

export async function updateDocument(id: number, data: Partial<InsertDocument>) {
  const db = await getDb();
  if (!db) return;
  await db.update(documents).set(data).where(eq(documents.id, id));
}

// ─── Assets ──────────────────────────────────────────────

export async function listAssets(opts?: { category?: string; search?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.category) conditions.push(eq(assets.category, opts.category));
  if (opts?.search) conditions.push(like(assets.name, `%${opts.search}%`));
  const rows = await db
    .select({
      id: assets.id,
      name: assets.name,
      description: assets.description,
      category: assets.category,
      tags: assets.tags,
      fileUrl: assets.fileUrl,
      fileKey: assets.fileKey,
      fileType: assets.fileType,
      fileSize: assets.fileSize,
      thumbnailUrl: assets.thumbnailUrl,
      uploadedBy: assets.uploadedBy,
      historyId: assets.historyId,
      projectId: assets.projectId,
      createdAt: assets.createdAt,
      projectName: projects.name,
    })
    .from(assets)
    .leftJoin(projects, eq(assets.projectId, projects.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(assets.createdAt));
  return rows;
}

export async function createAsset(data: InsertAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(assets).values(data);
  return { id: result[0].insertId };
}

export async function deleteAsset(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(assets).where(eq(assets.id, id));
}
export async function findAssetByUrl(fileUrl: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(assets).where(eq(assets.fileUrl, fileUrl)).limit(1);
  return result[0];
}

export async function createFolder(data: { name: string; parentId?: number; path?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(assets).values({
    name: data.name,
    parentId: data.parentId,
    isFolder: true,
    path: data.path,
    fileUrl: "",
    fileKey: "",
  });
  return { id: result[0].insertId };
}

export async function getAssetsByParent(parentId: number | null) {
  const db = await getDb();
  if (!db) return [];
  const condition = parentId === null ? isNull(assets.parentId) : eq(assets.parentId, parentId);
  return db
    .select({
      id: assets.id,
      name: assets.name,
      description: assets.description,
      category: assets.category,
      tags: assets.tags,
      fileUrl: assets.fileUrl,
      fileKey: assets.fileKey,
      fileType: assets.fileType,
      fileSize: assets.fileSize,
      thumbnailUrl: assets.thumbnailUrl,
      uploadedBy: assets.uploadedBy,
      historyId: assets.historyId,
      projectId: assets.projectId,
      parentId: assets.parentId,
      isFolder: assets.isFolder,
      path: assets.path,
      createdAt: assets.createdAt,
      projectName: projects.name,
    })
    .from(assets)
    .leftJoin(projects, eq(assets.projectId, projects.id))
    .where(condition)
    .orderBy(assets.isFolder, desc(assets.createdAt));
}

export async function moveAsset(assetId: number, newParentId: number | null, newPath?: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(assets)
    .set({ parentId: newParentId, path: newPath })
    .where(eq(assets.id, assetId));
}

export async function deleteFolder(folderId: number) {
  const db = await getDb();
  if (!db) return;
  // Get all children recursively
  const getAllChildren = async (parentId: number): Promise<number[]> => {
    const children = await db
      .select({ id: assets.id, isFolder: assets.isFolder })
      .from(assets)
      .where(eq(assets.parentId, parentId));
    let allIds = children.map((c) => c.id);
    for (const child of children) {
      if (child.isFolder) {
        allIds = allIds.concat(await getAllChildren(child.id));
      }
    }
    return allIds;
  };
  const childIds = await getAllChildren(folderId);
  const allIds = [folderId, ...childIds];
  if (allIds.length > 0) {
    await db.delete(assets).where(inArray(assets.id, allIds));
  }
}

// ─── Standardss ───────────────────────────────────────────

export async function listStandards(opts?: { category?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(standards.isActive, true)];
  if (opts?.category) conditions.push(eq(standards.category, opts.category as any));
  return db.select().from(standards).where(and(...conditions)).orderBy(desc(standards.updatedAt));
}

export async function createStandard(data: InsertStandard) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(standards).values(data);
  return { id: result[0].insertId };
}

export async function updateStandard(id: number, data: Partial<InsertStandard>) {
  const db = await getDb();
  if (!db) return;
  await db.update(standards).set(data).where(eq(standards.id, id));
}

// ─── AI Tools ────────────────────────────────────────────

export async function listAiTools(opts?: { category?: string; activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.activeOnly !== false) conditions.push(eq(aiTools.isActive, true));
  if (opts?.category) conditions.push(eq(aiTools.category, opts.category as any));
  return db.select().from(aiTools).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(aiTools.sortOrder, aiTools.name);
}

export async function getAiToolById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aiTools).where(eq(aiTools.id, id)).limit(1);
  return result[0];
}

export async function createAiTool(data: InsertAiTool) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiTools).values(data);
  return { id: result[0].insertId };
}

export async function updateAiTool(id: number, data: Partial<InsertAiTool>) {
  const db = await getDb();
  if (!db) return;
  await db.update(aiTools).set(data).where(eq(aiTools.id, id));
}

export async function deleteAiTool(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(aiTools).where(eq(aiTools.id, id));
}

export async function clearDefaultAiTool() {
  const db = await getDb();
  if (!db) return;
  await db.update(aiTools).set({ isDefault: false });
}

// ─── AI Tool Defaults per Capability ─────────────────────

/** 获取某 capability 的默认工具 ID */
export async function getDefaultToolForCapability(capability: string): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(aiToolDefaults).where(eq(aiToolDefaults.capability, capability)).limit(1);
  return rows[0]?.toolId;
}

/** 获取所有 capability 的默认工具映射 */
export async function getAllCapabilityDefaults(): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(aiToolDefaults);
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.capability] = row.toolId;
  }
  return result;
}

/** 设置某 capability 的默认工具（upsert） */
export async function setDefaultToolForCapability(capability: string, toolId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(aiToolDefaults)
    .values({ capability, toolId })
    .onDuplicateKeyUpdate({ set: { toolId } });
}

/** 删除某 capability 的默认工具（恢复为内置 AI） */
export async function clearDefaultToolForCapability(capability: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(aiToolDefaults).where(eq(aiToolDefaults.capability, capability));
}

// ─── AI Tool Logs ────────────────────────────────────────

export async function createAiToolLog(data: { toolId: number; userId: number; projectId?: number; action?: string; inputSummary?: string; outputSummary?: string; status?: string; durationMs?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(aiToolLogs).values(data as any);
}

export async function getAiToolCallCount(since?: Date) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [];
  if (since) conditions.push(sql`${aiToolLogs.createdAt} >= ${since}`);
  const result = await db.select({ count: sql<number>`count(*)` }).from(aiToolLogs).where(conditions.length > 0 ? and(...conditions) : undefined);
  return result[0]?.count ?? 0;
}

// ─── Suppliers ───────────────────────────────────────────

export async function listSuppliers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suppliers).orderBy(suppliers.name);
}

export async function createSupplier(data: InsertSupplier) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(suppliers).values(data);
  return { id: result[0].insertId };
}

// ─── Procurements ────────────────────────────────────────

export async function listProcurementsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(procurements).where(eq(procurements.projectId, projectId)).orderBy(desc(procurements.createdAt));
}

export async function createProcurement(data: InsertProcurement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(procurements).values(data);
  return { id: result[0].insertId };
}

// ─── Webhooks ────────────────────────────────────────────

export async function listWebhooks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
}

export async function createWebhook(data: InsertWebhook) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(webhooks).values(data);
  return { id: result[0].insertId };
}

export async function updateWebhook(id: number, data: Partial<InsertWebhook>) {
  const db = await getDb();
  if (!db) return;
  await db.update(webhooks).set(data).where(eq(webhooks.id, id));
}

export async function deleteWebhook(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(webhooks).where(eq(webhooks.id, id));
}

export async function getActiveWebhooksByEvent(event: string) {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(webhooks).where(eq(webhooks.isActive, true));
  return all.filter(w => {
    if (!w.events) return false;
    const events = typeof w.events === 'string' ? JSON.parse(w.events) : w.events;
    return Array.isArray(events) && events.includes(event);
  });
}

// ─── API Keys ────────────────────────────────────────────

export async function listApiKeys() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, permissions: apiKeys.permissions, isActive: apiKeys.isActive, lastUsedAt: apiKeys.lastUsedAt, expiresAt: apiKeys.expiresAt, createdAt: apiKeys.createdAt }).from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(data: InsertApiKey) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(apiKeys).values(data);
  return { id: result[0].insertId };
}

export async function getApiKeyByHash(keyHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true))).limit(1);
  return result[0];
}

export async function updateApiKeyLastUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
}

export async function deleteApiKey(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, id));
}

// ─── Dashboard Stats ─────────────────────────────────────

export async function getDashboardStats(userId?: number) {
  const db = await getDb();
  if (!db) return { activeProjects: 0, pendingTasks: 0, completedThisWeek: 0, aiToolCalls: 0, recentProjects: [], recentTasks: [] };

  const activeProjects = await db.select({ count: sql<number>`count(*)` }).from(projects).where(
    inArray(projects.status, ["planning", "design", "construction"])
  );

  const pendingTasks = await db.select({ count: sql<number>`count(*)` }).from(tasks).where(
    inArray(tasks.status, ["todo", "in_progress", "backlog"])
  );

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const completedThisWeek = await db.select({ count: sql<number>`count(*)` }).from(tasks).where(
    and(eq(tasks.status, "done"), sql`${tasks.updatedAt} >= ${weekAgo}`)
  );

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const aiCalls = await getAiToolCallCount(monthAgo);

  const recentProjects = userId
    ? await db.select().from(projects).where(
        sql`(${projects.id} IN (SELECT projectId FROM project_members WHERE userId = ${userId}) OR ${projects.createdBy} = ${userId})`
      ).orderBy(desc(projects.updatedAt)).limit(5)
    : await db.select().from(projects).orderBy(desc(projects.updatedAt)).limit(5);
  const recentTasks = await db.select().from(tasks).where(inArray(tasks.status, ["todo", "in_progress"])).orderBy(desc(tasks.createdAt)).limit(5);

  return {
    activeProjects: activeProjects[0]?.count ?? 0,
    pendingTasks: pendingTasks[0]?.count ?? 0,
    completedThisWeek: completedThisWeek[0]?.count ?? 0,
    aiToolCalls: aiCalls,
    recentProjects,
    recentTasks,
  };
}

// ─── Recent History for Greeting ────────────────────────
export async function listRecentHistoryForGreeting(userId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  const items = await db.select({
    id: generationHistory.id,
    module: generationHistory.module,
    title: generationHistory.title,
    outputUrl: generationHistory.outputUrl,
    createdAt: generationHistory.createdAt,
    status: generationHistory.status,
  })
  .from(generationHistory)
  .where(and(eq(generationHistory.userId, userId), eq(generationHistory.status, "success")))
  .orderBy(desc(generationHistory.createdAt))
  .limit(limit);
  return items;
}

// ─── Workflow Templates ──────────────────────────────────

export async function listWorkflowTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workflowTemplates).where(eq(workflowTemplates.isActive, true)).orderBy(desc(workflowTemplates.createdAt));
}

export async function createWorkflowTemplate(data: InsertWorkflowTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workflowTemplates).values(data);
  return { id: result[0].insertId };
}

// ─── Case Sources ───────────────────────────────────────

import { caseSources, InsertCaseSource } from "../drizzle/schema";

export async function listCaseSources(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const conditions = activeOnly ? [eq(caseSources.isActive, true)] : [];
  return db.select().from(caseSources).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(caseSources.sortOrder);
}

export async function getCaseSourceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(caseSources).where(eq(caseSources.id, id)).limit(1);
  return result[0];
}

export async function createCaseSource(data: InsertCaseSource) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(caseSources).values(data);
  return { id: result[0].insertId };
}

export async function updateCaseSource(id: number, data: Partial<InsertCaseSource>) {
  const db = await getDb();
  if (!db) return;
  await db.update(caseSources).set(data).where(eq(caseSources.id, id));
}

export async function deleteCaseSource(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(caseSources).where(eq(caseSources.id, id));
}

// ─── Generation History ─────────────────────────────────
export async function listGenerationHistory(userId: number, opts?: { module?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const conditions = [eq(generationHistory.userId, userId)];
  if (opts?.module) conditions.push(eq(generationHistory.module, opts.module));
  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  const items = await db.select().from(generationHistory)
    .where(where)
    .orderBy(desc(generationHistory.createdAt))
    .limit(opts?.limit || 50)
    .offset(opts?.offset || 0);
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(generationHistory).where(where);
  return { items, total: countResult[0]?.count || 0 };
}

export async function createGenerationHistory(data: InsertGenerationHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(generationHistory).values(data);
  return { id: result[0].insertId };
}

export async function getGenerationHistoryById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(generationHistory)
    .where(and(eq(generationHistory.id, id), eq(generationHistory.userId, userId)))
    .limit(1);
  return result[0];
}

/**
 * Get the full edit chain for a given root history item.
 * Finds the root ancestor first, then returns all descendants in chronological order.
 */
export async function getEditChain(rootId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  // First, find the root ancestor by walking up the parentId chain
  let currentId = rootId;
  let safety = 50; // prevent infinite loops
  while (safety-- > 0) {
    const item = await db.select().from(generationHistory)
      .where(and(eq(generationHistory.id, currentId), eq(generationHistory.userId, userId)))
      .limit(1);
    if (!item[0]) break;
    if (!item[0].parentId) break; // reached root
    currentId = item[0].parentId;
  }
  const actualRootId = currentId;

  // Determine the module of the root item
  const rootItem = await db.select().from(generationHistory)
    .where(and(eq(generationHistory.id, actualRootId), eq(generationHistory.userId, userId)))
    .limit(1);
  const rootModule = rootItem[0]?.module || "ai_render";

  // Now collect the full chain: root + all descendants
  // Use iterative approach: collect all items for this user in the same module,
  // then build the chain in memory
  const allRenderItems = await db.select().from(generationHistory)
    .where(and(eq(generationHistory.userId, userId), eq(generationHistory.module, rootModule)))
    .orderBy(generationHistory.createdAt);

  // Build a map of parentId -> children
  const childrenMap = new Map<number, typeof allRenderItems>();
  const itemMap = new Map<number, (typeof allRenderItems)[0]>();
  for (const item of allRenderItems) {
    itemMap.set(item.id, item);
    if (item.parentId) {
      const siblings = childrenMap.get(item.parentId) || [];
      siblings.push(item);
      childrenMap.set(item.parentId, siblings);
    }
  }

  // BFS from root to collect chain in order
  const chain: typeof allRenderItems = [];
  const root = itemMap.get(actualRootId);
  if (!root) return [];
  
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    chain.push(current);
    const children = childrenMap.get(current.id) || [];
    // Sort children by createdAt
    children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    queue.push(...children);
  }

  return chain;
}

/**
 * List history items grouped for thumbnail grid display.
 * For ai_render items: only return root items (parentId IS NULL) with the count of children and latest image.
 * For other modules: return as-is.
 */
export async function listGroupedHistory(userId: number, opts?: { module?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  // Helper: convert videoHistory rows to unified history format
  const toHistoryItem = (v: typeof videoHistory.$inferSelect) => ({
    id: v.id + 1000000,
    userId: v.userId,
    projectId: v.projectId || null,
    module: "ai_video" as const,
    title: (v.prompt || "").slice(0, 60) || "AI 视频",
    inputText: v.prompt || "",
    inputImageUrl: v.inputImageUrl || null,
    outputUrl: v.outputVideoUrl || null,
    outputText: null,
    status: v.status,
    errorMessage: v.errorMessage || null,
    metadata: { ...(v.metadata as object || {}), taskId: v.taskId, mode: v.mode, duration: v.duration, videoHistoryId: v.id },
    parentId: null,
    enhancedImageUrl: null,
    chainLength: 1,
    latestOutputUrl: v.outputVideoUrl || null,
    latestTitle: (v.prompt || "").slice(0, 60) || "AI 视频",
    latestEnhancedImageUrl: null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  });

  // If filtering to ai_video, return only video history
  if (opts?.module === "ai_video") {
    const videoItems = await db.select().from(videoHistory)
      .where(eq(videoHistory.userId, userId))
      .orderBy(desc(videoHistory.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: videoItems.map(toHistoryItem), total: videoItems.length };
  }

  // If filtering to a specific non-render, non-benchmark_report module, use the simple list
  if (opts?.module && opts.module !== "ai_render" && opts.module !== "benchmark_report") {
    return listGenerationHistory(userId, opts);
  }

  // For ai_render or benchmark_report single-module view, get roots with chain metadata
  if (opts?.module === "ai_render" || opts?.module === "benchmark_report") {
    const moduleFilter = opts.module;
    const roots = await db.select().from(generationHistory)
      .where(and(
        eq(generationHistory.userId, userId),
        eq(generationHistory.module, moduleFilter),
        sql`${generationHistory.parentId} IS NULL`
      ))
      .orderBy(desc(generationHistory.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(generationHistory)
      .where(and(
        eq(generationHistory.userId, userId),
        eq(generationHistory.module, moduleFilter),
        sql`${generationHistory.parentId} IS NULL`
      ));

    // For each root, build chain info
    const enrichedItems = await Promise.all(roots.map(async (root) => {
      const chainItems = await getEditChain(root.id, userId);
      const latestItem = chainItems[chainItems.length - 1];
      return {
        ...root,
        chainLength: chainItems.length,
        latestOutputUrl: latestItem?.outputUrl || root.outputUrl,
        latestTitle: latestItem?.title || root.title,
        latestEnhancedImageUrl: latestItem?.enhancedImageUrl || null,
      };
    }));

    return { items: enrichedItems, total: countResult[0]?.count || 0 };
  }

  // "all" module view: mix grouped modules (ai_render roots, benchmark_report roots) with other items
  const conditions = [
    eq(generationHistory.userId, userId),
    sql`((${generationHistory.module} != 'ai_render' AND ${generationHistory.module} != 'benchmark_report') OR ${generationHistory.parentId} IS NULL)`,
  ];
  const where = and(...conditions);

  const items = await db.select().from(generationHistory)
    .where(where)
    .orderBy(desc(generationHistory.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` }).from(generationHistory).where(where);

  // Enrich chain-capable roots with chain info
  const enrichedItems = await Promise.all(items.map(async (item) => {
    if ((item.module === "ai_render" || item.module === "benchmark_report") && !item.parentId) {
      const chainItems = await getEditChain(item.id, userId);
      const latestItem = chainItems[chainItems.length - 1];
      return {
        ...item,
        chainLength: chainItems.length,
        latestOutputUrl: latestItem?.outputUrl || item.outputUrl,
        latestTitle: latestItem?.title || item.title,
        latestEnhancedImageUrl: latestItem?.enhancedImageUrl || null,
      };
    }
    return { ...item, chainLength: 1, latestOutputUrl: item.outputUrl, latestTitle: item.title, latestEnhancedImageUrl: item.enhancedImageUrl || null };
  }));

  // Merge videoHistory items into the "all" view
  const videoItems = await db.select().from(videoHistory)
    .where(eq(videoHistory.userId, userId))
    .orderBy(desc(videoHistory.createdAt))
    .limit(limit);
  const videoAsHistory = videoItems.map(toHistoryItem);

  // Merge and sort by createdAt, then apply limit
  const allItems = [...enrichedItems, ...videoAsHistory]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return { items: allItems, total: (countResult[0]?.count || 0) + videoItems.length };
}


// ─── Feedback Helpers ──────────────────────────────────
export async function createFeedback(data: InsertFeedback) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(feedback).values(data);
  return { id: result[0].insertId };
}

export async function getFeedbackByHistoryId(historyId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(feedback)
    .where(and(eq(feedback.historyId, historyId), eq(feedback.userId, userId)))
    .limit(1);
  return rows[0] || null;
}

export async function updateFeedback(id: number, data: { rating?: "satisfied" | "unsatisfied"; comment?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(feedback).set(data).where(eq(feedback.id, id));
}

export async function getFeedbackStats(moduleFilter?: string) {
  const db = await getDb();
  if (!db) return { modules: [], total: { satisfied: 0, unsatisfied: 0, total: 0 } };
  
  const conditions = moduleFilter ? [eq(feedback.module, moduleFilter)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Per-module stats
  const moduleStats = await db.select({
    module: feedback.module,
    rating: feedback.rating,
    count: sql<number>`count(*)`,
  }).from(feedback)
    .where(where)
    .groupBy(feedback.module, feedback.rating);
  
  // Aggregate into a structured result
  const moduleMap: Record<string, { satisfied: number; unsatisfied: number; total: number }> = {};
  let totalSatisfied = 0;
  let totalUnsatisfied = 0;
  
  for (const row of moduleStats) {
    if (!moduleMap[row.module]) {
      moduleMap[row.module] = { satisfied: 0, unsatisfied: 0, total: 0 };
    }
    if (row.rating === "satisfied") {
      moduleMap[row.module].satisfied = row.count;
      totalSatisfied += row.count;
    } else {
      moduleMap[row.module].unsatisfied = row.count;
      totalUnsatisfied += row.count;
    }
    moduleMap[row.module].total += row.count;
  }
  
  const modules = Object.entries(moduleMap).map(([module, stats]) => ({
    module,
    ...stats,
    satisfactionRate: stats.total > 0 ? Math.round((stats.satisfied / stats.total) * 100) : 0,
  }));
  
  return {
    modules,
    total: {
      satisfied: totalSatisfied,
      unsatisfied: totalUnsatisfied,
      total: totalSatisfied + totalUnsatisfied,
      satisfactionRate: (totalSatisfied + totalUnsatisfied) > 0
        ? Math.round((totalSatisfied / (totalSatisfied + totalUnsatisfied)) * 100) : 0,
    },
  };
}

export async function getFeedbackTrend(days: number = 30, moduleFilter?: string) {
  const db = await getDb();
  if (!db) return [];
  
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const conditions = [
    sql`${feedback.createdAt} >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(safeDays))} DAY)`,
  ];
  if (moduleFilter) {
    conditions.push(eq(feedback.module, moduleFilter));
  }
  
  const rows = await db.select({
    date: sql<string>`DATE(${feedback.createdAt})`,
    rating: feedback.rating,
    count: sql<number>`count(*)`,
  }).from(feedback)
    .where(and(...conditions))
    .groupBy(sql`DATE(${feedback.createdAt})`, feedback.rating)
    .orderBy(sql`DATE(${feedback.createdAt})`);
  
  // Group by date
  const dateMap: Record<string, { date: string; satisfied: number; unsatisfied: number }> = {};
  for (const row of rows) {
    const dateStr = String(row.date);
    if (!dateMap[dateStr]) {
      dateMap[dateStr] = { date: dateStr, satisfied: 0, unsatisfied: 0 };
    }
    if (row.rating === "satisfied") {
      dateMap[dateStr].satisfied = row.count;
    } else {
      dateMap[dateStr].unsatisfied = row.count;
    }
  }
  
  return Object.values(dateMap);
}

export async function getRecentFeedback(limit: number = 20, moduleFilter?: string) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = moduleFilter ? [eq(feedback.module, moduleFilter)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const rows = await db.select({
    id: feedback.id,
    userId: feedback.userId,
    module: feedback.module,
    historyId: feedback.historyId,
    rating: feedback.rating,
    comment: feedback.comment,
    createdAt: feedback.createdAt,
    userName: users.name,
  }).from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(where)
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
  
  return rows;
}

// ─── Image Enhancement (Magnific) ────────────────────────────────────
export async function updateEnhanceStatus(
  historyId: number,
  updates: {
    enhanceTaskId?: string | null;
    enhanceStatus?: "idle" | "processing" | "done" | "failed";
    enhancedImageUrl?: string | null;
    enhanceParams?: Record<string, unknown>;
  }
) {
  const db = await getDb();
  if (!db) return;

  const setValues: Record<string, unknown> = {};
  if (updates.enhanceTaskId !== undefined) setValues.enhanceTaskId = updates.enhanceTaskId;
  if (updates.enhanceStatus !== undefined) setValues.enhanceStatus = updates.enhanceStatus;
  if (updates.enhancedImageUrl !== undefined) setValues.enhancedImageUrl = updates.enhancedImageUrl;
  if (updates.enhanceParams !== undefined) setValues.enhanceParams = updates.enhanceParams;

  if (Object.keys(setValues).length === 0) return;

  await db.update(generationHistory)
    .set(setValues)
    .where(eq(generationHistory.id, historyId));
}

// ─── Benchmark Jobs (异步对标调研任务) ─────────────────────

export async function createBenchmarkJob(data: {
  id: string;
  userId: number;
  inputParams: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(benchmarkJobs).values({
    id: data.id,
    userId: data.userId,
    status: "pending",
    inputParams: data.inputParams,
  });
}

export async function getBenchmarkJob(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Use raw SQL to bypass any ORM-level caching / REPEATABLE READ isolation issues
  const result = await db.execute(sql`SELECT id, userId, status, result, error, historyId, caseRefs, createdAt, updatedAt FROM benchmark_jobs WHERE id = ${id} LIMIT 1`);
  const rows = result[0] as unknown as any[];
  if (!rows || rows.length === 0) return undefined;
  const row = rows[0];
  // Raw SQL returns dates as strings; convert them to Date objects
  return {
    id: row.id as string,
    userId: row.userId as number,
    status: row.status as "pending" | "processing" | "done" | "failed",
    result: row.result as string | null,
    error: row.error as string | null,
    historyId: row.historyId as number | null,
    caseRefs: row.caseRefs as Record<string, string> | null,
    createdAt: row.createdAt ? new Date(row.createdAt as string) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string) : new Date(),
  };
}

export async function updateBenchmarkJob(id: string, updates: {
  status?: "pending" | "processing" | "done" | "failed";
  result?: string | null;
  error?: string | null;
  historyId?: number | null;
  caseRefs?: Record<string, string> | null;
}) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {};
  if (updates.status !== undefined) set.status = updates.status;
  if (updates.result !== undefined) set.result = updates.result;
  if (updates.error !== undefined) set.error = updates.error;
  if (updates.historyId !== undefined) set.historyId = updates.historyId;
  if (updates.caseRefs !== undefined) set.caseRefs = updates.caseRefs;
  if (Object.keys(set).length === 0) return;
  await db.update(benchmarkJobs).set(set).where(eq(benchmarkJobs.id, id));
}

// ─── Greeting cache (in-memory, 2-hour TTL) ──────────────────────────────────────────────────────
const greetingCache = new Map<number, { text: string; expiresAt: number }>();

export function getCachedGreeting(userId: number): string | null {
  const entry = greetingCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    greetingCache.delete(userId);
    return null;
  }
  return entry.text;
}

export function setCachedGreeting(userId: number, text: string): void {
  greetingCache.set(userId, { text, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
}


// ─── Generation History Project Association ──────────────────────────────────────────────────────
export async function updateGenerationHistoryProject(historyId: number, projectId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(generationHistory)
    .set({ projectId })
    .where(eq(generationHistory.id, historyId));
}

// ─── Render Styles (出品标准：渲染风格库) ─────────────────────────────────────

export async function listRenderStyles(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.activeOnly) conditions.push(eq(renderStyles.isActive, true));
  return db.select().from(renderStyles)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(renderStyles.sortOrder, renderStyles.createdAt);
}

export async function getRenderStyleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(renderStyles).where(eq(renderStyles.id, id)).limit(1);
  return result[0];
}

export async function createRenderStyle(data: InsertRenderStyle) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(renderStyles).values(data);
  return { id: result[0].insertId };
}

export async function updateRenderStyle(id: number, data: Partial<InsertRenderStyle>) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {};
  if (data.label !== undefined) set.label = data.label;
  if (data.promptHint !== undefined) set.promptHint = data.promptHint;
  if (data.referenceImageUrl !== undefined) set.referenceImageUrl = data.referenceImageUrl;
  if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;
  if (data.isActive !== undefined) set.isActive = data.isActive;
  if (Object.keys(set).length === 0) return;
  await db.update(renderStyles).set(set).where(eq(renderStyles.id, id));
}

export async function deleteRenderStyle(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(renderStyles).where(eq(renderStyles.id, id));
}

export async function reorderRenderStyles(orderedIds: number[]) {
  const db = await getDb();
  if (!db) return;
  await Promise.all(
    orderedIds.map((id, index) =>
      db.update(renderStyles).set({ sortOrder: index }).where(eq(renderStyles.id, id))
    )
  );
}


// ─── Video History ───────────────────────────────────────

// Export videoHistory table for use in routers
export { videoHistory };

// Create a db proxy object for use in routers
export const db = {
  videoHistory,
  select: () => ({
    from: (table: any) => ({
      where: async (condition: any) => {
        const database = await getDb();
        if (!database) throw new Error('Database not available');
        return await database.select().from(table).where(condition);
      },
    }),
  }),
  delete: (table: any) => ({
    where: async (condition: any) => {
      const database = await getDb();
      if (!database) throw new Error('Database not available');
      return await database.delete(table).where(condition);
    },
  }),
  update: (table: any) => ({
    set: (data: any) => ({
      where: async (condition: any) => {
        const database = await getDb();
        if (!database) throw new Error('Database not available');
        return await database.update(table).set(data).where(condition);
      },
    }),
  }),
  insert: (table: any) => ({
    values: async (data: any) => {
      const database = await getDb();
      if (!database) throw new Error('Database not available');
      return await database.insert(table).values(data);
    },
  }),
};

// Helper functions for video history
export async function listVideoHistory(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return await database.select().from(videoHistory).where(eq(videoHistory.userId, userId)).orderBy(desc(videoHistory.createdAt));
}

export async function deleteVideoHistory(id: number) {
  const database = await getDb();
  if (!database) return;
  await database.delete(videoHistory).where(eq(videoHistory.id, id));
}

export async function updateVideoHistory(id: number, data: Partial<InsertVideoHistory>) {
  const database = await getDb();
  if (!database) return;
  await database.update(videoHistory).set(data).where(eq(videoHistory.id, id));
}

// Get video history for a user
export async function getVideoHistory(userId: number) {
  const database = await getDb();
  if (!database) return [];
  const { eq } = await import('drizzle-orm');
  return await database.select().from(videoHistory).where(eq(videoHistory.userId, userId));
}

export async function getVideoHistoryById(id: number, userId: number) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database.select().from(videoHistory)
    .where(and(eq(videoHistory.id, id), eq(videoHistory.userId, userId)))
    .limit(1);
  return rows[0] || null;
}
