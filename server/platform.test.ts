import { describe, expect, it, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ───────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Track all project IDs created during tests for cleanup
const createdProjectIds: number[] = [];

function createTestUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-001",
    email: "test@nplus1.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createAdminUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return createTestUser({ role: "admin", name: "Admin User", openId: "admin-001", ...overrides });
}

function createContext(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthCaller() {
  const user = createTestUser();
  const ctx = createContext(user);
  return appRouter.createCaller(ctx);
}

function createAdminCaller() {
  const user = createAdminUser();
  const ctx = createContext(user);
  return appRouter.createCaller(ctx);
}

function createPublicCaller() {
  const ctx = createContext(null);
  return appRouter.createCaller(ctx);
}

/** Helper: create a project and track its ID for cleanup */
async function createTrackedProject(caller: ReturnType<typeof createAuthCaller>, name: string) {
  const result = await caller.projects.create({ name });
  createdProjectIds.push(result.id);
  return result;
}

// ─── Global Cleanup ────────────────────────────────────────
// Delete all test-created projects after ALL tests finish

afterAll(async () => {
  const caller = createAuthCaller();
  for (const id of createdProjectIds) {
    try {
      await caller.projects.delete({ id });
    } catch {
      // Project may already be deleted by delete test — ignore
    }
  }
});

// ─── Auth Tests ─────────────────────────────────────────────

describe("auth", () => {
  it("auth.me returns null for unauthenticated users", async () => {
    const caller = createPublicCaller();
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated users", async () => {
    const caller = createAuthCaller();
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.name).toBe("Test User");
    expect(result?.role).toBe("user");
  });

  it("auth.logout clears cookie and returns success", async () => {
    const user = createTestUser();
    const ctx = createContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

// ─── Dashboard Tests ────────────────────────────────────────

describe("dashboard", () => {
  it("dashboard.stats returns stats object for authenticated users", async () => {
    const caller = createAuthCaller();
    const stats = await caller.dashboard.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.activeProjects).toBe("number");
    expect(typeof stats.pendingTasks).toBe("number");
    expect(typeof stats.completedThisWeek).toBe("number");
    expect(typeof stats.aiToolCalls).toBe("number");
    expect(Array.isArray(stats.recentProjects)).toBe(true);
    expect(Array.isArray(stats.recentTasks)).toBe(true);
  });

  it("dashboard.stats throws for unauthenticated users", async () => {
    const caller = createPublicCaller();
    await expect(caller.dashboard.stats()).rejects.toThrow();
  });
});

// ─── Projects Tests ─────────────────────────────────────────

describe("projects", () => {
  it("projects.list returns array for authenticated users", async () => {
    const caller = createAuthCaller();
    const result = await caller.projects.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("projects.list throws for unauthenticated users", async () => {
    const caller = createPublicCaller();
    await expect(caller.projects.list()).rejects.toThrow();
  });

  it("projects.list supports search filter", async () => {
    const caller = createAuthCaller();
    const result = await caller.projects.list({ search: "test" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("projects.list supports status filter", async () => {
    const caller = createAuthCaller();
    const result = await caller.projects.list({ status: "planning" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("projects.create creates a project and returns id", async () => {
    const caller = createAuthCaller();
    const result = await createTrackedProject(caller, "__vitest_platform_create_" + Date.now());
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });

  it("projects.create requires name", async () => {
    const caller = createAuthCaller();
    await expect(caller.projects.create({ name: "" })).rejects.toThrow();
  });

  it("projects.getById returns project after creation", async () => {
    const caller = createAuthCaller();
    const created = await createTrackedProject(caller, "__vitest_platform_getById_" + Date.now());
    const project = await caller.projects.getById({ id: created.id });
    expect(project).toBeDefined();
    expect(project.name).toContain("__vitest_platform_getById_");
  });

  it("projects.getById throws for non-existent project", async () => {
    const caller = createAuthCaller();
    await expect(caller.projects.getById({ id: 999999 })).rejects.toThrow();
  });

  it("projects.update modifies project fields", async () => {
    const caller = createAuthCaller();
    const created = await createTrackedProject(caller, "__vitest_platform_update_" + Date.now());
    const result = await caller.projects.update({
      id: created.id,
      name: "__vitest_platform_updated_" + Date.now(),
      status: "design",
    });
    expect(result).toEqual({ success: true });

    const updated = await caller.projects.getById({ id: created.id });
    expect(updated.name).toContain("__vitest_platform_updated_");
    expect(updated.status).toBe("design");
  });

  it("projects.delete removes a project", async () => {
    const caller = createAuthCaller();
    const created = await createTrackedProject(caller, "__vitest_platform_delete_" + Date.now());
    const result = await caller.projects.delete({ id: created.id });
    expect(result).toEqual({ success: true });

    await expect(caller.projects.getById({ id: created.id })).rejects.toThrow();
    // Already deleted, remove from tracking
    const idx = createdProjectIds.indexOf(created.id);
    if (idx !== -1) createdProjectIds.splice(idx, 1);
  });
});

// ─── Tasks Tests ────────────────────────────────────────────

describe("tasks", () => {
  let projectId: number;

  // Create ONE shared project for all task tests
  it("setup: create project for task tests", async () => {
    const caller = createAuthCaller();
    const project = await createTrackedProject(caller, "__vitest_platform_tasks_" + Date.now());
    projectId = project.id;
  });

  it("tasks.listByProject returns empty array for new project", async () => {
    const caller = createAuthCaller();
    const tasks = await caller.tasks.listByProject({ projectId });
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBe(0);
  });

  it("tasks.create creates a task and returns id", async () => {
    const caller = createAuthCaller();
    const result = await caller.tasks.create({
      projectId,
      title: "Test Task",
      priority: "high",
      category: "design",
    });
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });

  it("tasks.create requires title", async () => {
    const caller = createAuthCaller();
    await expect(caller.tasks.create({ projectId, title: "" })).rejects.toThrow();
  });

  it("tasks.updateStatus changes task status", async () => {
    const caller = createAuthCaller();
    const task = await caller.tasks.create({ projectId, title: "Status Test" });
    const result = await caller.tasks.updateStatus({ id: task.id, status: "in_progress" });
    expect(result).toEqual({ success: true });
  });

  it("tasks.delete removes a task", async () => {
    const caller = createAuthCaller();
    const task = await caller.tasks.create({ projectId, title: "Delete Task Test" });
    const result = await caller.tasks.delete({ id: task.id });
    expect(result).toEqual({ success: true });

    const remaining = await caller.tasks.listByProject({ projectId });
    expect(remaining.find((t: any) => t.id === task.id)).toBeUndefined();
  });
});

// ─── Documents Tests ────────────────────────────────────────

describe("documents", () => {
  let projectId: number;

  // Create ONE shared project for all document tests
  it("setup: create project for document tests", async () => {
    const caller = createAuthCaller();
    const project = await createTrackedProject(caller, "__vitest_platform_docs_" + Date.now());
    projectId = project.id;
  });

  it("documents.listByProject returns empty array for new project", async () => {
    const caller = createAuthCaller();
    const docs = await caller.documents.listByProject({ projectId });
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBe(0);
  });

  it("documents.create creates a document", async () => {
    const caller = createAuthCaller();
    const result = await caller.documents.create({
      projectId,
      title: "Test Document",
      type: "report",
      category: "design",
      content: "Test content",
    });
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });

  it("documents.getById returns document after creation", async () => {
    const caller = createAuthCaller();
    const created = await caller.documents.create({
      projectId,
      title: "GetById Doc Test",
      content: "Some content",
    });
    const doc = await caller.documents.getById({ id: created.id });
    expect(doc).toBeDefined();
    expect(doc.title).toBe("GetById Doc Test");
  });
});

// ─── AI Tools Tests ─────────────────────────────────────────

describe("aiTools", () => {
  it("aiTools.list returns array for authenticated users", async () => {
    const caller = createAuthCaller();
    const result = await caller.aiTools.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("aiTools.list supports category filter", async () => {
    const caller = createAuthCaller();
    const result = await caller.aiTools.list({ category: "rendering" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("aiTools.create requires admin role", async () => {
    const caller = createAuthCaller(); // regular user
    await expect(
      caller.aiTools.create({
        name: "Test Tool",
        category: "rendering",
      })
    ).rejects.toThrow();
  });

  it("aiTools.create works for admin users", async () => {
    const caller = createAdminCaller();
    const result = await caller.aiTools.create({
      name: "Admin Test Tool " + Date.now(),
      category: "rendering",
      provider: "Test Provider",
      description: "A test AI tool",
    });
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });

  it("aiTools.update requires admin role", async () => {
    const caller = createAuthCaller();
    await expect(
      caller.aiTools.update({ id: 1, name: "Updated" })
    ).rejects.toThrow();
  });

  it("aiTools.delete requires admin role", async () => {
    const caller = createAuthCaller();
    await expect(caller.aiTools.delete({ id: 1 })).rejects.toThrow();
  });
});

// ─── Admin Tests ────────────────────────────────────────────

describe("admin", () => {
  it("admin.listUsers requires admin role", async () => {
    const caller = createAuthCaller();
    await expect(caller.admin.listUsers()).rejects.toThrow();
  });

  it("admin.listUsers works for admin", async () => {
    const caller = createAdminCaller();
    const result = await caller.admin.listUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin.createApiKey creates a key and returns raw key", async () => {
    const caller = createAdminCaller();
    const result = await caller.admin.createApiKey({ name: "Test Key " + Date.now() });
    expect(result).toBeDefined();
    expect(result.key).toBeDefined();
    expect(result.key.startsWith("nplus1_")).toBe(true);
    expect(result.prefix).toBeDefined();
  });

  it("admin.listApiKeys returns array for admin", async () => {
    const caller = createAdminCaller();
    const result = await caller.admin.listApiKeys();
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin.createWebhook creates a webhook", async () => {
    const caller = createAdminCaller();
    const result = await caller.admin.createWebhook({
      name: "Test Webhook",
      url: "https://example.com/webhook",
      events: JSON.stringify(["project.created", "task.completed"]),
    });
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });

  it("admin.listWebhooks returns array for admin", async () => {
    const caller = createAdminCaller();
    const result = await caller.admin.listWebhooks();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Standards Tests ────────────────────────────────────────

describe("standards", () => {
  it("standards.list returns array", async () => {
    const caller = createAuthCaller();
    const result = await caller.standards.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("standards.create creates a standard", async () => {
    const caller = createAuthCaller();
    const result = await caller.standards.create({
      title: "Test Standard " + Date.now(),
      category: "design_spec",
      description: "A test design specification",
      content: "Standard content here",
    });
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });
});

// ─── Assets Tests ───────────────────────────────────────────

describe("assets", () => {
  it("assets.list returns array", async () => {
    const caller = createAuthCaller();
    const result = await caller.assets.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("assets.create creates an asset", async () => {
    const caller = createAuthCaller();
    const result = await caller.assets.create({
      name: "Test Asset " + Date.now(),
      category: "image",
      fileUrl: "https://example.com/test.png",
      fileKey: "assets/test.png",
      fileType: "image/png",
      fileSize: 1024,
    });
    expect(result).toBeDefined();
    expect(typeof result.id).toBe("number");
  });
});

// ─── OpenClaw API Route Tests ───────────────────────────────

describe("openclawApi", () => {
  it("API router module exports openclawRouter", async () => {
    const module = await import("./openclawApi");
    expect(module.openclawRouter).toBeDefined();
    expect(typeof module.openclawRouter).toBe("function"); // Express Router is a function
  });
});

// ─── Benchmark Module Tests ────────────────────────────────

describe("benchmark", () => {
  it("benchmark.generate requires authentication", async () => {
    const caller = createPublicCaller();
    await expect(
      caller.benchmark.generate({
        projectName: "Test",
        projectType: "office",
        requirements: "Test requirements",
      })
    ).rejects.toThrow();
  });

  it("benchmark.generate validates referenceCount max", async () => {
    const caller = createAuthCaller();
    await expect(
      caller.benchmark.generate({
        projectName: "Test",
        projectType: "office",
        requirements: "Test",
        referenceCount: 20,
      })
    ).rejects.toThrow();
  });

  it("benchmark.exportPpt requires authentication", async () => {
    const caller = createPublicCaller();
    await expect(
      caller.benchmark.exportPpt({
        content: "# Test Report",
        title: "Test",
      })
    ).rejects.toThrow();
  });

  it("benchmark.exportPpt rejects empty content", async () => {
    const caller = createAuthCaller();
    await expect(
      caller.benchmark.exportPpt({
        content: "",
        title: "Test",
      })
    ).rejects.toThrow();
  });

  it("benchmark.exportPpt rejects empty title", async () => {
    const caller = createAuthCaller();
    await expect(
      caller.benchmark.exportPpt({
        content: "Some content",
        title: "",
      })
    ).rejects.toThrow();
  });

  it("benchmark.generate rejects referenceCount below min", async () => {
    const caller = createAuthCaller();
    await expect(
      caller.benchmark.generate({
        projectName: "Test",
        projectType: "office",
        requirements: "Test",
        referenceCount: 0,
      })
    ).rejects.toThrow();
  });
});
