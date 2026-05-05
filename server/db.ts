import crypto from "node:crypto";
import { eq, desc, like, and, sql, inArray, or, isNull, getTableColumns } from "drizzle-orm";
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
  renderingJobs,
  renderStyles, InsertRenderStyle,
  aiToolDefaults,
  videoHistory, InsertVideoHistory,
  apiTokens, InsertApiToken, ApiToken,
  analysisImagePrompts,
  analysisImageJobs,
  designBriefs, InsertDesignBrief,
  designBriefInputs, InsertDesignBriefInput,
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

export async function listProjects(opts?: { search?: string; status?: string | string[] }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.search) conditions.push(or(like(projects.name, `%${opts.search}%`), like(projects.code, `%${opts.search}%`)));
  if (opts?.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    if (statuses.length === 1) {
      conditions.push(eq(projects.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(projects.status, statuses as any[]));
    }
  }
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
  // Collect all descendant IDs via iterative BFS (avoids recursive serial awaits)
  const allIds: number[] = [id];
  let frontier = [id];
  while (frontier.length > 0) {
    const children = await db
      .select({ id: generationHistory.id })
      .from(generationHistory)
      .where(inArray(generationHistory.parentId, frontier));
    const childIds = children.map((c) => c.id);
    allIds.push(...childIds);
    frontier = childIds;
  }
  // Batch delete all descendants + the item itself in one query
  if (allIds.length > 1) {
    const deleteConditions = isAdmin
      ? inArray(generationHistory.id, allIds)
      : and(inArray(generationHistory.id, allIds), eq(generationHistory.userId, userId));
    await db.delete(generationHistory).where(deleteConditions!);
  } else {
    await db.delete(generationHistory).where(and(...conditions));
  }
}

/** Lightweight helper: fetch only module + inputParams for a history item (used by delete cascade check) */
export async function getGenerationHistoryModuleById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ module: generationHistory.module, inputParams: generationHistory.inputParams })
    .from(generationHistory)
    .where(and(eq(generationHistory.id, id), eq(generationHistory.userId, userId)))
    .limit(1);
  return result[0];
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
      completedAt: tasks.completedAt,
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
  // Auto-set completedAt when status changes to 'done', clear when reverting from 'done'
  const updateData = { ...data } as any;
  if (data.status === 'done' && !updateData.completedAt) {
    // Only set completedAt if not already set (preserve original completion time)
    const existing = await db.select({ completedAt: tasks.completedAt }).from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing[0]?.completedAt) {
      updateData.completedAt = new Date();
    }
  } else if (data.status && data.status !== 'done') {
    // Reverting from done — clear completedAt
    updateData.completedAt = null;
  }
  await db.update(tasks).set(updateData).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.id, id));
}

// 查询所有成员任务（管理员视图）
export async function listAllTasks() {
  const db = await getDb();
  if (!db) return [];
  return db
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
      createdBy: tasks.createdBy,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(sql`${tasks.status} != 'done' AND ${tasks.parentId} IS NULL`)
    .orderBy(tasks.dueDate, desc(tasks.createdAt));
}

