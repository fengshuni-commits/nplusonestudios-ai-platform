import { describe, it, expect, afterAll } from "vitest";
import * as db from "./db";
import bcrypt from "bcryptjs";

const TEST_EMAIL = `test-emailauth-${Date.now()}@example.com`;
const TEST_NAME = "Test Email User";
const TEST_PASSWORD = "testpassword123";

describe("Email Auth DB Helpers", () => {
  afterAll(async () => {
    // Clean up test user
    const user = await db.getUserByEmail(TEST_EMAIL);
    if (user) {
      const drizzleDb = await db.db;
      if (drizzleDb) {
        const { eq } = await import("drizzle-orm");
        const { users } = await import("../drizzle/schema");
        await drizzleDb.delete(users).where(eq(users.id, user.id));
      }
    }
  });

  it("should create an email user and retrieve by email", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const { id, openId } = await db.createEmailUser({
      email: TEST_EMAIL,
      name: TEST_NAME,
      passwordHash: hash,
    });
    expect(id).toBeGreaterThan(0);
    expect(openId).toBe(`email:${TEST_EMAIL}`);

    const user = await db.getUserByEmail(TEST_EMAIL);
    expect(user).toBeDefined();
    expect(user?.email).toBe(TEST_EMAIL);
    expect(user?.name).toBe(TEST_NAME);
    expect(user?.approved).toBe(false);
    expect(user?.loginMethod).toBe("email");
  });

  it("should verify correct password", async () => {
    const user = await db.getUserByEmail(TEST_EMAIL);
    expect(user?.passwordHash).toBeDefined();
    const valid = await bcrypt.compare(TEST_PASSWORD, user!.passwordHash!);
    expect(valid).toBe(true);
  });

  it("should reject wrong password", async () => {
    const user = await db.getUserByEmail(TEST_EMAIL);
    const invalid = await bcrypt.compare("wrongpassword", user!.passwordHash!);
    expect(invalid).toBe(false);
  });

  it("getUserByEmail should return undefined for non-existent email", async () => {
    const user = await db.getUserByEmail("nonexistent@nowhere.com");
    expect(user).toBeUndefined();
  });
});
