import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-projects",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("projects router", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);
  let createdProjectId: number;

  it("creates a project with extended fields", async () => {
    const result = await caller.projects.create({
      name: "测试项目-看板",
      code: "TP-2026-001",
      clientName: "测试甲方",
      companyProfile: "一家科技公司，专注于AI领域",
      businessGoal: "打造智能办公空间",
      clientProfile: "决策风格偏保守，注重性价比",
      projectOverview: "3000平米办公空间，需要现代简约风格",
    });
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
    createdProjectId = result.id;
  });

  it("retrieves project with all extended fields", async () => {
    const project = await caller.projects.getById({ id: createdProjectId });
    expect(project.name).toBe("测试项目-看板");
    expect(project.code).toBe("TP-2026-001");
    expect(project.clientName).toBe("测试甲方");
    expect(project.companyProfile).toBe("一家科技公司，专注于AI领域");
    expect(project.businessGoal).toBe("打造智能办公空间");
    expect(project.clientProfile).toBe("决策风格偏保守，注重性价比");
    expect(project.projectOverview).toBe("3000平米办公空间，需要现代简约风格");
  });

  it("updates project extended fields", async () => {
    await caller.projects.update({
      id: createdProjectId,
      companyProfile: "更新后的公司概况",
      businessGoal: "更新后的业务目标",
    });
    const updated = await caller.projects.getById({ id: createdProjectId });
    expect(updated.companyProfile).toBe("更新后的公司概况");
    expect(updated.businessGoal).toBe("更新后的业务目标");
    // Other fields should remain unchanged
    expect(updated.clientName).toBe("测试甲方");
  });

  it("lists projects with search", async () => {
    const all = await caller.projects.list({ search: "看板" });
    expect(all.length).toBeGreaterThanOrEqual(1);
    const found = all.find((p: any) => p.id === createdProjectId);
    expect(found).toBeDefined();
  });

  // ─── Custom Fields ─────────────────────────────────────

  let customFieldId: number;

  it("creates a custom field", async () => {
    const result = await caller.projects.createCustomField({
      projectId: createdProjectId,
      fieldName: "项目面积",
      fieldValue: "3000平米",
    });
    expect(result).toHaveProperty("id");
    customFieldId = result.id;
  });

  it("lists custom fields for the project", async () => {
    const fields = await caller.projects.listCustomFields({ projectId: createdProjectId });
    expect(fields.length).toBeGreaterThanOrEqual(1);
    const found = fields.find((f: any) => f.id === customFieldId);
    expect(found).toBeDefined();
    expect(found!.fieldName).toBe("项目面积");
    expect(found!.fieldValue).toBe("3000平米");
  });

  it("updates a custom field", async () => {
    await caller.projects.updateCustomField({
      id: customFieldId,
      fieldValue: "5000平米",
    });
    const fields = await caller.projects.listCustomFields({ projectId: createdProjectId });
    const found = fields.find((f: any) => f.id === customFieldId);
    expect(found!.fieldValue).toBe("5000平米");
  });

  it("deletes a custom field", async () => {
    await caller.projects.deleteCustomField({ id: customFieldId });
    const fields = await caller.projects.listCustomFields({ projectId: createdProjectId });
    const found = fields.find((f: any) => f.id === customFieldId);
    expect(found).toBeUndefined();
  });

  // ─── Project Context ───────────────────────────────────

  it("gets project context for AI import", async () => {
    // Add a custom field first
    const cf = await caller.projects.createCustomField({
      projectId: createdProjectId,
      fieldName: "设计风格",
      fieldValue: "现代简约",
    });

    const result = await caller.projects.getProjectContext({ id: createdProjectId });
    expect(result).toHaveProperty("context");
    expect(result).toHaveProperty("project");
    expect(result).toHaveProperty("customFields");
    expect(result.context).toContain("测试项目-看板");
    expect(result.context).toContain("更新后的公司概况");
    expect(result.context).toContain("设计风格：现代简约");

    // Cleanup
    await caller.projects.deleteCustomField({ id: cf.id });
  });

  // ─── Generation History ────────────────────────────────

  it("lists generation history for the project (empty initially)", async () => {
    const history = await caller.projects.listGenerationHistory({ projectId: createdProjectId });
    expect(Array.isArray(history)).toBe(true);
  });

  // ─── Cleanup ───────────────────────────────────────────

  it("deletes the test project", async () => {
    const result = await caller.projects.delete({ id: createdProjectId });
    expect(result).toEqual({ success: true });
  });
});