// 查询指定成员的任务
export async function listTasksByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
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
      createdBy: tasks.createdBy,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(tasks.assigneeId, userId),
      sql`${tasks.status} != 'done'`,
      isNull(tasks.parentId)
    ))
    .orderBy(tasks.dueDate, desc(tasks.createdAt));
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
export async function listMeetingDraftsByUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: documents.id,
    title: documents.title,
    content: documents.content,
    projectId: documents.projectId,
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
  }).from(documents)
    .where(and(eq(documents.type, "minutes"), eq(documents.createdBy, userId)))
    .orderBy(desc(documents.updatedAt))
    .limit(limit);
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

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(documents).where(eq(documents.id, id));
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
  // Use iterative BFS, fetching only children of known IDs (not all records)
  const rootItemRow = await db.select().from(generationHistory)
    .where(and(eq(generationHistory.id, actualRootId), eq(generationHistory.userId, userId)))
    .limit(1);
  if (!rootItemRow[0]) return [];

  const chain: (typeof rootItemRow) = [rootItemRow[0]];
  const toExpand: number[] = [actualRootId];
  let safetyBfs = 200;

  while (toExpand.length > 0 && safetyBfs-- > 0) {
    const parentIds = toExpand.splice(0, toExpand.length);
    // Fetch all direct children of current batch
    const children = await db.select().from(generationHistory)
      .where(and(
        eq(generationHistory.userId, userId),
        inArray(generationHistory.parentId, parentIds)
      ))
      .orderBy(generationHistory.createdAt);
    for (const child of children) {
      chain.push(child);
      toExpand.push(child.id);
    }
  }

  // Sort chain by createdAt to maintain chronological order
  chain.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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

  // ai_video records are now stored directly in generation_history (proxy entries).
  // No more videoHistory merge needed.

  // If filtering to a specific module (non-chain modules), use a join to include projectName
  if (opts?.module && opts.module !== "ai_render" && opts.module !== "benchmark_report") {
    const conditions = [eq(generationHistory.userId, userId), eq(generationHistory.module, opts.module)];
    const where = and(...conditions);
    const moduleItems = await db.select({
      ...getTableColumns(generationHistory),
      projectName: projects.name,
    }).from(generationHistory)
      .leftJoin(projects, eq(generationHistory.projectId, projects.id))
      .where(where)
      .orderBy(desc(generationHistory.createdAt))
      .limit(limit)
      .offset(offset);
    const moduleCount = await db.select({ count: sql<number>`count(*)` }).from(generationHistory).where(where);
    const moduleEnriched = moduleItems.map(item => ({ ...item, chainLength: 1, latestOutputUrl: item.outputUrl, latestTitle: item.title, latestEnhancedImageUrl: item.enhancedImageUrl || null }));
    return { items: moduleEnriched, total: moduleCount[0]?.count || 0 };
  }

  // For ai_render or benchmark_report single-module view, get roots with chain metadata
  if (opts?.module === "ai_render" || opts?.module === "benchmark_report") {
    const moduleFilter = opts.module;
    const roots = await db.select({
      ...getTableColumns(generationHistory),
      projectName: projects.name,
    }).from(generationHistory)
      .leftJoin(projects, eq(generationHistory.projectId, projects.id))
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

  const rows = await db.select({
    ...getTableColumns(generationHistory),
    projectName: projects.name,
  }).from(generationHistory)
    .leftJoin(projects, eq(generationHistory.projectId, projects.id))
    .where(where)
    .orderBy(desc(generationHistory.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` }).from(generationHistory).where(where);

  // Enrich chain-capable roots with chain info
  const enrichedItems = await Promise.all(rows.map(async (item) => {
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

  return { items: enrichedItems, total: countResult[0]?.count || 0 };
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

export async function updateGenerationHistoryContent(historyId: number, userId: number, outputContent: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(generationHistory)
    .set({ outputContent })
    .where(and(eq(generationHistory.id, historyId), eq(generationHistory.userId, userId)));
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

// ─── Rendering Jobs (async image generation) ─────────────────────────────────
export async function createRenderingJob(data: {
  id: string;
  userId: number;
  inputParams: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(renderingJobs).values({
    id: data.id,
    userId: data.userId,
    status: "pending",
    inputParams: data.inputParams,
  });
}

export async function getRenderingJob(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.execute(
    sql`SELECT id, userId, status, resultUrl, resultPrompt, error, historyId, createdAt, updatedAt FROM rendering_jobs WHERE id = ${id} LIMIT 1`
  );
  const rows = result[0] as unknown as any[];
  if (!rows || rows.length === 0) return undefined;
  const row = rows[0];
  return {
    id: row.id as string,
    userId: row.userId as number,
    status: row.status as "pending" | "processing" | "done" | "failed",
    resultUrl: row.resultUrl as string | null,
    resultPrompt: row.resultPrompt as string | null,
    error: row.error as string | null,
    historyId: row.historyId as number | null,
    createdAt: row.createdAt ? new Date(row.createdAt as string) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string) : new Date(),
  };
}

export async function updateRenderingJob(id: string, updates: {
  status?: "pending" | "processing" | "done" | "failed";
  resultUrl?: string | null;
  resultPrompt?: string | null;
  error?: string | null;
  historyId?: number | null;
}) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {};
  if (updates.status !== undefined) set.status = updates.status;
  if (updates.resultUrl !== undefined) set.resultUrl = updates.resultUrl;
  if (updates.resultPrompt !== undefined) set.resultPrompt = updates.resultPrompt;
  if (updates.error !== undefined) set.error = updates.error;
  if (updates.historyId !== undefined) set.historyId = updates.historyId;
  if (Object.keys(set).length === 0) return;
  await db.update(renderingJobs).set(set).where(eq(renderingJobs.id, id));
}


// ─── Team Task Stats ──────────────────────────────────────
export async function getMemberTaskStats() {
  const db = await getDb();
  if (!db) return [];

  // Get all approved users
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    avatar: users.avatar,
    department: users.department,
  }).from(users).where(eq(users.approved, true));

  if (allUsers.length === 0) return [];

  // Get all tasks with assignee
  const allTasks = await db.select({
    id: tasks.id,
    assigneeId: tasks.assigneeId,
    status: tasks.status,
    dueDate: tasks.dueDate,
    updatedAt: tasks.updatedAt,
  }).from(tasks).where(sql`${tasks.assigneeId} IS NOT NULL`);

  const now = new Date();

  // Build stats per member
  return allUsers.map((u) => {
    const memberTasks = allTasks.filter((t) => t.assigneeId === u.id);
    const total = memberTasks.length;
    const done = memberTasks.filter((t) => t.status === 'done').length;
    const inProgress = memberTasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length;

    // Early completed: done AND completedAt (updatedAt) <= dueDate
    const earlyCompleted = memberTasks.filter((t) => {
      if (t.status !== 'done') return false;
      if (!t.dueDate) return false;
      return t.updatedAt <= t.dueDate;
    }).length;

    // Overdue completed: done AND completedAt (updatedAt) > dueDate
    const overdueCompleted = memberTasks.filter((t) => {
      if (t.status !== 'done') return false;
      if (!t.dueDate) return false;
      return t.updatedAt > t.dueDate;
    }).length;

    // Overdue incomplete: not done AND dueDate < now
    const overdueIncomplete = memberTasks.filter((t) => {
      if (t.status === 'done') return false;
      if (!t.dueDate) return false;
      return t.dueDate < now;
    }).length;

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const overdueRate = done > 0 ? Math.round((overdueCompleted / done) * 100) : 0;

    return {
      userId: u.id,
      name: u.name || 'Unknown',
      avatar: u.avatar,
      department: u.department,
      total,
      done,
      inProgress,
      earlyCompleted,
      overdueCompleted,
      overdueIncomplete,
      completionRate,
      overdueRate,
    };
  });
}

export async function getMemberAiStats() {
  const db = await getDb();
  if (!db) return [];
  // Get all approved users
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    avatar: users.avatar,
    department: users.department,
  }).from(users).where(eq(users.approved, true));
  if (allUsers.length === 0) return [];
  // Get AI tool logs per user
  const toolLogs = await db.select({
    userId: aiToolLogs.userId,
    toolId: aiToolLogs.toolId,
    status: aiToolLogs.status,
    durationMs: aiToolLogs.durationMs,
    createdAt: aiToolLogs.createdAt,
  }).from(aiToolLogs);
  // Get generation history per user
  const genHistory = await db.select({
    userId: generationHistory.userId,
    module: generationHistory.module,
    status: generationHistory.status,
    createdAt: generationHistory.createdAt,
  }).from(generationHistory);
  // Get AI tool names
  const toolList = await db.select({ id: aiTools.id, name: aiTools.name }).from(aiTools);
  const toolNameMap = Object.fromEntries(toolList.map((t) => [t.id, t.name]));
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return allUsers.map((u) => {
    const userLogs = toolLogs.filter((l) => l.userId === u.id);
    const userGen = genHistory.filter((g) => g.userId === u.id);
    const recentLogs = userLogs.filter((l) => l.createdAt >= thirtyDaysAgo);
    const recentGen = userGen.filter((g) => g.createdAt >= thirtyDaysAgo);
    const totalCalls = userLogs.length;
    const recentCalls = recentLogs.length;
    const successCalls = userLogs.filter((l) => l.status === 'success').length;
    const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
    const durations = userLogs.filter((l) => l.durationMs != null).map((l) => l.durationMs as number);
    const avgDurationMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const totalGenerations = userGen.length;
    const recentGenerations = recentGen.length;
    const successGenerations = userGen.filter((g) => g.status === 'success').length;
    const moduleBreakdown: Record<string, number> = {};
    for (const g of userGen) {
      moduleBreakdown[g.module] = (moduleBreakdown[g.module] || 0) + 1;
    }
    const toolBreakdown: Record<string, number> = {};
    for (const l of userLogs) {
      const toolName = toolNameMap[l.toolId] || `Tool#${l.toolId}`;
      toolBreakdown[toolName] = (toolBreakdown[toolName] || 0) + 1;
    }
    return {
      userId: u.id,
      name: u.name || 'Unknown',
      avatar: u.avatar,
      department: u.department,
      totalCalls,
      recentCalls,
      successRate,
      avgDurationMs,
      totalGenerations,
      recentGenerations,
      successGenerations,
      moduleBreakdown,
      toolBreakdown,
    };
  });
}

