import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

let testProjectIds: number[] = [];

beforeAll(async () => {
  // Create test projects with different statuses
  const statuses = ["planning", "design", "paused", "completed"] as const;
  for (const status of statuses) {
    const result = await db.createProject({ name: `Test Project ${status}`, status });
    testProjectIds.push(result.id);
  }
});

afterAll(async () => {
  // Clean up test projects
  const dbConn = await db.getDb();
  if (dbConn && testProjectIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const { projects } = await import("../drizzle/schema");
    await dbConn.delete(projects).where(inArray(projects.id, testProjectIds));
  }
});

describe("Project paused status", () => {
  it("should create a project with paused status", async () => {
    const result = await db.createProject({ name: "Paused Test Project", status: "paused" });
    expect(result.id).toBeGreaterThan(0);
    testProjectIds.push(result.id);

    const project = await db.getProjectById(result.id);
    expect(project?.status).toBe("paused");
  });

  it("should update a project status to paused", async () => {
    const result = await db.createProject({ name: "To Be Paused", status: "design" });
    testProjectIds.push(result.id);

    await db.updateProject(result.id, { status: "paused" });
    const updated = await db.getProjectById(result.id);
    expect(updated?.status).toBe("paused");
  });
});

describe("Project multi-select status filter", () => {
  it("should filter by a single status string", async () => {
    const results = await db.listProjects({ status: "paused" });
    const testPaused = results.filter(p => testProjectIds.includes(p.id));
    expect(testPaused.every(p => p.status === "paused")).toBe(true);
  });

  it("should filter by a single-element array", async () => {
    const results = await db.listProjects({ status: ["planning"] });
    const testPlanning = results.filter(p => testProjectIds.includes(p.id));
    expect(testPlanning.every(p => p.status === "planning")).toBe(true);
  });

  it("should filter by multiple statuses (array)", async () => {
    const results = await db.listProjects({ status: ["paused", "completed"] });
    const testFiltered = results.filter(p => testProjectIds.includes(p.id));
    expect(testFiltered.length).toBeGreaterThanOrEqual(2);
    expect(testFiltered.every(p => ["paused", "completed"].includes(p.status))).toBe(true);
  });

  it("should return all projects when no status filter is given", async () => {
    const results = await db.listProjects({});
    const testAll = results.filter(p => testProjectIds.includes(p.id));
    // Should include projects of all statuses we created
    const statuses = new Set(testAll.map(p => p.status));
    expect(statuses.has("planning")).toBe(true);
    expect(statuses.has("paused")).toBe(true);
  });
});
