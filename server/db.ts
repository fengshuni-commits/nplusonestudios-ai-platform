import { eq, desc, like, and, sql, inArray, or } from "drizzle-orm";
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

// ─── Users ───────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

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
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
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
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
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
  return db.select().from(projects).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(desc(projects.updatedAt));
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

/// ─── Project Members ─────────────────────────────────────

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

// ─── Tasks ───────────────────────────────────────────────

export async function listTasksByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(tasks.sortOrder, desc(tasks.createdAt));
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
  return db.select().from(assets).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(desc(assets.createdAt));
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

// ─── Standards ───────────────────────────────────────────

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

export async function getDashboardStats() {
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

  const recentProjects = await db.select().from(projects).orderBy(desc(projects.updatedAt)).limit(5);
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
import { generationHistory, InsertGenerationHistory } from "../drizzle/schema";

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

  // Now collect the full chain: root + all descendants
  // Use iterative approach: collect all items for this user in ai_render module,
  // then build the chain in memory
  const allRenderItems = await db.select().from(generationHistory)
    .where(and(eq(generationHistory.userId, userId), eq(generationHistory.module, "ai_render")))
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

  // If filtering to a specific non-render module, use the simple list
  if (opts?.module && opts.module !== "ai_render") {
    return listGenerationHistory(userId, opts);
  }

  // For ai_render or "all" view, we need grouped results
  // Strategy: get root ai_render items (parentId IS NULL) with chain info,
  // plus non-render items

  if (opts?.module === "ai_render") {
    // Only ai_render: get roots with chain metadata
    const roots = await db.select().from(generationHistory)
      .where(and(
        eq(generationHistory.userId, userId),
        eq(generationHistory.module, "ai_render"),
        sql`${generationHistory.parentId} IS NULL`
      ))
      .orderBy(desc(generationHistory.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(generationHistory)
      .where(and(
        eq(generationHistory.userId, userId),
        eq(generationHistory.module, "ai_render"),
        sql`${generationHistory.parentId} IS NULL`
      ));

    // For each root, find the latest descendant and count
    const enrichedItems = await Promise.all(roots.map(async (root) => {
      const descendants = await db.select().from(generationHistory)
        .where(and(
          eq(generationHistory.userId, userId),
          eq(generationHistory.module, "ai_render"),
          sql`${generationHistory.parentId} IS NOT NULL`
        ))
        .orderBy(desc(generationHistory.createdAt));

      // Build chain count by walking from this root
      const chainItems = await getEditChain(root.id, userId);
      const latestItem = chainItems[chainItems.length - 1];

      return {
        ...root,
        chainLength: chainItems.length,
        latestOutputUrl: latestItem?.outputUrl || root.outputUrl,
        latestTitle: latestItem?.title || root.title,
      };
    }));

    return { items: enrichedItems, total: countResult[0]?.count || 0 };
  }

  // "all" module view: mix ai_render roots with other module items
  // Get all non-render items + render roots only
  const conditions = [
    eq(generationHistory.userId, userId),
    sql`(${generationHistory.module} != 'ai_render' OR ${generationHistory.parentId} IS NULL)`,
  ];
  const where = and(...conditions);

  const items = await db.select().from(generationHistory)
    .where(where)
    .orderBy(desc(generationHistory.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` }).from(generationHistory).where(where);

  // Enrich ai_render roots with chain info
  const enrichedItems = await Promise.all(items.map(async (item) => {
    if (item.module === "ai_render" && !item.parentId) {
      const chainItems = await getEditChain(item.id, userId);
      const latestItem = chainItems[chainItems.length - 1];
      return {
        ...item,
        chainLength: chainItems.length,
        latestOutputUrl: latestItem?.outputUrl || item.outputUrl,
        latestTitle: latestItem?.title || item.title,
      };
    }
    return { ...item, chainLength: 1, latestOutputUrl: item.outputUrl, latestTitle: item.title };
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