// ─── Benchmark: Recent Case Names ────────────────────────────────────────────────────────────────
/**
 * Get the list of case names used in a user's recent benchmark jobs.
 * Used to avoid repeating the same cases in new reports.
 */
export async function getRecentBenchmarkCaseNames(userId: number, limit = 10): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`SELECT caseRefs FROM benchmark_jobs WHERE userId = ${userId} AND status = 'done' AND caseRefs IS NOT NULL ORDER BY createdAt DESC LIMIT ${limit}`
  );
  const rows = result[0] as unknown as Array<{ caseRefs: unknown }>;
  const allNames = new Set<string>();
  for (const row of rows) {
    try {
      const refs = typeof row.caseRefs === 'string' ? JSON.parse(row.caseRefs) : row.caseRefs;
      if (refs && typeof refs === 'object') {
        Object.keys(refs).forEach(name => allNames.add(name));
      }
    } catch { /* ignore */ }
  }
  return Array.from(allNames);
}

// ─── AI Tool Call Statistics ─────────────────────────────────────────────────

/** 按工具汇总调用统计（近 N 天） */
export async function getAiToolCallStats(days: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`
      SELECT
        l.toolId,
        t.name AS toolName,
        t.provider,
        COUNT(*) AS totalCalls,
        SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) AS successCalls,
        SUM(CASE WHEN l.status = 'failed'  THEN 1 ELSE 0 END) AS failedCalls,
        ROUND(AVG(CASE WHEN l.durationMs IS NOT NULL THEN l.durationMs END)) AS avgDurationMs,
        MAX(l.createdAt) AS lastCalledAt,
        l.action
      FROM ai_tool_logs l
      LEFT JOIN ai_tools t ON l.toolId = t.id
      WHERE l.createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY l.toolId, t.name, t.provider, l.action
      ORDER BY totalCalls DESC
    `
  );
  return (result[0] as unknown as Array<{
    toolId: number;
    toolName: string | null;
    provider: string | null;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    avgDurationMs: number | null;
    lastCalledAt: Date;
    action: string | null;
  }>);
}

