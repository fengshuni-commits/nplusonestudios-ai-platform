import { getDb } from "./db";
import { caseLibrary } from "../drizzle/schema";
import { eq, desc, like, or, and } from "drizzle-orm";

export type CaseLibraryFilter = {
  search?: string;
  projectType?: string;
  styleTag?: string;
};

export async function listCaseLibrary(filter: CaseLibraryFilter = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  const conditions = [];

  if (filter.search) {
    conditions.push(
      or(
        like(caseLibrary.title, `%${filter.search}%`),
        like(caseLibrary.description, `%${filter.search}%`),
        like(caseLibrary.designerName, `%${filter.search}%`),
        like(caseLibrary.clientType, `%${filter.search}%`)
      )
    );
  }

  if (filter.projectType) {
    conditions.push(eq(caseLibrary.projectType, filter.projectType));
  }

  if (filter.styleTag) {
    conditions.push(like(caseLibrary.styleTags, `%${filter.styleTag}%`));
  }

  const rows = await db
    .select()
    .from(caseLibrary)
    .where(conditions.length > 0 ? and(...(conditions as any[])) : undefined)
    .orderBy(desc(caseLibrary.createdAt))
    .limit(100);

  return rows;
}

export async function getCaseLibraryItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  const [row] = await db
    .select()
    .from(caseLibrary)
    .where(eq(caseLibrary.id, id));
  return row ?? null;
}

export async function createCaseLibraryItem(data: {
  title: string;
  description?: string;
  projectType?: string;
  styleTags?: string;
  areaSqm?: number;
  clientType?: string;
  coverImageUrl?: string;
  imageUrls?: string[];
  sourceUrl?: string;
  completionYear?: number;
  designerName?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  const [result] = await db.insert(caseLibrary).values({
    title: data.title,
    description: data.description,
    projectType: data.projectType,
    styleTags: data.styleTags,
    areaSqm: data.areaSqm,
    clientType: data.clientType,
    coverImageUrl: data.coverImageUrl,
    imageUrls: data.imageUrls ?? [],
    sourceUrl: data.sourceUrl,
    completionYear: data.completionYear,
    designerName: data.designerName,
    createdBy: data.createdBy,
  });
  return result;
}

export async function updateCaseLibraryItem(id: number, data: Partial<{
  title: string;
  description: string;
  projectType: string;
  styleTags: string;
  areaSqm: number;
  clientType: string;
  coverImageUrl: string;
  imageUrls: string[];
  sourceUrl: string;
  completionYear: number;
  designerName: string;
  aiTags: string[];
  aiTagsGenerated: boolean;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  await db.update(caseLibrary).set(data as any).where(eq(caseLibrary.id, id));
}

export async function deleteCaseLibraryItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  await db.delete(caseLibrary).where(eq(caseLibrary.id, id));
}
