/**
 * AES-256-GCM encryption/decryption for sensitive values (e.g. API keys).
 * Uses JWT_SECRET as the encryption key material (derived via SHA-256).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./env";

function getDerivedKey(): Buffer {
  // Derive a 32-byte key from JWT_SECRET using SHA-256
  return createHash("sha256").update(ENV.cookieSecret || "fallback-dev-secret").digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string: iv(12 bytes) + authTag(16 bytes) + ciphertext
 */
export function encryptApiKey(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Combine iv + authTag + ciphertext and encode as base64
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted string produced by encryptApiKey.
 * Returns the original plaintext, or null if decryption fails.
 */
export function decryptApiKey(encrypted: string): string | null {
  try {
    const key = getDerivedKey();
    const combined = Buffer.from(encrypted, "base64");
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Mask an API key for display: show first 4 and last 4 chars, rest as dots.
 * e.g. "sk-abc123xyz" → "sk-a••••••xyz"
 */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return "•".repeat(plaintext.length);
  return plaintext.slice(0, 4) + "•".repeat(Math.max(4, plaintext.length - 8)) + plaintext.slice(-4);
}