/** 按日期趋势统计（近 N 天，每天的调用量） */
export async function getAiToolDailyTrend(days: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`
      SELECT
        DATE(l.createdAt) AS date,
        l.toolId,
        t.name AS toolName,
        COUNT(*) AS totalCalls,
        SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) AS successCalls,
        SUM(CASE WHEN l.status = 'failed'  THEN 1 ELSE 0 END) AS failedCalls
      FROM ai_tool_logs l
      LEFT JOIN ai_tools t ON l.toolId = t.id
      WHERE l.createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY DATE(l.createdAt), l.toolId, t.name
      ORDER BY date ASC, totalCalls DESC
    `
  );
  return (result[0] as unknown as Array<{
    date: string;
    toolId: number;
    toolName: string | null;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
  }>);
}

/** 最近失败记录（含错误信息） */
export async function getAiToolRecentFailures(limit: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`
      SELECT
        l.id,
        l.toolId,
        t.name AS toolName,
        l.action,
        l.inputSummary,
        l.durationMs,
        l.createdAt,
        rj.error AS errorMessage
      FROM ai_tool_logs l
      LEFT JOIN ai_tools t ON l.toolId = t.id
      LEFT JOIN rendering_jobs rj
        ON rj.createdAt BETWEEN DATE_SUB(l.createdAt, INTERVAL 5 SECOND)
                             AND DATE_ADD(l.createdAt, INTERVAL 5 SECOND)
        AND rj.status = 'failed'
        AND l.status = 'failed'
      WHERE l.status = 'failed'
      ORDER BY l.createdAt DESC
      LIMIT ${limit}
    `
  );
  return (result[0] as unknown as Array<{
    id: number;
    toolId: number;
    toolName: string | null;
    action: string | null;
    inputSummary: string | null;
    durationMs: number | null;
    createdAt: Date;
    errorMessage: string | null;
  }>);
}

/** 按成员统计 AI 工具调用（近 N 天） */
export async function getAiToolStatsByUser(days: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`
      SELECT
        l.userId,
        u.name AS userName,
        u.avatar AS userAvatar,
        u.department,
        COUNT(*) AS totalCalls,
        SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) AS successCalls,
        SUM(CASE WHEN l.status = 'failed'  THEN 1 ELSE 0 END) AS failedCalls,
        AVG(CASE WHEN l.durationMs IS NOT NULL THEN l.durationMs END) AS avgDurationMs,
        MAX(l.createdAt) AS lastCalledAt
      FROM ai_tool_logs l
      LEFT JOIN users u ON l.userId = u.id
      WHERE l.createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY l.userId, u.name, u.avatar, u.department
      ORDER BY totalCalls DESC
    `
  );
  return (result[0] as unknown as Array<{
    userId: number;
    userName: string | null;
    userAvatar: string | null;
    department: string | null;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    avgDurationMs: number | null;
    lastCalledAt: Date;
  }>);
}

/** 按成员 + 操作类型 + 工具统计（近 N 天，用于成员详情展开） */
export async function getAiToolStatsByUserAndAction(days: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`
      SELECT
        l.userId,
        u.name AS userName,
        l.action,
        l.toolId,
        t.name AS toolName,
        COUNT(*) AS totalCalls,
        SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) AS successCalls,
        SUM(CASE WHEN l.status = 'failed'  THEN 1 ELSE 0 END) AS failedCalls
      FROM ai_tool_logs l
      LEFT JOIN users u ON l.userId = u.id
      LEFT JOIN ai_tools t ON l.toolId = t.id
      WHERE l.createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY l.userId, u.name, l.action, l.toolId, t.name
      ORDER BY l.userId, totalCalls DESC
    `
  );
  return (result[0] as unknown as Array<{
    userId: number;
    userName: string | null;
    action: string | null;
    toolId: number;
    toolName: string | null;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
  }>);
}

// ─── Analysis Image Prompts ──────────────────────────────────────────────────
export async function listAnalysisImagePrompts() {
  const db = await getDb();
  if (!db) return [];
  const { analysisImagePrompts } = await import("../drizzle/schema");
  return db.select().from(analysisImagePrompts).orderBy(analysisImagePrompts.type);
}

export async function getAnalysisImagePrompt(type: "material" | "soft_furnishing") {
  const db = await getDb();
  if (!db) return null;
  const { analysisImagePrompts } = await import("../drizzle/schema");
  const rows = await db.select().from(analysisImagePrompts).where(eq(analysisImagePrompts.type, type)).limit(1);
  return rows[0] ?? null;
}

export async function upsertAnalysisImagePrompt(
  type: "material" | "soft_furnishing",
  data: { label?: string; prompt: string; description?: string; updatedBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { analysisImagePrompts } = await import("../drizzle/schema");
  const existing = await getAnalysisImagePrompt(type);
  if (existing) {
    await db.update(analysisImagePrompts).set({ ...data, updatedAt: new Date() }).where(eq(analysisImagePrompts.type, type));
    return { ...existing, ...data };
  } else {
    const label = type === "material" ? "材质搭配图" : "软装搭配图";
    const result = await db.insert(analysisImagePrompts).values({ type, label: data.label ?? label, prompt: data.prompt, description: data.description, updatedBy: data.updatedBy });
    return { id: Number((result as any).insertId), type, label: data.label ?? label, prompt: data.prompt };
  }
}

// ─── Analysis Image Jobs ─────────────────────────────────────────────────────
export async function createAnalysisImageJob(data: {
  id: string;
  userId: number;
  type: "material" | "soft_furnishing";
  toolId?: number | null;
  referenceImageUrl: string;
  fullPrompt?: string | null;
  width?: number | null;
  height?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { analysisImageJobs } = await import("../drizzle/schema");
  await db.insert(analysisImageJobs).values({ ...data, status: "pending" });
  return data.id;
}

export async function getAnalysisImageJob(id: string) {
  const db = await getDb();
  if (!db) return null;
  // Use raw SQL to bypass ORM cache (REPEATABLE READ isolation)
  const [rows] = await db.execute(sql`SELECT * FROM analysis_image_jobs WHERE id = ${id} LIMIT 1`);
  const row = (rows as unknown as any[])[0];
  if (!row) return null;
  return {
    ...row,
    createdAt: new Date(row.createdAt as string),
    updatedAt: new Date(row.updatedAt as string),
  };
}

export async function updateAnalysisImageJob(id: string, data: {
  status?: "pending" | "processing" | "done" | "failed";
  resultUrl?: string | null;
  fullPrompt?: string | null;
  error?: string | null;
  historyId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { analysisImageJobs } = await import("../drizzle/schema");
  await db.update(analysisImageJobs).set({ ...data, updatedAt: new Date() }).where(eq(analysisImageJobs.id, id));
}

// ─── Graphic Layout Prompts ──────────────────────────────────────────────────
export async function listGraphicLayoutPrompts() {
  const db = await getDb();
  if (!db) return [];
  const { graphicLayoutPrompts } = await import("../drizzle/schema");
  return db.select().from(graphicLayoutPrompts).orderBy(graphicLayoutPrompts.type);
}

export async function getGraphicLayoutPrompt(type: "layout_plan_system" | "image_generation") {
  const db = await getDb();
  if (!db) return null;
  const { graphicLayoutPrompts } = await import("../drizzle/schema");
  const rows = await db.select().from(graphicLayoutPrompts).where(eq(graphicLayoutPrompts.type, type)).limit(1);
  return rows[0] ?? null;
}

export async function upsertGraphicLayoutPrompt(
  type: "layout_plan_system" | "image_generation",
  data: { label?: string; prompt: string; description?: string; updatedBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { graphicLayoutPrompts } = await import("../drizzle/schema");
  const existing = await getGraphicLayoutPrompt(type);
  const defaultLabel = type === "layout_plan_system" ? "排版规划系统提示词" : "图像生成风格提示词";
  if (existing) {
    await db.update(graphicLayoutPrompts).set({ ...data, updatedAt: new Date() }).where(eq(graphicLayoutPrompts.type, type));
    return { ...existing, ...data };
  } else {
    const result = await db.insert(graphicLayoutPrompts).values({ type, label: data.label ?? defaultLabel, prompt: data.prompt, description: data.description, updatedBy: data.updatedBy });
    return { id: Number((result as any).insertId), type, label: data.label ?? defaultLabel, prompt: data.prompt };
  }
}

export async function getGraphicStylePackById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { graphicStylePacks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(graphicStylePacks).where(eq(graphicStylePacks.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── Color Plan Prompts (AI 平面图内置提示词) ──────────────────────────────────────────────────
export async function listColorPlanPrompts(style?: "colored" | "hand_drawn" | "line_drawing") {
  const db = await getDb();
  if (!db) return [];
  const { colorPlanPrompts } = await import("../drizzle/schema");
  if (style) {
    return db.select().from(colorPlanPrompts).where(eq(colorPlanPrompts.style, style)).orderBy(colorPlanPrompts.type);
  }
  return db.select().from(colorPlanPrompts).orderBy(colorPlanPrompts.style, colorPlanPrompts.type);
}

export async function getColorPlanPrompt(
  type: "base" | "reference_prefix",
  style: "colored" | "hand_drawn" | "line_drawing" = "colored"
) {
  const db = await getDb();
  if (!db) return null;
  const { colorPlanPrompts } = await import("../drizzle/schema");
  const { and: _and } = await import("drizzle-orm");
  const rows = await db.select().from(colorPlanPrompts)
    .where(_and(eq(colorPlanPrompts.style, style), eq(colorPlanPrompts.type, type)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertColorPlanPrompt(
  type: "base" | "reference_prefix",
  data: { style?: "colored" | "hand_drawn" | "line_drawing"; label?: string; prompt: string; description?: string; updatedBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { colorPlanPrompts } = await import("../drizzle/schema");
  const { and: _and } = await import("drizzle-orm");
  const style = data.style ?? "colored";
  const existing = await getColorPlanPrompt(type, style);
  const defaultLabel = type === "base" ? "基础提示词" : "参考图前缀提示词";
  if (existing) {
    await db.update(colorPlanPrompts)
      .set({ prompt: data.prompt, label: data.label ?? existing.label, description: data.description, updatedBy: data.updatedBy, updatedAt: new Date() })
      .where(_and(eq(colorPlanPrompts.style, style), eq(colorPlanPrompts.type, type)));
    return { ...existing, ...data };
  } else {
    const result = await db.insert(colorPlanPrompts).values({ style, type, label: data.label ?? defaultLabel, prompt: data.prompt, description: data.description, updatedBy: data.updatedBy });
    return { id: Number((result as any).insertId), style, type, label: data.label ?? defaultLabel, prompt: data.prompt };
  }
}

// ─── Case Study Prompts ──────────────────────────────────────────────────────
export async function listCaseStudyPrompts() {
  const db = await getDb();
  if (!db) return [];
  const { caseStudyPrompts } = await import("../drizzle/schema");
  return db.select().from(caseStudyPrompts).orderBy(caseStudyPrompts.phase);
}

export async function getCaseStudyPrompt(phase: "keyword_extraction" | "case_selection" | "report_generation") {
  const db = await getDb();
  if (!db) return null;
  const { caseStudyPrompts } = await import("../drizzle/schema");
  const rows = await db.select().from(caseStudyPrompts)
    .where(eq(caseStudyPrompts.phase, phase))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertCaseStudyPrompt(
  phase: "keyword_extraction" | "case_selection" | "report_generation",
  data: { label?: string; prompt: string; description?: string; updatedBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { caseStudyPrompts } = await import("../drizzle/schema");
  const existing = await getCaseStudyPrompt(phase);
  const defaultLabels: Record<string, string> = {
    keyword_extraction: "关键词提取",
    case_selection: "案例筛选",
    report_generation: "报告生成",
  };
  if (existing) {
    await db.update(caseStudyPrompts)
      .set({ prompt: data.prompt, label: data.label ?? existing.label, description: data.description, updatedBy: data.updatedBy, updatedAt: new Date() })
      .where(eq(caseStudyPrompts.phase, phase));
    return { ...existing, ...data };
  } else {
    const result = await db.insert(caseStudyPrompts).values({
      phase, label: data.label ?? defaultLabels[phase], prompt: data.prompt, description: data.description, updatedBy: data.updatedBy
    });
    return { id: Number((result as any).insertId), phase, label: data.label ?? defaultLabels[phase], prompt: data.prompt };
  }
}

// ─── Graphic Layout Job Raw Query ────────────────────────────────────────────
/**
 * Fetch a graphic layout job using raw SQL to bypass MySQL REPEATABLE READ
 * isolation that can cause Drizzle ORM to return stale cached rows during polling.
 */
export async function getGraphicLayoutJobRaw(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.execute(
    sql`SELECT id, userId, packId, docType, pageCount, aspectRatio, contentText, assetUrls, title, stylePrompt, status, errorMessage, pages, htmlPages, modelsUsed, createdAt, updatedAt
        FROM graphic_layout_jobs
        WHERE id = ${id} AND userId = ${userId}
        LIMIT 1`
  );
  const rows = result[0] as unknown as any[];
  if (!rows || rows.length === 0) return undefined;
  const row = rows[0];
  const parseJson = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
    return v;
  };
  return {
    id: row.id as number,
    userId: row.userId as number,
    packId: row.packId as number | null,
    docType: row.docType as string,
    pageCount: row.pageCount as number,
    aspectRatio: row.aspectRatio as string,
    contentText: row.contentText as string,
    assetUrls: parseJson(row.assetUrls),
    title: row.title as string | null,
    stylePrompt: row.stylePrompt as string | null,
    status: row.status as "pending" | "processing" | "done" | "failed",
    errorMessage: row.errorMessage as string | null,
    pages: parseJson(row.pages) as any[] | null,
    htmlPages: parseJson(row.htmlPages) as any[] | null,
    modelsUsed: parseJson(row.modelsUsed) as string[] | null,
    createdAt: row.createdAt ? new Date(row.createdAt as string) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string) : new Date(),
  };
}

/**
 * Mark stale graphic layout jobs (stuck in pending/processing for > timeoutMs) as failed.
 * Returns the number of jobs updated.
 */
export async function timeoutStaleGraphicLayoutJobs(timeoutMs = 15 * 60 * 1000) {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - timeoutMs);
  const result = await db.execute(
    sql`UPDATE graphic_layout_jobs
        SET status = 'failed', errorMessage = 'Task timed out, please retry (server restart or instance shutdown interrupted the background task)'
        WHERE status IN ('pending', 'processing') AND updatedAt < ${cutoff}`
  );
  const affectedRows = (result[0] as any)?.affectedRows ?? 0;
  if (affectedRows > 0) {
    console.log(`[GraphicLayout] Marked ${affectedRows} stale jobs as failed (timeout=${timeoutMs}ms)`);
  }
  return affectedRows;
}

// ─── Video proxy sync helper ────────────────────────────────────────────────
/**
 * Update the generation_history proxy entry for a video record.
 * Called when video status changes so the history list stays in sync.
 */
export async function syncVideoProxyEntry(
  videoHistoryId: number,
  userId: number,
  updates: { status?: "success" | "failed" | "processing"; outputUrl?: string | null }
) {
  const db = await getDb();
  if (!db) return;
  // Find the proxy row by scanning ai_video entries for this user
  const rows = await db.select().from(generationHistory)
    .where(and(eq(generationHistory.userId, userId), eq(generationHistory.module, "ai_video")));
  const proxy = rows.find((r) => {
    const p = typeof r.inputParams === "string" ? JSON.parse(r.inputParams as string) : r.inputParams;
    return (p as any)?.videoHistoryId === videoHistoryId;
  });
  if (!proxy) return;
  const setValues: Record<string, unknown> = {};
  if (updates.status !== undefined) setValues.status = updates.status;
  if (updates.outputUrl !== undefined) setValues.outputUrl = updates.outputUrl;
  if (Object.keys(setValues).length === 0) return;
  await db.update(generationHistory).set(setValues).where(eq(generationHistory.id, proxy.id));
}

// ─── Design Briefs (设计任务书) ──────────────────────────

export async function listDesignBriefs(opts: { userId: number; projectId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts.projectId !== undefined) {
    conditions.push(eq(designBriefs.projectId, opts.projectId));
  }
  conditions.push(eq(designBriefs.createdBy, opts.userId));
  return db.select().from(designBriefs)
    .where(and(...conditions))
    .orderBy(desc(designBriefs.updatedAt));
}

export async function getDesignBriefById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(designBriefs).where(eq(designBriefs.id, id)).limit(1);
  return result[0];
}

export async function createDesignBrief(data: InsertDesignBrief) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(designBriefs).values(data);
  return { id: result[0].insertId as number };
}

export async function updateDesignBrief(id: number, data: Partial<InsertDesignBrief>) {
  const db = await getDb();
  if (!db) return;
  await db.update(designBriefs).set(data).where(eq(designBriefs.id, id));
}

export async function deleteDesignBrief(id: number) {
  const db = await getDb();
  if (!db) return;
  // Also delete associated inputs
  const history = await db.select({ historyId: designBriefs.latestHistoryId })
    .from(designBriefs).where(eq(designBriefs.id, id)).limit(1);
  await db.delete(designBriefs).where(eq(designBriefs.id, id));
}

/** List all generation history entries for a design brief (version chain) */
export async function listDesignBriefVersions(briefId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get the brief to find the latest history entry
  const brief = await getDesignBriefById(briefId);
  if (!brief || !brief.latestHistoryId) return [];

  // Walk the parentId chain to collect all versions
  const versions: typeof generationHistory.$inferSelect[] = [];
  let currentId: number | null = brief.latestHistoryId;
  const visited = new Set<number>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const rows = await db.select().from(generationHistory)
      .where(eq(generationHistory.id, currentId)).limit(1);
    if (rows.length === 0) break;
    versions.push(rows[0]);
    currentId = rows[0].parentId ?? null;
  }
  return versions; // newest first
}

/** Save inputs for a generation history entry */
export async function createDesignBriefInputs(inputs: InsertDesignBriefInput[]) {
  const db = await getDb();
  if (!db) return;
  if (inputs.length === 0) return;
  await db.insert(designBriefInputs).values(inputs);
}

export async function listDesignBriefInputsByHistory(historyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(designBriefInputs)
    .where(eq(designBriefInputs.historyId, historyId))
    .orderBy(designBriefInputs.id);
}

// ─── Meeting Minutes Prompts ─────────────────────────────────────────────────
export async function listMeetingMinutesPrompts() {
  const db = await getDb();
  if (!db) return [];
  const { meetingMinutesPrompts } = await import("../drizzle/schema");
  return db.select().from(meetingMinutesPrompts).orderBy(meetingMinutesPrompts.type);
}

export async function getMeetingMinutesPrompt(type: "system") {
  const db = await getDb();
  if (!db) return null;
  const { meetingMinutesPrompts } = await import("../drizzle/schema");
  const rows = await db.select().from(meetingMinutesPrompts).where(eq(meetingMinutesPrompts.type, type)).limit(1);
  return rows[0] ?? null;
}

export async function updateMeetingMinutesPrompt(
  type: "system",
  data: { label?: string; prompt: string; description?: string; updatedBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { meetingMinutesPrompts } = await import("../drizzle/schema");
  const existing = await getMeetingMinutesPrompt(type);
  if (existing) {
    await db.update(meetingMinutesPrompts).set({ ...data, updatedAt: new Date() }).where(eq(meetingMinutesPrompts.type, type));
    return { ...existing, ...data };
  } else {
    const result = await db.insert(meetingMinutesPrompts).values({ type, label: data.label ?? "系统提示词", prompt: data.prompt, description: data.description, updatedBy: data.updatedBy });
    return { id: Number((result as any).insertId), type, label: data.label ?? "系统提示词", prompt: data.prompt };
  }
}

// ─── Design Brief Prompts ────────────────────────────────────────────────────
export async function listDesignBriefPrompts() {
  const db = await getDb();
  if (!db) return [];
  const { designBriefPrompts } = await import("../drizzle/schema");
  return db.select().from(designBriefPrompts).orderBy(designBriefPrompts.type);
}

export async function getDesignBriefPrompt(type: "system" | "revise") {
  const db = await getDb();
  if (!db) return null;
  const { designBriefPrompts } = await import("../drizzle/schema");
  const rows = await db.select().from(designBriefPrompts).where(eq(designBriefPrompts.type, type)).limit(1);
  return rows[0] ?? null;
}

export async function updateDesignBriefPrompt(
  type: "system" | "revise",
  data: { label?: string; prompt: string; description?: string; updatedBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { designBriefPrompts } = await import("../drizzle/schema");
  const existing = await getDesignBriefPrompt(type);
  if (existing) {
    await db.update(designBriefPrompts).set({ ...data, updatedAt: new Date() }).where(eq(designBriefPrompts.type, type));
    return { ...existing, ...data };
  } else {
    const label = type === "system" ? "生成提示词" : "AI修订提示词";
    const result = await db.insert(designBriefPrompts).values({ type, label: data.label ?? label, prompt: data.prompt, description: data.description, updatedBy: data.updatedBy });
    return { id: Number((result as any).insertId), type, label: data.label ?? label, prompt: data.prompt };
  }
}
